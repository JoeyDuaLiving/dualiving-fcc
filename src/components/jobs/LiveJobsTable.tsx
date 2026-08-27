import Link from "next/link";
import { formatAUD, formatDateAU } from "@/lib/format";
import { StatusPill } from "@/components/shared/Badges";
import type { Job, JobStatus } from "@/types";

const STATUS_LABEL: Record<JobStatus, string> = {
  quoting: "Quoting",
  contracted: "Not Started",
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

export function LiveJobsTable({ jobs }: { jobs: Job[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
            <th className="pb-2 font-medium">Job</th>
            <th className="pb-2 font-medium">Client / Product</th>
            <th className="pb-2 font-medium">Status</th>
            <th className="pb-2 font-medium text-right">Progress</th>
            <th className="pb-2 font-medium text-right">Contract</th>
            <th className="pb-2 font-medium text-right">Actual cost</th>
            <th className="pb-2 font-medium text-right">Committed</th>
            <th className="pb-2 font-medium text-right">Variations</th>
            <th className="pb-2 font-medium text-right">Completion</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {jobs.map((job) => (
            <tr key={job.id} className="hover:bg-slate-900/60">
              <td className="py-2.5">
                <Link href={`/jobs/${job.id}`} className="text-blue-400 hover:text-blue-300 font-medium">
                  {job.jobNumber}-{job.client}
                </Link>
              </td>
              <td className="py-2.5 text-slate-300">
                {job.client}
                <div className="text-[11px] text-slate-500">{job.product}</div>
              </td>
              <td className="py-2.5">
                <StatusPill tone={statusTone(job.status)}>{STATUS_LABEL[job.status]}</StatusPill>
              </td>
              <td className="py-2.5 text-right tabular-nums text-slate-300">{job.progressPercent}%</td>
              <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(job.contractValue)}</td>
              <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(job.actualCost)}</td>
              <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(job.committedCost)}</td>
              <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(job.approvedVariations)}</td>
              <td className="py-2.5 text-right whitespace-nowrap text-slate-400">
                {job.expectedCompletion ? formatDateAU(job.expectedCompletion) : "—"}
              </td>
            </tr>
          ))}
          {jobs.length === 0 && (
            <tr>
              <td colSpan={9} className="py-6 text-center text-slate-500">
                No jobs returned.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
