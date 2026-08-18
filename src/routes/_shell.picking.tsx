import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, SectionHeader, SignalBadge } from "@/components/wf/bits";
import { bandTone, pickMinutes, priorityOf, routeFor, suggestBatches } from "@/lib/wf/engine";
import { useWf } from "@/lib/wf/store";

export const Route = createFileRoute("/_shell/picking")({
  head: () => ({
    meta: [
      { title: "Smart Picking & Batching — WAREFLOW AI" },
      { name: "description", content: "Optimized pick routes with measured distance saved, plus multi-order batch optimization and damage reporting." },
      { property: "og:title", content: "Smart Picking & Batching — WAREFLOW AI" },
      { property: "og:description", content: "Fewer metres walked, more orders picked per hour." },
    ],
  }),
  component: PickingPage,
});

function PickingPage() {
  const { orders, products, workers, batches, dispatch, act } = useWf();
  const queue = orders.filter((o) => ["ALLOCATED", "PICKING"].includes(o.status));
  const suggestions = suggestBatches(orders, products);
  const pickers = workers.filter((w) => w.role === "picker");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Picking Operations"
        title="Optimized picking queue"
        description="Every order carries a nearest-neighbour route across pick zones, with the distance and time saved made explicit."
      />

      <section>
        <SectionHeader title="Batch optimization" description="Compatible orders sharing zones are merged into a single trip." />
        {suggestions.length === 0 ? (
          <EmptyState title="No batching opportunity" body="Allocate more orders to build a compatible batch." actionLabel="Open allocation" to="/allocation" />
        ) : (
          <div className="grid gap-3 lg:grid-cols-3">
            {suggestions.map((b) => (
              <div key={b.orderIds.join()} className="panel p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{b.orderIds.join(", ")}</p>
                  <SignalBadge tone="ok">+{b.gainPct}%</SignalBadge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{b.reason}</p>
                <p className="tabular mt-3 text-sm">Before {b.baselineMinutes} min → optimized {b.optimizedMinutes} min</p>
                <p className="mt-1 text-xs text-muted-foreground">Zones: {b.zones.join(" → ")}</p>
                <Button size="sm" className="mt-3" onClick={() => act(() => dispatch({ type: "batch", orderIds: b.orderIds }), "Optimized batch created", `${b.baselineMinutes} min → ${b.optimizedMinutes} min picker time.`)}>
                  Create optimized batch
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {batches.length ? (
        <section>
          <SectionHeader title="Active batches" />
          <div className="grid gap-3 lg:grid-cols-3">
            {batches.map((b) => (
              <div key={b.id} className="panel p-4 text-sm">
                <p className="font-semibold">Batch #{b.id}</p>
                <p className="mt-1 text-xs text-muted-foreground">{b.orderIds.join(", ")} · {b.zones.join(" → ")}</p>
                <p className="tabular mt-2">{b.baselineMinutes} min → {b.optimizedMinutes} min</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeader title="Pick tasks" description="Assign a picker, walk the optimized route, report damage or shortfalls inline." />
        {queue.length === 0 ? (
          <EmptyState title="Picking queue is empty" body="Allocated orders will appear here for route optimization." actionLabel="Open allocation" to="/allocation" />
        ) : (
          <div className="space-y-3">
            {queue.map((o) => {
              const p = priorityOf(o, products);
              const route = routeFor(o, products);
              return (
                <div key={o.id} className="panel p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{o.id} · {o.customer}</p>
                    <SignalBadge tone={bandTone(p.band) as "danger"}>{p.score} {p.band}</SignalBadge>
                    <SignalBadge tone="muted">{o.status}</SignalBadge>
                    {o.batchId ? <SignalBadge tone="info">Batch #{o.batchId}</SignalBadge> : null}
                    <span className="tabular ml-auto text-xs text-muted-foreground">
                      {o.lines.reduce((s, l) => s + l.qty, 0)} units · est {pickMinutes(o, products)} min · picker {o.picker ?? "unassigned"}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground">Original route: {route.original.join(" → ")} ({route.originalDistance} m)</p>
                  <p className="text-xs">Optimized route: {route.optimized.join(" → ")} ({route.optimizedDistance} m) · <span className="text-ok">saved {route.saved} m / {route.savedPct}%</span></p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {!o.picker ? (
                      <Button size="sm" variant="secondary" onClick={() => act(() => dispatch({ type: "assignPicker", orderId: o.id, picker: pickers.sort((a, b) => a.activeTasks - b.activeTasks)[0]!.id }), `Picker assigned to ${o.id}`)}>
                        Assign lowest-loaded picker
                      </Button>
                    ) : null}
                    {o.status === "ALLOCATED" ? (
                      <Button size="sm" onClick={() => act(() => dispatch({ type: "status", orderId: o.id, status: "PICKING", note: `Optimized route ${route.optimizedDistance} m` }), `Picking started · ${o.id}`)}>
                        Start picking
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => act(() => dispatch({ type: "status", orderId: o.id, status: "PACKING", note: "Pick complete" }), `${o.id} moved to packing`)}>
                        Complete pick
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => act(() => dispatch({ type: "damage", orderId: o.id, sku: o.lines[0]!.sku, qty: 2, kind: "damaged" }), "Damage reported", "2 units removed from usable stock; exception raised with a resolution.")}>
                      Report 2 damaged
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => act(() => dispatch({ type: "damage", orderId: o.id, sku: o.lines[0]!.sku, qty: 1, kind: "missing" }), "Missing item reported")}>
                      Report missing
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <SectionHeader title="Picker workload" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {pickers.map((w) => (
            <div key={w.id} className="panel p-4 text-sm">
              <p className="font-semibold">{w.name}</p>
              <p className="text-xs text-muted-foreground">{w.id} · {w.zone}</p>
              <p className="tabular mt-2">{w.activeTasks} active tasks · {w.itemsPerHour} items/h</p>
              <SignalBadge tone={w.activeTasks > 4 ? "danger" : w.activeTasks > 2 ? "warn" : "ok"} className="mt-2">
                {w.activeTasks > 4 ? "overloaded" : w.activeTasks > 2 ? "busy" : "available"}
              </SignalBadge>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
