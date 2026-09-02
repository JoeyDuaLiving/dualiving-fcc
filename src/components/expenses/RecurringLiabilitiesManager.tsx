"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/shared/Card";
import { formatAUD, formatDateAU } from "@/lib/format";

export interface RecurringLiabilityDTO {
  id: string;
  description: string;
  amount: number;
  frequency: "weekly" | "fortnightly" | "monthly";
  startDate: string;
  endDate: string | null;
  nextOccurrence: string | null;
  monthlyEquivalent: number;
}

interface EditState {
  description: string;
  amount: string;
  frequency: "weekly" | "fortnightly" | "monthly";
  startDate: string;
  endDate: string;
}

const FREQUENCY_LABEL: Record<EditState["frequency"], string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
};

export function RecurringLiabilitiesManager({ liabilities }: { liabilities: RecurringLiabilityDTO[] }) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<EditState["frequency"]>("monthly");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  async function addLiability() {
    if (!description || !amount || !startDate) {
      setError("Description, amount and a known repayment date are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/recurring-liabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, amount: Number(amount), frequency, startDate, endDate: endDate || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to add");
      }
      setDescription("");
      setAmount("");
      setFrequency("monthly");
      setStartDate("");
      setEndDate("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setSubmitting(false);
    }
  }

  async function removeLiability(id: string) {
    await fetch(`/api/recurring-liabilities/${id}`, { method: "DELETE" });
    router.refresh();
  }

  function startEdit(l: RecurringLiabilityDTO) {
    setEditingId(l.id);
    setEdit({ description: l.description, amount: String(l.amount), frequency: l.frequency, startDate: l.startDate, endDate: l.endDate ?? "" });
  }

  function cancelEdit() {
    setEditingId(null);
    setEdit(null);
  }

  async function saveEdit(id: string) {
    if (!edit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/recurring-liabilities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: edit.description,
          amount: Number(edit.amount),
          frequency: edit.frequency,
          startDate: edit.startDate,
          endDate: edit.endDate || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save changes");
      setEditingId(null);
      setEdit(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  const totalMonthly = liabilities.reduce((s, l) => s + l.monthlyEquivalent, 0);

  return (
    <Card
      title="Recurring liability repayments"
      action={liabilities.length > 0 ? <span className="text-xs text-slate-500">{formatAUD(totalMonthly)}/month equivalent</span> : undefined}
      className="mb-6"
    >
      <p className="text-sm text-slate-400 mb-4">
        Car loans, equipment finance and similar - real direct-debited cash out that never shows up in Xero&rsquo;s
        P&amp;L (loan principal reduces a liability account, not an expense account), so it has to be entered here
        directly. Feeds into the Cash Flow / Forecast projections as a recurring outflow.
      </p>

      {liabilities.length > 0 && (
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="pb-2 font-medium">Description</th>
                <th className="pb-2 font-medium text-right">Amount</th>
                <th className="pb-2 font-medium">Frequency</th>
                <th className="pb-2 font-medium">Next due</th>
                <th className="pb-2 font-medium">Ends</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {liabilities.map((l) =>
                editingId === l.id && edit ? (
                  <tr key={l.id}>
                    <td className="py-1.5">
                      <input
                        value={edit.description}
                        onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200"
                      />
                    </td>
                    <td className="py-1.5">
                      <input
                        type="number"
                        value={edit.amount}
                        onChange={(e) => setEdit({ ...edit, amount: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200 text-right"
                      />
                    </td>
                    <td className="py-1.5">
                      <select
                        value={edit.frequency}
                        onChange={(e) => setEdit({ ...edit, frequency: e.target.value as EditState["frequency"] })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200"
                      >
                        <option value="weekly">Weekly</option>
                        <option value="fortnightly">Fortnightly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </td>
                    <td className="py-1.5">
                      <input
                        type="date"
                        value={edit.startDate}
                        onChange={(e) => setEdit({ ...edit, startDate: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200"
                      />
                    </td>
                    <td className="py-1.5">
                      <input
                        type="date"
                        value={edit.endDate}
                        onChange={(e) => setEdit({ ...edit, endDate: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200"
                      />
                    </td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      <button onClick={() => saveEdit(l.id)} disabled={saving} className="text-xs text-brand-400 hover:text-brand-300 mr-2">
                        Save
                      </button>
                      <button onClick={cancelEdit} className="text-xs text-slate-400 hover:text-slate-200">
                        Cancel
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={l.id}>
                    <td className="py-1.5 text-slate-300">{l.description}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-300">{formatAUD(l.amount)}</td>
                    <td className="py-1.5 text-slate-400">{FREQUENCY_LABEL[l.frequency]}</td>
                    <td className="py-1.5 text-slate-400 whitespace-nowrap">{l.nextOccurrence ? formatDateAU(l.nextOccurrence) : "—"}</td>
                    <td className="py-1.5 text-slate-500 whitespace-nowrap">{l.endDate ? formatDateAU(l.endDate) : "—"}</td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      <button onClick={() => startEdit(l)} className="text-xs text-brand-400 hover:text-brand-300 mr-3">
                        Edit
                      </button>
                      <button onClick={() => removeLiability(l.id)} className="text-xs text-red-400 hover:text-red-300">
                        Remove
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid md:grid-cols-6 gap-2 items-end">
        <div className="md:col-span-2">
          <label className="text-xs text-slate-400 block mb-1">Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ute loan"
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Amount ($)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Frequency</label>
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as EditState["frequency"])}
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
          >
            <option value="weekly">Weekly</option>
            <option value="fortnightly">Fortnightly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">A known debit date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Ends (optional)</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
          />
        </div>
      </div>
      <button
        onClick={addLiability}
        disabled={submitting}
        className="mt-2 bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white text-sm rounded-md px-3 py-1.5"
      >
        {submitting ? "Adding..." : "Add repayment"}
      </button>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </Card>
  );
}
