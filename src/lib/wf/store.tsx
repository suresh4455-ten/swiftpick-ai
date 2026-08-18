import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import {
  NOW,
  seedBatches,
  seedExceptions,
  seedOrders,
  seedProducts,
  seedStations,
  seedWorkers,
} from "./seed";
import {
  allocationPlan,
  available,
  buildInsights,
  computeKpis,
  detectBottleneck,
  pickMinutes,
  priorityOf,
  suggestBatches,
} from "./engine";
import type {
  ExceptionType,
  Notification,
  Order,
  OrderStatus,
  PickBatch,
  Product,
  Role,
  Station,
  WfException,
  Worker,
} from "./types";

export interface WfState {
  products: Product[];
  orders: Order[];
  exceptions: WfException[];
  stations: Station[];
  workers: Worker[];
  batches: PickBatch[];
  notifications: Notification[];
  role: Role;
  seq: number;
}

const initialState = (): WfState => {
  const products = seedProducts();
  const orders = seedOrders(products);
  return {
    products,
    orders,
    exceptions: seedExceptions(),
    stations: seedStations(),
    workers: seedWorkers(),
    batches: seedBatches(),
    role: "manager",
    seq: 1,
    notifications: [
      {
        id: "n1",
        level: "critical",
        title: "Critical order risk · #1042",
        body: "Express order for Vertex Manufacturing has a 2h dispatch window and only 70% coverage.",
        at: NOW - 12 * 60_000,
        read: false,
      },
      {
        id: "n2",
        level: "warning",
        title: "Low stock · WH-153",
        body: "7 available units against 7/day demand — stockout expected in ~1 day.",
        at: NOW - 48 * 60_000,
        read: false,
      },
      {
        id: "n3",
        level: "critical",
        title: "Stockout detected · WH-119",
        body: "0 available units. Order #1055 is blocked on 8 units.",
        at: NOW - 95 * 60_000,
        read: false,
      },
      {
        id: "n4",
        level: "warning",
        title: "Packing bottleneck · Packing Station 03",
        body: "11.8 min average cycle vs 6.2 min floor average.",
        at: NOW - 140 * 60_000,
        read: true,
      },
    ],
  };
};

type Action =
  | { type: "role"; role: Role }
  | { type: "allocate"; orderId: string }
  | { type: "status"; orderId: string; status: OrderStatus; note?: string }
  | { type: "assignPicker"; orderId: string; picker: string }
  | { type: "damage"; orderId: string; sku: string; qty: number; kind: "damaged" | "missing" }
  | { type: "qc"; orderId: string; result: "PASS" | "FAIL" | "PARTIAL" }
  | { type: "reorder"; sku: string }
  | { type: "batch"; orderIds: string[] }
  | { type: "rebalance"; stationId: string }
  | { type: "toggleStation"; stationId: string }
  | { type: "resolveException"; id: string }
  | { type: "exception"; ex: Omit<WfException, "id" | "createdAt" | "status"> }
  | { type: "notify"; n: Omit<Notification, "id" | "at" | "read"> }
  | { type: "readAll" }
  | { type: "reset" };

const stageOrder: OrderStatus[] = [
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

function stamp(order: Order, stage: string, note?: string): Order {
  const at = (order.timeline.at(-1)?.at ?? NOW) + 6 * 60_000;
  return { ...order, timeline: [...order.timeline, { stage, at, note }] };
}

function pushNotification(state: WfState, n: Omit<Notification, "id" | "at" | "read">): WfState {
  return {
    ...state,
    seq: state.seq + 1,
    notifications: [
      { ...n, id: `n-${state.seq}`, at: NOW + state.seq * 60_000, read: false },
      ...state.notifications,
    ].slice(0, 40),
  };
}

function reducer(state: WfState, action: Action): WfState {
  switch (action.type) {
    case "role":
      return { ...state, role: action.role };

    case "allocate": {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order) return state;
      const plan = allocationPlan(order, state.products, state.orders);
      const products = state.products.map((p) => {
        const line = plan.lines.find((l) => l.sku === p.sku);
        if (!line) return p;
        const orderLine = order.lines.find((l) => l.sku === p.sku)!;
        const delta = line.allocate - orderLine.allocated;
        return delta > 0 ? { ...p, reserved: p.reserved + delta } : p;
      });
      const orders = state.orders.map((o) =>
        o.id !== order.id
          ? o
          : stamp(
              {
                ...o,
                status: plan.fulfilment === "blocked" ? "EXCEPTION" : "ALLOCATED",
                lines: o.lines.map((l) => ({
                  ...l,
                  allocated: plan.lines.find((x) => x.sku === l.sku)?.allocate ?? l.allocated,
                })),
              },
              plan.fulfilment === "blocked" ? "EXCEPTION" : "ALLOCATED",
              plan.decision,
            ),
      );
      let next: WfState = { ...state, products, orders };
      const shortfall = plan.lines.reduce((s, l) => s + l.shortfall, 0);
      if (shortfall > 0) {
        const line = plan.lines.find((l) => l.shortfall > 0)!;
        next = {
          ...next,
          seq: next.seq + 1,
          exceptions: [
            {
              id: `EX-${2300 + next.seq}`,
              type: "Stock shortage",
              severity: plan.fulfilment === "blocked" ? "critical" : "high",
              orderId: order.id,
              sku: line.sku,
              detail: `${order.id} is short ${shortfall} unit(s) of ${line.sku} after priority-based allocation.`,
              decision:
                "Keep the allocated units reserved for this order and put the shortfall on replenishment watch.",
              resolution: `Check inbound stock and alternate bins for ${line.sku}; otherwise split the shipment.`,
              action: "Approve replenishment or confirm a partial dispatch with the customer.",
              status: "open",
              createdAt: NOW,
            },
            ...next.exceptions,
          ],
        };
        next = pushNotification(next, {
          level: "warning",
          title: `Partial allocation · ${order.id}`,
          body: `${shortfall} unit(s) of ${line.sku} short — replenishment watch created.`,
        });
      } else {
        next = pushNotification(next, {
          level: "success",
          title: `Allocation applied · ${order.id}`,
          body: "All required units reserved. Order released to picking queue.",
        });
      }
      return next;
    }

    case "status": {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order) return state;
      let products = state.products;
      // Consume reserved stock at dispatch.
      if (action.status === "DISPATCHED") {
        products = state.products.map((p) => {
          const line = order.lines.find((l) => l.sku === p.sku);
          if (!line) return p;
          return {
            ...p,
            stock: Math.max(0, p.stock - line.allocated),
            reserved: Math.max(0, p.reserved - line.allocated),
          };
        });
      }
      const orders = state.orders.map((o) =>
        o.id === order.id
          ? stamp({ ...o, status: action.status }, action.status, action.note)
          : o,
      );
      let next: WfState = { ...state, products, orders };
      if (action.status === "DISPATCHED") {
        next = pushNotification(next, {
          level: "success",
          title: `Dispatched · ${order.id}`,
          body: "Stock consumed, inventory and analytics updated.",
        });
      }
      return next;
    }

    case "assignPicker":
      return {
        ...state,
        orders: state.orders.map((o) =>
          o.id === action.orderId ? { ...o, picker: action.picker } : o,
        ),
      };

    case "damage": {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order) return state;
      const products = state.products.map((p) =>
        p.sku === action.sku && action.kind === "damaged"
          ? { ...p, damaged: p.damaged + action.qty, reserved: Math.max(0, p.reserved - action.qty) }
          : p,
      );
      const orders = state.orders.map((o) =>
        o.id !== action.orderId
          ? o
          : stamp(
              {
                ...o,
                status: "EXCEPTION",
                lines: o.lines.map((l) =>
                  l.sku !== action.sku
                    ? l
                    : {
                        ...l,
                        [action.kind]: l[action.kind] + action.qty,
                        allocated: Math.max(0, l.allocated - action.qty),
                        picked: Math.max(0, l.picked - action.qty),
                      },
                ),
              },
              "EXCEPTION",
              `${action.qty} unit(s) of ${action.sku} reported ${action.kind}`,
            ),
      );
      const alt = products.find(
        (p) => p.sku === action.sku && available(p) >= action.qty,
      );
      const type: ExceptionType = action.kind === "damaged" ? "Damaged item" : "Missing item";
      let next: WfState = {
        ...state,
        products,
        orders,
        seq: state.seq + 1,
        exceptions: [
          {
            id: `EX-${2400 + state.seq}`,
            type,
            severity: "high",
            orderId: action.orderId,
            sku: action.sku,
            detail: `${action.qty} unit(s) of ${action.sku} reported ${action.kind} while picking ${action.orderId}.`,
            decision:
              "Remove the units from available-to-promise, re-run allocation and search alternate bins plus inbound stock.",
            resolution: alt
              ? `${action.qty} replacement unit(s) found in ${alt.zone} · ${alt.bin}.`
              : "No replacement stock on hand — inbound ASN or partial dispatch required.",
            action: alt
              ? `Transfer ${action.qty} unit(s) from ${alt.bin} to the picking station and resume the pick.`
              : "Split the order and confirm a revised ETA with the customer.",
            status: "open",
            createdAt: NOW,
          },
          ...state.exceptions,
        ],
      };
      next = pushNotification(next, {
        level: "critical",
        title: `${type} reported · ${action.orderId}`,
        body: `${action.qty} × ${action.sku} removed from usable stock. Exception raised with a proposed resolution.`,
      });
      return next;
    }

    case "qc": {
      const order = state.orders.find((o) => o.id === action.orderId);
      if (!order) return state;
      const nextStatus: OrderStatus =
        action.result === "PASS" ? "READY TO DISPATCH" : action.result === "PARTIAL" ? "READY TO DISPATCH" : "EXCEPTION";
      let next: WfState = {
        ...state,
        orders: state.orders.map((o) =>
          o.id === order.id
            ? stamp({ ...o, qc: action.result, status: nextStatus }, `QUALITY CHECK · ${action.result}`)
            : o,
        ),
      };
      if (action.result === "FAIL") {
        next = {
          ...next,
          seq: next.seq + 1,
          exceptions: [
            {
              id: `EX-${2500 + next.seq}`,
              type: "Packing failure",
              severity: "high",
              orderId: order.id,
              detail: `Quality check failed for ${order.id} at the packing station.`,
              decision: "Return the tote to packing, re-verify every line against the pick list.",
              resolution: "Repack with reinforced packaging and re-run the quality gate.",
              action: "Repack and re-submit for quality check.",
              status: "open",
              createdAt: NOW,
            },
            ...next.exceptions,
          ],
        };
      }
      return pushNotification(next, {
        level: action.result === "PASS" ? "success" : action.result === "PARTIAL" ? "warning" : "critical",
        title: `Quality check ${action.result} · ${order.id}`,
        body:
          action.result === "FAIL"
            ? "Order held and a packing-failure exception was created."
            : "Order moved to READY TO DISPATCH.",
      });
    }

    case "reorder": {
      const p = state.products.find((x) => x.sku === action.sku);
      if (!p) return state;
      const next: WfState = {
        ...state,
        products: state.products.map((x) =>
          x.sku === action.sku
            ? { ...x, incoming: x.incoming + x.reorderQty, reorderRequested: true }
            : x,
        ),
      };
      return pushNotification(next, {
        level: "success",
        title: `Reorder approved · ${p.sku}`,
        body: `${p.reorderQty} units raised on purchase order. Inbound quantity updated.`,
      });
    }

    case "batch": {
      const suggestion = suggestBatches(state.orders, state.products).find(
        (s) => s.orderIds.join() === action.orderIds.join(),
      );
      const orders = state.orders.filter((o) => action.orderIds.includes(o.id));
      const baseline =
        suggestion?.baselineMinutes ??
        Math.round(orders.reduce((s, o) => s + pickMinutes(o, state.products) + 4.5, 0) * 10) / 10;
      const optimized = suggestion?.optimizedMinutes ?? Math.round(baseline * 0.64 * 10) / 10;
      const id = `B-${100 + state.batches.length + 4}`;
      const zones = suggestion?.zones ?? ["Zone A"];
      const next: WfState = {
        ...state,
        batches: [
          { id, orderIds: action.orderIds, zones, baselineMinutes: baseline, optimizedMinutes: optimized, createdAt: NOW },
          ...state.batches,
        ],
        orders: state.orders.map((o) =>
          action.orderIds.includes(o.id)
            ? stamp({ ...o, batchId: id, status: "PICKING" }, "PICKING", `Batched into ${id}`)
            : o,
        ),
      };
      return pushNotification(next, {
        level: "success",
        title: `Optimized batch ${id} created`,
        body: `${action.orderIds.join(", ")} · ${baseline} min → ${optimized} min picker time.`,
      });
    }

    case "rebalance": {
      const target = state.stations.find((s) => s.id === action.stationId);
      if (!target) return state;
      const helpers = state.stations.filter(
        (s) => s.kind === target.kind && s.id !== target.id && s.online,
      );
      const moved = Math.min(target.queue, helpers.length * 2);
      const next: WfState = {
        ...state,
        stations: state.stations.map((s) => {
          if (s.id === target.id)
            return {
              ...s,
              queue: s.queue - moved,
              avgMinutes: Math.round(Math.max(4.5, s.avgMinutes * 0.62) * 10) / 10,
            };
          if (helpers.some((h) => h.id === s.id))
            return { ...s, queue: s.queue + Math.round(moved / helpers.length) };
          return s;
        }),
        workers: state.workers.map((w, i) =>
          w.role === "packer" && i % 2 === 0 ? { ...w, activeTasks: w.activeTasks + 1 } : w,
        ),
      };
      return pushNotification(next, {
        level: "success",
        title: `Rebalance applied · ${target.name}`,
        body: `${moved} orders redistributed; cycle time projected to drop to ${Math.round(Math.max(4.5, target.avgMinutes * 0.62) * 10) / 10} min.`,
      });
    }

    case "toggleStation":
      return {
        ...state,
        stations: state.stations.map((s) =>
          s.id === action.stationId ? { ...s, online: !s.online } : s,
        ),
      };

    case "resolveException": {
      const ex = state.exceptions.find((e) => e.id === action.id);
      if (!ex) return state;
      let orders = state.orders;
      if (ex.orderId) {
        orders = state.orders.map((o) =>
          o.id === ex.orderId && o.status === "EXCEPTION"
            ? stamp({ ...o, status: "ALLOCATED" }, "ALLOCATED", `Exception ${ex.id} resolved`)
            : o,
        );
      }
      const next: WfState = {
        ...state,
        orders,
        exceptions: state.exceptions.map((e) =>
          e.id === action.id ? { ...e, status: "resolved" } : e,
        ),
      };
      return pushNotification(next, {
        level: "success",
        title: `Exception resolved · ${ex.id}`,
        body: ex.action,
      });
    }

    case "exception": {
      const next: WfState = {
        ...state,
        seq: state.seq + 1,
        exceptions: [
          { ...action.ex, id: `EX-${2600 + state.seq}`, status: "open", createdAt: NOW },
          ...state.exceptions,
        ],
      };
      return next;
    }

    case "notify":
      return pushNotification(state, action.n);

    case "readAll":
      return { ...state, notifications: state.notifications.map((n) => ({ ...n, read: true })) };

    case "reset":
      return initialState();

    default:
      return state;
  }
}

interface WfContextValue extends WfState {
  dispatch: React.Dispatch<Action>;
  kpis: ReturnType<typeof computeKpis>;
  insights: ReturnType<typeof buildInsights>;
  bottleneck: ReturnType<typeof detectBottleneck>;
  demoRunning: boolean;
  demoStep: string | null;
  startDemo: () => void;
  act: (fn: () => void, message: string, description?: string) => void;
}

const WfContext = createContext<WfContextValue | null>(null);

export function WfProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoStep, setDemoStep] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const kpis = useMemo(() => computeKpis(state.orders, state.products), [state.orders, state.products]);
  const bottleneck = useMemo(
    () => detectBottleneck(state.stations, state.orders, state.products),
    [state.stations, state.orders, state.products],
  );
  const insights = useMemo(
    () => buildInsights(state.orders, state.products, state.stations, state.exceptions),
    [state.orders, state.products, state.stations, state.exceptions],
  );

  const act = useCallback((fn: () => void, message: string, description?: string) => {
    fn();
    toast.success(message, description ? { description } : undefined);
  }, []);

  const startDemo = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setDemoRunning(true);
    const hero = "#1042";
    const steps: Array<[string, () => void]> = [
      [
        "Urgent Express order #1042 received — scoring priority",
        () => dispatch({ type: "status", orderId: hero, status: "PRIORITIZED", note: "Priority engine scored the order" }),
      ],
      [
        "Inventory check: shortage detected on WH-153",
        () => dispatch({ type: "status", orderId: hero, status: "INVENTORY CHECK", note: "Availability verified against competing demand" }),
      ],
      [
        "AI allocation applied — 7 units reserved for #1042, 3 to replenishment",
        () => dispatch({ type: "allocate", orderId: hero }),
      ],
      [
        "Replenishment approved for WH-153",
        () => dispatch({ type: "reorder", sku: "WH-153" }),
      ],
      [
        "Optimized picking route released to picker",
        () => dispatch({ type: "status", orderId: hero, status: "PICKING", note: "Optimized route assigned" }),
      ],
      [
        "Picker reports 2 damaged units — exception raised automatically",
        () => dispatch({ type: "damage", orderId: hero, sku: "WH-125", qty: 2, kind: "damaged" }),
      ],
      [
        "Bottleneck rebalance applied at Packing Station 03",
        () => dispatch({ type: "rebalance", stationId: "PS-03" }),
      ],
      [
        "Order packed and passed quality check",
        () => {
          dispatch({ type: "status", orderId: hero, status: "PACKING", note: "Packed with reinforced carton" });
          dispatch({ type: "qc", orderId: hero, result: "PARTIAL" });
        },
      ],
      [
        "#1042 dispatched inside its window — inventory and analytics updated",
        () => dispatch({ type: "status", orderId: hero, status: "DISPATCHED" }),
      ],
    ];

    steps.forEach(([label, run], i) => {
      timers.current.push(
        setTimeout(() => {
          setDemoStep(label);
          run();
          toast.info(`Demo step ${i + 1}/${steps.length}`, { description: label });
          if (i === steps.length - 1) {
            timers.current.push(
              setTimeout(() => {
                setDemoRunning(false);
                setDemoStep(null);
                toast.success("Demo complete", {
                  description: "Observe → Analyze → Decide → Act → Verify → Learn, end to end.",
                });
              }, 2200),
            );
          }
        }, 1800 * i + 400),
      );
    });
  }, []);

  const value = useMemo<WfContextValue>(
    () => ({ ...state, dispatch, kpis, insights, bottleneck, demoRunning, demoStep, startDemo, act }),
    [state, kpis, insights, bottleneck, demoRunning, demoStep, startDemo, act],
  );

  return <WfContext.Provider value={value}>{children}</WfContext.Provider>;
}

export function useWf() {
  const ctx = useContext(WfContext);
  if (!ctx) throw new Error("useWf must be used inside WfProvider");
  return ctx;
}

export function useOrderPriority(order: Order) {
  const { products } = useWf();
  return useMemo(() => priorityOf(order, products), [order, products]);
}

export const nextStage = (status: OrderStatus): OrderStatus | null => {
  const i = stageOrder.indexOf(status);
  return i >= 0 && i < stageOrder.length - 1 ? stageOrder[i + 1]! : null;
};

export { stageOrder };
