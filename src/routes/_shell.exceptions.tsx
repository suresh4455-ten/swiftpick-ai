import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { DecisionCard, EmptyState, PageHeader, SectionHeader, SignalBadge } from "@/components/wf/bits";
import { relative } from "@/lib/wf/engine";
import { useWf } from "@/lib/wf/store";

export const Route = createFileRoute("/_shell/exceptions")({
  head: () => ({
    meta: [
      { title: "Exception Center — WAREFLOW AI" },
      { name: "description", content: "Exception → decision → resolution workflow for shortages, damage, missing items, mismatches and dispatch delays." },
      { property: "og:title", content: "Exception Center — WAREFLOW AI" },
      { property: "og:description", content: "Every exception arrives with a decision and a one-click resolution." },
    ],
  }),
  component: ExceptionsPage,
});

function ExceptionsPage() {
  const { exceptions, dispatch, act } = useWf();
  const open = exceptions.filter((e) => e.status === "open");
  const resolved = exceptions.filter((e) => e.status === "resolved");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Exception Center"
        title="Exception → decision → resolution"
        description="Nothing is left as a raw alert. Each exception carries the decision taken, the resolution found and the action to execute."
      >
        <SignalBadge tone={open.length ? "danger" : "ok"}>{open.length} open</SignalBadge>
        <SignalBadge tone="muted">{resolved.length} resolved</SignalBadge>
      </PageHeader>

      {open.length === 0 ? (
        <EmptyState title="No open exceptions" body="Blocked stock has been released back into available-to-promise." actionLabel="Open dashboard" to="/dashboard" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {open.map((e) => (
            <DecisionCard
              key={e.id}
              tone={e.severity === "critical" ? "danger" : e.severity === "high" ? "warn" : "info"}
              label={`${e.id} · ${e.type}${e.orderId ? ` · ${e.orderId}` : ""}`}
              decision={e.decision}
              reason={e.detail}
              impact={e.resolution}
              action={e.action}
              factors={[
                { label: "Severity", value: e.severity },
                { label: "Raised", value: relative(e.createdAt) },
                ...(e.sku ? [{ label: "SKU", value: e.sku }] : []),
                ...(e.orderId ? [{ label: "Order", value: e.orderId }] : []),
              ]}
            >
              <Button size="sm" onClick={() => act(() => dispatch({ type: "resolveException", id: e.id }), `Exception ${e.id} resolved`, e.action)}>
                Resolve exception
              </Button>
            </DecisionCard>
          ))}
        </div>
      )}

      {resolved.length ? (
        <section>
          <SectionHeader title="Recently resolved" />
          <div className="panel divide-y divide-border">
            {resolved.map((e) => (
              <div key={e.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <SignalBadge tone="ok">{e.type}</SignalBadge>
                  <span className="font-medium">{e.id}</span>
                  <span className="text-muted-foreground">{e.orderId ?? e.sku}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{relative(e.createdAt)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{e.resolution}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
