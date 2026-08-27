"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CashFlowChart } from "@/components/charts/CashFlowChart";
import { ConfidenceBadge } from "@/components/shared/Badges";
import { Card } from "@/components/shared/Card";
import { formatAUD, formatDateAU } from "@/lib/format";
import type { DailyCashPoint } from "@/lib/calculations";
import type { CashDirection, Confidence, ForecastItem } from "@/types";

const CONFIDENCE_OPTIONS: (Confidence | "all")[] = ["all", "actual", "committed", "forecast", "potential"];
const DIRECTION_OPTIONS: (CashDirection | "all")[] = ["all", "inflow", "outflow"];

export function CashFlowClient({
  daily,
  weekly,
  buffer,
  items,
}: {
  daily: DailyCashPoint[];
  weekly: DailyCashPoint[];
  buffer: number;
  items: ForecastItem[];
}) {
  const [view, setView] = useState<"daily" | "weekly">("weekly");
  const [confidence, setConfidence] = useState<Confidence | "all">("all");
  const [direction, setDirection] = useState<CashDirection | "all">("all");

  const chartData = view === "daily" ? daily : weekly;

  const filteredItems = useMemo(() => {
    return items
      .filter((i) => confidence === "all" || i.confidence === confidence)
      .filter((i) => direction === "all" || i.direction === direction)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [items, confidence, direction]);

  const totals = useMemo(() => {
    const horizon = daily[daily.length - 1]?.date ?? "9999-99-99";
    const within90 = items.filter((i) => i.date <= horizon && i.confidence !== "potential");
    const inflow = within90.filter((i) => i.direction === "inflow").reduce((s, i) => s + i.amount, 0);
    const outflow = within90.filter((i) => i.direction === "outflow").reduce((s, i) => s + i.amount, 0);
    return { inflow, outflow };
  }, [items, daily]);

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-400">Opening cash</div>
          <div className="text-xl font-semibold text-white tabular-nums mt-1">{formatAUD(daily[0]?.openingBalance ?? 0)}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-400">Total forecast inflows (90d)</div>
          <div className="text-xl font-semibold text-emerald-400 tabular-nums mt-1">+{formatAUD(totals.inflow)}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-400">Total forecast outflows (90d)</div>
          <div className="text-xl font-semibold text-red-400 tabular-nums mt-1">-{formatAUD(totals.outflow)}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-400">Closing cash (day 90)</div>
          <div className="text-xl font-semibold text-white tabular-nums mt-1">{formatAUD(daily[daily.length - 1]?.closingBalance ?? 0)}</div>
        </div>
      </div>

      <Card
        title="90-Day Cash Flow"
        action={
          <div className="flex rounded-md border border-slate-700 overflow-hidden text-xs">
            <button
              onClick={() => setView("daily")}
              className={`px-3 py-1.5 ${view === "daily" ? "bg-brand-500 text-white" : "text-slate-400 hover:bg-slate-800"}`}
            >
              Daily
            </button>
            <button
              onClick={() => setView("weekly")}
              className={`px-3 py-1.5 ${view === "weekly" ? "bg-brand-500 text-white" : "text-slate-400 hover:bg-slate-800"}`}
            >
              Weekly
            </button>
          </div>
        }
        className="mb-6"
      >
        <CashFlowChart data={chartData} buffer={buffer} />
      </Card>

      <Card
        title="Forecast items"
        action={
          <div className="flex gap-2">
            <select
              value={confidence}
              onChange={(e) => setConfidence(e.target.value as Confidence | "all")}
              className="text-xs bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-slate-200"
            >
              {CONFIDENCE_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c === "all" ? "All confidence" : c[0].toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as CashDirection | "all")}
              className="text-xs bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-slate-200"
            >
              {DIRECTION_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d === "all" ? "All directions" : d === "inflow" ? "Inflows" : "Outflows"}
                </option>
              ))}
            </select>
          </div>
        }
      >
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-900">
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Description</th>
                <th className="pb-2 font-medium">Party</th>
                <th className="pb-2 font-medium">Confidence</th>
                <th className="pb-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-slate-900/60">
                  <td className="py-2 whitespace-nowrap text-slate-400">{formatDateAU(item.date)}</td>
                  <td className="py-2 text-slate-200">
                    {item.jobId ? (
                      <Link href={`/jobs/${item.jobId}`} className="hover:text-brand-300">
                        {item.description}
                      </Link>
                    ) : (
                      item.description
                    )}
                  </td>
                  <td className="py-2 text-slate-400">{item.party ?? "—"}</td>
                  <td className="py-2">
                    <ConfidenceBadge confidence={item.confidence} />
                  </td>
                  <td className={`py-2 text-right tabular-nums font-medium ${item.direction === "inflow" ? "text-emerald-400" : "text-red-400"}`}>
                    {item.direction === "inflow" ? "+" : "-"}
                    {formatAUD(item.amount)}
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">
                    No forecast items match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
