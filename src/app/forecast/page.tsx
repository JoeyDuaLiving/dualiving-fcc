import { PageHeader } from "@/components/shared/PageHeader";
import { StatusPill } from "@/components/shared/Badges";
import { ForecastClient } from "@/components/forecast/ForecastClient";
import { ManualStagesManager, type ManualStageDTO } from "@/components/forecast/ManualStagesManager";
import { activeJobs, buildForecastItems, currentCashBalance, jobCosting } from "@/lib/calculations";
import { settings } from "@/lib/mock-data";
import { buildLiveForecastItems, loadLiveForecastData } from "@/lib/live-forecast";

export const dynamic = "force-dynamic";

export default async function ForecastPage() {
  const live = await loadLiveForecastData();
  const isLive = live.source === "live" && live.data !== null;

  const items = isLive ? buildLiveForecastItems(live.data!) : buildForecastItems();
  const openingBalance = isLive ? live.data!.currentCashBalance : currentCashBalance();
  const jobOptions = isLive
    ? live.data!.jobRows.map((row) => ({ id: row.job.id, label: `${row.job.jobNumber} - ${row.job.client}` }))
    : activeJobs.map((j) => ({ id: j.id, label: `${j.id} - ${j.client}` }));

  const manualStageJobOptions = isLive
    ? live.data!.jobRows.map((row) => ({
        id: row.job.id,
        jobNumber: row.job.jobNumber,
        client: row.job.client,
        revisedRevenue: jobCosting(row.job).revisedRevenue,
      }))
    : [];
  const manualStagesByJobId: Record<string, ManualStageDTO[]> = {};
  if (isLive) {
    for (const [jobId, stages] of live.data!.manualStagesByJobId) {
      manualStagesByJobId[jobId] = stages.map((s) => ({
        id: s.id,
        label: s.label,
        percentOfContract: s.percentOfContract,
        triggerDescription: s.triggerDescription,
        expectedDate: s.expectedDate,
        invoiced: s.invoiced,
      }));
    }
  }

  return (
    <div>
      <PageHeader
        title="Forecast"
        description="Compare Conservative, Base and Optimistic assumptions, or stress-test a specific scenario against the base cash forecast."
        action={isLive ? <StatusPill tone="good">Live</StatusPill> : undefined}
      />
      {!isLive && live.error && (
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">
          {live.error} Showing Phase 1 mock data in the meantime.
        </div>
      )}
      {isLive && <ManualStagesManager jobOptions={manualStageJobOptions} stagesByJobId={manualStagesByJobId} />}
      <ForecastClient items={items} buffer={settings.minimumCashBuffer} openingBalance={openingBalance} jobOptions={jobOptions} />
    </div>
  );
}
