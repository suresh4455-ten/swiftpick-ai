import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, SectionHeader, SignalBadge } from "@/components/wf/bits";
import { priorityOf } from "@/lib/wf/engine";
import { useWf } from "@/lib/wf/store";

export const Route = createFileRoute("/_shell/packing")({
  head: () => ({
    meta: [
      { title: "Packing & Quality Control — WAREFLOW AI" },
      { name: "description", content: "Packing station checklist with packaging recommendation, quality gate and automatic exception creation." },
      { property: "og:title", content: "Packing & Quality Control — WAREFLOW AI" },
      { property: "og:description", content: "Pass, fail or partial — every outcome routes the order correctly." },
    ],
  }),
  component: PackingPage,
});

function PackingPage() {
  const { orders, products, stations, dispatch, act } = useWf();
  const queue = orders.filter((o) => ["PACKING", "QUALITY CHECK"].includes(o.status));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Packing Station"
        title="Pack-out & quality gate"
        description="Verify picked against expected quantities, apply the packaging recommendation and record the quality outcome."
      />

      <section>
        <SectionHeader title="Station status" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stations.filter((s) => s.kind !== "dispatch").map((s) => (
            <div key={s.id} className="panel p-4 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{s.name}</p>
                <SignalBadge tone={!s.online ? "muted" : s.avgMinutes > 9 ? "danger" : s.avgMinutes > 6.5 ? "warn" : "ok"}>
                  {s.online ? `${s.avgMinutes} min` : "offline"}
                </SignalBadge>
              </div>
              <p className="tabular mt-1 text-xs text-muted-foreground">Queue {s.queue} orders</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => act(() => dispatch({ type: "rebalance", stationId: s.id }), `Rebalance applied · ${s.name}`)}>
                  Rebalance
                </Button>
                <Button size="sm" variant="ghost" onClick={() => act(() => dispatch({ type: "toggleStation", stationId: s.id }), `${s.name} is now ${s.online ? "offline" : "online"}`)}>
                  {s.online ? "Take offline" : "Bring online"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader title="Pack queue" description="Damaged or missing units automatically create an exception with a proposed resolution." />
        {queue.length === 0 ? (
          <EmptyState title="Nothing waiting to pack" body="Completed picks arrive here automatically." actionLabel="Open picking" to="/picking" />
        ) : (
          <div className="space-y-3">
            {queue.map((o) => {
              const p = priorityOf(o, products);
              const units = o.lines.reduce((s, l) => s + l.qty, 0);
              const picked = o.lines.reduce((s, l) => s + l.picked, 0);
              const damaged = o.lines.reduce((s, l) => s + l.damaged, 0);
              const missing = o.lines.reduce((s, l) => s + l.missing, 0);
              const packaging = units > 12 ? "Double-wall carton L + edge protectors" : units > 5 ? "Corrugated box M + void fill" : "Polybag mailer + fragile tape";
              return (
                <div key={o.id} className="panel p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{o.id} · {o.customer}</p>
                    <SignalBadge tone={p.band === "CRITICAL" ? "danger" : "muted"}>{p.score} {p.band}</SignalBadge>
                    <SignalBadge tone="muted">{o.status}</SignalBadge>
                    <span className="tabular ml-auto text-xs text-muted-foreground">expected {units} · picked {picked} · damaged {damaged} · missing {missing}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Packaging recommendation: {packaging}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => act(() => dispatch({ type: "qc", orderId: o.id, result: "PASS" }), `Quality check PASS · ${o.id}`)}>Quality PASS</Button>
                    <Button size="sm" variant="outline" onClick={() => act(() => dispatch({ type: "qc", orderId: o.id, result: "PARTIAL" }), `Quality check PARTIAL · ${o.id}`, "Order ships short with a backorder line.")}>Quality PARTIAL</Button>
                    <Button size="sm" variant="ghost" onClick={() => act(() => dispatch({ type: "qc", orderId: o.id, result: "FAIL" }), `Quality check FAIL · ${o.id}`, "Packing-failure exception created.")}>Quality FAIL</Button>
                    <Button size="sm" variant="ghost" onClick={() => act(() => dispatch({ type: "damage", orderId: o.id, sku: o.lines[0]!.sku, qty: 1, kind: "damaged" }), "Damage reported at packing")}>Report damage</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <SectionHeader title="Ready to dispatch" />
        <div className="space-y-2">
          {orders.filter((o) => o.status === "READY TO DISPATCH").map((o) => (
            <div key={o.id} className="panel flex flex-wrap items-center gap-2 p-3 text-sm">
              <span className="font-medium">{o.id}</span>
              <span className="text-muted-foreground">{o.customer} · QC {o.qc ?? "—"}</span>
              <Button size="sm" className="ml-auto" onClick={() => act(() => dispatch({ type: "status", orderId: o.id, status: "DISPATCHED" }), `Dispatched · ${o.id}`, "Reserved stock consumed and inventory updated.")}>
                Dispatch
              </Button>
            </div>
          ))}
          {orders.filter((o) => o.status === "READY TO DISPATCH").length === 0 ? (
            <EmptyState title="No orders staged for dispatch" body="Orders passing the quality gate appear here." />
          ) : null}
        </div>
      </section>
    </div>
  );
}
