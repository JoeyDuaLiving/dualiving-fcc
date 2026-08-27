import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Card } from "@/components/shared/Card";
import { StatusPill } from "@/components/shared/Badges";
import { formatAUD, formatDateAU } from "@/lib/format";
import { jobMappings, reconciliationFlags } from "@/lib/mock-data";
import { loadReconciliation } from "@/lib/reconciliation-source";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  unmatched_job: "Unmatched job",
  cost_variance: "Cost variance",
  po_bill_variance: "PO vs bill variance",
  payment_variance: "Payment variance",
};

export default async function ReconciliationPage() {
  const live = await loadReconciliation();
  const isLive = live.source === "live";

  if (isLive) {
    const flaggedRows = live.rows.filter((r) => r.costFlag || r.revenueFlag);
    const criticalCount = live.rows.filter(
      (r) => (r.costFlag && Math.abs(r.costVariance) > 5000) || (r.revenueFlag && Math.abs(r.revenueVariance) > 5000)
    ).length;

    return (
      <div>
        <PageHeader
          title="Reconciliation"
          description="Buildxact and Xero are cross-checked here, matched by job code - primarily Xero's Job Codes tracking category, falling back to a job-number-in-description match for older records. Scoped to active/contracted jobs; GHL and contact-level matching aren't included."
          action={<StatusPill tone="good">Live</StatusPill>}
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Active jobs checked" value={String(live.rows.length)} />
          <StatCard label="Flagged jobs" value={String(flaggedRows.length)} tone={flaggedRows.length > 0 ? "warn" : "good"} />
          <StatCard label="Critical (&gt;$5k)" value={String(criticalCount)} tone={criticalCount > 0 ? "bad" : "good"} />
          <StatCard label="Orphaned Xero records" value={String(live.orphanedRecords.length)} tone={live.orphanedRecords.length > 0 ? "warn" : "good"} />
        </div>

        <Card title="Flagged jobs" className="mb-6">
          {flaggedRows.length === 0 ? (
            <p className="text-sm text-slate-400">No cost or revenue discrepancies above threshold.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {flaggedRows.map((r) => (
                <li key={r.jobId} className="py-3 first:pt-0">
                  <Link href={`/jobs/${r.jobId}`} className="text-sm font-medium text-brand-400 hover:text-brand-300">
                    {r.jobNumber} - {r.client}
                  </Link>
                  {r.costFlag && <p className="text-sm text-slate-300 mt-0.5">{r.costFlag}</p>}
                  {r.revenueFlag && <p className="text-sm text-slate-300 mt-0.5">{r.revenueFlag}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="By job" className="mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                  <th className="pb-2 font-medium">Job</th>
                  <th className="pb-2 font-medium text-right">BX cost</th>
                  <th className="pb-2 font-medium text-right">Xero bills matched</th>
                  <th className="pb-2 font-medium text-right">Cost variance</th>
                  <th className="pb-2 font-medium text-right">BX contract</th>
                  <th className="pb-2 font-medium text-right">Xero invoices matched</th>
                  <th className="pb-2 font-medium text-right">Revenue variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {live.rows.map((r) => (
                  <tr key={r.jobId} className="hover:bg-slate-900/60">
                    <td className="py-2.5">
                      <Link href={`/jobs/${r.jobId}`} className="text-brand-400 hover:text-brand-300 font-medium">
                        {r.jobNumber} - {r.client}
                      </Link>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(r.bxCost, { compact: true })}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(r.xeroBillsMatched, { compact: true })}</td>
                    <td className={`py-2.5 text-right tabular-nums font-medium ${r.costFlag ? "text-amber-400" : "text-slate-500"}`}>
                      {formatAUD(r.costVariance, { compact: true })}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(r.bxContractValue, { compact: true })}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(r.xeroInvoicesMatched, { compact: true })}</td>
                    <td className={`py-2.5 text-right tabular-nums font-medium ${r.revenueFlag ? "text-amber-400" : "text-slate-500"}`}>
                      {formatAUD(r.revenueVariance, { compact: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card
          title="Orphaned Xero records"
          action={<span className="text-xs text-slate-500">Job code found, but no matching Buildxact job</span>}
        >
          {live.orphanedRecords.length === 0 ? (
            <p className="text-sm text-slate-400">No orphaned records found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                    <th className="pb-2 font-medium">Type</th>
                    <th className="pb-2 font-medium">Number</th>
                    <th className="pb-2 font-medium">Party</th>
                    <th className="pb-2 font-medium">Extracted job code</th>
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {live.orphanedRecords.map((o) => (
                    <tr key={`${o.type}-${o.id}`} className="hover:bg-slate-900/60">
                      <td className="py-2.5 text-slate-400 capitalize">{o.type}</td>
                      <td className="py-2.5 text-slate-300">{o.number}</td>
                      <td className="py-2.5 text-slate-300">{o.party}</td>
                      <td className="py-2.5 text-amber-400">{o.extractedJobNumber}</td>
                      <td className="py-2.5 text-slate-400 whitespace-nowrap">{o.date ? formatDateAU(o.date) : "—"}</td>
                      <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(o.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    );
  }

  const unresolved = reconciliationFlags.filter((f) => !f.resolved);
  const resolved = reconciliationFlags.filter((f) => f.resolved);

  return (
    <div>
      <PageHeader
        title="Reconciliation"
        description="Buildxact, Xero and GHL are cross-checked here. Discrepancies are flagged for management review - never silently overwritten or auto-resolved."
      />

      {live.error && (
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">
          {live.error} Showing Phase 1 mock data in the meantime.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Jobs mapped" value={String(jobMappings.length)} sub="Buildxact <-> Xero <-> GHL" />
        <StatCard label="Open flags" value={String(unresolved.length)} tone={unresolved.length > 0 ? "warn" : "good"} />
        <StatCard label="Critical flags" value={String(unresolved.filter((f) => f.severity === "critical").length)} tone="bad" />
        <StatCard label="Resolved" value={String(resolved.length)} tone="good" />
      </div>

      <Card title="Open flags" className="mb-6">
        {unresolved.length === 0 ? (
          <p className="text-sm text-slate-400">No open reconciliation discrepancies.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {unresolved.map((f) => (
              <li key={f.id} className="py-3 first:pt-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <StatusPill tone={f.severity === "critical" ? "bad" : f.severity === "warning" ? "warn" : "neutral"}>
                    {f.severity}
                  </StatusPill>
                  <span className="text-xs text-slate-500">{TYPE_LABEL[f.type]}</span>
                  <Link href={`/jobs/${f.jobId}`} className="text-xs text-brand-400 hover:text-brand-300">
                    {f.jobId}
                  </Link>
                </div>
                <p className="text-sm text-slate-300">{f.description}</p>
                {f.buildxactValue !== undefined && f.xeroValue !== undefined && (
                  <p className="text-xs text-slate-500 mt-1">
                    Buildxact: {formatAUD(f.buildxactValue)} &middot; Xero: {formatAUD(f.xeroValue)} &middot; Variance: {formatAUD(f.variance ?? 0)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Job mapping" action={<span className="text-xs text-slate-500">Buildxact job number is the master identifier</span>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="pb-2 font-medium">Dualiving ID</th>
                <th className="pb-2 font-medium">Buildxact job</th>
                <th className="pb-2 font-medium">Xero tracking category</th>
                <th className="pb-2 font-medium">Xero contact</th>
                <th className="pb-2 font-medium">GHL opportunity</th>
                <th className="pb-2 font-medium text-right">Match confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {jobMappings.map((m) => (
                <tr key={m.dualivingJobId} className="hover:bg-slate-900/60">
                  <td className="py-2.5">
                    <Link href={`/jobs/${m.dualivingJobId}`} className="text-brand-400 hover:text-brand-300 font-medium">
                      {m.dualivingJobId}
                    </Link>
                  </td>
                  <td className="py-2.5 text-slate-300">{m.buildxactJobNumber}</td>
                  <td className="py-2.5 text-slate-400">{m.xeroTrackingCategoryOptionId ?? "—"}</td>
                  <td className="py-2.5 text-slate-400">{m.xeroContactId ?? "—"}</td>
                  <td className="py-2.5 text-slate-400">{m.ghlOpportunityId ?? "Not yet in pipeline"}</td>
                  <td className="py-2.5 text-right">
                    <StatusPill tone={m.matchConfidence === "confirmed" ? "good" : m.matchConfidence === "probable" ? "warn" : "bad"}>
                      {m.matchConfidence}
                    </StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
