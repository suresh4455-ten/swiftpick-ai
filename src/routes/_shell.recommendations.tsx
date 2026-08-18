import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { DecisionCard, EmptyState, PageHeader } from "@/components/wf/bits";
import { buildInsights, type Insight } from "@/lib/wf/engine";
import { useWf } from "@/lib/wf/store";

export const Route = createFileRoute("/_shell/recommendations")({
  head: () => ({
    meta: [
      { title: "AI Recommendations — WAREFLOW AI" },
      { name: "description", content: "Every active AI recommendation with its reasoning, business impact and the exact action to execute." },
      { property: "og:title", content: "AI Recommendations — WAREFLOW AI" },
      { property: "og:description", content: "Explainable operational decisions, ranked by impact." },
    ],
  }),
  component: RecommendationsPage,
});

function RecommendationsPage() {
  const { orders, products, stations, exceptions, dispatch, act } = useWf();
  const navigate = useNavigate();
  const list = buildInsights(orders, products, stations, exceptions);

  const run = (i: Insight) => {
    const a = i.action;
    if (a.kind === "navigate") {
      void navigate({ to: a.to });
      return;
    }
    act(
      () => {
        if (a.kind === "prioritize") dispatch({ type: "allocate", orderId: a.orderId });
        else if (a.kind === "reorder") dispatch({ type: "reorder", sku: a.sku });
        else if (a.kind === "batch") dispatch({ type: "batch", orderIds: a.orderIds });
        else dispatch({ type: "rebalance", stationId: a.stationId });
      },
      i.title,
      i.impact,
    );
  };

  const tone = (level: Insight["level"]) =>
    level === "critical" ? "danger" : level === "warning" ? "warn" : level === "optimization" ? "info" : "ok";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Decision Feed"
        title="All AI recommendations"
        description="Observe → analyze → decide → act. Each card states what was detected, why it matters and what happens if you approve."
      />

      {list.length === 0 ? (
        <EmptyState title="Nothing needs attention" body="The floor is running inside every threshold." actionLabel="Open dashboard" to="/dashboard" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {list.map((i) => (
            <DecisionCard
              key={i.id}
              tone={tone(i.level) as "danger"}
              label={i.title}
              decision={i.recommendation}
              reason={i.reason}
              impact={i.impact}
              action={i.actionLabel}
              factors={[
                { label: "Detected", value: i.problem },
                { label: "Level", value: i.level },
              ]}
            >
              <Button size="sm" onClick={() => run(i)}>
                {i.actionLabel}
              </Button>
            </DecisionCard>
          ))}
        </div>
      )}
    </div>
  );
}
