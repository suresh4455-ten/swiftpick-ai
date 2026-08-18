import {
  allocationPlan,
  available,
  computeKpis,
  detectBottleneck,
  ordersAtRisk,
  priorityOf,
  reorderRecs,
  routeFor,
  stockStatus,
  suggestBatches,
} from "./engine";
import type { WfState } from "./store";

export interface CopilotReply {
  answer: string;
  bullets: string[];
  link?: { label: string; to: string };
}

const suggestions = [
  "Which orders are at risk?",
  "Why is Order #1042 delayed?",
  "Which products need reordering?",
  "Where is the current bottleneck?",
  "How can we reduce picking time?",
  "Which orders should be prioritized?",
  "Show me critical inventory.",
];

export const copilotSuggestions = suggestions;

export function askCopilot(question: string, state: WfState): CopilotReply {
  const q = question.toLowerCase();
  const { orders, products, stations, exceptions } = state;
  const kpis = computeKpis(orders, products);

  const orderMatch = q.match(/#?(\d{4})/);
  if (orderMatch) {
    const order = orders.find((o) => o.id === `#${orderMatch[1]}`);
    if (order) {
      const p = priorityOf(order, products);
      const plan = allocationPlan(order, products, orders);
      const ex = exceptions.filter((e) => e.orderId === order.id && e.status === "open");
      return {
        answer: `${order.id} (${order.customer}) is ${order.status} with priority ${p.score}/100 — ${p.band}. ${p.explanation}`,
        bullets: [
          `Dispatch window: ${p.hoursToDeadline < 0 ? `breached ${Math.abs(p.hoursToDeadline).toFixed(1)}h ago` : `${p.hoursToDeadline.toFixed(1)}h remaining`}`,
          `Inventory coverage: ${Math.round(p.coverage * 100)}% (${plan.fulfilment} fulfilment)`,
          ex.length ? `Blocking exception: ${ex[0]!.type} — ${ex[0]!.action}` : "No open exceptions on this order",
          `Next action: ${plan.action}`,
        ],
        link: { label: `Open ${order.id}`, to: `/orders/${order.id.replace("#", "")}` },
      };
    }
  }

  if (q.includes("risk") || q.includes("delay") || q.includes("late")) {
    const risk = ordersAtRisk(orders, products).sort(
      (a, b) => priorityOf(b, products).score - priorityOf(a, products).score,
    );
    const top = risk[0];
    return {
      answer: top
        ? `${risk.length} orders are currently at risk. ${top.id} is the highest priority because its dispatch deadline is ${priorityOf(top, products).hoursToDeadline.toFixed(1)}h away and only ${Math.round(priorityOf(top, products).coverage * 100)}% of required inventory is allocated.`
        : "No orders are currently at risk — every open order has coverage and time in hand.",
      bullets: risk
        .slice(0, 5)
        .map(
          (o) =>
            `${o.id} · ${priorityOf(o, products).band} ${priorityOf(o, products).score}/100 · ${o.status} · ${Math.round(priorityOf(o, products).coverage * 100)}% covered`,
        ),
      link: { label: "Open order board", to: "/orders" },
    };
  }

  if (q.includes("reorder") || q.includes("replenish") || q.includes("stockout")) {
    const recs = reorderRecs(products).slice(0, 5);
    return {
      answer: recs.length
        ? `${recs.length}+ SKUs are at or below their reorder point. ${recs[0]!.sku} is the most urgent — ${recs[0]!.daysToStockout} days of cover left; reorder ${recs[0]!.quantity} units within 24 hours.`
        : "No SKU is below its reorder point right now.",
      bullets: recs.map(
        (r) => `${r.sku} · ${r.available} available · ${r.daysToStockout}d cover · reorder ${r.quantity} units (${r.risk})`,
      ),
      link: { label: "Open replenishment", to: "/inventory" },
    };
  }

  if (q.includes("bottleneck") || q.includes("slow") || q.includes("congest")) {
    const bn = detectBottleneck(stations, orders, products);
    return {
      answer: `${bn.name} is the current constraint at ${bn.avgMinutes} min average cycle versus a ${bn.benchmark} min floor average. ${bn.impact}`,
      bullets: [
        bn.recommendation,
        ...stations
          .filter((s) => s.online)
          .map((s) => `${s.name} · ${s.avgMinutes} min · queue ${s.queue}`),
      ],
      link: { label: "Open analytics", to: "/analytics" },
    };
  }

  if (q.includes("picking") || q.includes("route") || q.includes("batch") || q.includes("travel")) {
    const batch = suggestBatches(orders, products)[0];
    const sample = orders.find((o) => o.status === "ALLOCATED" || o.status === "PICKING");
    const route = sample ? routeFor(sample, products) : null;
    return {
      answer: batch
        ? `Picking time drops fastest through batching: grouping ${batch.orderIds.join(", ")} takes ${batch.baselineMinutes} min down to ${batch.optimizedMinutes} min (${batch.gainPct}% gain).`
        : "No batching opportunity right now — release more allocated orders to the picking queue first.",
      bullets: [
        route && sample
          ? `${sample.id} route optimization: ${route.originalDistance} m → ${route.optimizedDistance} m (saves ${route.saved} m)`
          : "Allocate orders to generate optimized routes.",
        "Re-slot slow movers out of prime pick faces to shorten every trip.",
        "Assign the lowest-loaded picker to the batch to avoid queueing at staging.",
      ],
      link: { label: "Open picking", to: "/picking" },
    };
  }

  if (q.includes("prioriti")) {
    const ranked = orders
      .filter((o) => !["DISPATCHED", "DELIVERED"].includes(o.status))
      .map((o) => ({ o, p: priorityOf(o, products) }))
      .sort((a, b) => b.p.score - a.p.score)
      .slice(0, 5);
    return {
      answer: ranked.length
        ? `Work this order: ${ranked.map((r) => r.o.id).join(" → ")}. ${ranked[0]!.o.id} leads at ${ranked[0]!.p.score}/100 — ${ranked[0]!.p.explanation}`
        : "No open orders to prioritize.",
      bullets: ranked.map((r) => `${r.o.id} · ${r.p.score}/100 ${r.p.band} · ${r.o.customer} · ${r.o.status}`),
      link: { label: "Open order board", to: "/orders" },
    };
  }

  if (q.includes("inventory") || q.includes("critical") || q.includes("stock")) {
    const critical = products
      .filter((p) => ["critical", "out"].includes(stockStatus(p)))
      .sort((a, b) => available(a) - available(b))
      .slice(0, 6);
    return {
      answer: `${kpis.outOfStock} SKUs are out of stock and ${kpis.lowStock} are at or below reorder point. ${kpis.damagedUnits} units are quarantined as damaged and excluded from available-to-promise.`,
      bullets: critical.map(
        (p) => `${p.sku} · ${p.name} · ${available(p)} available · ${p.zone} ${p.bin} · ${stockStatus(p)}`,
      ),
      link: { label: "Open inventory", to: "/inventory" },
    };
  }

  if (q.includes("exception")) {
    const open = exceptions.filter((e) => e.status === "open");
    return {
      answer: `${open.length} open exceptions. Each one already carries a decision and a proposed resolution.`,
      bullets: open.map((e) => `${e.id} · ${e.type}${e.orderId ? ` · ${e.orderId}` : ""} — ${e.action}`),
      link: { label: "Open Exception Center", to: "/exceptions" },
    };
  }

  return {
    answer: `Floor status: ${kpis.pending} open orders, ${kpis.atRisk} at risk, ${kpis.lowStock} SKUs below reorder point, fulfilment rate ${kpis.fulfilmentRate}%. Ask me about risk, priorities, reordering, bottlenecks or a specific order number.`,
    bullets: suggestions.slice(0, 4),
    link: { label: "Open dashboard", to: "/dashboard" },
  };
}
