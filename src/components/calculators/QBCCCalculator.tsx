"use client";

import { useState } from "react";
import { Card } from "@/components/shared/Card";
import { Shield } from "lucide-react";

function getPremium(val: number): number {
  if (val < 3300) return 194.25;
  if (val <= 250000) {
    return +(194.25 + ((val - 3300) / 1000) * 4.653).toFixed(2);
  }
  return +(1357.40 + ((val - 251000) / 1000) * 15.20).toFixed(2);
}

function fmt(v: number) {
  return v.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

export function QBCCCalculator() {
  const [contractInc, setContractInc] = useState("");
  const n = parseFloat(contractInc);
  const valid = !isNaN(n) && n > 0;

  const contractEx      = valid ? n / 1.1 : null;
  const qleaveLevy      = contractEx !== null ? contractEx * 0.00575 : null;
  const totalInsurable  = valid && qleaveLevy !== null ? n + qleaveLevy : null;
  const rounded         = totalInsurable !== null ? Math.ceil(totalInsurable / 1000) * 1000 : null;
  const premium         = rounded !== null ? getPremium(rounded) : null;
  const overTable       = rounded !== null && rounded > 539000;

  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <Shield size={15} className="text-brand-400" />
          <span>QBCC Home Warranty Insurance</span>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-slate-500">New Residence · Effective 1 July 2020</p>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Contract Value (inc GST)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
            <input
              type="number"
              value={contractInc}
              onChange={e => setContractInc(e.target.value)}
              placeholder="0.00"
              className="w-full pl-7 pr-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        {valid && contractEx !== null && qleaveLevy !== null && totalInsurable !== null && rounded !== null && premium !== null && (
          <div className="space-y-2 pt-1">
            <Row label="Contract ex GST"         value={fmt(contractEx)} />
            <Row label="QLeave Levy (0.575% ex)" value={fmt(qleaveLevy)} />
            <Row label="Total Insurable Value"   value={fmt(totalInsurable)} />
            <Row label="Rounded (next $1,000)"   value={fmt(rounded)} muted />
            <div className="flex items-center justify-between pt-2 border-t border-slate-700 mt-2">
              <span className="text-sm font-semibold text-white">QBCC Premium (inc GST)</span>
              <span className="text-lg font-bold text-brand-300">{fmt(premium)}</span>
            </div>
            {overTable && (
              <p className="text-xs text-amber-400 text-right">Above $539k table range — verify with QBCC</p>
            )}
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
      <span className={muted ? "text-slate-500" : "text-white font-medium"}>{value}</span>
    </div>
  );
}
