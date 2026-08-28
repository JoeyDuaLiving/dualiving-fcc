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

interface JobEditState {
  reference: string;
  client: string;
  estimatedContractValue: string;
  expectedStartDate: string;
}

interface StageEditState {
  label: string;
  percentOfContract: string;
  expectedDate: string;
}

export function QuotedJobsManager({ quotedJobs }: { quotedJobs: QuotedJobDTO[] }) {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [client, setClient] = useState("");
  const [value, setValue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [jobEdit, setJobEdit] = useState<JobEditState | null>(null);
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [stageEdit, setStageEdit] = useState<StageEditState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

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

  function startEditJob(q: QuotedJobDTO) {
    setEditingJobId(q.id);
    setJobEdit({
      reference: q.reference,
      client: q.client,
      estimatedContractValue: String(q.estimatedContractValue),
      expectedStartDate: q.expectedStartDate,
    });
  }

  function cancelEditJob() {
    setEditingJobId(null);
    setJobEdit(null);
  }

  async function saveEditJob(id: string) {
    if (!jobEdit) return;
    setSavingEdit(true);
    setError(null);
    try {
      const res = await fetch(`/api/quoted-jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: jobEdit.reference,
          client: jobEdit.client,
          estimatedContractValue: Number(jobEdit.estimatedContractValue),
          expectedStartDate: jobEdit.expectedStartDate,
        }),
      });
      if (!res.ok) throw new Error("Failed to save changes");
      setEditingJobId(null);
      setJobEdit(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSavingEdit(false);
    }
  }

  function startEditStage(stage: QuotedJobStageDTO) {
    setEditingStageId(stage.id);
    setStageEdit({ label: stage.label, percentOfContract: String(stage.percentOfContract), expectedDate: stage.expectedDate });
  }

  function cancelEditStage() {
    setEditingStageId(null);
    setStageEdit(null);
  }

  async function saveEditStage(id: string) {
    if (!stageEdit) return;
    setSavingEdit(true);
    setError(null);
    try {
      const res = await fetch(`/api/quoted-job-stages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: stageEdit.label,
          percentOfContract: Number(stageEdit.percentOfContract),
          expectedDate: stageEdit.expectedDate,
        }),
      });
      if (!res.ok) throw new Error("Failed to save changes");
      setEditingStageId(null);
      setStageEdit(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSavingEdit(false);
    }
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
              {editingJobId === q.id && jobEdit ? (
                <div className="grid md:grid-cols-4 gap-2 items-end mb-2">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Reference</label>
                    <input
                      value={jobEdit.reference}
                      onChange={(e) => setJobEdit({ ...jobEdit, reference: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-sm text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Client</label>
                    <input
                      value={jobEdit.client}
                      onChange={(e) => setJobEdit({ ...jobEdit, client: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-sm text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Estimated value ($)</label>
                    <input
                      type="number"
                      value={jobEdit.estimatedContractValue}
                      onChange={(e) => setJobEdit({ ...jobEdit, estimatedContractValue: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-sm text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Expected start date</label>
                    <input
                      type="date"
                      value={jobEdit.expectedStartDate}
                      onChange={(e) => setJobEdit({ ...jobEdit, expectedStartDate: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-sm text-slate-200"
                    />
                  </div>
                  <div className="md:col-span-4 flex gap-2">
                    <button
                      onClick={() => saveEditJob(q.id)}
                      disabled={savingEdit}
                      className="bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white text-xs rounded-md px-3 py-1.5"
                    >
                      Save
                    </button>
                    <button onClick={cancelEditJob} className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-sm font-medium text-slate-200">{q.reference} - {q.client}</span>
                    <span className="text-xs text-slate-500 ml-2">{formatAUD(q.estimatedContractValue)} estimated</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => startEditJob(q)} className="text-xs text-brand-400 hover:text-brand-300">
                      Edit
                    </button>
                    <button onClick={() => removeQuotedJob(q.id)} className="text-xs text-red-400 hover:text-red-300">
                      Delete quoted job
                    </button>
                  </div>
                </div>
              )}
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
                  {q.stages.map((stage) =>
                    editingStageId === stage.id && stageEdit ? (
                      <tr key={stage.id}>
                        <td className="py-1.5">
                          <input
                            value={stageEdit.label}
                            onChange={(e) => setStageEdit({ ...stageEdit, label: e.target.value })}
                            className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200"
                          />
                        </td>
                        <td className="py-1.5">
                          <input
                            type="number"
                            value={stageEdit.percentOfContract}
                            onChange={(e) => setStageEdit({ ...stageEdit, percentOfContract: e.target.value })}
                            className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200 text-right"
                          />
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-slate-500">
                          {formatAUD((Number(stageEdit.percentOfContract || 0) / 100) * q.estimatedContractValue)}
                        </td>
                        <td className="py-1.5">
                          <input
                            type="date"
                            value={stageEdit.expectedDate}
                            onChange={(e) => setStageEdit({ ...stageEdit, expectedDate: e.target.value })}
                            className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200"
                          />
                        </td>
                        <td className="py-1.5 text-right whitespace-nowrap">
                          <button onClick={() => saveEditStage(stage.id)} disabled={savingEdit} className="text-xs text-brand-400 hover:text-brand-300 mr-2">
                            Save
                          </button>
                          <button onClick={cancelEditStage} className="text-xs text-slate-400 hover:text-slate-200">
                            Cancel
                          </button>
                        </td>
                      </tr>
                    ) : (
                      <tr key={stage.id}>
                        <td className="py-1.5 text-slate-300">{stage.label}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-400">{stage.percentOfContract}%</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-400">
                          {formatAUD((stage.percentOfContract / 100) * q.estimatedContractValue)}
                        </td>
                        <td className="py-1.5 text-slate-500 whitespace-nowrap">{formatDateAU(stage.expectedDate)}</td>
                        <td className="py-1.5 text-right whitespace-nowrap">
                          <button onClick={() => startEditStage(stage)} className="text-xs text-brand-400 hover:text-brand-300 mr-3">
                            Edit
                          </button>
                          <button onClick={() => removeStage(stage.id)} className="text-xs text-red-400 hover:text-red-300">
                            Remove
                          </button>
                        </td>
                      </tr>
                    )
                  )}
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
