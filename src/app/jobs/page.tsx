import { PageHeader } from "@/components/shared/PageHeader";
import { Card } from "@/components/shared/Card";
import { StatusPill } from "@/components/shared/Badges";
import { LiveJobsTable } from "@/components/jobs/LiveJobsTable";
import { formatDateAU } from "@/lib/format";
import { loadLiveJobsList } from "@/lib/jobs-source";

// This page reads synced Buildxact data straight from Postgres - it must
// not be statically prerendered at build time, or it would only ever show
// whatever the database looked like the moment `next build` ran.
export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const live = await loadLiveJobsList();

  return (
    <div>
      <PageHeader
        title="Jobs / WIP"
        description="Buildxact is the system of record for job cost, budget and progress. Cash figures are cross-referenced against Xero invoices and bills."
      />

      {live.source === "unavailable" && live.error && (
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">
          {live.error}
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
        >
          <p className="text-xs text-slate-500 mb-3">
            Job number, client, status, progress, contract value, actual cost and committed cost (from live purchase
            orders) are synced from Buildxact. Profit is cash actually received to date (invoices with status
            &ldquo;Received&rdquo;) minus actual + committed cost - not the full contract value, so it stays
            meaningful before a job is finished. &ldquo;Xero bills&rdquo; and &ldquo;Xero invoices&rdquo; are the
            Xero-side totals matched to this job by job code - a cross-check against the Buildxact figures, not
            used in the profit calculation (open a job for the full breakdown and matched transactions).
          </p>
          <LiveJobsTable
            jobs={live.jobs}
            cashReceivedByJobId={Object.fromEntries(live.cashReceivedByJobId)}
            xeroBillsByJobId={Object.fromEntries(live.xeroBillsByJobId)}
            xeroInvoicesByJobId={Object.fromEntries(live.xeroInvoicesByJobId)}
          />
        </Card>
      )}
    </div>
  );
}
