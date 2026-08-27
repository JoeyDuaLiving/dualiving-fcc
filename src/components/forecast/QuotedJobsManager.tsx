"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/shared/Card";
import { formatAUD, formatDateAU } from "@/lib/format";

export interface QuotedJobStageDTO {
  id: string;
  label: string;
  percentOfContract: number;
  triggerDescription: string;
  expectedDate: string;
}

export interface QuotedJobDTO {
  id: string;
  reference: string;
  client: string;
  estimatedContractValue: number;
  expectedStartDate: string;
  notes: string;
  stages: QuotedJobStageDTO[];
}

export function QuotedJobsManager({ quotedJobs }: { quotedJobs: QuotedJobDTO[] }) {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [client, setClient] = useState("");
  const [value, setValue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addQuotedJob() {
    if (!reference || !client || !value || !startDate) {
      setError("Reference, client, estimated value and expected start date are all required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/quoted-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, client, estimatedContractValue: Number(value), expectedStartDate: startDate }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to add quoted job");
      }
      setReference("");
      setClient("");
      setValue("");
      setStartDate("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add quoted job");
    } finally {
      setSubmitting(false);
    }
  }

  async function removeQuotedJob(id: string) {
    await fetch(`/api/quoted-jobs/${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function removeStage(id: string) {
    await fetch(`/api/quoted-job-stages/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <Card title="Quoted jobs (not yet in Buildxact)" className="mb-6">
      <p className="text-sm text-slate-400 mb-4">
        A deal close to starting that doesn&rsquo;t have a Buildxact job yet - e.g. &ldquo;Q1280&rdquo;, expected to
        become &ldquo;J1280&rdquo; once BX creates the real job. Adding one auto-fills the standard 10% deposit / 40%
        manufacturing (+2wk) / 45% install (+4wk) / 5% final (+8wk) stages from the expected start date - edit or
        remove any of them below. Delete the quoted job once the real Buildxact job exists, so it stops being counted
        twice.
      </p>
      <p className="text-sm text-slate-400 mb-4">
        The forecast also generates COGS outflows for each quoted job: 25% of estimated value 2wk after the
        Manufacturing stage, another 25% 6wk after that, and a final 25% 2wk after the Final stage - 75% of estimated
        value as cost, implying a 25% margin. This is calculated automatically from the Manufacturing/Final stage
        dates below, not editable here - rename or remove either of those two stages and the job stops getting COGS
        outflows.
      </p>

      {quotedJobs.length > 0 && (
        <div className="space-y-4 mb-5">
          {quotedJobs.map((q) => (
            <div key={q.id} className="rounded-lg border border-slate-800 p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-sm font-medium text-slate-200">{q.reference} - {q.client}</span>
                  <span className="text-xs text-slate-500 ml-2">{formatAUD(q.estimatedContractValue)} estimated</span>
                </div>
                <button onClick={() => removeQuotedJob(q.id)} className="text-xs text-red-400 hover:text-red-300">
                  Delete quoted job
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                    <th className="pb-1 font-medium">Stage</th>
                    <th className="pb-1 font-medium text-right">%</th>
                    <th className="pb-1 font-medium text-right">Amount</th>
                    <th className="pb-1 font-medium">Expected date</th>
                    <th className="pb-1 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {q.stages.map((stage) => (
                    <tr key={stage.id}>
                      <td className="py-1.5 text-slate-300">{stage.label}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-400">{stage.percentOfContract}%</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-400">
                        {formatAUD((stage.percentOfContract / 100) * q.estimatedContractValue)}
                      </td>
                      <td className="py-1.5 text-slate-500 whitespace-nowrap">{formatDateAU(stage.expectedDate)}</td>
                      <td className="py-1.5 text-right">
                        <button onClick={() => removeStage(stage.id)} className="text-xs text-red-400 hover:text-red-300">
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-5 gap-2 items-end">
        <div>
          <label className="text-xs text-slate-400 block mb-1">Reference</label>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Q1280"
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Client</label>
          <input
            value={client}
            onChange={(e) => setClient(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Estimated value ($)</label>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Expected start date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
          />
        </div>
        <button
          onClick={addQuotedJob}
          disabled={submitting}
          className="bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white text-sm rounded-md px-3 py-1.5"
        >
          {submitting ? "Adding..." : "Add quoted job"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </Card>
  );
}
