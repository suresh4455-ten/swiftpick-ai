import { Link, createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, Meter, PageHeader, SignalBadge } from "@/components/wf/bits";
import { bandTone, openStatuses, priorityOf, relative } from "@/lib/wf/engine";
import { nextStage, useWf } from "@/lib/wf/store";
import type { OrderStatus } from "@/lib/wf/types";

export const Route = createFileRoute("/_shell/orders/")({
  head: () => ({
    meta: [
      { title: "Order Board — WAREFLOW AI" },
      {
        name: "description",
        content:
          "Every order with its priority score, inventory coverage, lifecycle stage and next recommended action.",
      },
      { property: "og:title", content: "Order Board — WAREFLOW AI" },
      { property: "og:description", content: "Priority-scored order pipeline with one-click stage advance." },
    ],
  }),
  component: OrdersPage,
});

type SortKey = "priority" | "deadline" | "value";

function OrdersPage() {
  const { orders, products, dispatch, act } = useWf();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "open" | OrderStatus>("all");
  const [sort, setSort] = useState<SortKey>("priority");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders
      .filter((o) => {
        if (status === "open" && !openStatuses.includes(o.status)) return false;
        if (status !== "all" && status !== "open" && o.status !== status) return false;
        if (!q) return true;
        return (
          o.id.toLowerCase().includes(q) ||
          o.customer.toLowerCase().includes(q) ||
          o.lines.some((l) => l.sku.toLowerCase().includes(q))
        );
      })
      .map((o) => ({ o, p: priorityOf(o, products) }))
      .sort((a, b) =>
        sort === "priority"
          ? b.p.score - a.p.score
          : sort === "deadline"
            ? a.o.deadline - b.o.deadline
            : b.o.valueUsd - a.o.valueUsd,
      );
  }, [orders, products, query, status, sort]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Order Management"
        title="Order board"
        description="Priority-scored pipeline across the full fulfillment lifecycle. Advance a stage or open an order for its full decision trail."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search order, customer or SKU"
            className="pl-8"
            aria-label="Search orders"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open orders</SelectItem>
            {(
              [
                "NEW",
                "PRIORITIZED",
                "INVENTORY CHECK",
                "ALLOCATED",
                "PICKING",
                "PACKING",
                "QUALITY CHECK",
                "READY TO DISPATCH",
                "DISPATCHED",
                "DELIVERED",
                "EXCEPTION",
              ] as OrderStatus[]
            ).map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Sort" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="priority">Sort: priority score</SelectItem>
            <SelectItem value="deadline">Sort: deadline</SelectItem>
            <SelectItem value="value">Sort: order value</SelectItem>
          </SelectContent>
        </Select>
        <SignalBadge tone="muted">{rows.length} orders</SignalBadge>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No orders match these filters"
          body="Clear the search box or switch the status filter to see the full pipeline."
        />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-b border-border bg-surface-raised text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                {["Order", "Customer", "Channel", "Lines", "Priority", "Coverage", "Deadline", "Status", "Action"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(({ o, p }) => {
                const next = nextStage(o.status);
                return (
                  <tr key={o.id} className="transition-colors hover:bg-surface-raised/60">
                    <td className="px-4 py-2.5">
                      <Link to="/orders/$id" params={{ id: o.id.replace("#", "") }} className="font-medium hover:text-primary">
                        {o.id}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{o.customer}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{o.channel}</td>
                    <td className="tabular px-4 py-2.5 text-muted-foreground">
                      {o.lines.length} · {o.lines.reduce((s, l) => s + l.qty, 0)} units
                    </td>
                    <td className="px-4 py-2.5">
                      <SignalBadge tone={bandTone(p.band) as "danger"}>{p.score} {p.band}</SignalBadge>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="w-20">
                        <Meter value={p.coverage * 100} tone={p.coverage < 1 ? "warn" : "ok"} />
                        <span className="mt-1 block text-[11px] text-muted-foreground">{Math.round(p.coverage * 100)}%</span>
                      </div>
                    </td>
                    <td className="tabular px-4 py-2.5 text-muted-foreground">{relative(o.deadline)}</td>
                    <td className="px-4 py-2.5">
                      <SignalBadge tone={o.status === "EXCEPTION" ? "danger" : o.status === "DELIVERED" ? "ok" : "muted"}>
                        {o.status}
                      </SignalBadge>
                    </td>
                    <td className="px-4 py-2.5">
                      {o.status === "INVENTORY CHECK" || o.status === "PRIORITIZED" || o.status === "NEW" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            act(() => dispatch({ type: "allocate", orderId: o.id }), `Allocation applied to ${o.id}`)
                          }
                        >
                          Allocate
                        </Button>
                      ) : next && o.status !== "EXCEPTION" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            act(
                              () => dispatch({ type: "status", orderId: o.id, status: next }),
                              `${o.id} advanced to ${next}`,
                            )
                          }
                        >
                          → {next}
                        </Button>
                      ) : o.status === "EXCEPTION" ? (
                        <Button size="sm" variant="ghost" asChild>
                          <Link to="/exceptions">Resolve</Link>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Complete</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
