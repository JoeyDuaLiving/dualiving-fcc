"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/shared/Card";
import { CashFlowChart } from "@/components/charts/CashFlowChart";
import { formatAUD, formatDateAU } from "@/lib/format";
import {
  SCENARIOS,
  applyScenario,
  applyStressTest,
  cashForecastSeries,
  summarizeForecast,
} from "@/lib/calculations";
import type { ForecastItem, ScenarioName, StressTestInputs } from "@/types";

const SCENARIO_ORDER: ScenarioName[] = ["conservative", "base", "optimistic"];

const DEFAULT_STRESS: StressTestInputs = {
  delayedReceiptsAmount: 0,
  delayedReceiptsDays: 30,
  jobCostIncreasePercent: 0,
  delayedJobIds: [],
  delayedJobWeeks: 4,
  pipelineConversionDropPercent: 0,
  opexIncreaseAmount: 0,
};

export function ForecastClient({
  items,
  buffer,
  openingBalance,
  jobOptions,
}: {
  items: ForecastItem[];
  buffer: number;
  openingBalance: number;
  jobOptions: { id: string; label: string }[];
}) {
  const [activeScenario, setActiveScenario] = useState<ScenarioName>("base");
  const [stress, setStress] = useState<StressTestInputs>(DEFAULT_STRESS);

  const scenarioResults = useMemo(() => {
    return SCENARIO_ORDER.map((name) => {
      const adjusted = applyScenario(items, SCENARIOS[name]);
      const daily = cashForecastSeries(adjusted, 90, openingBalance, true);
      const summary = summarizeForecast(daily, buffer);
      return { name, daily, summary };
    });
  }, [items, openingBalance, buffer]);

  const activeResult = scenarioResults.find((r) => r.name === activeScenario)!;

  const baseSummary = useMemo(() => {
    const daily = cashForecastSeries(items.filter((i) => i.confidence !== "potential"), 90, openingBalance);
    return summarizeForecast(daily, buffer);
  }, [items, openingBalance, buffer]);

  const stressResult = useMemo(() => {
    const base = items.filter((i) => i.confidence !== "potential");
    const stressed = applyStressTest(base, stress);
    const daily = cashForecastSeries(stressed, 90, openingBalance, true);
    return { daily, summary: summarizeForecast(daily, buffer) };
  }, [items, stress, openingBalance, buffer]);

  return (
    <div>
      <Card
        title="Forecast scenarios"
        action={
          <div className="flex rounded-md border border-slate-700 overflow-hidden text-xs">
            {SCENARIO_ORDER.map((name) => (
              <button
                key={name}
                onClick={() => setActiveScenario(name)}
                className={`px-3 py-1.5 capitalize ${activeScenario === name ? "bg-brand-500 text-white" : "text-slate-400 hover:bg-slate-800"}`}
              >
                {name}
              </button>
            ))}
          </div>
        }
        className="mb-6"
      >
        <div className="grid grid-cols-3 gap-4 mb-5">
          {scenarioResults.map((r) => (
            <button
              key={r.name}
              onClick={() => setActiveScenario(r.name)}
              className={`text-left rounded-lg border p-3 transition-colors ${
                activeScenario === r.name ? "border-brand-500 bg-brand-500/10" : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
              }`}
            >
              <div className="text-xs font-medium text-slate-300 capitalize">{r.name}</div>
              <div className="text-lg font-semibold text-white tabular-nums mt-1">{formatAUD(r.summary.day90)}</div>
              <div className="text-[11px] text-slate-500">at day 90</div>
              {r.summary.bufferBreach && (
                <div className="text-[11px] text-red-400 mt-1">Breaches buffer {formatDateAU(r.summary.minBalanceDate)}</div>
              )}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5 pb-5 border-b border-slate-800">
          <div>
            <div className="text-xs text-slate-400">30 days</div>
            <div className="text-xl font-semibold text-white tabular-nums">{formatAUD(activeResult.summary.day30)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">60 days</div>
            <div className="text-xl font-semibold text-white tabular-nums">{formatAUD(activeResult.summary.day60)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">90 days</div>
            <div className="text-xl font-semibold text-white tabular-nums">{formatAUD(activeResult.summary.day90)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Lowest balance</div>
            <div className="text-xl font-semibold text-white tabular-nums">{formatAUD(activeResult.summary.minBalance)}</div>
            <div className="text-[11px] text-slate-500">{formatDateAU(activeResult.summary.minBalanceDate)}</div>
          </div>
        </div>

        <CashFlowChart data={activeResult.daily} buffer={buffer} />

        <div className="mt-4 text-xs text-slate-500 grid md:grid-cols-3 gap-2">
          <p><span className="text-slate-400 font-medium">Conservative:</span> {SCENARIOS.conservative.customerPaymentDelayDays}-day payment delays, {SCENARIOS.conservative.jobCostVariancePercent}% cost contingency, pipeline excluded.</p>
          <p><span className="text-slate-400 font-medium">Base:</span> payments on schedule, costs as forecast, pipeline excluded.</p>
          <p><span className="text-slate-400 font-medium">Optimistic:</span> payments {Math.abs(SCENARIOS.optimistic.customerPaymentDelayDays)} days early, costs {Math.abs(SCENARIOS.optimistic.jobCostVariancePercent)}% lower, pipeline included at boosted conversion.</p>
        </div>
      </Card>

      <Card title="Cash stress test">
        <p className="text-sm text-slate-400 mb-4">Test assumptions against the Base scenario and see the impact on the 30/60/90-day forecast.</p>
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Delay customer receipts of $ by days</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={stress.delayedReceiptsAmount}
                  onChange={(e) => setStress((s) => ({ ...s, delayedReceiptsAmount: Number(e.target.value) }))}
                  className="w-1/2 bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
                  placeholder="Amount"
                />
                <input
                  type="number"
                  value={stress.delayedReceiptsDays}
                  onChange={(e) => setStress((s) => ({ ...s, delayedReceiptsDays: Number(e.target.value) }))}
                  className="w-1/2 bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
                  placeholder="Days"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Job costs increase by (%)</label>
              <input
                type="number"
                value={stress.jobCostIncreasePercent}
                onChange={(e) => setStress((s) => ({ ...s, jobCostIncreasePercent: Number(e.target.value) }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">GHL pipeline conversion falls by (%)</label>
              <input
                type="number"
                value={stress.pipelineConversionDropPercent}
                onChange={(e) => setStress((s) => ({ ...s, pipelineConversionDropPercent: Number(e.target.value) }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
              />
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Delay these jobs by weeks</label>
              <div className="flex gap-2">
                <select
                  multiple
                  value={stress.delayedJobIds}
                  onChange={(e) => setStress((s) => ({ ...s, delayedJobIds: Array.from(e.target.selectedOptions, (o) => o.value) }))}
                  className="w-2/3 bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200 h-24"
                >
                  {jobOptions.map((j) => (
                    <option key={j.id} value={j.id}>{j.label}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={stress.delayedJobWeeks}
                  onChange={(e) => setStress((s) => ({ ...s, delayedJobWeeks: Number(e.target.value) }))}
                  className="w-1/3 bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200 h-9"
                  placeholder="Weeks"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Additional monthly OPEX ($)</label>
              <input
                type="number"
                value={stress.opexIncreaseAmount}
                onChange={(e) => setStress((s) => ({ ...s, opexIncreaseAmount: Number(e.target.value) }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
              />
            </div>
            <button
              onClick={() => setStress(DEFAULT_STRESS)}
              className="text-xs text-slate-400 hover:text-slate-200 border border-slate-700 rounded-md px-3 py-1.5"
            >
              Reset assumptions
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-5 pb-5 border-b border-slate-800">
          {[
            { label: "30 days", base: baseSummary.day30, stressed: stressResult.summary.day30 },
            { label: "60 days", base: baseSummary.day60, stressed: stressResult.summary.day60 },
            { label: "90 days", base: baseSummary.day90, stressed: stressResult.summary.day90 },
            { label: "Lowest balance", base: baseSummary.minBalance, stressed: stressResult.summary.minBalance },
          ].map((row) => (
            <div key={row.label}>
              <div className="text-xs text-slate-400">{row.label}</div>
              <div className="text-lg font-semibold text-white tabular-nums">{formatAUD(row.stressed)}</div>
              <div className="text-[11px] text-slate-500">vs {formatAUD(row.base, { compact: true })} base</div>
            </div>
          ))}
          <div>
            <div className="text-xs text-slate-400">Buffer breach</div>
            <div className={`text-lg font-semibold tabular-nums ${stressResult.summary.bufferBreach ? "text-red-400" : "text-emerald-400"}`}>
              {stressResult.summary.bufferBreach ? formatAUD(stressResult.summary.bufferBreachAmount) : "None"}
            </div>
            {stressResult.summary.bufferBreach && (
              <div className="text-[11px] text-slate-500">on {formatDateAU(stressResult.summary.minBalanceDate)}</div>
            )}
          </div>
        </div>

        <CashFlowChart data={stressResult.daily} buffer={buffer} />
      </Card>
    </div>
  );
}
