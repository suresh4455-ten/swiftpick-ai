import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type Tone = "ok" | "warn" | "danger" | "info" | "muted";

const toneClasses: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok border-ok/30",
  warn: "bg-warn-soft text-warn border-warn/30",
  danger: "bg-danger-soft text-danger border-danger/30",
  info: "bg-info-soft text-info border-info/30",
  muted: "bg-muted text-muted-foreground border-border",
};

export function SignalBadge({
  tone = "muted",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusDot({ tone = "muted", pulse }: { tone?: Tone; pulse?: boolean }) {
  const bg: Record<Tone, string> = {
    ok: "bg-ok",
    warn: "bg-warn",
    danger: "bg-danger",
    info: "bg-info",
    muted: "bg-muted-foreground",
  };
  return (
    <span className="relative inline-flex size-2">
      <span className={cn("size-2 rounded-full", bg[tone])} />
      {pulse ? (
        <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60", bg[tone])} />
      ) : null}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  sub,
  tone = "muted",
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: Tone;
  icon?: ReactNode;
}) {
  const accent: Record<Tone, string> = {
    ok: "text-ok",
    warn: "text-warn",
    danger: "text-danger",
    info: "text-info",
    muted: "text-foreground",
  };
  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <span className={cn("opacity-70", accent[tone])}>{icon}</span>
      </div>
      <p className={cn("tabular mt-2 text-2xl font-semibold", accent[tone])}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          {eyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}

/** Explainable-AI card: decision → why → impact → action. */
export function DecisionCard({
  tone = "info",
  label,
  decision,
  reason,
  impact,
  action,
  factors,
  children,
}: {
  tone?: Tone;
  label: string;
  decision: string;
  reason: string;
  impact: string;
  action?: string;
  factors?: Array<{ label: string; value: string }>;
  children?: ReactNode;
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-raised px-4 py-2.5">
        <div className="flex items-center gap-2">
          <StatusDot tone={tone} pulse={tone === "danger"} />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            AI Decision · {label}
          </span>
        </div>
        <SignalBadge tone={tone}>Explainable</SignalBadge>
      </div>
      <div className="space-y-3 p-4">
        <Field title="Decision">{decision}</Field>
        <Field title="Why">{reason}</Field>
        {factors?.length ? (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {factors.map((f) => (
              <li
                key={f.label}
                className="flex items-center justify-between rounded-md border border-border bg-background/40 px-2.5 py-1.5 text-xs"
              >
                <span className="text-muted-foreground">{f.label}</span>
                <span className="tabular font-medium">{f.value}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <Field title="Expected impact">{impact}</Field>
        {action ? <Field title="Next action">{action}</Field> : null}
        {children ? <div className="flex flex-wrap gap-2 pt-1">{children}</div> : null}
      </div>
    </div>
  );
}

export function Field({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <p className="mt-0.5 text-sm leading-relaxed text-foreground">{children}</p>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  actionLabel,
  to,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  to?: string;
}) {
  return (
    <div className="panel flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
      {actionLabel && to ? (
        <Button asChild variant="secondary" size="sm" className="mt-2">
          <Link to={to}>{actionLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
}

export function Meter({ value, tone = "info" }: { value: number; tone?: Tone }) {
  const bg: Record<Tone, string> = {
    ok: "bg-ok",
    warn: "bg-warn",
    danger: "bg-danger",
    info: "bg-info",
    muted: "bg-muted-foreground",
  };
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-all duration-500", bg[tone])}
        style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
      />
    </div>
  );
}
