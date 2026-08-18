import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Brain,
  Gauge,
  Play,
  Route as RouteIcon,
  Sparkles,
  Split,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WAREFLOW AI — From Warehouse Data to Intelligent Decisions" },
      {
        name: "description",
        content:
          "WAREFLOW AI is an intelligent warehouse command center: priority scoring, smart inventory allocation, picking optimization, bottleneck detection and exception resolution.",
      },
      { property: "og:title", content: "WAREFLOW AI — Warehouse Command Center" },
      {
        property: "og:description",
        content:
          "It doesn't just monitor the warehouse — it recommends what to do next. Explainable AI decisions for order fulfillment.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const decisionFeed = [
  {
    tone: "danger",
    label: "CRITICAL · Order #1042",
    text: "Reserve the 7 available units of WH-153 for #1042 — priority 94/100 beats #1051 (58). Remaining 3 units go to replenishment watch.",
  },
  {
    tone: "warn",
    label: "WARNING · SKU WH-153",
    text: "1.0 days of cover left at 7 units/day demand. Reorder 50 units within 24 hours to avoid 2 unfulfillable orders.",
  },
  {
    tone: "info",
    label: "OPTIMIZATION · Picking",
    text: "Batching #1042, #1045 and #1051 cuts picker time from 42 min to 27 min — 35.7% efficiency gain.",
  },
  {
    tone: "danger",
    label: "BOTTLENECK · Packing Station 03",
    text: "11.8 min cycle vs 6.2 min floor average. Move one packer for 45 minutes to protect 23 at-risk orders.",
  },
];

const pillars = [
  { icon: Brain, title: "AI Decision Engine", body: "Deterministic rules turn stock, deadlines and priority into a decision, a reason, an impact and a next action." },
  { icon: Split, title: "Smart Allocation", body: "Scarce inventory goes to the highest-scoring order. Damaged stock is never promised." },
  { icon: RouteIcon, title: "Route & Batch Optimization", body: "Measured metres and minutes saved on every pick trip and batch." },
  { icon: AlertTriangle, title: "Exception → Resolution", body: "Every exception ships with a decision, a resolution and a one-click action." },
  { icon: Gauge, title: "Bottleneck Detection", body: "Finds the constraint station and prescribes the staffing move." },
  { icon: Boxes, title: "Predictive Replenishment", body: "Stockout dates, reorder quantities and risk levels — approved in one click." },
];

function Landing() {
  const toneMap: Record<string, string> = {
    danger: "border-danger/40 bg-danger-soft text-danger",
    warn: "border-warn/40 bg-warn-soft text-warn",
    info: "border-info/40 bg-info-soft text-info",
  };

  return (
    <div className="grid-backdrop min-h-screen">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground">
            <Activity className="size-4" />
          </span>
          <span>
            <span className="block text-sm font-semibold leading-none">WAREFLOW AI</span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Command Center
            </span>
          </span>
        </div>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          Sign in as Warehouse Manager <ArrowRight className="size-3.5" />
        </Link>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-20">
        <section className="grid items-start gap-10 py-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
              <Sparkles className="size-3.5" /> Observe → Analyze → Decide → Act → Verify → Learn
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.1] sm:text-5xl">
              From Warehouse Data to
              <span className="block text-primary">Intelligent Decisions.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
              AI-powered warehouse operations, fulfillment intelligence and real-time decision
              support. WAREFLOW AI prioritizes orders, allocates scarce inventory, optimizes picking,
              predicts stockouts, resolves exceptions and finds bottlenecks before they become
              fulfillment failures.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Enter Command Center <ArrowRight className="size-4" />
              </Link>
              <Link
                to="/dashboard"
                search={{ demo: true }}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-5 py-2.5 text-sm font-semibold transition-colors hover:border-primary/50"
              >
                <Play className="size-4 text-primary" /> Launch Demo
              </Link>
            </div>

            <dl className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                ["The problem", "Warehouse operations are difficult to coordinate — stockouts, competing orders, hidden bottlenecks."],
                ["The solution", "WAREFLOW AI converts warehouse data into operational decisions with full reasoning."],
                ["The differentiator", "It doesn't just monitor the warehouse. It recommends what to do next."],
              ].map(([title, body]) => (
                <div key={title} className="panel p-4">
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                    {title}
                  </dt>
                  <dd className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{body}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-border bg-surface-raised px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Live AI Decision Feed
              </p>
              <span className="flex items-center gap-1.5 text-[11px] text-ok">
                <span className="size-1.5 animate-pulse rounded-full bg-ok" /> streaming
              </span>
            </div>
            <ul className="divide-y divide-border">
              {decisionFeed.map((d) => (
                <li key={d.label} className="space-y-2 px-4 py-4">
                  <span
                    className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${toneMap[d.tone]}`}
                  >
                    {d.label}
                  </span>
                  <p className="text-sm leading-relaxed text-foreground">{d.text}</p>
                </li>
              ))}
            </ul>
            <div className="border-t border-border bg-surface-raised px-4 py-3 text-xs text-muted-foreground">
              Every recommendation carries its score, reasoning, expected impact and a one-click
              action.
            </div>
          </div>
        </section>

        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Operational intelligence, not data visualization
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pillars.map((p) => (
              <article key={p.title} className="panel p-5">
                <p.icon className="size-5 text-primary" />
                <h3 className="mt-3 text-sm font-semibold">{p.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{p.body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
