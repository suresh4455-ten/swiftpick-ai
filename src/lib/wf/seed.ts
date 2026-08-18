import type {
  Order,
  OrderLine,
  PickBatch,
  Product,
  Station,
  WfException,
  Worker,
  Zone,
} from "./types";

/** Fixed simulation clock so SSR and client render identical values. */
export const NOW = Date.parse("2026-08-18T09:00:00Z");
export const H = 3600_000;

const zones: Zone[] = ["Zone A", "Zone B", "Zone C", "Zone D"];

const catalog: Array<[string, string, number]> = [
  // [product name, category, unit cost]
  ["Industrial Bearing 60mm", "Components", 42],
  ["Hydraulic Hose 2m", "Components", 68],
  ["Steel Fastener Kit", "Components", 19],
  ["Aluminium Bracket L", "Components", 26],
  ["Precision Gear 24T", "Components", 88],
  ["Drive Belt XL", "Components", 34],
  ["Servo Motor 400W", "Electronics", 214],
  ["Control Board v3", "Electronics", 176],
  ["Proximity Sensor", "Electronics", 59],
  ["Barcode Scanner Pro", "Electronics", 289],
  ["RFID Tag Roll 1k", "Electronics", 132],
  ["Thermal Printhead", "Electronics", 198],
  ["LED Work Lamp", "Electronics", 47],
  ["Lithium Cell Pack", "Electronics", 121],
  ["Cable Harness 3m", "Electronics", 38],
  ["Pallet Wrap Roll", "Packaging", 12],
  ["Corrugated Box M", "Packaging", 3],
  ["Corrugated Box L", "Packaging", 5],
  ["Void Fill Bag 50L", "Packaging", 8],
  ["Fragile Tape 60m", "Packaging", 6],
  ["Edge Protector Set", "Packaging", 9],
  ["Shrink Sleeve Pack", "Packaging", 14],
  ["Safety Helmet", "Safety", 33],
  ["Cut-Resistant Glove", "Safety", 11],
  ["High-Vis Vest", "Safety", 17],
  ["Safety Goggles", "Safety", 15],
  ["Steel Toe Boot 42", "Safety", 74],
  ["Ear Defender", "Safety", 22],
  ["Lockout Tag Kit", "Safety", 28],
  ["Coolant 5L", "Consumables", 24],
  ["Lubricant Grease 1kg", "Consumables", 18],
  ["Cleaning Solvent 2L", "Consumables", 21],
  ["Abrasive Disc 125mm", "Consumables", 7],
  ["Welding Rod Pack", "Consumables", 31],
  ["Filter Cartridge", "Consumables", 44],
  ["Adhesive Cartridge", "Consumables", 16],
  ["Conveyor Roller", "Handling", 63],
  ["Caster Wheel 100mm", "Handling", 29],
  ["Pallet Jack Wheel", "Handling", 41],
  ["Strapping Tensioner", "Handling", 96],
  ["Tote Bin 40L", "Handling", 13],
  ["Shelf Divider Set", "Handling", 10],
  ["Label Applicator", "Handling", 154],
  ["Forklift Fork Pin", "Handling", 52],
  ["Smart Thermostat", "Retail", 109],
  ["Wireless Charger", "Retail", 39],
  ["Bluetooth Speaker", "Retail", 71],
  ["Action Camera", "Retail", 189],
  ["Fitness Tracker", "Retail", 84],
  ["Noise-Cancel Headset", "Retail", 149],
  ["Portable SSD 1TB", "Retail", 118],
  ["Mesh Router", "Retail", 97],
  ["Robot Vacuum", "Retail", 258],
  ["Espresso Machine", "Retail", 312],
];

/** Deterministic pseudo-variation without Math.random. */
const jitter = (i: number, mod: number) => ((i * 37 + 11) % mod) + 1;

export function seedProducts(): Product[] {
  const products: Product[] = catalog.map(([name, category, cost], i) => {
    const sku = `WH-${(101 + i * 2).toString().padStart(3, "0")}`;
    const dailyDemand = 2 + jitter(i, 14);
    const reorderPoint = Math.round(dailyDemand * 4);
    const stock = reorderPoint * 2 + jitter(i, 40);
    return {
      sku,
      name,
      category,
      stock,
      reserved: jitter(i, 8) * 2,
      damaged: i % 11 === 0 ? jitter(i, 3) : 0,
      incoming: i % 5 === 0 ? Math.round(dailyDemand * 6) : 0,
      reorderPoint,
      reorderQty: Math.max(30, Math.round(dailyDemand * 8)),
      zone: zones[i % zones.length]!,
      bin: `${zones[i % zones.length]!.slice(-1)}${String((i % 18) + 1).padStart(2, "0")}-B${String((i % 6) + 1).padStart(2, "0")}`,
      dailyDemand,
      unitCost: cost,
    };
  });

  const byKey = (sku: string) => products.find((p) => p.sku === sku)!;

  // Deliberate edge cases used across the demo narrative.
  Object.assign(byKey("WH-153"), {
    // becomes the famous WH-204 style shortage SKU
    stock: 18,
    reserved: 8,
    damaged: 3,
    dailyDemand: 7,
    reorderPoint: 25,
    reorderQty: 50,
    incoming: 0,
    zone: "Zone A" as Zone,
    bin: "A12-B04",
  });
  Object.assign(byKey("WH-119"), { stock: 0, reserved: 0, damaged: 0, incoming: 40 }); // out of stock
  Object.assign(byKey("WH-131"), { stock: 6, reserved: 4, damaged: 2, dailyDemand: 9 }); // critical
  Object.assign(byKey("WH-147"), { stock: 940, reserved: 20, dailyDemand: 3 }); // overstock
  Object.assign(byKey("WH-167"), { damaged: 12 }); // damage cluster
  Object.assign(byKey("WH-173"), { mismatch: 5 }); // cycle-count mismatch
  Object.assign(byKey("WH-189"), { stock: 21, reserved: 12, dailyDemand: 8, reorderPoint: 30 });
  return products;
}

const customers: Array<[string, Order["tier"], Order["channel"]]> = [
  ["Northwind Logistics", "strategic", "B2B"],
  ["Meridian Retail Group", "key", "Retail"],
  ["Vertex Manufacturing", "strategic", "Express"],
  ["Kanto Supplies", "standard", "E-commerce"],
  ["Halden Industrial", "key", "B2B"],
  ["Bluepeak Stores", "standard", "Retail"],
  ["Orbital Devices", "key", "Express"],
  ["Summit Fabrication", "standard", "B2B"],
  ["Lakeside Distribution", "strategic", "B2B"],
  ["Corvus Electronics", "key", "E-commerce"],
];

const flow: Order["status"][] = [
  "NEW",
  "PRIORITIZED",
  "INVENTORY CHECK",
  "ALLOCATED",
  "PICKING",
  "PACKING",
  "QUALITY CHECK",
  "READY TO DISPATCH",
  "DISPATCHED",
  "DELIVERED",
];

function timelineFor(status: Order["status"], createdAt: number): Order["timeline"] {
  const idx = flow.indexOf(status);
  const stages = idx < 0 ? ["NEW"] : flow.slice(0, idx + 1);
  return stages.map((stage, i) => ({ stage, at: createdAt + i * 42 * 60_000 }));
}

export function seedOrders(products: Product[]): Order[] {
  const orders: Order[] = [];
  const statusPlan: Order["status"][] = [
    "NEW",
    "NEW",
    "PRIORITIZED",
    "INVENTORY CHECK",
    "ALLOCATED",
    "ALLOCATED",
    "PICKING",
    "PICKING",
    "PACKING",
    "PACKING",
    "QUALITY CHECK",
    "READY TO DISPATCH",
    "DISPATCHED",
    "DELIVERED",
    "DELIVERED",
    "EXCEPTION",
  ];

  for (let i = 0; i < 32; i++) {
    const id = `#${1040 + i}`;
    const [customer, tier, channel] = customers[i % customers.length]!;
    const createdAt = NOW - (jitter(i, 26) + 2) * H;
    const deadline = NOW + (jitter(i, 40) - 6) * H;
    const status = statusPlan[i % statusPlan.length]!;
    const lineCount = 1 + (i % 3);
    const lines: OrderLine[] = [];
    for (let l = 0; l < lineCount; l++) {
      const p = products[(i * 5 + l * 13) % products.length]!;
      if (lines.some((x) => x.sku === p.sku)) continue;
      const qty = 1 + jitter(i + l, 9);
      const allocated = flow.indexOf(status) >= 3 ? qty : 0;
      const picked = flow.indexOf(status) >= 5 ? allocated : 0;
      lines.push({ sku: p.sku, qty, allocated, picked, damaged: 0, missing: 0 });
    }
    const valueUsd = lines.reduce(
      (sum, l) => sum + l.qty * (products.find((p) => p.sku === l.sku)?.unitCost ?? 25),
      0,
    );
    orders.push({
      id,
      customer,
      tier,
      channel,
      createdAt,
      deadline,
      status,
      lines,
      timeline: timelineFor(status, createdAt),
      picker: flow.indexOf(status) >= 4 ? `PK-0${(i % 4) + 1}` : undefined,
      packer: flow.indexOf(status) >= 5 ? `PA-0${(i % 3) + 1}` : undefined,
      valueUsd,
    });
  }

  // ── Hero demo scenario ─────────────────────────────────────────────
  const hero = orders.find((o) => o.id === "#1042")!;
  Object.assign(hero, {
    customer: "Vertex Manufacturing",
    tier: "strategic" as const,
    channel: "Express" as const,
    status: "INVENTORY CHECK" as const,
    createdAt: NOW - 3 * H,
    deadline: NOW + 2 * H,
    lines: [
      { sku: "WH-153", qty: 10, allocated: 0, picked: 0, damaged: 0, missing: 0 },
      { sku: "WH-125", qty: 4, allocated: 0, picked: 0, damaged: 0, missing: 0 },
    ],
    timeline: timelineFor("INVENTORY CHECK", NOW - 3 * H),
  });
  const rival = orders.find((o) => o.id === "#1051")!;
  Object.assign(rival, {
    customer: "Kanto Supplies",
    tier: "standard" as const,
    channel: "E-commerce" as const,
    status: "INVENTORY CHECK" as const,
    createdAt: NOW - 5 * H,
    deadline: NOW + 26 * H,
    lines: [{ sku: "WH-153", qty: 5, allocated: 0, picked: 0, damaged: 0, missing: 0 }],
    timeline: timelineFor("INVENTORY CHECK", NOW - 5 * H),
  });
  const late = orders.find((o) => o.id === "#1045")!;
  Object.assign(late, {
    status: "ALLOCATED" as const,
    deadline: NOW + 4 * H,
    tier: "key" as const,
    lines: [
      { sku: "WH-125", qty: 6, allocated: 6, picked: 0, damaged: 0, missing: 0 },
      { sku: "WH-153", qty: 2, allocated: 0, picked: 0, damaged: 0, missing: 0 },
    ],
  });
  const stuck = orders.find((o) => o.id === "#1055")!;
  Object.assign(stuck, {
    status: "EXCEPTION" as const,
    deadline: NOW - 1 * H,
    lines: [{ sku: "WH-119", qty: 8, allocated: 0, picked: 0, damaged: 0, missing: 8 }],
  });

  return orders;
}

export function seedExceptions(): WfException[] {
  return [
    {
      id: "EX-2201",
      type: "Stock shortage",
      severity: "critical",
      orderId: "#1055",
      sku: "WH-119",
      detail: "Order #1055 requires 8 units of WH-119. On-hand availability is 0 units.",
      decision:
        "Hold picking, check inbound ASN and alternate zones before offering a partial shipment.",
      resolution: "Inbound PO carries 40 units, ETA 6h — after the customer dispatch cut-off.",
      action: "Split the order: dispatch remaining lines now, backorder WH-119 with new ETA.",
      status: "open",
      createdAt: NOW - 2 * H,
    },
    {
      id: "EX-2202",
      type: "Damaged item",
      severity: "high",
      sku: "WH-167",
      detail: "Cycle count at Zone C found 12 damaged units of WH-167 (crushed outer packaging).",
      decision: "Quarantine damaged units and exclude them from available-to-promise stock.",
      resolution: "Available stock recalculated; 2 open orders re-scored for fulfilment risk.",
      action: "Raise supplier claim and move quarantine pallet to Receiving inspection bay.",
      status: "open",
      createdAt: NOW - 5 * H,
    },
    {
      id: "EX-2203",
      type: "Inventory mismatch",
      severity: "medium",
      sku: "WH-173",
      detail: "System shows 5 units more than the counted quantity in bin C09-B03.",
      decision: "Freeze the bin, trigger a blind recount before allocating further orders.",
      resolution: "Recount scheduled for the next Zone C sweep.",
      action: "Assign recount task to the Zone C picker and adjust on-hand after verification.",
      status: "open",
      createdAt: NOW - 9 * H,
    },
    {
      id: "EX-2204",
      type: "Dispatch delay",
      severity: "high",
      orderId: "#1048",
      detail: "Carrier pickup window missed by 35 minutes at Dispatch Bay 2.",
      decision: "Re-slot to the 14:00 line-haul and notify the customer proactively.",
      resolution: "Capacity confirmed on the 14:00 line-haul.",
      action: "Reprint labels for the new manifest and confirm the updated ETA.",
      status: "resolved",
      createdAt: NOW - 14 * H,
    },
  ];
}

export function seedStations(): Station[] {
  return [
    { id: "PS-01", name: "Packing Station 01", kind: "packing", avgMinutes: 5.4, queue: 3, online: true },
    { id: "PS-02", name: "Packing Station 02", kind: "packing", avgMinutes: 6.1, queue: 4, online: true },
    { id: "PS-03", name: "Packing Station 03", kind: "packing", avgMinutes: 11.8, queue: 9, online: true },
    { id: "QC-01", name: "Quality Check 01", kind: "quality", avgMinutes: 4.2, queue: 2, online: true },
    { id: "DS-01", name: "Dispatch Bay 1", kind: "dispatch", avgMinutes: 7.5, queue: 5, online: true },
    { id: "DS-02", name: "Dispatch Bay 2", kind: "dispatch", avgMinutes: 8.9, queue: 6, online: true },
  ];
}

export function seedWorkers(): Worker[] {
  return [
    { id: "PK-01", name: "R. Iyer", role: "picker", zone: "Zone A", activeTasks: 4, itemsPerHour: 92 },
    { id: "PK-02", name: "L. Ferreira", role: "picker", zone: "Zone B", activeTasks: 2, itemsPerHour: 78 },
    { id: "PK-03", name: "M. Okafor", role: "picker", zone: "Zone C", activeTasks: 6, itemsPerHour: 101 },
    { id: "PK-04", name: "S. Novak", role: "picker", zone: "Zone D", activeTasks: 1, itemsPerHour: 69 },
    { id: "PA-01", name: "T. Bergman", role: "packer", zone: "Packing", activeTasks: 3, itemsPerHour: 54 },
    { id: "PA-02", name: "D. Alvarez", role: "packer", zone: "Packing", activeTasks: 5, itemsPerHour: 61 },
    { id: "PA-03", name: "N. Haddad", role: "packer", zone: "Packing", activeTasks: 1, itemsPerHour: 48 },
  ];
}

export function seedBatches(): PickBatch[] {
  return [];
}
