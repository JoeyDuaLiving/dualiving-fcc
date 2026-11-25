"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { StatusPill } from "@/components/shared/Badges";
import { formatAUD } from "@/lib/format";

export interface PurchaseOrderRowData {
  purchaseOrderId: string;
  orderNumber: number;
  description: string;
  total: number;
  status: string;
  isCompleted: boolean;
  isLabour: boolean;
}

type SortKey = "default" | "order" | "description" | "total" | "status";
type SortDir = "asc" | "desc";

// Open POs first (they're the ones still carrying committed cost), then closed,
// then cancelled - the order the team actually works through them in.
function statusRank(status: string): number {
  if (status === "Cancelled") return 2;
  if (status === "Received" || status === "Completed") return 1;
  return 0;
}

function compare(a: PurchaseOrderRowData, b: PurchaseOrderRowData, key: SortKey): number {
  switch (key) {
    case "order":
      return a.orderNumber - b.orderNumber;
    case "description":
      return a.description.localeCompare(b.description, undefined, { sensitivity: "base" });
    case "total":
      return a.total - b.total;
    case "status":
      return statusRank(a.status) - statusRank(b.status) || a.status.localeCompare(b.status);
    default:
      return statusRank(a.status) - statusRank(b.status) || b.orderNumber - a.orderNumber;
  }
}

const COLUMNS: { key: Exclude<SortKey, "default">; label: string; align: "left" | "right" }[] = [
  { key: "order", label: "Order", align: "left" },
  { key: "description", label: "Description", align: "left" },
  { key: "total", label: "Total (inc GST)", align: "right" },
  { key: "status", label: "Status", align: "right" },
];

export function PurchaseOrdersTable({ rows }: { rows: PurchaseOrderRowData[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "default", dir: "asc" });

  const sorted = useMemo(() => {
    const direction = sort.dir === "asc" ? 1 : -1;
    // Ties on a chosen column fall back to newest PO first so the order is stable.
    return [...rows].sort((a, b) =>
      sort.key === "default" ? compare(a, b, "default") : compare(a, b, sort.key) * direction || b.orderNumber - a.orderNumber
    );
  }, [rows, sort]);

  function toggle(key: Exclude<SortKey, "default">) {
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "total" ? "desc" : "asc" }));
  }

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
            {COLUMNS.map((col) => {
              const active = sort.key === col.key;
              const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
              return (
                <th
                  key={col.key}
                  className={`pb-2 font-medium ${col.align === "right" ? "text-right" : ""}`}
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button
                    type="button"
                    onClick={() => toggle(col.key)}
                    className={`inline-flex items-center gap-1 hover:text-slate-200 ${active ? "text-slate-200" : ""}`}
                  >
                    {col.label}
                    <Icon className={`h-3 w-3 ${active ? "" : "opacity-50"}`} aria-hidden />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {sorted.map((po) => (
            <tr key={po.purchaseOrderId} className={po.status === "Cancelled" ? "opacity-50" : ""}>
              <td className="py-2 text-slate-300">#{po.orderNumber}</td>
              <td className="py-2 text-slate-400">
                {po.description}
                {po.isLabour && (
                  <span className="ml-2">
                    <StatusPill tone="warn">Labour</StatusPill>
                  </span>
                )}
              </td>
              <td className="py-2 text-right tabular-nums text-slate-300">{formatAUD(po.total)}</td>
              <td className="py-2 text-right">
                <StatusPill tone={po.isCompleted ? "good" : "neutral"}>{po.status}</StatusPill>
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-slate-500">
                No purchase orders recorded.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {sort.key !== "default" && (
        <button type="button" onClick={() => setSort({ key: "default", dir: "asc" })} className="mt-2 text-xs text-brand-400 hover:text-brand-300">
          Reset to open POs first
        </button>
      )}
    </div>
  );
}
