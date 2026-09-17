"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/shared/Card";
import { StatCard } from "@/components/shared/StatCard";
import { WhatIfChart, type WhatIfSeriesMeta } from "@/components/charts/WhatIfChart";
import { formatAUD, formatAUDSigned, formatDateAU, formatMonthAU } from "@/lib/format";
import { baselineMonthlyDelta, firstMonthBelowBuffer, projectMonthlyBalance } from "@/lib/what-if-calculations";
import type { WhatIfAdjustmentCategory, WhatIfAdjustmentDTO, WhatIfScenarioDTO } from "@/lib/what-if-source";

const SCENARIO_COLORS = ["#607161", "#f59e0b", "#38bdf8", "#fb7185", "#a78bfa", "#34d399"];
const HORIZON_OPTIONS = [6, 12, 24] as const;

interface NewAdjustmentState {
  label: string;
  category: WhatIfAdjustmentCategory;
  amount: string;
  effect: "cost" | "saving";
  startDate: string;
  endDate: string;
}

function emptyAdjustment(startFrom: string): NewAdjustmentState {
  return { label: "", category: "wages", amount: "", effect: "cost", startDate: startFrom, endDate: "" };
}

export function WhatIfClient({
  todayBalance,
  day90Balance,
  minimumCashBuffer,
  today,
  initialScenarios,
}: {
  todayBalance: number;
  day90Balance: number;
  minimumCashBuffer: number;
  today: string;
  initialScenarios: WhatIfScenarioDTO[];
}) {
  const router = useRouter();
  const [horizon, setHorizon] = useState<(typeof HORIZON_OPTIONS)[number]>(12);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialScenarios.map((s) => s.id)));
  const seenScenarioIds = useRef<Set<string>>(new Set(initialScenarios.map((s) => s.id)));

  // A newly-created scenario should show up on the chart immediately rather
  // than requiring an extra click - but an existing scenario the user has
  // deliberately unchecked should stay unchecked across a router.refresh()
  // (e.g. after adding an adjustment to a different scenario), so this only
  // ever adds ids it hasn't seen before, never touching ones already known.
  useEffect(() => {
    const newIds = initialScenarios.map((s) => s.id).filter((id) => !seenScenarioIds.current.has(id));
    if (newIds.length > 0) setSelectedIds((prev) => new Set([...prev, ...newIds]));
    seenScenarioIds.current = new Set(initialScenarios.map((s) => s.id));
  }, [initialScenarios]);

  const [newScenarioName, setNewScenarioName] = useState("");
  const [newScenarioDescription, setNewScenarioDescription] = useState("");
  const [addingScenario, setAddingScenario] = useState(false);

  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null);
  const [editScenario, setEditScenario] = useState<{ name: string; description: string } | null>(null);

  const [adjustmentDraftByScenario, setAdjustmentDraftByScenario] = useState<Record<string, NewAdjustmentState>>({});
  const [savingAdjustment, setSavingAdjustment] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const delta = baselineMonthlyDelta(todayBalance, day90Balance);

  const activeScenarios = initialScenarios.filter((s) => selectedIds.has(s.id));

  const { rows, seriesMeta, endpoints } = useMemo(() => {
    const baselinePoints = projectMonthlyBalance(todayBalance, delta, [], horizon, today);
    const meta: WhatIfSeriesMeta[] = [{ key: "baseline", label: "Baseline (current trend)", color: "#64748b" }];
    const rowsByMonth = new Map<string, Record<string, number | string>>();
    for (const p of baselinePoints) rowsByMonth.set(p.monthKey, { monthKey: p.monthKey, baseline: Math.round(p.balance) });

    const endpointRows: { id: string; label: string; end: number; breach: { monthKey: string; balance: number } | null }[] = [
      { id: "baseline", label: "Baseline", end: baselinePoints[baselinePoints.length - 1].balance, breach: firstMonthBelowBuffer(baselinePoints, minimumCashBuffer) },
    ];

    activeScenarios.forEach((scenario, idx) => {
      const points = projectMonthlyBalance(todayBalance, delta, scenario.adjustments, horizon, today);
      const key = `scenario_${scenario.id}`;
      meta.push({ key, label: scenario.name, color: SCENARIO_COLORS[idx % SCENARIO_COLORS.length] });
      for (const p of points) {
        const row = rowsByMonth.get(p.monthKey) ?? { monthKey: p.monthKey };
        row[key] = Math.round(p.balance);
        rowsByMonth.set(p.monthKey, row);
      }
      endpointRows.push({
        id: scenario.id,
        label: scenario.name,
        end: points[points.length - 1].balance,
        breach: firstMonthBelowBuffer(points, minimumCashBuffer),
      });
    });

    return { rows: [...rowsByMonth.values()], seriesMeta: meta, endpoints: endpointRows };
  }, [todayBalance, delta, horizon, today, activeScenarios, minimumCashBuffer]);

  function toggleScenario(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addScenario() {
    if (!newScenarioName) {
      setError("A scenario name is required.");
      return;
    }
    setAddingScenario(true);
    setError(null);
    try {
      const res = await fetch("/api/what-if-scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newScenarioName, description: newScenarioDescription || undefined }),
      });
      if (!res.ok) throw new Error("Failed to add scenario");
      setNewScenarioName("");
      setNewScenarioDescription("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add scenario");
    } finally {
      setAddingScenario(false);
    }
  }

  function startEditScenario(s: WhatIfScenarioDTO) {
    setEditingScenarioId(s.id);
    setEditScenario({ name: s.name, description: s.description });
  }

  async function saveScenarioEdit(id: string) {
    if (!editScenario) return;
    await fetch(`/api/what-if-scenarios/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editScenario.name, description: editScenario.description || null }),
    });
    setEditingScenarioId(null);
    setEditScenario(null);
    router.refresh();
  }

  async function removeScenario(id: string) {
    await fetch(`/api/what-if-scenarios/${id}`, { method: "DELETE" });
    router.refresh();
  }

  function draftFor(scenarioId: string): NewAdjustmentState {
    return adjustmentDraftByScenario[scenarioId] ?? emptyAdjustment(today);
  }

  function setDraft(scenarioId: string, patch: Partial<NewAdjustmentState>) {
    setAdjustmentDraftByScenario((prev) => ({ ...prev, [scenarioId]: { ...draftFor(scenarioId), ...patch } }));
  }

  async function addAdjustment(scenarioId: string) {
    const draft = draftFor(scenarioId);
    if (!draft.label || !draft.amount || !draft.startDate) {
      setError("Label, amount and a start date are required.");
      return;
    }
    setSavingAdjustment(scenarioId);
    setError(null);
    try {
      const signedAmount = draft.effect === "cost" ? Number(draft.amount) : -Number(draft.amount);
      const res = await fetch("/api/what-if-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId,
          label: draft.label,
          category: draft.category,
          monthlyAmount: signedAmount,
          startDate: draft.startDate,
          endDate: draft.endDate || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to add adjustment");
      setAdjustmentDraftByScenario((prev) => ({ ...prev, [scenarioId]: emptyAdjustment(today) }));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add adjustment");
    } finally {
      setSavingAdjustment(null);
    }
  }

  async function removeAdjustment(id: string) {
    await fetch(`/api/what-if-adjustments/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-1 bg-slate-900 rounded-md p-0.5">
          {HORIZON_OPTIONS.map((h) => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                horizon === h ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {h} months
            </button>
          ))}
        </div>
        {initialScenarios.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            {initialScenarios.map((s, idx) => (
              <label key={s.id} className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.has(s.id)}
                  onChange={() => toggleScenario(s.id)}
                  className="accent-brand-500"
                  style={{ accentColor: SCENARIO_COLORS[idx % SCENARIO_COLORS.length] }}
                />
                {s.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <Card className="mb-6">
        <WhatIfChart rows={rows} series={seriesMeta} buffer={minimumCashBuffer} />
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {endpoints.map((e) => (
          <StatCard
            key={e.id}
            label={`${e.label} @ ${horizon}mo`}
            value={formatAUD(e.end, { compact: true })}
            tone={e.end < minimumCashBuffer ? "bad" : "good"}
            sub={e.breach ? `Below buffer from ${formatMonthAU(e.breach.monthKey)}` : "Stays above buffer"}
          />
        ))}
      </div>

      <p className="text-xs text-slate-500 mb-6">
        Baseline is the business&rsquo;s own current net monthly cash trend ({formatAUDSigned(delta)}/month) taken from
        the live 90-day cash forecast (day 90 balance vs today, spread over 3 months) and held flat forward - every
        real committed and forecast item the 90-day forecast already knows about (invoices, bills, job costs, opex,
        recurring liabilities, weighted pipeline deposits), continued at today&rsquo;s trajectory. A scenario adds its
        own adjustments on top of that same trend from each adjustment&rsquo;s start date.
      </p>

      <Card title="Add a scenario" className="mb-6">
        <div className="grid md:grid-cols-5 gap-2 items-end">
          <div className="md:col-span-2">
            <label className="text-xs text-slate-400 block mb-1">Name</label>
            <input
              value={newScenarioName}
              onChange={(e) => setNewScenarioName(e.target.value)}
              placeholder="Hire a Project Manager"
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-slate-400 block mb-1">Description (optional)</label>
            <input
              value={newScenarioDescription}
              onChange={(e) => setNewScenarioDescription(e.target.value)}
              placeholder="What this scenario tests"
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
            />
          </div>
          <button
            onClick={addScenario}
            disabled={addingScenario}
            className="bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white text-sm rounded-md px-3 py-1.5"
          >
            {addingScenario ? "Adding..." : "Add scenario"}
          </button>
        </div>
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      </Card>

      {initialScenarios.map((scenario) => {
        const draft = draftFor(scenario.id);
        const isEditing = editingScenarioId === scenario.id;
        const scenarioMonthly = scenario.adjustments.reduce((s, a) => s + a.monthlyAmount, 0);
        return (
          <Card
            key={scenario.id}
            className="mb-6"
            title={
              isEditing && editScenario ? (
                <div className="flex items-center gap-2">
                  <input
                    value={editScenario.name}
                    onChange={(e) => setEditScenario({ ...editScenario, name: e.target.value })}
                    className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-sm text-slate-200"
                  />
                  <input
                    value={editScenario.description}
                    onChange={(e) => setEditScenario({ ...editScenario, description: e.target.value })}
                    placeholder="Description"
                    className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200 flex-1"
                  />
                </div>
              ) : (
                <div>
                  <h2 className="text-sm font-semibold text-white">{scenario.name}</h2>
                  {scenario.description && <p className="text-xs text-slate-500 mt-0.5">{scenario.description}</p>}
                </div>
              )
            }
            action={
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 tabular-nums">
                  {scenarioMonthly === 0 ? "No net impact" : `${formatAUDSigned(-scenarioMonthly)}/month`}
                </span>
                {isEditing ? (
                  <>
                    <button onClick={() => saveScenarioEdit(scenario.id)} className="text-xs text-brand-400 hover:text-brand-300">
                      Save
                    </button>
                    <button onClick={() => setEditingScenarioId(null)} className="text-xs text-slate-400 hover:text-slate-200">
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => startEditScenario(scenario)} className="text-xs text-brand-400 hover:text-brand-300">
                      Edit
                    </button>
                    <button onClick={() => removeScenario(scenario.id)} className="text-xs text-red-400 hover:text-red-300">
                      Remove
                    </button>
                  </>
                )}
              </div>
            }
          >
            {scenario.adjustments.length > 0 && (
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                      <th className="pb-2 font-medium">Adjustment</th>
                      <th className="pb-2 font-medium">Category</th>
                      <th className="pb-2 font-medium text-right">Monthly $ impact</th>
                      <th className="pb-2 font-medium">From</th>
                      <th className="pb-2 font-medium">Until</th>
                      <th className="pb-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {scenario.adjustments.map((a: WhatIfAdjustmentDTO) => (
                      <tr key={a.id}>
                        <td className="py-1.5 text-slate-300">{a.label}</td>
                        <td className="py-1.5 text-slate-400 capitalize">{a.category}</td>
                        <td className={`py-1.5 text-right tabular-nums font-medium ${a.monthlyAmount > 0 ? "text-red-400" : "text-emerald-400"}`}>
                          {formatAUDSigned(-a.monthlyAmount)}
                        </td>
                        <td className="py-1.5 text-slate-400 whitespace-nowrap">{formatDateAU(a.startDate)}</td>
                        <td className="py-1.5 text-slate-500 whitespace-nowrap">{a.endDate ? formatDateAU(a.endDate) : "—"}</td>
                        <td className="py-1.5 text-right">
                          <button onClick={() => removeAdjustment(a.id)} className="text-xs text-red-400 hover:text-red-300">
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid md:grid-cols-7 gap-2 items-end">
              <div className="md:col-span-2">
                <label className="text-xs text-slate-400 block mb-1">Adjustment</label>
                <input
                  value={draft.label}
                  onChange={(e) => setDraft(scenario.id, { label: e.target.value })}
                  placeholder="New Project Manager salary"
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Category</label>
                <select
                  value={draft.category}
                  onChange={(e) => setDraft(scenario.id, { category: e.target.value as NewAdjustmentState["category"] })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
                >
                  <option value="wages">Wages</option>
                  <option value="revenue">Revenue</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Monthly $</label>
                <input
                  type="number"
                  value={draft.amount}
                  onChange={(e) => setDraft(scenario.id, { amount: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Effect</label>
                <select
                  value={draft.effect}
                  onChange={(e) => setDraft(scenario.id, { effect: e.target.value as NewAdjustmentState["effect"] })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
                >
                  <option value="cost">Increases costs</option>
                  <option value="saving">Reduces costs / adds income</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">From</label>
                <input
                  type="date"
                  value={draft.startDate}
                  onChange={(e) => setDraft(scenario.id, { startDate: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Until (optional)</label>
                <input
                  type="date"
                  value={draft.endDate}
                  onChange={(e) => setDraft(scenario.id, { endDate: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-slate-200"
                />
              </div>
            </div>
            <button
              onClick={() => addAdjustment(scenario.id)}
              disabled={savingAdjustment === scenario.id}
              className="mt-2 bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white text-sm rounded-md px-3 py-1.5"
            >
              {savingAdjustment === scenario.id ? "Adding..." : "Add adjustment"}
            </button>
          </Card>
        );
      })}
    </div>
  );
}
