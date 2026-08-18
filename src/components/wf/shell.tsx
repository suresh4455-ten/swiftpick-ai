import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  ClipboardCheck,
  FlaskConical,
  LayoutDashboard,
  Map as MapIcon,
  PackageCheck,
  Route as RouteIcon,
  ScrollText,
  Settings,
  Sparkles,
  Split,
  Play,
} from "lucide-react";
import type { ComponentType } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { relative } from "@/lib/wf/engine";
import { useWf } from "@/lib/wf/store";
import type { Role } from "@/lib/wf/types";

import { CopilotPanel } from "./copilot-panel";
import { SignalBadge, StatusDot } from "./bits";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  roles: Role[];
}

const nav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["manager", "inventory", "picker", "packer"] },
  { to: "/orders", label: "Orders", icon: ScrollText, roles: ["manager", "picker", "packer"] },
  { to: "/inventory", label: "Inventory", icon: Boxes, roles: ["manager", "inventory"] },
  { to: "/allocation", label: "Allocation", icon: Split, roles: ["manager", "inventory"] },
  { to: "/picking", label: "Picking", icon: RouteIcon, roles: ["manager", "picker"] },
  { to: "/packing", label: "Packing", icon: PackageCheck, roles: ["manager", "packer"] },
  { to: "/exceptions", label: "Exceptions", icon: AlertTriangle, roles: ["manager", "inventory", "packer"] },
  { to: "/map", label: "Warehouse Map", icon: MapIcon, roles: ["manager", "inventory", "picker"] },
  { to: "/analytics", label: "Analytics", icon: BarChart3, roles: ["manager"] },
  { to: "/recommendations", label: "AI Recommendations", icon: Sparkles, roles: ["manager", "inventory"] },
  { to: "/simulator", label: "Simulator", icon: FlaskConical, roles: ["manager", "inventory"] },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["manager", "inventory", "picker", "packer"] },
];

const roleLabels: Record<Role, string> = {
  manager: "Warehouse Manager",
  inventory: "Inventory Manager",
  picker: "Picker",
  packer: "Packer",
};

export function CommandShell() {
  const { role, dispatch, notifications, kpis, demoRunning, demoStep, startDemo } = useWf();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = nav.filter((n) => n.roles.includes(role));
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <Link to="/" className="flex items-center gap-2.5 border-b border-sidebar-border px-5 py-4">
          <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <Activity className="size-4" />
          </span>
          <span>
            <span className="block text-sm font-semibold leading-none">WAREFLOW AI</span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Command Center
            </span>
          </span>
        </Link>

        <ScrollArea className="flex-1 px-2 py-3">
          <nav className="space-y-0.5">
            {items.map((item) => {
              const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <item.icon className={cn("size-4", active && "text-primary")} />
                  {item.label}
                  {item.to === "/exceptions" ? (
                    <span className="ml-auto text-[11px] text-danger">{kpis.atRisk}</span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </ScrollArea>

        <div className="border-t border-sidebar-border p-3">
          <div className="panel flex items-center gap-2 p-2.5 text-xs">
            <StatusDot tone={kpis.atRisk > 5 ? "danger" : kpis.atRisk > 0 ? "warn" : "ok"} pulse />
            <span className="text-muted-foreground">
              {kpis.atRisk > 5 ? "Critical" : kpis.atRisk > 0 ? "Attention required" : "Healthy"} ·{" "}
              {kpis.pending} open
            </span>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-border bg-background/85 px-4 py-3 backdrop-blur lg:px-6">
          <Link to="/" className="flex items-center gap-2 lg:hidden">
            <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
              <Activity className="size-3.5" />
            </span>
            <span className="text-sm font-semibold">WAREFLOW AI</span>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 lg:hidden">
                Menu
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {items.map((item) => (
                <DropdownMenuItem key={item.to} asChild>
                  <Link to={item.to} className="flex items-center gap-2">
                    <item.icon className="size-4" /> {item.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {demoRunning ? (
            <SignalBadge tone="info" className="hidden sm:inline-flex">
              <StatusDot tone="info" pulse /> Demo · {demoStep ?? "starting"}
            </SignalBadge>
          ) : null}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="gap-2" onClick={startDemo} disabled={demoRunning}>
              <Play className="size-3.5" />
              {demoRunning ? "Demo running" : "Start Demo"}
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="ghost" className="relative gap-2">
                  <Bell className="size-4" />
                  {unread ? (
                    <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-danger text-[9px] font-bold text-danger-foreground">
                      {unread}
                    </span>
                  ) : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Notifications
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "readAll" })}>
                    Mark all read
                  </Button>
                </div>
                <ScrollArea className="max-h-80">
                  <ul className="divide-y divide-border">
                    {notifications.map((n) => (
                      <li key={n.id} className={cn("px-3 py-2.5", !n.read && "bg-surface-raised/60")}>
                        <div className="flex items-center gap-2">
                          <StatusDot
                            tone={
                              n.level === "critical"
                                ? "danger"
                                : n.level === "warning"
                                  ? "warn"
                                  : n.level === "success"
                                    ? "ok"
                                    : "info"
                            }
                          />
                          <p className="text-sm font-medium">{n.title}</p>
                          <span className="ml-auto text-[10px] text-muted-foreground">
                            {relative(n.at)}
                          </span>
                        </div>
                        <p className="mt-1 pl-4 text-xs text-muted-foreground">{n.body}</p>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </PopoverContent>
            </Popover>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="secondary" className="gap-2">
                  <ClipboardCheck className="size-4 text-primary" />
                  {roleLabels[role]}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Switch role view</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(Object.keys(roleLabels) as Role[]).map((r) => (
                  <DropdownMenuItem key={r} onClick={() => dispatch({ type: "role", role: r })}>
                    {roleLabels[r]}
                    {r === role ? <span className="ml-auto text-primary">•</span> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <CopilotPanel />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
