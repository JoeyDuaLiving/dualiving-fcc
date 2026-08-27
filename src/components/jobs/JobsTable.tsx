"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatAUD, formatDateAU, formatPercent } from "@/lib/format";
import { StatusPill } from "@/components/shared/Badges";
import type { Job, JobStatus } from "@/types";

export interface JobRow {
  job: Job;
  revisedRevenue: number;
  forecastFinalCost: number;
  marginPercent: number;
  belowTarget: boolean;
  cashReceived: number;
  cashRequiredToFinish: number;
  wip: number;
}

type SortKey = "cashRequired" | "margin" | "contract" | "completion" | "progress";

const STATUS_LABEL: Record<JobStatus, string> = {
  quoting: "Quoting",
  contracted: "Contracted",
  in_progress: "In Progress",
  practical_completion: "Practical Completion",
  complete: "Complete",
  on_hold: "On Hold",
};

function statusTone(status: JobStatus): "neutral" | "good" | "warn" {
  if (status === "complete") return "good";
  if (status === "on_hold") return "warn";
  return "neutral";
}

export function JobsTable({ rows }: { rows: JobRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("cashRequired");

  const sorted = useMemo(() => {
    const copy = [...rows];
    switch (sortKey) {
      case "cashRequired":
        return copy.sort((a, b) => b.cashRequiredToFinish - a.cashRequiredToFinish);
      case "margin":
        return copy.sort((a, b) => a.marginPercent - b.marginPercent);
      case "contract":
        return copy.sort((a, b) => b.revisedRevenue - a.revisedRevenue);
      case "completion":
        return copy.sort((a, b) => a.job.expectedCompletion.localeCompare(b.job.expectedCompletion));
      case "progress":
        return copy.sort((a, b) => b.job.progressPercent - a.job.progressPercent);
      default:
        return copy;
    }
  }, [rows, sortKey]);

  return (
    <div>
      <div className="flex items-center justify-end gap-2 mb-3">
        <span className="text-xs text-slate-500">Sort by</span>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="text-xs bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-slate-200"
        >
          <option value="cashRequired">Highest cash requirement</option>
          <option value="margin">Lowest margin</option>
          <option value="contract">Largest job</option>
          <option value="completion">Completion date</option>
          <option value="progress">Progress</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
              <th className="pb-2 font-medium">Job</th>
              <th className="pb-2 font-medium">Client / Product</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium text-right">Progress</th>
              <th className="pb-2 font-medium text-right">Contract</th>
              <th className="pb-2 font-medium text-right">Forecast cost</th>
              <th className="pb-2 font-medium text-right">Margin</th>
              <th className="pb-2 font-medium text-right">WIP</th>
              <th className="pb-2 font-medium text-right">Cash required</th>
              <th className="pb-2 font-medium text-right">Completion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {sorted.map((r) => (
              <tr key={r.job.id} className="hover:bg-slate-900/60">
                <td className="py-2.5">
                  <Link href={`/jobs/${r.job.id}`} className="text-brand-400 hover:text-brand-300 font-medium">
                    {r.job.id}
                  </Link>
                  <div className="text-[11px] text-slate-500">{r.job.jobNumber}</div>
                </td>
                <td className="py-2.5 text-slate-300">
                  {r.job.client}
                  <div className="text-[11px] text-slate-500">{r.job.product}</div>
                </td>
                <td className="py-2.5">
                  <StatusPill tone={statusTone(r.job.status)}>{STATUS_LABEL[r.job.status]}</StatusPill>
                </td>
                <td className="py-2.5 text-right tabular-nums text-slate-300">{r.job.progressPercent}%</td>
                <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(r.revisedRevenue)}</td>
                <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(r.forecastFinalCost)}</td>
                <td className={`py-2.5 text-right tabular-nums font-medium ${r.belowTarget ? "text-red-400" : "text-emerald-400"}`}>
                  {formatPercent(r.marginPercent)}
                </td>
                <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(r.wip)}</td>
                <td className={`py-2.5 text-right tabular-nums font-medium ${r.cashRequiredToFinish > 0 ? "text-amber-400" : "text-slate-500"}`}>
                  {r.cashRequiredToFinish > 0 ? formatAUD(r.cashRequiredToFinish) : "—"}
                </td>
                <td className="py-2.5 text-right whitespace-nowrap text-slate-400">{formatDateAU(r.job.expectedCompletion)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
