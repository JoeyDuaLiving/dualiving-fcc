"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatAUD, formatDateAU } from "@/lib/format";

export function BankBalanceCard({
  balance,
  asOf,
  isSet,
  fallbackBalance,
}: {
  balance: number;
  asOf: string;
  isSet: boolean;
  fallbackBalance: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(isSet ? String(balance) : String(fallbackBalance));
  const [date, setDate] = useState(asOf || new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayValue = isSet ? balance : fallbackBalance;

  async function save() {
    if (!amount || !date) {
      setError("Balance and date are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/manual-bank-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balance: Number(amount), asOf: date }),
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

  if (editing) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 h-full">
        <div className="text-xs font-medium text-slate-400">Current bank balance</div>
        <div className="mt-2 flex gap-1.5">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full min-w-0 bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-sm text-slate-200"
            autoFocus
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-md px-1.5 py-1 text-xs text-slate-200"
          />
        </div>
        <div className="mt-2 flex gap-2">
          <button onClick={save} disabled={saving} className="text-xs bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white rounded-md px-2 py-1">
            {saving ? "Saving..." : "Save"}
          </button>
          <button onClick={() => setEditing(false)} className="text-xs text-slate-400 hover:text-slate-200">
            Cancel
          </button>
        </div>
        {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 h-full transition-colors hover:border-slate-700 hover:bg-slate-900">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-slate-400">Current bank balance</div>
        <button onClick={() => setEditing(true)} className="text-[11px] text-brand-400 hover:text-brand-300">
          Update
        </button>
      </div>
      <div className={`mt-1.5 text-2xl font-semibold tabular-nums ${displayValue < 0 ? "text-red-400" : "text-white"}`}>{formatAUD(displayValue)}</div>
      <div className="mt-1 text-xs text-slate-500">{isSet ? `As of ${formatDateAU(asOf)} · manual` : "Balance in Xero (ledger) - not yet set manually"}</div>
    </div>
  );
}
