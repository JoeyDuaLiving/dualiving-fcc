import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Card } from "@/components/shared/Card";
import { StatusPill } from "@/components/shared/Badges";
import { formatAUD, formatDateAU, formatPercent } from "@/lib/format";
import {
  expectedDeposit,
  openOpportunities,
  totalPipelineValue,
  totalWeightedExpectedDeposits,
  weightedExpectedDeposit,
  weightedPipelineValue,
} from "@/lib/calculations";
import { opportunities, settings } from "@/lib/mock-data";
import {
  liveExpectedDeposit,
  liveTotalPipelineValue,
  liveWeightedExpectedDeposit,
  liveWeightedPipelineValue,
  loadLiveOpenOpportunities,
  type LiveOpportunity,
} from "@/lib/ghl-source";
import type { PipelineStage } from "@/types";

export const dynamic = "force-dynamic";

const STAGE_ORDER: PipelineStage[] = ["lead", "qualified", "feasibility", "proposal", "contract", "won", "lost"];
const STAGE_LABEL: Record<PipelineStage, string> = {
  lead: "Lead", qualified: "Qualified", feasibility: "Feasibility", proposal: "Proposal",
  contract: "Contract", won: "Won", lost: "Lost",
};

export default async function PipelinePage() {
  const live = await loadLiveOpenOpportunities();
  const isLive = live.source === "live";

  if (isLive) {
    const open = live.opportunities;
    const depositPercent = settings.defaultDepositPercent;
    const byStage = new Map<string, { count: number; value: number }>();
    for (const o of open) {
      const entry = byStage.get(o.stage) ?? { count: 0, value: 0 };
      entry.count++;
      entry.value += o.value;
      byStage.set(o.stage, entry);
    }

    return (
      <div>
        <PageHeader
          title="Sales Pipeline"
          description="Live from GoHighLevel - open opportunities in the Council Workflow and Non-Council Workflow pipelines. This is potential future revenue, never counted as committed cash until a contract converts to a Buildxact job."
          action={<StatusPill tone="good">Live</StatusPill>}
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total pipeline" value={formatAUD(liveTotalPipelineValue(open))} sub={`${open.length} open opportunities`} />
          <StatCard label="Weighted pipeline" value={formatAUD(liveWeightedPipelineValue(open))} sub="Value x probability" />
          <StatCard
            label="Expected deposits"
            value={formatAUD(open.reduce((s, o) => s + liveExpectedDeposit(o, depositPercent), 0))}
            sub={`If all convert (at ${depositPercent}% deposit assumption)`}
          />
          <StatCard
            label="Weighted expected deposits"
            value={formatAUD(open.reduce((s, o) => s + liveWeightedExpectedDeposit(o, depositPercent), 0))}
            sub="Probability-weighted"
          />
        </div>

        <Card title="By stage" className="mb-6">
          <div className="overflow-x-auto">
            <div className="flex gap-4 min-w-max">
              {[...byStage.entries()].map(([stage, s]) => (
                <div key={stage} className="min-w-[180px]">
                  <div className="text-xs text-slate-400">{stage}</div>
                  <div className="text-lg font-semibold text-white tabular-nums mt-1">{formatAUD(s.value, { compact: true })}</div>
                  <div className="text-[11px] text-slate-500">{s.count} opportunities</div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card title="Open opportunities">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                  <th className="pb-2 font-medium">Opportunity</th>
                  <th className="pb-2 font-medium">Stage</th>
                  <th className="pb-2 font-medium text-right">Value</th>
                  <th className="pb-2 font-medium text-right">Probability</th>
                  <th className="pb-2 font-medium text-right">Expected deposit</th>
                  <th className="pb-2 font-medium text-right">Weighted deposit</th>
                  <th className="pb-2 font-medium">Expected close</th>
                  <th className="pb-2 font-medium">Job</th>
                  <th className="pb-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {open.map((opp: LiveOpportunity) => (
                  <tr key={opp.id} className="hover:bg-slate-900/60">
                    <td className="py-2.5 text-slate-200">
                      {opp.name}
                      {opp.contact && <div className="text-[11px] text-slate-500">{opp.contact}</div>}
                    </td>
                    <td className="py-2.5 text-slate-400">{opp.stage}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(opp.value)}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-300">{formatPercent(opp.probabilityPercent, 0)}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(liveExpectedDeposit(opp, depositPercent))}</td>
                    <td className="py-2.5 text-right tabular-nums text-purple-300">{formatAUD(liveWeightedExpectedDeposit(opp, depositPercent))}</td>
                    <td className="py-2.5 text-slate-400 whitespace-nowrap">{opp.expectedCloseDate ? formatDateAU(opp.expectedCloseDate) : "—"}</td>
                    <td className="py-2.5">
                      {opp.jobId ? (
                        <Link href={`/jobs/${opp.jobId}`} className="text-blue-400 hover:text-blue-300">
                          {opp.jobNumber ?? opp.jobId}
                        </Link>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-2.5 text-slate-500">{opp.leadSource ?? "—"}</td>
                  </tr>
                ))}
                {open.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-slate-500">No open opportunities.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <p className="text-xs text-slate-500 mt-3">
          BA/Construction, Marketing Pipeline and Active Campaign Import are synced but not shown here - they
          aren&rsquo;t genuine sales-value pipelines (Active Campaign Import in particular is a bulk historical
          marketing-CRM import). Salesperson and product/range are also not shown - resolving them needs GHL API
          scopes the current Private Integration Token doesn&rsquo;t have (Users API, location custom fields).
          Deposit amounts use the management assumption in Settings ({depositPercent}%), not a value from GHL.
        </p>
      </div>
    );
  }

  const open = openOpportunities().sort((a, b) => a.expectedCloseDate.localeCompare(b.expectedCloseDate));
  const stageCounts = STAGE_ORDER.filter((s) => s !== "won" && s !== "lost").map((stage) => ({
    stage,
    count: open.filter((o) => o.stage === stage).length,
    value: open.filter((o) => o.stage === stage).reduce((s, o) => s + o.value, 0),
  }));

  return (
    <div>
      <PageHeader
        title="Sales Pipeline"
        description="GoHighLevel opportunities. This is potential future revenue - never counted as committed cash until a contract converts to a Buildxact job."
      />

      {live.error && (
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">
          {live.error} Showing Phase 1 mock data in the meantime.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total pipeline" value={formatAUD(totalPipelineValue())} sub={`${open.length} open opportunities`} />
        <StatCard label="Weighted pipeline" value={formatAUD(weightedPipelineValue())} sub="Value x probability" />
        <StatCard label="Expected deposits" value={formatAUD(open.reduce((s, o) => s + expectedDeposit(o), 0))} sub="If all opportunities convert" />
        <StatCard label="Weighted expected deposits" value={formatAUD(totalWeightedExpectedDeposits())} sub="Probability-weighted" />
      </div>

      <Card title="By stage" className="mb-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {stageCounts.map((s) => (
            <div key={s.stage}>
              <div className="text-xs text-slate-400">{STAGE_LABEL[s.stage]}</div>
              <div className="text-lg font-semibold text-white tabular-nums mt-1">{formatAUD(s.value, { compact: true })}</div>
              <div className="text-[11px] text-slate-500">{s.count} opportunities</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Open opportunities">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="pb-2 font-medium">Opportunity</th>
                <th className="pb-2 font-medium">Stage</th>
                <th className="pb-2 font-medium text-right">Value</th>
                <th className="pb-2 font-medium text-right">Probability</th>
                <th className="pb-2 font-medium text-right">Expected deposit</th>
                <th className="pb-2 font-medium text-right">Weighted deposit</th>
                <th className="pb-2 font-medium">Expected close</th>
                <th className="pb-2 font-medium">Salesperson</th>
                <th className="pb-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {open.map((opp) => (
                <tr key={opp.id} className="hover:bg-slate-900/60">
                  <td className="py-2.5 text-slate-200">
                    {opp.name}
                    <div className="text-[11px] text-slate-500">{opp.product} &middot; {opp.location}</div>
                  </td>
                  <td className="py-2.5">
                    <StatusPill tone={opp.stage === "contract" ? "good" : opp.stage === "lead" ? "neutral" : "warn"}>
                      {STAGE_LABEL[opp.stage]}
                    </StatusPill>
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(opp.value)}</td>
                  <td className="py-2.5 text-right tabular-nums text-slate-300">{formatPercent(opp.probabilityPercent, 0)}</td>
                  <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(expectedDeposit(opp))}</td>
                  <td className="py-2.5 text-right tabular-nums text-purple-300">{formatAUD(weightedExpectedDeposit(opp))}</td>
                  <td className="py-2.5 text-slate-400 whitespace-nowrap">{formatDateAU(opp.expectedCloseDate)}</td>
                  <td className="py-2.5 text-slate-400">{opp.salesperson}</td>
                  <td className="py-2.5 text-slate-500">{opp.leadSource}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-slate-500 mt-3">
        {opportunities.length - open.length} closed opportunities (won/lost) are excluded from pipeline totals.
      </p>
    </div>
  );
}
