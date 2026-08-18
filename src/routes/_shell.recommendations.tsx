import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { DecisionCard, EmptyState, PageHeader } from "@/components/wf/bits";
import { insights } from "@/lib/wf/engine";
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
  const state = useWf();
  const list = insights(state.orders, state.products, state.stations, state.exceptions);

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
              tone={i.tone as "danger"}
              label={i.title}
              decision={i.decision}
              reason={i.reason}
              impact={i.impact}
              action={i.action}
              factors={i.factors}
            >
              <Button size="sm" onClick={() => state.act(() => state.dispatch(i.dispatch), i.title, i.action)}>
                Approve & execute
              </Button>
            </DecisionCard>
          ))}
        </div>
      )}
    </div>
  );
}
