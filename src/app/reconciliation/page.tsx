import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Card } from "@/components/shared/Card";
import { StatusPill } from "@/components/shared/Badges";
import { formatAUD } from "@/lib/format";
import { jobMappings, reconciliationFlags } from "@/lib/mock-data";

const TYPE_LABEL: Record<string, string> = {
  unmatched_job: "Unmatched job",
  cost_variance: "Cost variance",
  po_bill_variance: "PO vs bill variance",
  payment_variance: "Payment variance",
};

export default function ReconciliationPage() {
  const unresolved = reconciliationFlags.filter((f) => !f.resolved);
  const resolved = reconciliationFlags.filter((f) => f.resolved);

  return (
    <div>
      <PageHeader
        title="Reconciliation"
        description="Buildxact, Xero and GHL are cross-checked here. Discrepancies are flagged for management review - never silently overwritten or auto-resolved."
      />

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
                  <Link href={`/jobs/${f.jobId}`} className="text-xs text-blue-400 hover:text-blue-300">
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
                    <Link href={`/jobs/${m.dualivingJobId}`} className="text-blue-400 hover:text-blue-300 font-medium">
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
