import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { DecisionCard, EmptyState, PageHeader, SignalBadge } from "@/components/wf/bits";
import { allocationPlan, bandTone, priorityOf } from "@/lib/wf/engine";
import { useWf } from "@/lib/wf/store";

export const Route = createFileRoute("/_shell/allocation")({
  head: () => ({
    meta: [
      { title: "Smart Allocation Engine — WAREFLOW AI" },
      { name: "description", content: "Priority-based inventory allocation across competing orders, with bin-level assignment and shortfall handling." },
      { property: "og:title", content: "Smart Allocation Engine — WAREFLOW AI" },
      { property: "og:description", content: "Scarce inventory goes to the highest-scoring order — never to damaged stock." },
    ],
  }),
  component: AllocationPage,
});

function AllocationPage() {
  const { orders, products, dispatch, act } = useWf();
  const queue = orders
    .filter((o) => ["NEW", "PRIORITIZED", "INVENTORY CHECK"].includes(o.status))
    .map((o) => ({ o, p: priorityOf(o, products), plan: allocationPlan(o, products, orders) }))
    .sort((a, b) => b.p.score - a.p.score);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Allocation Engine"
        title="Allocate scarce inventory by priority"
        description="Availability check → competing-demand comparison → bin-level allocation → shortfall to replenishment. Damaged units are never promised."
      />

      {queue.length === 0 ? (
        <EmptyState
          title="Allocation queue is clear"
          body="Every order has been allocated. New or re-scored orders will appear here automatically."
          actionLabel="Open order board"
          to="/orders"
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {queue.map(({ o, p, plan }) => (
            <DecisionCard
              key={o.id}
              tone={bandTone(p.band) as "danger"}
              label={`${o.id} · ${o.customer} · ${p.band} ${p.score}/100`}
              decision={plan.decision}
              reason={plan.reason}
              impact={plan.impact}
              action={plan.action}
              factors={plan.lines.map((l) => ({
                label: `${l.sku} → ${l.zone} · ${l.bin}`,
                value: `${l.allocate}/${l.required}${l.shortfall ? ` · ${l.shortfall} short` : ""}`,
              }))}
            >
              <SignalBadge tone={plan.fulfilment === "full" ? "ok" : plan.fulfilment === "partial" ? "warn" : "danger"}>
                {plan.fulfilment} fulfilment
              </SignalBadge>
              <Button size="sm" onClick={() => act(() => dispatch({ type: "allocate", orderId: o.id }), `Allocation applied to ${o.id}`, plan.decision)}>
                Apply allocation
              </Button>
            </DecisionCard>
          ))}
        </div>
      )}
    </div>
  );
}
