"use client";

import { useState } from "react";
import { Card } from "@/components/shared/Card";
import { Calculator } from "lucide-react";

function fmt(v: number) {
  return v.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

export function GSTCalculator() {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"ex" | "inc">("ex");
  const n = parseFloat(amount);
  const valid = !isNaN(n) && n > 0;

  const exGST  = valid ? (mode === "ex" ? n : n / 1.1) : null;
  const incGST = valid ? (mode === "ex" ? n * 1.1 : n) : null;
  const gst    = exGST !== null && incGST !== null ? incGST - exGST : null;

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <Calculator size={15} className="text-brand-400" />
          <span>GST Calculator</span>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          {(["ex", "inc"] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                mode === m
                  ? "bg-brand-500/20 text-brand-300 border border-brand-500/40"
                  : "bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200"
              }`}
            >
              {m === "ex" ? "Enter ex-GST" : "Enter inc-GST"}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">
            {mode === "ex" ? "Amount (ex GST)" : "Amount (inc GST)"}
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full pl-7 pr-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        {valid && exGST !== null && incGST !== null && gst !== null && (
          <div className="space-y-2 pt-1 border-t border-slate-700">
            <Row label="Ex-GST"    value={fmt(exGST)} />
            <Row label="GST (10%)" value={fmt(gst)} />
            <Row label="Inc-GST"   value={fmt(incGST)} bold />
          </div>
        )}
      </div>
    </Card>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className={bold ? "text-white font-bold" : "text-white font-medium"}>{value}</span>
    </div>
  );
}
