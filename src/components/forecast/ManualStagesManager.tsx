"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/shared/Card";
import { formatAUD, formatDateAU } from "@/lib/format";

export interface ManualStageJobOption {
  id: string;
  jobNumber: string;
  client: string;
  revisedRevenue: number;
}

export interface ManualStageDTO {
  id: string;
  label: string;
  percentOfContract: number;
  triggerDescription: string;
  expectedDate: string;
  invoiced: boolean;
}

export function ManualStagesManager({
  jobOptions,
  stagesByJobId,
}: {
  jobOptions: ManualStageJobOption[];
  stagesByJobId: Record<string, ManualStageDTO[]>;
}) {
  const router = useRouter();
  const [selectedJobId, setSelectedJobId] = useState(jobOptions[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [percent, setPercent] = useState("");
  const [date, setDate] = useState("");
  const [trigger, setTrigger] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedJob = jobOptions.find((j) => j.id === selectedJobId);
  const stages = useMemo(
    () => (stagesByJobId[selectedJobId] ?? []).slice().sort((a, b) => a.expectedDate.localeCompare(b.expectedDate)),
    [stagesByJobId, selectedJobId]
  );

  async function addStage() {
    if (!selectedJobId || !label || !percent || !date) {
      setError("Label, % of contract and expected date are all required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/manual-stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: selectedJobId,
          label,
          percentOfContract: Number(percent),
          expectedDate: date,
          triggerDescription: trigger || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to add stage");
      }
      setLabel("");
      setPercent("");
      setDate("");
      setTrigger("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add stage");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleInvoiced(stage: ManualStageDTO) {
    await fetch(`/api/manual-stages/${stage.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiced: !stage.invoiced }),
    });
    router.refresh();
  }

  async function deleteStage(stageId: string) {
    await fetch(`/api/manual-stages/${stageId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <Card title="Payment stages (manual)" className="mb-6">
      <p className="text-sm text-slate-400 mb-4">
        Buildxact has no field for Dualiving&rsquo;s own invoicing plan per job (e.g. &ldquo;10% deposit, 40% frame
        stage&rdquo;), so enter it here - it feeds the FORECAST inflow/outflow timing above instead of a single
        lump-sum estimate. Mark a stage invoiced once it&rsquo;s been billed in Xero to drop it out of the forecast.
      </p>

      <div className="mb-4">
        <label className="text-xs text-slate-400 block mb-1">Job</label>
        <select
          value={selectedJobId}
          onChange={(e) => setSelectedJobId(e.target.value)}
          className="w-full md:w-96 bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
        >
          {jobOptions.map((j) => (
            <option key={j.id} value={j.id}>
              {j.jobNumber} - {j.client}
            </option>
          ))}
        </select>
      </div>

      {selectedJob && (
        <>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                  <th className="pb-2 font-medium">Stage</th>
                  <th className="pb-2 font-medium text-right">% of contract</th>
                  <th className="pb-2 font-medium text-right">Amount</th>
                  <th className="pb-2 font-medium">Expected date</th>
                  <th className="pb-2 font-medium">Invoiced</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {stages.map((stage) => (
                  <tr key={stage.id}>
                    <td className="py-2 text-slate-200">
                      {stage.label}
                      {stage.triggerDescription && <div className="text-[11px] text-slate-500">{stage.triggerDescription}</div>}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-300">{stage.percentOfContract}%</td>
                    <td className="py-2 text-right tabular-nums text-slate-300">
                      {formatAUD((stage.percentOfContract / 100) * selectedJob.revisedRevenue)}
                    </td>
                    <td className="py-2 text-slate-400 whitespace-nowrap">{formatDateAU(stage.expectedDate)}</td>
                    <td className="py-2">
                      <input type="checkbox" checked={stage.invoiced} onChange={() => toggleInvoiced(stage)} />
                    </td>
                    <td className="py-2 text-right">
                      <button onClick={() => deleteStage(stage.id)} className="text-xs text-red-400 hover:text-red-300">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {stages.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-slate-500">
                      No manual stages for this job yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="grid md:grid-cols-5 gap-2 items-end">
            <div className="md:col-span-2">
              <label className="text-xs text-slate-400 block mb-1">Stage label</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. 40% Frame stage"
                className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">% of contract</label>
              <input
                type="number"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Expected date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
              />
            </div>
            <button
              onClick={addStage}
              disabled={submitting}
              className="bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white text-sm rounded-md px-3 py-1.5"
            >
              {submitting ? "Adding..." : "Add stage"}
            </button>
          </div>
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        </>
      )}

      {jobOptions.length === 0 && <p className="text-sm text-slate-500">No active jobs available.</p>}
    </Card>
  );
}
