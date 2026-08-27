"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyCashPoint } from "@/lib/calculations";
import { formatAUD, formatDateShortAU } from "@/lib/format";

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: DailyCashPoint }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  const majorItems = [...point.items].sort((a, b) => b.amount - a.amount).slice(0, 4);

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs shadow-xl max-w-[280px]">
      <div className="font-semibold text-white mb-1.5">{formatDateShortAU(point.date)}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-slate-300">
        <span className="text-slate-500">Opening</span>
        <span className="text-right tabular-nums">{formatAUD(point.openingBalance)}</span>
        <span className="text-slate-500">Inflows</span>
        <span className="text-right tabular-nums text-emerald-400">+{formatAUD(point.inflows)}</span>
        <span className="text-slate-500">Outflows</span>
        <span className="text-right tabular-nums text-red-400">-{formatAUD(point.outflows)}</span>
        <span className="text-slate-500 font-medium">Closing</span>
        <span className="text-right tabular-nums font-medium text-white">{formatAUD(point.closingBalance)}</span>
      </div>
      {majorItems.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-800 space-y-1">
          <div className="text-slate-500">Major transactions</div>
          {majorItems.map((item) => (
            <div key={item.id} className="flex justify-between gap-2 text-slate-400">
              <span className="truncate">{item.description}</span>
              <span className={`tabular-nums shrink-0 ${item.direction === "inflow" ? "text-emerald-400" : "text-red-400"}`}>
                {item.direction === "inflow" ? "+" : "-"}
                {formatAUD(item.amount, { compact: true })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CashFlowChart({ data, buffer }: { data: DailyCashPoint[]; buffer: number }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(v: string) => formatDateShortAU(v)}
          stroke="#475569"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          minTickGap={40}
        />
        <YAxis
          tickFormatter={(v: number) => formatAUD(v, { compact: true })}
          stroke="#475569"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          width={64}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine
          y={buffer}
          stroke="#f59e0b"
          strokeDasharray="4 4"
          label={{ value: "Minimum buffer", position: "insideTopLeft", fill: "#f59e0b", fontSize: 11 }}
        />
        <Area
          type="monotone"
          dataKey="closingBalance"
          stroke="#3b82f6"
          strokeWidth={2}
          fill="url(#cashFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
