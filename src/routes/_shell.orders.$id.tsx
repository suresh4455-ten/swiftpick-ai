import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DecisionCard, EmptyState, Meter, PageHeader, SectionHeader, SignalBadge } from "@/components/wf/bits";
import { allocationPlan, available, bandTone, fmtTime, priorityOf, relative, routeFor } from "@/lib/wf/engine";
import { nextStage, stageOrder, useWf } from "@/lib/wf/store";

export const Route = createFileRoute("/_shell/orders/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Order #${params.id} — WAREFLOW AI` },
      {
        name: "description",
        content: `Full decision trail for order #${params.id}: priority score, allocation plan, lifecycle timeline and next action.`,
      },
      { property: "og:title", content: `Order #${params.id} — WAREFLOW AI` },
      { property: "og:description", content: "Explainable order fulfillment decisions, stage by stage." },
    ],
  }),
  component: OrderDetail,
});

function OrderDetail() {
  const { id } = Route.useParams();
  const { orders, products, exceptions, dispatch, act } = useWf();
  const order = orders.find((o) => o.id === `#${id}`);

  if (!order) {
    return (
      <EmptyState
        title={`Order #${id} not found`}
        body="This order number is not in the current operational dataset."
        actionLabel="Back to order board"
        to="/orders"
      />
    );
  }

  const p = priorityOf(order, products);
  const plan = allocationPlan(order, products, orders);
  const route = routeFor(order, products);
  const next = nextStage(order.status);
  const orderExceptions = exceptions.filter((e) => e.orderId === order.id);
  const done = new Set(order.timeline.map((t) => t.stage));

  return (
    <div className="space-y-6">
      <Button size="sm" variant="ghost" asChild className="gap-1.5">
        <Link to="/orders"><ArrowLeft className="size-4" /> Order board</Link>
      </Button>

      <PageHeader
        eyebrow={`${order.channel} · ${order.tier} account`}
        title={`${order.id} · ${order.customer}`}
        description={`${order.lines.length} lines · ${order.lines.reduce((s, l) => s + l.qty, 0)} units · $${order.valueUsd.toLocaleString()} · dispatch ${relative(order.deadline)}`}
      >
        <SignalBadge tone={bandTone(p.band) as "danger"}>Priority {p.score}/100 · {p.band}</SignalBadge>
        <SignalBadge tone={order.status === "EXCEPTION" ? "danger" : "muted"}>{order.status}</SignalBadge>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <DecisionCard
          tone={bandTone(p.band) as "danger"}
          label="Priority & allocation"
          decision={plan.decision}
          reason={`${p.explanation} ${plan.reason}`}
          impact={plan.impact}
          action={plan.action}
          factors={p.factors.map((f) => ({ label: `${f.label} (${Math.round(f.weight * 100)}%)`, value: `${f.raw}/100 — ${f.note}` }))}
        >
          {["NEW", "PRIORITIZED", "INVENTORY CHECK"].includes(order.status) ? (
            <Button size="sm" onClick={() => act(() => dispatch({ type: "allocate", orderId: order.id }), `Allocation applied to ${order.id}`, plan.decision)}>
              Apply recommendation
            </Button>
          ) : null}
          {next && order.status !== "EXCEPTION" ? (
            <Button size="sm" variant="secondary" onClick={() => act(() => dispatch({ type: "status", orderId: order.id, status: next }), `${order.id} advanced to ${next}`)}>
              Advance to {next}
            </Button>
          ) : null}
        </DecisionCard>

        <div className="panel p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Lifecycle timeline</p>
          <ol className="mt-3 space-y-3">
            {stageOrder.map((stage) => {
              const event = order.timeline.find((t) => t.stage === stage);
              const complete = done.has(stage);
              return (
                <li key={stage} className="flex gap-3">
                  {complete ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />}
                  <div className="min-w-0">
                    <p className={complete ? "text-sm font-medium" : "text-sm text-muted-foreground"}>{stage}</p>
                    {event ? (
                      <p className="text-xs text-muted-foreground">
                        {fmtTime(event.at)}{event.note ? ` · ${event.note}` : ""}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <section>
        <SectionHeader title="Lines & allocation" description="Damaged stock is excluded from available-to-promise on every line." />
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-border bg-surface-raised text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>{["SKU", "Product", "Required", "Allocated", "Picked", "Damaged/Missing", "Location", "Coverage"].map((h) => <th key={h} className="px-4 py-2.5 text-left font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {order.lines.map((l) => {
                const prod = products.find((x) => x.sku === l.sku);
                const cov = Math.min(100, ((l.allocated + (prod ? available(prod) : 0)) / l.qty) * 100);
                return (
                  <tr key={l.sku}>
                    <td className="px-4 py-2.5 font-medium">{l.sku}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{prod?.name ?? "—"}</td>
                    <td className="tabular px-4 py-2.5">{l.qty}</td>
                    <td className="tabular px-4 py-2.5">{l.allocated}</td>
                    <td className="tabular px-4 py-2.5">{l.picked}</td>
                    <td className="tabular px-4 py-2.5 text-danger">{l.damaged} / {l.missing}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{prod ? `${prod.zone} · ${prod.bin}` : "—"}</td>
                    <td className="px-4 py-2.5"><div className="w-20"><Meter value={cov} tone={cov < 100 ? "warn" : "ok"} /></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Optimized pick route</p>
          <p className="mt-2 text-sm text-muted-foreground">Original: {route.original.join(" → ")}</p>
          <p className="text-sm">Optimized: {route.optimized.join(" → ")}</p>
          <div className="tabular mt-3 grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-md border border-border bg-background/40 p-2.5"><span className="block text-[11px] text-muted-foreground">Original</span>{route.originalDistance} m</div>
            <div className="rounded-md border border-border bg-background/40 p-2.5"><span className="block text-[11px] text-muted-foreground">Optimized</span>{route.optimizedDistance} m</div>
            <div className="rounded-md border border-ok/30 bg-ok-soft p-2.5 text-ok"><span className="block text-[11px] opacity-80">Saved</span>{route.saved} m ({route.savedPct}%)</div>
          </div>
        </div>

        <div className="panel p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Exceptions on this order</p>
          {orderExceptions.length ? (
            <ul className="mt-3 space-y-2">
              {orderExceptions.map((e) => (
                <li key={e.id} className="rounded-md border border-border bg-background/40 p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <SignalBadge tone={e.status === "resolved" ? "ok" : "danger"}>{e.type}</SignalBadge>
                    <span className="text-muted-foreground">{e.id}</span>
                  </div>
                  <p className="mt-1.5">{e.detail}</p>
                  <p className="mt-1 text-muted-foreground">Action: {e.action}</p>
                  {e.status === "open" ? (
                    <Button size="sm" variant="secondary" className="mt-2" onClick={() => act(() => dispatch({ type: "resolveException", id: e.id }), `Exception ${e.id} resolved`, e.action)}>
                      Resolve exception
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No exceptions raised for this order.</p>
          )}
        </div>
      </section>
    </div>
  );
}
