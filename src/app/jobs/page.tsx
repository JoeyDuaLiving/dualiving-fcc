import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Card } from "@/components/shared/Card";
import { StatusPill } from "@/components/shared/Badges";
import { JobsTable, type JobRow } from "@/components/jobs/JobsTable";
import { LiveJobsTable } from "@/components/jobs/LiveJobsTable";
import { formatAUD, formatDateAU } from "@/lib/format";
import { loadLiveJobsList } from "@/lib/jobs-source";
import {
  activeJobs,
  completedJobs,
  jobCashPosition,
  jobCosting,
  totalActiveJobCashRequirement,
  totalWip,
  wipByProgressBucket,
} from "@/lib/calculations";

// This page reads synced Buildxact data straight from Postgres - it must
// not be statically prerendered at build time, or it would only ever show
// whatever the database looked like the moment `next build` ran.
export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const live = await loadLiveJobsList();

  const rows: JobRow[] = activeJobs.map((job) => {
    const costing = jobCosting(job);
    const pos = jobCashPosition(job);
    return {
      job,
      revisedRevenue: costing.revisedRevenue,
      forecastFinalCost: costing.forecastFinalCost,
      marginPercent: costing.forecastMarginPercent,
      belowTarget: costing.belowTarget,
      cashReceived: pos.cashReceived,
      cashRequiredToFinish: pos.cashRequiredToFinish,
      wip: pos.wip,
    };
  });

  const belowTargetCount = rows.filter((r) => r.belowTarget).length;
  const wipBuckets = wipByProgressBucket();
  const totalContractValue = rows.reduce((s, r) => s + r.revisedRevenue, 0);

  return (
    <div>
      <PageHeader
        title="Jobs / WIP"
        description="Buildxact is the system of record for job cost, budget and progress. Cash figures are cross-referenced against Xero invoices and bills."
      />

      {live.source === "unavailable" && live.error && (
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">
          {live.error} The sections below are showing Phase 1 mock data in the meantime.
        </div>
      )}

      {live.source === "live" && (
        <Card
          title={
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white">Live Buildxact jobs</h2>
              <StatusPill tone="good">Live</StatusPill>
            </div>
          }
          action={
            <span className="text-xs text-slate-500">
              {live.jobs.length} jobs{live.lastSyncedAt ? ` · Last synced ${formatDateAU(live.lastSyncedAt)}` : ""}
            </span>
          }
          className="mb-6"
        >
          <p className="text-xs text-slate-500 mb-3">
            Job number, client, status, progress, contract value, actual cost, committed cost (from live purchase orders)
            and variations are synced from Buildxact. Margin and cash-required aren&rsquo;t shown here yet - Buildxact has
            no confirmed &ldquo;cost to complete&rdquo; field, so those numbers would be guesses (open a job for its full
            purchase order / invoice breakdown, which is real).
          </p>
          <LiveJobsTable jobs={live.jobs} />
        </Card>
      )}

      <PageHeader
        title={live.source === "live" ? "Mock Jobs / WIP dashboard (Phase 1 reference)" : "Jobs / WIP"}
        description={
          live.source === "live"
            ? "Kept for comparison while the live integration is being built out - this section still runs entirely on Phase 1 mock data."
            : undefined
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Active jobs" value={String(activeJobs.length)} sub={`${formatAUD(totalContractValue, { compact: true })} contracted`} />
        <StatCard label="Total WIP" value={formatAUD(totalWip())} sub="Cost incurred, not yet billed" />
        <StatCard label="Cash required to finish" value={formatAUD(totalActiveJobCashRequirement())} tone={totalActiveJobCashRequirement() > 0 ? "warn" : "good"} sub="Across all active jobs" />
        <StatCard label="Below margin target" value={String(belowTargetCount)} tone={belowTargetCount > 0 ? "bad" : "good"} sub="of 25% target margin" />
      </div>

      <Card title="WIP by project stage" className="mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(wipBuckets).map(([bucket, value]) => (
            <div key={bucket}>
              <div className="text-xs text-slate-400">{bucket} progress</div>
              <div className="text-lg font-semibold text-white tabular-nums mt-1">{formatAUD(value)}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Active jobs" className="mb-6">
        <JobsTable rows={rows} />
      </Card>

      <Card
        title="Completed jobs"
        action={<span className="text-xs text-slate-500">{completedJobs.length} jobs</span>}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="pb-2 font-medium">Job</th>
                <th className="pb-2 font-medium">Client</th>
                <th className="pb-2 font-medium text-right">Contract</th>
                <th className="pb-2 font-medium text-right">Actual cost</th>
                <th className="pb-2 font-medium text-right">Gross profit</th>
                <th className="pb-2 font-medium text-right">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {completedJobs.map((job) => {
                const costing = jobCosting(job);
                return (
                  <tr key={job.id} className="hover:bg-slate-900/60">
                    <td className="py-2.5">
                      <Link href={`/jobs/${job.id}`} className="text-blue-400 hover:text-blue-300 font-medium">
                        {job.id}
                      </Link>
                    </td>
                    <td className="py-2.5 text-slate-300">{job.client}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(costing.revisedRevenue)}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(job.actualCost)}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(costing.forecastGrossProfit)}</td>
                    <td className={`py-2.5 text-right tabular-nums font-medium ${costing.belowTarget ? "text-red-400" : "text-emerald-400"}`}>
                      {costing.forecastMarginPercent.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
