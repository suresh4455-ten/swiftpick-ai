import { H, NOW } from "./seed";
import type {
  Order,
  Product,
  PickBatch,
  Station,
  StockStatus,
  WfException,
  Worker,
  Zone,
} from "./types";

/* ── Inventory maths ─────────────────────────────────────────────── */

export const available = (p: Product) => Math.max(0, p.stock - p.reserved - p.damaged);

export const daysRemaining = (p: Product) =>
  p.dailyDemand > 0 ? available(p) / p.dailyDemand : 99;

export function stockStatus(p: Product): StockStatus {
  const avail = available(p);
  if (avail <= 0) return "out";
  if (avail < p.reorderPoint * 0.5) return "critical";
  if (avail <= p.reorderPoint) return "low";
  return "healthy";
}

export const statusTone = (s: StockStatus) =>
  s === "healthy" ? "ok" : s === "low" ? "warn" : s === "critical" ? "danger" : "muted";

export const inventoryValue = (products: Product[]) =>
  products.reduce((sum, p) => sum + p.stock * p.unitCost, 0);

/* ── Priority engine ─────────────────────────────────────────────── */

export interface PriorityFactor {
  label: string;
  weight: number;
  raw: number;
  note: string;
}

export interface Priority {
  score: number;
  band: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  factors: PriorityFactor[];
  explanation: string;
  hoursToDeadline: number;
  coverage: number;
}

const tierWeight: Record<Order["tier"], number> = { strategic: 100, key: 72, standard: 45 };
const channelBoost: Record<Order["channel"], number> = {
  Express: 100,
  B2B: 72,
  Retail: 60,
  "E-commerce": 50,
};

export function coverageOf(order: Order, products: Product[]) {
  const required = order.lines.reduce((s, l) => s + l.qty, 0);
  if (required === 0) return 1;
  const servable = order.lines.reduce((s, l) => {
    const p = products.find((x) => x.sku === l.sku);
    const pool = p ? available(p) + l.allocated : 0;
    return s + Math.min(l.qty, pool);
  }, 0);
  return servable / required;
}

export function priorityOf(order: Order, products: Product[], now = NOW): Priority {
  const hoursToDeadline = (order.deadline - now) / H;
  const deadlineRisk = clamp(100 - (hoursToDeadline / 24) * 100, 0, 100);
  const customerPriority = Math.round(tierWeight[order.tier] * 0.7 + channelBoost[order.channel] * 0.3);
  const coverage = coverageOf(order, products);
  const stockRisk = clamp((1 - coverage) * 100, 0, 100);
  const businessImpact = clamp((order.valueUsd / 3500) * 100, 10, 100);

  const factors: PriorityFactor[] = [
    {
      label: "Deadline risk",
      weight: 0.4,
      raw: Math.round(deadlineRisk),
      note:
        hoursToDeadline < 0
          ? `Dispatch window elapsed ${Math.abs(hoursToDeadline).toFixed(1)}h ago`
          : `${hoursToDeadline.toFixed(1)}h until dispatch cut-off`,
    },
    {
      label: "Customer priority",
      weight: 0.2,
      raw: customerPriority,
      note: `${order.tier} account · ${order.channel} channel`,
    },
    {
      label: "Stock availability risk",
      weight: 0.2,
      raw: Math.round(stockRisk),
      note: `${Math.round(coverage * 100)}% of required inventory is currently servable`,
    },
    {
      label: "Business impact",
      weight: 0.2,
      raw: Math.round(businessImpact),
      note: `Order value $${order.valueUsd.toLocaleString()}`,
    },
  ];

  const score = Math.round(factors.reduce((s, f) => s + f.raw * f.weight, 0));
  const band = score >= 90 ? "CRITICAL" : score >= 75 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW";

  const explanation =
    `${band} because the dispatch cut-off is ${hoursToDeadline < 0 ? "already breached" : `${hoursToDeadline.toFixed(1)}h away`}` +
    `, the account is ${order.tier}, and ${Math.round(coverage * 100)}% of required inventory is available today.`;

  return { score, band, factors, explanation, hoursToDeadline, coverage };
}

export const bandTone = (band: Priority["band"]) =>
  band === "CRITICAL" ? "danger" : band === "HIGH" ? "warn" : band === "MEDIUM" ? "info" : "muted";

/* ── Allocation engine ───────────────────────────────────────────── */

export interface AllocationLine {
  sku: string;
  name: string;
  required: number;
  allocate: number;
  shortfall: number;
  zone: Zone;
  bin: string;
  damagedExcluded: number;
}

export interface AllocationPlan {
  orderId: string;
  lines: AllocationLine[];
  fulfilment: "full" | "partial" | "blocked";
  competing: Array<{ id: string; score: number; sku: string; qty: number }>;
  decision: string;
  reason: string;
  impact: string;
  action: string;
}

export function allocationPlan(
  order: Order,
  products: Product[],
  orders: Order[],
): AllocationPlan {
  const lines: AllocationLine[] = order.lines.map((l) => {
    const p = products.find((x) => x.sku === l.sku);
    const pool = p ? available(p) : 0;
    const allocate = Math.min(l.qty - l.allocated, pool);
    return {
      sku: l.sku,
      name: p?.name ?? l.sku,
      required: l.qty,
      allocate: allocate + l.allocated,
      shortfall: Math.max(0, l.qty - l.allocated - allocate),
      zone: p?.zone ?? "Zone A",
      bin: p?.bin ?? "—",
      damagedExcluded: p?.damaged ?? 0,
    };
  });

  const myScore = priorityOf(order, products).score;
  const skus = new Set(order.lines.map((l) => l.sku));
  const competing = orders
    .filter(
      (o) =>
        o.id !== order.id &&
        !["DISPATCHED", "DELIVERED"].includes(o.status) &&
        o.lines.some((l) => skus.has(l.sku) && l.allocated < l.qty),
    )
    .map((o) => {
      const line = o.lines.find((l) => skus.has(l.sku))!;
      return { id: o.id, score: priorityOf(o, products).score, sku: line.sku, qty: line.qty };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const shortfall = lines.reduce((s, l) => s + l.shortfall, 0);
  const fulfilment: AllocationPlan["fulfilment"] =
    shortfall === 0 ? "full" : lines.some((l) => l.allocate > 0) ? "partial" : "blocked";

  const beaten = competing.filter((c) => c.score < myScore);
  const totalDamaged = lines.reduce((s, l) => s + l.damagedExcluded, 0);

  const decision =
    fulfilment === "full"
      ? `Allocate all ${lines.reduce((s, l) => s + l.required, 0)} units to ${order.id} and release it to picking.`
      : fulfilment === "partial"
        ? `Reserve the ${lines.reduce((s, l) => s + l.allocate, 0)} available units for ${order.id}, place ${shortfall} unit(s) on replenishment watch and flag the order as partially fulfillable.`
        : `Block allocation for ${order.id}: no unreserved, undamaged stock is available.`;

  const reason =
    `Priority score ${myScore}/100 ` +
    (beaten.length
      ? `outranks ${beaten.map((c) => `${c.id} (${c.score})`).join(", ")} competing for the same SKUs. `
      : `and no higher-priority order is competing for these SKUs. `) +
    (totalDamaged ? `${totalDamaged} damaged unit(s) were excluded from available-to-promise. ` : "") +
    `Coverage today is ${Math.round(coverageOf(order, products) * 100)}%.`;

  const impact =
    fulfilment === "full"
      ? "Order clears the dispatch window with no shortfall and stock is committed against competing demand."
      : fulfilment === "partial"
        ? `Protects the urgent dispatch window for ${order.id}; the ${shortfall}-unit gap moves to replenishment instead of silently delaying the whole order.`
        : "Prevents a picker from being sent to an empty bin and escalates the shortage to procurement immediately.";

  const action =
    fulfilment === "blocked"
      ? "Raise a stock-shortage exception and evaluate the inbound ASN or a partial split."
      : `Apply allocation, then release ${order.id} to the optimized picking queue.`;

  return { orderId: order.id, lines, fulfilment, competing, decision, reason, impact, action };
}

/* ── Replenishment ───────────────────────────────────────────────── */

export interface ReorderRec {
  sku: string;
  name: string;
  available: number;
  dailyDemand: number;
  daysToStockout: number;
  reorderPoint: number;
  quantity: number;
  risk: "critical" | "high" | "medium";
  reason: string;
  stockoutDate: number;
}

export function reorderRecs(products: Product[]): ReorderRec[] {
  return products
    .filter((p) => available(p) <= p.reorderPoint && !p.reorderRequested)
    .map((p) => {
      const days = daysRemaining(p);
      const risk: ReorderRec["risk"] = days < 1.5 ? "critical" : days < 4 ? "high" : "medium";
      const quantity = Math.max(p.reorderQty, Math.round(p.dailyDemand * 10 - available(p)));
      return {
        sku: p.sku,
        name: p.name,
        available: available(p),
        dailyDemand: p.dailyDemand,
        daysToStockout: Number(days.toFixed(1)),
        reorderPoint: p.reorderPoint,
        quantity,
        risk,
        stockoutDate: NOW + days * 24 * H,
        reason:
          `Available stock ${available(p)} is at or below the reorder point ${p.reorderPoint}. ` +
          `At ${p.dailyDemand} units/day demand this SKU runs out in ${days.toFixed(1)} days` +
          (p.incoming ? `, with ${p.incoming} units inbound.` : " with nothing inbound."),
      };
    })
    .sort((a, b) => a.daysToStockout - b.daysToStockout);
}

/* ── Picking route optimisation ──────────────────────────────────── */

export const zoneCoords: Record<Zone, { x: number; y: number }> = {
  Receiving: { x: 5, y: 80 },
  "Zone A": { x: 25, y: 25 },
  "Zone B": { x: 50, y: 25 },
  "Zone C": { x: 75, y: 25 },
  "Zone D": { x: 75, y: 62 },
  Packing: { x: 50, y: 75 },
  "Quality Check": { x: 72, y: 88 },
  Dispatch: { x: 95, y: 80 },
};

const dist = (a: Zone, b: Zone) => {
  const p = zoneCoords[a];
  const q = zoneCoords[b];
  return Math.round(Math.hypot(p.x - q.x, p.y - q.y) * 4.2);
};

export interface RoutePlan {
  original: Zone[];
  optimized: Zone[];
  originalDistance: number;
  optimizedDistance: number;
  saved: number;
  savedPct: number;
}

function pathLength(path: Zone[]) {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += dist(path[i - 1]!, path[i]!);
  return total;
}

export function routeFor(order: Order, products: Product[]): RoutePlan {
  const stops = order.lines.map((l) => products.find((p) => p.sku === l.sku)?.zone ?? "Zone A");
  const original: Zone[] = ["Receiving", ...stops, "Packing"];

  // Nearest-neighbour over unique zones, starting at Receiving, ending at Packing.
  const unique = Array.from(new Set(stops));
  const opt: Zone[] = ["Receiving"];
  let current: Zone = "Receiving";
  const pool = [...unique];
  while (pool.length) {
    pool.sort((a, b) => dist(current, a) - dist(current, b));
    current = pool.shift()!;
    opt.push(current);
  }
  opt.push("Packing");

  const originalDistance = pathLength(original);
  const optimizedDistance = pathLength(opt);
  const saved = Math.max(0, originalDistance - optimizedDistance);
  return {
    original,
    optimized: opt,
    originalDistance,
    optimizedDistance,
    saved,
    savedPct: originalDistance ? Math.round((saved / originalDistance) * 1000) / 10 : 0,
  };
}

export const pickMinutes = (order: Order, products: Product[]) => {
  const route = routeFor(order, products);
  const units = order.lines.reduce((s, l) => s + l.qty, 0);
  return Math.round((route.optimizedDistance / 55 + units * 0.35 + 3) * 10) / 10;
};

export interface BatchSuggestion {
  orderIds: string[];
  zones: Zone[];
  baselineMinutes: number;
  optimizedMinutes: number;
  gainPct: number;
  reason: string;
}

export function suggestBatches(orders: Order[], products: Product[]): BatchSuggestion[] {
  const candidates = orders.filter(
    (o) => ["ALLOCATED", "PICKING"].includes(o.status) && !o.batchId,
  );
  const groups = new Map<string, Order[]>();
  for (const o of candidates) {
    const zones = Array.from(
      new Set(o.lines.map((l) => products.find((p) => p.sku === l.sku)?.zone ?? "Zone A")),
    ).sort();
    const key = zones[0] ?? "Zone A";
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  return Array.from(groups.values())
    .filter((g) => g.length >= 2)
    .map((g) => {
      const baseline = g.reduce((s, o) => s + pickMinutes(o, products) + 4.5, 0);
      const zones = Array.from(
        new Set(
          g.flatMap((o) =>
            o.lines.map((l) => products.find((p) => p.sku === l.sku)?.zone ?? ("Zone A" as Zone)),
          ),
        ),
      );
      const optimized =
        Math.round((baseline * 0.62 + zones.length * 1.4) * 10) / 10;
      const gainPct = Math.round(((baseline - optimized) / baseline) * 1000) / 10;
      return {
        orderIds: g.map((o) => o.id),
        zones,
        baselineMinutes: Math.round(baseline * 10) / 10,
        optimizedMinutes: optimized,
        gainPct,
        reason: `These orders share ${zones.length} pick zone(s) (${zones.join(" → ")}). Batching removes ${g.length - 1} redundant travel loop(s) and one staging trip per order.`,
      };
    })
    .sort((a, b) => b.gainPct - a.gainPct)
    .slice(0, 3);
}

/* ── Bottleneck detection ────────────────────────────────────────── */

export interface Bottleneck {
  stationId: string;
  name: string;
  avgMinutes: number;
  benchmark: number;
  ordersAtRisk: number;
  impact: string;
  recommendation: string;
  severity: "critical" | "warning" | "ok";
}

export function detectBottleneck(
  stations: Station[],
  orders: Order[],
  products: Product[],
): Bottleneck {
  const active = stations.filter((s) => s.online);
  const benchmark =
    Math.round((active.reduce((s, x) => s + x.avgMinutes, 0) / Math.max(1, active.length)) * 10) /
    10;
  const worst = [...active].sort(
    (a, b) => b.avgMinutes * (1 + b.queue / 10) - a.avgMinutes * (1 + a.queue / 10),
  )[0];
  const atRisk = ordersAtRisk(orders, products).length;
  if (!worst) {
    return {
      stationId: "—",
      name: "All stations offline",
      avgMinutes: 0,
      benchmark,
      ordersAtRisk: atRisk,
      impact: "No station is processing work.",
      recommendation: "Bring at least one packing station back online.",
      severity: "critical",
    };
  }
  const severity: Bottleneck["severity"] =
    worst.avgMinutes > benchmark * 1.5 ? "critical" : worst.avgMinutes > benchmark * 1.15 ? "warning" : "ok";
  return {
    stationId: worst.id,
    name: worst.name,
    avgMinutes: worst.avgMinutes,
    benchmark,
    ordersAtRisk: atRisk,
    impact: `${worst.queue} orders queued here and ${atRisk} orders across the floor are at risk of missing their dispatch window.`,
    recommendation:
      severity === "ok"
        ? "Flow is balanced — keep current staffing."
        : `Move one available packer to ${worst.name} for the next 45 minutes and divert new work to the fastest station.`,
    severity,
  };
}

/* ── Risk, insights, KPIs ────────────────────────────────────────── */

export const openStatuses: Order["status"][] = [
  "NEW",
  "PRIORITIZED",
  "INVENTORY CHECK",
  "ALLOCATED",
  "PICKING",
  "PACKING",
  "QUALITY CHECK",
  "READY TO DISPATCH",
  "EXCEPTION",
];

export function ordersAtRisk(orders: Order[], products: Product[]) {
  return orders.filter((o) => {
    if (!openStatuses.includes(o.status)) return false;
    const p = priorityOf(o, products);
    return p.hoursToDeadline < 6 || p.coverage < 1 || o.status === "EXCEPTION";
  });
}

export interface Insight {
  id: string;
  level: "critical" | "warning" | "optimization" | "recommendation";
  title: string;
  problem: string;
  reason: string;
  recommendation: string;
  impact: string;
  actionLabel: string;
  action:
    | { kind: "prioritize"; orderId: string }
    | { kind: "reorder"; sku: string }
    | { kind: "batch"; orderIds: string[] }
    | { kind: "rebalance"; stationId: string }
    | { kind: "navigate"; to: string };
}

export function buildInsights(
  orders: Order[],
  products: Product[],
  stations: Station[],
  exceptions: WfException[],
): Insight[] {
  const out: Insight[] = [];
  const risk = ordersAtRisk(orders, products);
  const top = [...risk].sort(
    (a, b) => priorityOf(b, products).score - priorityOf(a, products).score,
  )[0];

  if (top) {
    const p = priorityOf(top, products);
    out.push({
      id: "ins-risk",
      level: "critical",
      title: `${risk.length} orders may miss their dispatch deadline`,
      problem: `${risk.length} open orders are inside the risk window; ${top.id} is the most urgent.`,
      reason: `${top.id} scores ${p.score}/100 — cut-off in ${p.hoursToDeadline.toFixed(1)}h with ${Math.round(p.coverage * 100)}% inventory coverage.`,
      recommendation: `Allocate and release ${top.id} ahead of lower-scoring orders competing for the same SKUs.`,
      impact: "Protects the most valuable dispatch window and pushes the shortfall to replenishment instead of the customer.",
      actionLabel: `Prioritize ${top.id}`,
      action: { kind: "prioritize", orderId: top.id },
    });
  }

  const recs = reorderRecs(products);
  const urgent = recs[0];
  if (urgent) {
    out.push({
      id: "ins-reorder",
      level: "warning",
      title: `${urgent.sku} may reach stockout in ${urgent.daysToStockout} days`,
      problem: `${urgent.name} has ${urgent.available} available units against ${urgent.dailyDemand}/day demand.`,
      reason: urgent.reason,
      recommendation: `Raise a replenishment order for ${urgent.quantity} units within the next 24 hours.`,
      impact: `Avoids an estimated ${Math.round(urgent.dailyDemand * 2)} unfulfillable units and protects downstream orders.`,
      actionLabel: `Approve reorder · ${urgent.quantity} units`,
      action: { kind: "reorder", sku: urgent.sku },
    });
  }

  const batch = suggestBatches(orders, products)[0];
  if (batch) {
    out.push({
      id: "ins-batch",
      level: "optimization",
      title: `Batching ${batch.orderIds.join(", ")} cuts picking time ${batch.gainPct}%`,
      problem: "These orders are being picked as separate trips through overlapping zones.",
      reason: batch.reason,
      recommendation: `Create optimized batch across ${batch.zones.join(" → ")}.`,
      impact: `${batch.baselineMinutes} min → ${batch.optimizedMinutes} min of picker time.`,
      actionLabel: "Create optimized batch",
      action: { kind: "batch", orderIds: batch.orderIds },
    });
  }

  const bn = detectBottleneck(stations, orders, products);
  if (bn.severity !== "ok") {
    out.push({
      id: "ins-bottleneck",
      level: bn.severity === "critical" ? "critical" : "warning",
      title: `${bn.name} is the current bottleneck`,
      problem: `Average processing time ${bn.avgMinutes} min vs warehouse average ${bn.benchmark} min.`,
      reason: bn.impact,
      recommendation: bn.recommendation,
      impact: "Rebalancing restores flow before queued orders breach their dispatch windows.",
      actionLabel: "Apply rebalance",
      action: { kind: "rebalance", stationId: bn.stationId },
    });
  }

  const openEx = exceptions.filter((e) => e.status === "open");
  if (openEx.length) {
    out.push({
      id: "ins-exceptions",
      level: "recommendation",
      title: `${openEx.length} open exceptions are blocking fulfilment`,
      problem: openEx.map((e) => `${e.type}${e.orderId ? ` on ${e.orderId}` : ""}`).join(", ") + ".",
      reason: "Each exception holds inventory or an order in a non-flowing state.",
      recommendation: "Work the exception queue highest-severity first; every item already carries a proposed resolution.",
      impact: "Clearing them releases blocked stock back into available-to-promise.",
      actionLabel: "Open Exception Center",
      action: { kind: "navigate", to: "/exceptions" },
    });
  }

  const dense = products.filter((p) => available(p) > p.reorderPoint * 8);
  if (dense.length) {
    out.push({
      id: "ins-slotting",
      level: "recommendation",
      title: `Re-slot ${dense.length} overstocked SKUs closer to Packing`,
      problem: `${dense[0]!.name} holds ${available(dense[0]!)} units in ${dense[0]!.zone} with only ${dense[0]!.dailyDemand}/day demand.`,
      reason: "High-volume slow movers occupy prime pick faces, lengthening every pick route through that aisle.",
      recommendation: "Move slow movers to Zone D bulk and promote fast movers to the Packing-adjacent faces.",
      impact: "Estimated 8–12% reduction in average travel distance per pick trip.",
      actionLabel: "Open warehouse map",
      action: { kind: "navigate", to: "/map" },
    });
  }

  return out;
}

export interface Kpis {
  totalUnits: number;
  inventoryValue: number;
  ordersToday: number;
  pending: number;
  atRisk: number;
  readyToPick: number;
  packing: number;
  readyToDispatch: number;
  lowStock: number;
  outOfStock: number;
  damagedUnits: number;
  pickingEfficiency: number;
  fulfilmentRate: number;
  avgFulfilmentHours: number;
}

export function computeKpis(orders: Order[], products: Product[]): Kpis {
  const done = orders.filter((o) => ["DISPATCHED", "DELIVERED"].includes(o.status));
  const totalUnits = products.reduce((s, p) => s + p.stock, 0);
  return {
    totalUnits,
    inventoryValue: inventoryValue(products),
    ordersToday: orders.filter((o) => o.createdAt > NOW - 24 * H).length,
    pending: orders.filter((o) => openStatuses.includes(o.status)).length,
    atRisk: ordersAtRisk(orders, products).length,
    readyToPick: orders.filter((o) => o.status === "ALLOCATED").length,
    packing: orders.filter((o) => o.status === "PACKING").length,
    readyToDispatch: orders.filter((o) => o.status === "READY TO DISPATCH").length,
    lowStock: products.filter((p) => ["low", "critical"].includes(stockStatus(p))).length,
    outOfStock: products.filter((p) => stockStatus(p) === "out").length,
    damagedUnits: products.reduce((s, p) => s + p.damaged, 0),
    pickingEfficiency: 87 - Math.min(20, ordersAtRisk(orders, products).length),
    fulfilmentRate: Math.round((done.length / Math.max(1, orders.length)) * 100),
    avgFulfilmentHours:
      Math.round(
        (done.reduce((s, o) => s + (o.timeline.at(-1)!.at - o.createdAt) / H, 0) /
          Math.max(1, done.length)) *
          10,
      ) / 10,
  };
}

/* ── Simulation ──────────────────────────────────────────────────── */

export interface SimResult {
  headline: string;
  metrics: Array<{ label: string; value: string; tone: "ok" | "warn" | "danger" | "info" }>;
  reasoning: string[];
  recommendation: string;
}

export function simulateStockDrop(
  sku: string,
  dropPct: number,
  orders: Order[],
  products: Product[],
): SimResult {
  const p = products.find((x) => x.sku === sku);
  if (!p)
    return {
      headline: "Unknown SKU",
      metrics: [],
      reasoning: ["The selected SKU is not in the catalogue."],
      recommendation: "Pick a valid SKU from the list.",
    };
  const newAvail = Math.max(0, Math.round(available(p) * (1 - dropPct / 100)));
  const affected = orders.filter(
    (o) => openStatuses.includes(o.status) && o.lines.some((l) => l.sku === sku),
  );
  let pool = newAvail;
  let unfulfillable = 0;
  const priorityAffected: string[] = [];
  for (const o of [...affected].sort(
    (a, b) => priorityOf(b, products).score - priorityOf(a, products).score,
  )) {
    const need = o.lines.filter((l) => l.sku === sku).reduce((s, l) => s + l.qty, 0);
    const give = Math.min(need, pool);
    pool -= give;
    if (give < need) {
      unfulfillable += need - give;
      if (priorityOf(o, products).score >= 75) priorityAffected.push(o.id);
    }
  }
  const days = p.dailyDemand ? newAvail / p.dailyDemand : 99;
  return {
    headline: `${sku} stock −${dropPct}% → ${newAvail} available units`,
    metrics: [
      { label: "Orders touching this SKU", value: String(affected.length), tone: "info" },
      { label: "Units unfulfillable", value: String(unfulfillable), tone: unfulfillable ? "danger" : "ok" },
      {
        label: "High-priority orders hit",
        value: String(priorityAffected.length),
        tone: priorityAffected.length ? "danger" : "ok",
      },
      { label: "Days of cover left", value: `${days.toFixed(1)}d`, tone: days < 2 ? "danger" : days < 5 ? "warn" : "ok" },
    ],
    reasoning: [
      `Available-to-promise falls from ${available(p)} to ${newAvail} units after damaged and reserved stock is excluded.`,
      `${affected.length} open orders consume this SKU; allocation is replayed strictly in priority-score order.`,
      unfulfillable
        ? `${unfulfillable} units cannot be served, delaying ${priorityAffected.length ? priorityAffected.join(", ") : "lower-priority orders"} by an estimated ${Math.ceil(unfulfillable / Math.max(1, p.dailyDemand))} day(s).`
        : "All open demand is still coverable at the reduced level.",
    ],
    recommendation: unfulfillable
      ? `Raise an emergency replenishment of ${Math.max(p.reorderQty, unfulfillable + p.dailyDemand * 3)} units and pre-reserve remaining stock for ${priorityAffected[0] ?? "the highest-scoring order"}.`
      : "No action required — keep the standard reorder cadence.",
  };
}

export function simulateStationOutage(
  stationId: string,
  stations: Station[],
  orders: Order[],
  products: Product[],
): SimResult {
  const target = stations.find((s) => s.id === stationId);
  if (!target)
    return { headline: "Unknown station", metrics: [], reasoning: [], recommendation: "" };
  const remaining = stations.filter((s) => s.online && s.id !== stationId && s.kind === target.kind);
  const redistributed = remaining.length ? target.queue / remaining.length : target.queue;
  const newAvg = remaining.length
    ? Math.round(
        (remaining.reduce((s, x) => s + x.avgMinutes, 0) / remaining.length +
          redistributed * 0.6) *
          10,
      ) / 10
    : 99;
  const delay = Math.round(redistributed * newAvg);
  const nextBottleneck = [...remaining].sort((a, b) => b.avgMinutes - a.avgMinutes)[0];
  return {
    headline: `${target.name} offline → ${target.queue} orders redistributed`,
    metrics: [
      { label: "Orders affected", value: String(target.queue), tone: "warn" },
      { label: "New bottleneck", value: nextBottleneck?.name ?? "None available", tone: "danger" },
      { label: "Added cycle time", value: `${newAvg} min`, tone: newAvg > 10 ? "danger" : "warn" },
      { label: "Expected delay", value: `${delay} min`, tone: delay > 60 ? "danger" : "warn" },
      {
        label: "Orders at risk after outage",
        value: String(ordersAtRisk(orders, products).length + Math.ceil(target.queue / 2)),
        tone: "danger",
      },
    ],
    reasoning: [
      `${target.queue} queued orders move to ${remaining.length} remaining ${target.kind} station(s) — ${redistributed.toFixed(1)} extra orders each.`,
      `Effective cycle time rises to ${newAvg} min per order once queueing effects are included.`,
      nextBottleneck
        ? `${nextBottleneck.name} becomes the constraint at ${nextBottleneck.avgMinutes} min baseline.`
        : "No alternative station of this type is online — the line stops.",
    ],
    recommendation: remaining.length
      ? `Reassign the two least-loaded packers to ${nextBottleneck?.name}, and route CRITICAL/HIGH orders there first while ${target.name} is down.`
      : `Bring ${target.name} back online immediately or divert to manual pack-out; there is no fallback capacity.`,
  };
}

/* ── Analytics series (deterministic) ────────────────────────────── */

export function analyticsSeries(orders: Order[], products: Product[]) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const k = computeKpis(orders, products);
  return {
    throughput: days.map((d, i) => ({
      day: d,
      orders: 28 + ((i * 13) % 17),
      fulfilled: 24 + ((i * 11) % 15),
    })),
    efficiency: days.map((d, i) => ({
      day: d,
      picking: 78 + ((i * 7) % 14),
      packing: 71 + ((i * 5) % 18),
    })),
    processing: days.map((d, i) => ({
      day: d,
      hours: Math.round((5.2 + ((i * 3) % 9) / 3) * 10) / 10,
    })),
    exceptions: [
      { type: "Stock shortage", count: 9 },
      { type: "Damaged", count: 6 },
      { type: "Missing", count: 4 },
      { type: "Mismatch", count: 3 },
      { type: "Dispatch", count: 5 },
    ],
    stockouts: days.map((d, i) => ({ day: d, events: (i * 5) % 4 })),
    turnover: ["Components", "Electronics", "Packaging", "Safety", "Consumables", "Handling", "Retail"].map(
      (c, i) => ({
        category: c,
        turns: Math.round((3.1 + ((i * 7) % 11) / 3) * 10) / 10,
      }),
    ),
    fulfilmentRate: k.fulfilmentRate,
  };
}

/* ── helpers ─────────────────────────────────────────────────────── */

export function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function fmtTime(ts: number) {
  return new Date(ts).toISOString().slice(11, 16) + " UTC";
}

export function fmtDay(ts: number) {
  return new Date(ts).toISOString().slice(5, 10);
}

export function relative(ts: number, now = NOW) {
  const h = (ts - now) / H;
  if (Math.abs(h) < 1) return `${Math.round(Math.abs(h) * 60)} min ${h < 0 ? "ago" : "left"}`;
  if (Math.abs(h) < 48) return `${Math.abs(h).toFixed(1)}h ${h < 0 ? "ago" : "left"}`;
  return `${Math.abs(h / 24).toFixed(1)}d ${h < 0 ? "ago" : "left"}`;
}

export function zoneLoad(products: Product[], orders: Order[], zone: Zone) {
  const zoneProducts = products.filter((p) => p.zone === zone);
  const units = zoneProducts.reduce((s, p) => s + p.stock, 0);
  const activeOrders = orders.filter(
    (o) =>
      openStatuses.includes(o.status) &&
      o.lines.some((l) => zoneProducts.some((p) => p.sku === l.sku)),
  );
  return { zoneProducts, units, activeOrders };
}

export function workerLoad(workers: Worker[]) {
  return [...workers].sort((a, b) => b.activeTasks - a.activeTasks);
}

export function batchLabel(b: PickBatch) {
  return `Batch ${b.id}`;
}
