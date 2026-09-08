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

export function PipelineKanbanBoard({
  pipelines,
  opportunitiesByPipelineId,
}: {
  pipelines: KanbanPipeline[];
  opportunitiesByPipelineId: Record<string, LiveOpportunity[]>;
}) {
  const [activeId, setActiveId] = useState(pipelines[0]?.id ?? "");
  const active = pipelines.find((p) => p.id === activeId) ?? pipelines[0];
  const opportunities = active ? (opportunitiesByPipelineId[active.id] ?? []) : [];

  if (!active) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-1 border-b border-slate-800 mb-4">
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
    </div>
  );
}
