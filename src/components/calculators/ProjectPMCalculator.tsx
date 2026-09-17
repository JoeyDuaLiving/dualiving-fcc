"use client";

import { useState } from "react";
import { Card } from "@/components/shared/Card";
import { HardHat } from "lucide-react";

function fmt(v: number) {
  return v.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

export function ProjectPMCalculator() {
  const [cost, setCost] = useState("");
  const n = parseFloat(cost);
  const valid = !isNaN(n) && n > 0;

  const supervision = valid ? n * 0.01  : null;
  const maintenance = valid ? n * 0.005 : null;
  const contingency = valid ? n * 0.02  : null;
  const sales       = valid ? n * 0.01  : null;
  const pmTotal     = supervision !== null && maintenance !== null && contingency !== null && sales !== null
    ? supervision + maintenance + contingency + sales : null;
  const grandTotal  = pmTotal !== null ? n + pmTotal : null;

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <HardHat size={15} className="text-brand-400" />
          <span>Project Management Fees</span>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-slate-500">1% supervision · 0.5% maintenance · 2% contingency · 1% sales</p>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Total Project Cost</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
            <input
              type="number"
              value={cost}
              onChange={e => setCost(e.target.value)}
              placeholder="0.00"
              className="w-full pl-7 pr-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        {valid && supervision !== null && maintenance !== null && contingency !== null && sales !== null && pmTotal !== null && grandTotal !== null && (
          <div className="space-y-2 pt-1">
            <Row label="Supervision (1%)"   value={fmt(supervision)} />
            <Row label="Maintenance (0.5%)" value={fmt(maintenance)} />
            <Row label="Contingency (2%)"   value={fmt(contingency)} />
            <Row label="Sales (1%)"         value={fmt(sales)} />
            <Row label="PM Fees (4.5%)"     value={fmt(pmTotal)} muted />
            <div className="flex items-center justify-between pt-2 border-t border-slate-700 mt-2">
              <span className="text-sm font-semibold text-white">Total inc. PM</span>
              <span className="text-lg font-bold text-brand-300">{fmt(grandTotal)}</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className={muted ? "text-slate-500 italic" : "text-white font-medium"}>{value}</span>
    </div>
  );
}
