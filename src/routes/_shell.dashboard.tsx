import { Link, createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Boxes,
  CircleDollarSign,
  Clock,
  Gauge,
  PackageCheck,
  Route as RouteIcon,
  ScrollText,
  ShieldAlert,
  Split,
  Truck,
} from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { DecisionCard, KpiCard, Meter, PageHeader, SectionHeader, SignalBadge, StatusDot } from "@/components/wf/bits";
import {
  allocationPlan,
  available,
  bandTone,
  ordersAtRisk,
  priorityOf,
  relative,
  reorderRecs,
} from "@/lib/wf/engine";
import { useWf } from "@/lib/wf/store";

export const Route = createFileRoute("/_shell/dashboard")({
  validateSearch: (search: Record<string, unknown>) => ({ demo: search.demo === true || search.demo === "true" }),
  head: () => ({
    meta: [
      { title: "Command Center Dashboard — WAREFLOW AI" },
      {
        name: "description",
        content:
          "Live warehouse KPIs, at-risk orders, current bottleneck and explainable AI decisions for order fulfillment.",
      },
      { property: "og:title", content: "Command Center Dashboard — WAREFLOW AI" },
      { property: "og:description", content: "What is happening, why, and what to do next." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { demo } = Route.useSearch();
  const wf = useWf();
  const { kpis, orders, products, insights, bottleneck, role, dispatch, act, startDemo, demoRunning } = wf;

  useEffect(() => {
    if (demo && !demoRunning) startDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo]);

  const hero = orders.find((o) => o.id === "#1042");
  const heroPriority = hero ? priorityOf(hero, products) : null;
  const heroPlan = hero ? allocationPlan(hero, products, orders) : null;
  const risk = ordersAtRisk(orders, products).sort(
    (a, b) => priorityOf(b, products).score - priorityOf(a, products).score,
  );
  const recs = reorderRecs(products);

  const health =
    kpis.atRisk > 6 || kpis.outOfStock > 0
      ? { tone: "danger" as const, label: "🔴 Critical" }
      : kpis.atRisk > 0
        ? { tone: "warn" as const, label: "🟡 Attention required" }
        : { tone: "ok" as const, label: "🟢 Healthy" };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Warehouse Command Center"
        title="Operations overview"
        description="What is happening on the floor, why it is happening, and what the team should do next."
      >
        <SignalBadge tone={health.tone}>{health.label}</SignalBadge>
        <Button size="sm" variant="secondary" asChild>
          <Link to="/recommendations">All AI recommendations</Link>
        </Button>
      </PageHeader>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Inventory on hand" value={kpis.totalUnits.toLocaleString()} sub={`${products.length} active SKUs`} icon={<Boxes className="size-4" />} />
        <KpiCard label="Inventory value" value={`$${Math.round(kpis.inventoryValue).toLocaleString()}`} sub="At current unit cost" icon={<CircleDollarSign className="size-4" />} />
        <KpiCard label="Orders today" value={kpis.ordersToday} sub={`${kpis.pending} open in the pipeline`} icon={<ScrollText className="size-4" />} />
        <KpiCard label="Orders at risk" value={kpis.atRisk} tone={kpis.atRisk ? "danger" : "ok"} sub="Deadline or coverage risk" icon={<ShieldAlert className="size-4" />} />
        <KpiCard label="Ready for picking" value={kpis.readyToPick} tone="info" sub="Allocated, awaiting a picker" icon={<RouteIcon className="size-4" />} />
        <KpiCard label="Being packed" value={kpis.packing} tone="info" sub={`${kpis.readyToDispatch} ready to dispatch`} icon={<PackageCheck className="size-4" />} />
        <KpiCard label="Low / out of stock" value={`${kpis.lowStock} / ${kpis.outOfStock}`} tone={kpis.outOfStock ? "danger" : "warn"} sub={`${kpis.damagedUnits} damaged units quarantined`} icon={<AlertTriangle className="size-4" />} />
        <KpiCard label="Fulfilment rate" value={`${kpis.fulfilmentRate}%`} tone={kpis.fulfilmentRate > 40 ? "ok" : "warn"} sub={`Avg cycle ${kpis.avgFulfilmentHours}h · picking eff. ${kpis.pickingEfficiency}%`} icon={<Gauge className="size-4" />} />
      </section>

      {hero && heroPriority && heroPlan ? (
        <section>
          <SectionHeader
            title="Hero scenario · scarce inventory, competing orders"
            description="The exact decision a warehouse manager has to make right now — with the reasoning made explicit."
          >
            <Button size="sm" variant="outline" asChild>
              <Link to="/orders/$id" params={{ id: "1042" }}>
                Open {hero.id}
              </Link>
            </Button>
          </SectionHeader>

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <DecisionCard
              tone={bandTone(heroPriority.band) as "danger"}
              label={`${hero.id} · ${heroPriority.band} ${heroPriority.score}/100`}
              decision={heroPlan.decision}
              reason={heroPlan.reason}
              impact={heroPlan.impact}
              action={heroPlan.action}
              factors={heroPriority.factors.map((f) => ({
                label: `${f.label} (${Math.round(f.weight * 100)}%)`,
                value: `${f.raw}/100`,
              }))}
            >
              {hero.status === "INVENTORY CHECK" || hero.status === "NEW" || hero.status === "PRIORITIZED" ? (
                <Button
                  size="sm"
                  onClick={() =>
                    act(
                      () => dispatch({ type: "allocate", orderId: hero.id }),
                      `Recommendation applied to ${hero.id}`,
                      heroPlan.decision,
                    )
                  }
                >
                  Apply recommendation
                </Button>
              ) : (
                <SignalBadge tone="ok">Applied · order is {hero.status}</SignalBadge>
              )}
              <Button size="sm" variant="ghost" asChild>
                <Link to="/allocation">Open allocation engine</Link>
              </Button>
            </DecisionCard>

            <div className="panel p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Competing demand for the same SKUs
              </p>
              <ul className="mt-3 space-y-2">
                {heroPlan.competing.length ? (
                  heroPlan.competing.map((c) => (
                    <li key={c.id} className="rounded-md border border-border bg-background/40 p-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{c.id}</span>
                        <span className="tabular text-muted-foreground">
                          {c.qty} × {c.sku} · score {c.score}
                        </span>
                      </div>
                      <div className="mt-2">
                        <Meter value={c.score} tone={c.score >= heroPriority.score ? "danger" : "muted"} />
                      </div>
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-muted-foreground">
                    No other open order is competing for these SKUs.
                  </li>
                )}
              </ul>

              <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Line availability
              </p>
              <ul className="mt-2 space-y-2">
                {heroPlan.lines.map((l) => {
                  const p = products.find((x) => x.sku === l.sku)!;
                  return (
                    <li key={l.sku} className="flex items-center justify-between rounded-md border border-border bg-background/40 px-3 py-2 text-xs">
                      <span>
                        <span className="font-medium">{l.sku}</span> · {l.name}
                      </span>
                      <span className="tabular text-muted-foreground">
                        need {l.required} · avail {available(p)} · {p.zone} {p.bin}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <SectionHeader title="AI decision feed" description="Ranked by operational impact. Every card acts on real state." />
          <div className="space-y-3">
            {insights.slice(0, 3).map((ins) => (
              <div key={ins.id} className="panel p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <SignalBadge
                    tone={
                      ins.level === "critical"
                        ? "danger"
                        : ins.level === "warning"
                          ? "warn"
                          : ins.level === "optimization"
                            ? "ok"
                            : "info"
                    }
                  >
                    {ins.level}
                  </SignalBadge>
                  <p className="text-sm font-semibold">{ins.title}</p>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{ins.reason}</p>
                <p className="mt-2 text-sm">{ins.recommendation}</p>
                <div className="mt-3">
                  <Button size="sm" variant="secondary" asChild>
                    <Link to="/recommendations">Review &amp; act</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel p-4">
            <div className="flex items-center gap-2">
              <StatusDot tone={bottleneck.severity === "critical" ? "danger" : bottleneck.severity === "warning" ? "warn" : "ok"} pulse />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Current bottleneck
              </p>
            </div>
            <p className="mt-2 text-base font-semibold">{bottleneck.name}</p>
            <p className="tabular mt-1 text-sm text-muted-foreground">
              {bottleneck.avgMinutes} min average vs {bottleneck.benchmark} min floor average
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{bottleneck.impact}</p>
            <p className="mt-2 text-sm">{bottleneck.recommendation}</p>
            {bottleneck.severity !== "ok" ? (
              <Button
                size="sm"
                className="mt-3"
                onClick={() =>
                  act(
                    () => dispatch({ type: "rebalance", stationId: bottleneck.stationId }),
                    "Rebalance applied",
                    bottleneck.recommendation,
                  )
                }
              >
                Apply recommendation
              </Button>
            ) : null}
          </div>

          <div className="panel p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Replenishment watch
            </p>
            <ul className="mt-3 space-y-2">
              {recs.slice(0, 4).map((r) => (
                <li key={r.sku} className="rounded-md border border-border bg-background/40 p-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{r.sku}</span>
                    <SignalBadge tone={r.risk === "critical" ? "danger" : r.risk === "high" ? "warn" : "info"}>
                      {r.daysToStockout}d cover
                    </SignalBadge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Reorder {r.quantity} units · {r.available} available at {r.dailyDemand}/day
                  </p>
                </li>
              ))}
              {recs.length === 0 ? (
                <li className="text-sm text-muted-foreground">Every SKU is above its reorder point.</li>
              ) : null}
            </ul>
            <Button size="sm" variant="secondary" className="mt-3" asChild>
              <Link to="/inventory">Open inventory intelligence</Link>
            </Button>
          </div>
        </div>
      </section>

      <section>
        <SectionHeader
          title="Orders at risk"
          description="Sorted by priority score. Coverage below 100% means the order cannot ship complete today."
        >
          <SignalBadge tone="muted">Viewing as {role}</SignalBadge>
        </SectionHeader>
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-border bg-surface-raised text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                {["Order", "Customer", "Status", "Priority", "Coverage", "Deadline", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {risk.slice(0, 8).map((o) => {
                const p = priorityOf(o, products);
                return (
                  <tr key={o.id} className="transition-colors hover:bg-surface-raised/60">
                    <td className="px-4 py-2.5 font-medium">{o.id}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{o.customer}</td>
                    <td className="px-4 py-2.5">
                      <SignalBadge tone={o.status === "EXCEPTION" ? "danger" : "muted"}>{o.status}</SignalBadge>
                    </td>
                    <td className="px-4 py-2.5">
                      <SignalBadge tone={bandTone(p.band) as "danger"}>
                        {p.score} {p.band}
                      </SignalBadge>
                    </td>
                    <td className="tabular px-4 py-2.5">
                      <div className="w-24">
                        <Meter value={p.coverage * 100} tone={p.coverage < 1 ? "warn" : "ok"} />
                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          {Math.round(p.coverage * 100)}%
                        </span>
                      </div>
                    </td>
                    <td className="tabular px-4 py-2.5 text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Clock className="size-3.5" /> {relative(o.deadline)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button size="sm" variant="ghost" asChild>
                        <Link to="/orders/$id" params={{ id: o.id.replace("#", "") }}>
                          Open
                        </Link>
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {risk.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No orders at risk — every open order has coverage and time in hand.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { to: "/allocation", label: "Run allocation engine", icon: Split },
          { to: "/picking", label: "Optimize picking", icon: RouteIcon },
          { to: "/packing", label: "Packing & quality", icon: PackageCheck },
          { to: "/exceptions", label: "Resolve exceptions", icon: Truck },
        ].map((a) => (
          <Link key={a.to} to={a.to} className="panel flex items-center gap-3 p-4 transition-colors hover:border-primary/40">
            <a.icon className="size-4 text-primary" />
            <span className="text-sm font-medium">{a.label}</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
