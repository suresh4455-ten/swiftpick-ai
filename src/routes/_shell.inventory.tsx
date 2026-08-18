import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, Meter, PageHeader, SectionHeader, SignalBadge } from "@/components/wf/bits";
import { available, daysRemaining, fmtDay, reorderRecs, stockStatus, statusTone } from "@/lib/wf/engine";
import { useWf } from "@/lib/wf/store";

export const Route = createFileRoute("/_shell/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory Intelligence — WAREFLOW AI" },
      { name: "description", content: "Available-to-promise stock, days of cover, damaged quarantine and predictive reorder recommendations." },
      { property: "og:title", content: "Inventory Intelligence — WAREFLOW AI" },
      { property: "og:description", content: "Predictive replenishment with explained stockout dates." },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  const { products, dispatch, act } = useWf();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const recs = reorderRecs(products);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const s = stockStatus(p);
      if (filter !== "all" && filter !== s) return false;
      if (!q) return true;
      return `${p.sku} ${p.name} ${p.category} ${p.zone}`.toLowerCase().includes(q);
    });
  }, [products, query, filter]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inventory Intelligence"
        title="Stock health & replenishment"
        description="Available = on hand − reserved − damaged. Days of cover drives the reorder recommendation, never a raw low-stock list."
      />

      <section>
        <SectionHeader title="Predictive reorder recommendations" description="Ranked by time to stockout. Approving raises inbound quantity immediately." />
        {recs.length === 0 ? (
          <EmptyState title="No replenishment needed" body="Every SKU is currently above its reorder point." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recs.slice(0, 6).map((r) => (
              <div key={r.sku} className="panel p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{r.sku} · {r.name}</p>
                  <SignalBadge tone={r.risk === "critical" ? "danger" : r.risk === "high" ? "warn" : "info"}>{r.risk}</SignalBadge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{r.reason}</p>
                <div className="tabular mt-3 grid grid-cols-2 gap-2 text-xs">
                  <Stat label="Available" value={String(r.available)} />
                  <Stat label="Daily demand" value={String(r.dailyDemand)} />
                  <Stat label="Stockout" value={`${r.daysToStockout}d · ${fmtDay(r.stockoutDate)}`} />
                  <Stat label="Reorder point" value={String(r.reorderPoint)} />
                </div>
                <p className="mt-3 text-sm">Reorder <strong>{r.quantity} units</strong> within the next 24 hours.</p>
                <Button size="sm" className="mt-3" onClick={() => act(() => dispatch({ type: "reorder", sku: r.sku }), `Reorder approved · ${r.sku}`, `${r.quantity} units raised on purchase order.`)}>
                  Approve reorder
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeader title="SKU register" description={`${products.length} SKUs across four pick zones.`}>
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search SKU, name, zone" className="pl-8" aria-label="Search inventory" />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="healthy">🟢 Healthy</SelectItem>
              <SelectItem value="low">🟡 Low</SelectItem>
              <SelectItem value="critical">🔴 Critical</SelectItem>
              <SelectItem value="out">⚫ Out of stock</SelectItem>
            </SelectContent>
          </Select>
        </SectionHeader>

        {rows.length === 0 ? (
          <EmptyState title="No SKUs match" body="Adjust the search term or status filter." />
        ) : (
          <div className="panel max-h-[620px] overflow-auto">
            <table className="w-full min-w-[1020px] text-sm">
              <thead className="sticky top-0 border-b border-border bg-surface-raised text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>{["SKU", "Product", "Zone / bin", "On hand", "Reserved", "Damaged", "Available", "Incoming", "Demand", "Cover", "Status"].map((h) => <th key={h} className="px-3 py-2.5 text-left font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((p) => {
                  const s = stockStatus(p);
                  const cover = daysRemaining(p);
                  return (
                    <tr key={p.sku} className="transition-colors hover:bg-surface-raised/60">
                      <td className="px-3 py-2 font-medium">{p.sku}</td>
                      <td className="px-3 py-2 text-muted-foreground">{p.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{p.zone} · {p.bin}</td>
                      <td className="tabular px-3 py-2">{p.stock}</td>
                      <td className="tabular px-3 py-2">{p.reserved}</td>
                      <td className="tabular px-3 py-2 text-danger">{p.damaged}</td>
                      <td className="tabular px-3 py-2 font-semibold">{available(p)}</td>
                      <td className="tabular px-3 py-2 text-muted-foreground">{p.incoming}</td>
                      <td className="tabular px-3 py-2 text-muted-foreground">{p.dailyDemand}/d</td>
                      <td className="px-3 py-2">
                        <div className="w-16">
                          <Meter value={Math.min(100, cover * 10)} tone={statusTone(s) as "ok"} />
                          <span className="tabular mt-1 block text-[11px] text-muted-foreground">{cover.toFixed(1)}d</span>
                        </div>
                      </td>
                      <td className="px-3 py-2"><SignalBadge tone={statusTone(s) as "ok"}>{s}</SignalBadge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40 px-2.5 py-1.5">
      <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
