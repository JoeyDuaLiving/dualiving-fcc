"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Card } from "@/components/shared/Card";
import { StatCard } from "@/components/shared/StatCard";
import { StatusPill } from "@/components/shared/Badges";
import { formatAUD, formatAUDSigned } from "@/lib/format";
import type { PoReconcileJobSummary, PoReconcileReport as Report } from "@/lib/po-reconcile-source";

type SortKey = "gap" | "job" | "reconciled" | "noBill" | "variance" | "unmatched" | "suggestions";
type SortDir = "asc" | "desc";

const pct = (j: Pick<PoReconcileJobSummary, "poCount" | "reconciledCount">) => (j.poCount > 0 ? (j.reconciledCount / j.poCount) * 100 : 100);
const gap = (j: PoReconcileJobSummary) => j.noBillValue + j.unmatchedBillValue;

function sortValue(j: PoReconcileJobSummary, key: SortKey): number | string {
  switch (key) {
    case "job":
      return j.jobNumber;
    case "reconciled":
      return pct(j);
    case "noBill":
      return j.noBillValue;
    case "variance":
      return Math.abs(j.netVariance);
    case "unmatched":
      return j.unmatchedBillValue;
    case "suggestions":
      return j.suggestionCount;
    default:
      return gap(j);
  }
}

const COLUMNS: { key: Exclude<SortKey, "gap">; label: string; align: "left" | "right" }[] = [
  { key: "job", label: "Job", align: "left" },
  { key: "reconciled", label: "POs reconciled", align: "left" },
  { key: "noBill", label: "POs with no Xero bill", align: "right" },
  { key: "variance", label: "Variance on matched POs", align: "right" },
  { key: "unmatched", label: "Xero bills not on a PO", align: "right" },
  { key: "suggestions", label: "Suggested matches", align: "right" },
];

export function PoReconcileReport({ report }: { report: Report }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "gap", dir: "desc" });
  const t = report.totals;
  const reconciledPct = t.poCount > 0 ? (t.reconciledCount / t.poCount) * 100 : 100;

  const rows = useMemo(() => {
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...report.jobs].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      const c = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv, undefined, { numeric: true }) : Number(av) - Number(bv);
      return c * direction || a.jobNumber.localeCompare(b.jobNumber, undefined, { numeric: true });
    });
  }, [report.jobs, sort]);

  function toggle(key: Exclude<SortKey, "gap">) {
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "job" || key === "reconciled" ? "asc" : "desc" }));
  }

  return (
    <section className="mb-6" aria-labelledby="po-recon-heading">
      <div className="mb-3">
        <h2 id="po-recon-heading" className="text-sm font-semibold text-white">
          PO vs Xero reconciliation
        </h2>
        <p className="text-xs text-slate-500 mt-0.5 max-w-3xl">
          Each Buildxact purchase order checked against the Xero bills that cover it, across active jobs. Amounts are inc GST. POs drawn from stock count as reconciled
          against J1057. Open a job to link bills, accept suggested matches or sign POs off.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <StatCard
          label="POs reconciled"
          value={`${t.reconciledCount} of ${t.poCount}`}
          sub={`${reconciledPct.toFixed(0)}% across ${t.jobCount} active jobs`}
          tone={reconciledPct >= 90 ? "good" : reconciledPct >= 50 ? "warn" : "bad"}
        />
        <StatCard label="PO value with no Xero bill" value={formatAUD(t.noBillValue, { compact: true })} sub={`${t.noBillCount} POs`} tone={t.noBillCount > 0 ? "warn" : "good"} />
        <StatCard
          label="Xero bills not on a PO"
          value={formatAUD(t.unmatchedBillValue, { compact: true })}
          sub={`${t.unmatchedBillCount} bills on active jobs`}
          tone={t.unmatchedBillCount > 0 ? "warn" : "good"}
        />
        <StatCard
          label="Variance on matched POs"
          value={formatAUDSigned(t.netVariance)}
          sub={`${t.mismatchCount} POs off by $1 or more`}
          tone={t.mismatchCount > 0 ? "warn" : "good"}
        />
        <StatCard label="Suggested matches waiting" value={String(t.suggestionCount)} sub="strong or likely, ready to accept" tone={t.suggestionCount > 0 ? "default" : "good"} />
        <StatCard label="POs from stock" value={String(t.stockCount)} sub="reconciled against J1057" />
      </div>

      <Card title="By job" action={<span className="text-xs text-slate-500">Biggest gaps first</span>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                {COLUMNS.map((col) => {
                  const active = sort.key === col.key;
                  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
                  return (
                    <th
                      key={col.key}
                      className={`pb-2 pr-3 font-medium ${col.align === "right" ? "text-right" : ""}`}
                      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <button type="button" onClick={() => toggle(col.key)} className={`inline-flex items-center gap-1 hover:text-slate-200 ${active ? "text-slate-200" : ""}`}>
                        {col.label}
                        <Icon className={`h-3 w-3 ${active ? "" : "opacity-50"}`} aria-hidden />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {rows.map((j) => {
                const p = pct(j);
                const clear = j.noBillCount === 0 && j.mismatchCount === 0 && j.unmatchedBillCount === 0;
                return (
                  <tr key={j.jobId} className="hover:bg-slate-900/60 align-top">
                    <td className="py-2.5 pr-3">
                      <Link href={`/jobs/${j.jobId}`} className="text-brand-400 hover:text-brand-300 font-medium">
                        {j.jobNumber} - {j.client}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3 min-w-[9rem]">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-300 tabular-nums">
                          {j.reconciledCount} of {j.poCount}
                        </span>
                        <span className="text-slate-500 tabular-nums">{p.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div className={`h-full rounded-full ${p >= 90 ? "bg-emerald-500" : p >= 50 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${p}%` }} />
                      </div>
                      {j.stockCount > 0 && <div className="text-[11px] text-slate-500 mt-0.5">{j.stockCount} from stock</div>}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {j.noBillCount === 0 ? (
                        <span className="text-slate-500">—</span>
                      ) : (
                        <>
                          <span className="text-slate-200">{formatAUD(j.noBillValue, { compact: true })}</span>
                          <span className="block text-[11px] text-slate-500">
                            {j.noBillCount} PO{j.noBillCount === 1 ? "" : "s"}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {j.mismatchCount === 0 ? (
                        <span className="text-slate-500">—</span>
                      ) : (
                        <>
                          <span className={Math.abs(j.netVariance) < 1 ? "text-slate-300" : j.netVariance < 0 ? "text-amber-300" : "text-red-300"}>{formatAUDSigned(j.netVariance)}</span>
                          <span className="block text-[11px] text-slate-500">
                            {j.mismatchCount} PO{j.mismatchCount === 1 ? "" : "s"} off
                          </span>
                        </>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {j.unmatchedBillCount === 0 ? (
                        <span className="text-slate-500">—</span>
                      ) : (
                        <>
                          <span className="text-slate-200">{formatAUD(j.unmatchedBillValue, { compact: true })}</span>
                          <span className="block text-[11px] text-slate-500">
                            {j.unmatchedBillCount} bill{j.unmatchedBillCount === 1 ? "" : "s"}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      {j.suggestionCount > 0 ? <StatusPill tone="neutral">{j.suggestionCount} waiting</StatusPill> : clear ? <StatusPill tone="good">Clear</StatusPill> : <span className="text-slate-500">—</span>}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-500">
                    No active jobs with purchase orders.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
