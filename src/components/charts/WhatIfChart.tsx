"use client";

import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatAUD, formatMonthAU } from "@/lib/format";

export interface WhatIfSeriesMeta {
  key: string;
  label: string;
  color: string;
}

export function WhatIfChart({
  rows,
  series,
  buffer,
}: {
  rows: Record<string, number | string>[];
  series: WhatIfSeriesMeta[];
  buffer: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={360}>
      <LineChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis dataKey="monthKey" tickFormatter={(v: string) => formatMonthAU(v)} stroke="#475569" tick={{ fontSize: 11, fill: "#94a3b8" }} minTickGap={30} />
        <YAxis tickFormatter={(v: number) => formatAUD(v, { compact: true })} stroke="#475569" tick={{ fontSize: 11, fill: "#94a3b8" }} width={64} />
        <Tooltip
          formatter={(value, name) => [formatAUD(Number(value)), String(name)]}
          labelFormatter={(label) => formatMonthAU(String(label))}
          contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "#e2e8f0" }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
        <ReferenceLine y={buffer} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "Minimum buffer", position: "insideTopLeft", fill: "#f59e0b", fontSize: 11 }} />
        <ReferenceLine y={0} stroke="#64748b" />
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
