"use client";

import { useState } from "react";
import Link from "next/link";
import { formatAUD, formatDateAU, formatPercent } from "@/lib/format";
import type { LiveOpportunity } from "@/lib/ghl-source";

export interface KanbanStage {
  id: string;
  name: string;
}

export interface KanbanPipeline {
  id: string;
  name: string;
  stages: KanbanStage[];
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
const DAY_LABEL = new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", timeZone: "UTC" });
const WEEKDAY_LABEL = new Intl.DateTimeFormat("en-AU", { weekday: "short", timeZone: "UTC" });

function stageNameById(stages: KanbanStage[], id: string | null): string {
  return stages.find((s) => s.id === id)?.name ?? "Unknown stage";
}

function OpportunityCard({ opp, stageName }: { opp: LiveOpportunity; stageName: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <div className="text-sm font-medium text-slate-200 leading-snug">{opp.name}</div>
      {opp.contact && <div className="text-xs text-slate-500 mt-0.5">{opp.contact}</div>}
      <div className="flex items-center justify-between mt-2">
        <span className="text-sm font-semibold text-white tabular-nums">{formatAUD(opp.value, { compact: true })}</span>
        <span className="text-xs text-slate-400 tabular-nums">{formatPercent(opp.probabilityPercent, 0)}</span>
      </div>
      <div className="flex items-center justify-between mt-1.5 text-[11px] text-slate-500">
        <span className="truncate pr-2">{stageName}</span>
        {opp.jobId && (
          <Link href={`/jobs/${opp.jobId}`} className="text-brand-400 hover:text-brand-300 shrink-0">
            {opp.jobNumber ?? "Job"}
          </Link>
        )}
      </div>
    </div>
  );
}

function TimelineView({ opportunities, stages }: { opportunities: LiveOpportunity[]; stages: KanbanStage[] }) {
  const dated = opportunities.filter((o) => o.expectedCloseDate).sort((a, b) => a.expectedCloseDate!.localeCompare(b.expectedCloseDate!));
  const undated = opportunities.filter((o) => !o.expectedCloseDate);

  const byMonth = new Map<string, LiveOpportunity[]>();
  for (const o of dated) {
    const key = o.expectedCloseDate!.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(o);
  }

  if (opportunities.length === 0) {
    return <p className="text-sm text-slate-500 py-6 text-center">No opportunities in this pipeline.</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      {[...byMonth.entries()].map(([month, opps]) => {
        const total = opps.reduce((s, o) => s + o.value, 0);
        return (
          <div key={month}>
            <div className="flex items-baseline justify-between mb-3 pb-2 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-white">{MONTH_LABEL.format(new Date(`${month}-01T00:00:00Z`))}</h3>
              <span className="text-xs text-slate-500 tabular-nums">
                {opps.length} &middot; {formatAUD(total, { compact: true })}
              </span>
            </div>
            <div className="relative pl-6">
              <div className="absolute left-[7px] top-1 bottom-1 w-px bg-slate-800" />
              <div className="flex flex-col gap-3">
                {opps.map((o) => {
                  const d = new Date(`${o.expectedCloseDate}T00:00:00Z`);
                  return (
                    <div key={o.id} className="relative">
                      <div className="absolute -left-6 top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-slate-950" />
                      <div className="flex items-start gap-3">
                        <div className="w-16 shrink-0 pt-0.5">
                          <div className="text-xs font-medium text-slate-300 tabular-nums">{DAY_LABEL.format(d)}</div>
                          <div className="text-[10px] text-slate-500 uppercase">{WEEKDAY_LABEL.format(d)}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <OpportunityCard opp={o} stageName={stageNameById(stages, o.pipelineStageId)} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {undated.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between mb-3 pb-2 border-b border-slate-800">
            <h3 className="text-sm font-semibold text-slate-400">No expected close date</h3>
            <span className="text-xs text-slate-500 tabular-nums">
              {undated.length} &middot; {formatAUD(undated.reduce((s, o) => s + o.value, 0), { compact: true })}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {undated.map((o) => (
              <OpportunityCard key={o.id} opp={o} stageName={stageNameById(stages, o.pipelineStageId)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PipelineKanbanBoard({
  pipelines,
  opportunitiesByPipelineId,
}: {
  pipelines: KanbanPipeline[];
  opportunitiesByPipelineId: Record<string, LiveOpportunity[]>;
}) {
  const [activeId, setActiveId] = useState(pipelines[0]?.id ?? "");
  const [view, setView] = useState<"board" | "timeline">("board");
  const active = pipelines.find((p) => p.id === activeId) ?? pipelines[0];
  const opportunities = active ? (opportunitiesByPipelineId[active.id] ?? []) : [];

  if (!active) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between border-b border-slate-800 mb-4">
        <div className="flex items-center gap-1">
          {pipelines.map((p) => {
            const count = (opportunitiesByPipelineId[p.id] ?? []).length;
            const isActive = p.id === active.id;
            return (
              <button
                key={p.id}
                onClick={() => setActiveId(p.id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  isActive ? "border-brand-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                {p.name} <span className="text-xs text-slate-500">({count})</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1 mb-2 bg-slate-900 rounded-md p-0.5">
          {(["board", "timeline"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 text-xs font-medium rounded capitalize transition-colors ${
                view === v ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === "board" ? (
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-4 min-w-max">
            {active.stages.map((stage) => {
              const stageOpps = opportunities.filter((o) => o.pipelineStageId === stage.id);
              const stageTotal = stageOpps.reduce((s, o) => s + o.value, 0);
              return (
                <div key={stage.id} className="w-72 shrink-0 flex flex-col">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">{stage.name}</h3>
                    <span className="text-xs text-slate-500">{stageOpps.length}</span>
                  </div>
                  <div className="text-xs text-slate-500 mb-2 px-1 tabular-nums">{formatAUD(stageTotal, { compact: true })}</div>
                  <div className="flex flex-col gap-2 min-h-[40px]">
                    {stageOpps.map((opp) => (
                      <div key={opp.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                        <div className="text-sm font-medium text-slate-200 leading-snug">{opp.name}</div>
                        {opp.contact && <div className="text-xs text-slate-500 mt-0.5">{opp.contact}</div>}
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-sm font-semibold text-white tabular-nums">{formatAUD(opp.value, { compact: true })}</span>
                          <span className="text-xs text-slate-400 tabular-nums">{formatPercent(opp.probabilityPercent, 0)}</span>
                        </div>
                        <div className="flex items-center justify-between mt-1.5 text-[11px] text-slate-500">
                          <span>{opp.expectedCloseDate ? formatDateAU(opp.expectedCloseDate) : "No close date"}</span>
                          {opp.jobId && (
                            <Link href={`/jobs/${opp.jobId}`} className="text-brand-400 hover:text-brand-300">
                              {opp.jobNumber ?? "Job"}
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                    {stageOpps.length === 0 && <div className="text-xs text-slate-600 italic px-1 py-2">No opportunities</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <TimelineView opportunities={opportunities} stages={active.stages} />
      )}
    </div>
  );
}
