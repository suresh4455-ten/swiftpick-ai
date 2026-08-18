export type Zone =
  | "Receiving"
  | "Zone A"
  | "Zone B"
  | "Zone C"
  | "Zone D"
  | "Packing"
  | "Quality Check"
  | "Dispatch";

export type StockStatus = "healthy" | "low" | "critical" | "out";

export interface Product {
  sku: string;
  name: string;
  category: string;
  stock: number;
  reserved: number;
  damaged: number;
  incoming: number;
  reorderPoint: number;
  reorderQty: number;
  zone: Zone;
  bin: string;
  dailyDemand: number;
  unitCost: number;
  reorderRequested?: boolean;
  mismatch?: number;
}

export type OrderStatus =
  | "NEW"
  | "PRIORITIZED"
  | "INVENTORY CHECK"
  | "ALLOCATED"
  | "PICKING"
  | "PACKING"
  | "QUALITY CHECK"
  | "READY TO DISPATCH"
  | "DISPATCHED"
  | "DELIVERED"
  | "EXCEPTION";

export type CustomerTier = "strategic" | "key" | "standard";

export interface OrderLine {
  sku: string;
  qty: number;
  allocated: number;
  picked: number;
  damaged: number;
  missing: number;
}

export interface TimelineEvent {
  stage: string;
  at: number;
  note?: string;
}

export interface Order {
  id: string;
  customer: string;
  tier: CustomerTier;
  channel: "B2B" | "Retail" | "E-commerce" | "Express";
  createdAt: number;
  deadline: number;
  status: OrderStatus;
  lines: OrderLine[];
  timeline: TimelineEvent[];
  picker?: string;
  packer?: string;
  batchId?: string;
  qc?: "PASS" | "FAIL" | "PARTIAL";
  valueUsd: number;
}

export type ExceptionType =
  | "Stock shortage"
  | "Damaged item"
  | "Missing item"
  | "Wrong item picked"
  | "Inventory mismatch"
  | "Delayed order"
  | "Packing failure"
  | "Dispatch delay";

export interface WfException {
  id: string;
  type: ExceptionType;
  severity: "critical" | "high" | "medium";
  orderId?: string;
  sku?: string;
  detail: string;
  decision: string;
  resolution: string;
  action: string;
  status: "open" | "resolved";
  createdAt: number;
}

export interface Station {
  id: string;
  name: string;
  kind: "packing" | "quality" | "dispatch";
  avgMinutes: number;
  queue: number;
  online: boolean;
}

export interface Worker {
  id: string;
  name: string;
  role: "picker" | "packer";
  zone: Zone;
  activeTasks: number;
  itemsPerHour: number;
}

export interface PickBatch {
  id: string;
  orderIds: string[];
  zones: Zone[];
  baselineMinutes: number;
  optimizedMinutes: number;
  createdAt: number;
}

export interface Notification {
  id: string;
  level: "critical" | "warning" | "info" | "success";
  title: string;
  body: string;
  at: number;
  read: boolean;
}

export type Role = "manager" | "inventory" | "picker" | "packer";
