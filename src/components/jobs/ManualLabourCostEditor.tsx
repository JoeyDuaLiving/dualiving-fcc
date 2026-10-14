"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatAUD, formatDateAU } from "@/lib/format";

export function ManualLabourCostEditor({
  jobSourceId,
  current,
}: {
  jobSourceId: string;
  current: { amount: number; note: string | null; updatedAt: string } | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(current ? String(current.amount) : "");
  const [note, setNote] = useState(current?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!amount) {
      setError("Amount is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/job-labour-cost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobSourceId, amount: Number(amount), note: note || null }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    try {
      await fetch("/api/job-labour-cost", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobSourceId }),
      });
      setAmount("");
      setNote("");
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="rounded-md border border-slate-700 bg-slate-900 p-3">
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-[11px] text-slate-500 block mb-1">Labour cost ($)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
              autoFocus
            />
          </div>
          <div>
            <label className="text-[11px] text-slate-500 block mb-1">Note (optional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="From labour spreadsheet"
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={saving} className="text-xs bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white rounded-md px-2.5 py-1">
            {saving ? "Saving..." : "Save"}
          </button>
          <button onClick={() => setEditing(false)} className="text-xs text-slate-400 hover:text-slate-200">
            Cancel
          </button>
          {current && (
            <button onClick={clear} disabled={saving} className="text-xs text-red-400 hover:text-red-300 ml-auto">
              Clear (use estimate instead)
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
      </div>
    );
  }

  return (
    <button onClick={() => setEditing(true)} className="text-xs text-brand-400 hover:text-brand-300">
      {current ? `Edit (${formatAUD(current.amount)}, set ${formatDateAU(current.updatedAt)})` : "Enter from spreadsheet"}
    </button>
  );
}
