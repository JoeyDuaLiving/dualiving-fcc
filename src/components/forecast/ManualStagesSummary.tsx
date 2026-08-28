import Link from "next/link";
import { Card } from "@/components/shared/Card";
import { StatusPill } from "@/components/shared/Badges";
import { formatAUD, formatDateAU } from "@/lib/format";
import type { ManualStageDTO } from "./ManualStagesManager";

export interface ManualStagesSummaryJob {
  id: string;
  jobNumber: string;
  client: string;
  revisedRevenue: number;
}

interface SummaryRow {
  jobId: string;
  jobNumber: string;
  client: string;
  stageId: string;
  label: string;
  percentOfContract: number;
  amount: number;
  expectedDate: string;
  invoiced: boolean;
}

export function ManualStagesSummary({
  jobOptions,
  stagesByJobId,
}: {
  jobOptions: ManualStagesSummaryJob[];
  stagesByJobId: Record<string, ManualStageDTO[]>;
}) {
  const jobById = new Map(jobOptions.map((j) => [j.id, j]));
  const rows: SummaryRow[] = [];
  for (const [jobId, stages] of Object.entries(stagesByJobId)) {
    const job = jobById.get(jobId);
    if (!job) continue;
    for (const stage of stages) {
      rows.push({
        jobId,
        jobNumber: job.jobNumber,
        client: job.client,
        stageId: stage.id,
        label: stage.label,
        percentOfContract: stage.percentOfContract,
        amount: Math.round((stage.percentOfContract / 100) * job.revisedRevenue),
        expectedDate: stage.expectedDate,
        invoiced: stage.invoiced,
      });
    }
  }
  rows.sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));

  return (
    <Card title="Manually entered payment stages" action={<span className="text-xs text-slate-500">{rows.length} across all jobs</span>} className="mb-6">
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">No manual payment stages entered yet - add one per job below.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="pb-2 font-medium">Job</th>
                <th className="pb-2 font-medium">Stage</th>
                <th className="pb-2 font-medium text-right">%</th>
                <th className="pb-2 font-medium text-right">Amount</th>
                <th className="pb-2 font-medium text-right">Expected date</th>
                <th className="pb-2 font-medium text-right">Invoiced</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {rows.map((r) => (
                <tr key={r.stageId} className="hover:bg-slate-900/60">
                  <td className="py-2">
                    <Link href={`/jobs/${r.jobId}`} className="text-brand-400 hover:text-brand-300 font-medium">
                      {r.jobNumber} - {r.client}
                    </Link>
                  </td>
                  <td className="py-2 text-slate-300">{r.label}</td>
                  <td className="py-2 text-right tabular-nums text-slate-400">{r.percentOfContract}%</td>
                  <td className="py-2 text-right tabular-nums text-slate-300">{formatAUD(r.amount)}</td>
                  <td className="py-2 text-right text-slate-400 whitespace-nowrap">{formatDateAU(r.expectedDate)}</td>
                  <td className="py-2 text-right">
                    <StatusPill tone={r.invoiced ? "good" : "neutral"}>{r.invoiced ? "Invoiced" : "Pending"}</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
