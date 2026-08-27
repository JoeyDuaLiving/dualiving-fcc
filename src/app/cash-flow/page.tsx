import { PageHeader } from "@/components/shared/PageHeader";
import { StatusPill } from "@/components/shared/Badges";
import { CashFlowClient } from "@/components/cash-flow/CashFlowClient";
import { buildForecastItems, cashForecastSeries, weeklySeriesFromDaily } from "@/lib/calculations";
import { settings } from "@/lib/mock-data";
import { buildLiveForecastItems, loadLiveForecastData } from "@/lib/live-forecast";

export const dynamic = "force-dynamic";

export default async function CashFlowPage() {
  const live = await loadLiveForecastData();
  const isLive = live.source === "live" && live.data !== null;

  const items = isLive ? buildLiveForecastItems(live.data!) : buildForecastItems();
  const daily = cashForecastSeries(items, 90, isLive ? live.data!.currentCashBalance : undefined);
  const weekly = weeklySeriesFromDaily(daily);

  return (
    <div>
      <PageHeader
        title="Cash Flow"
        description={
          isLive
            ? "Live from Buildxact, Xero and GHL - committed and forecast cash movements over the next 90 days. Potential (GHL pipeline) money is excluded from this base view."
            : "Committed and forecast cash movements over the next 90 days. Potential (GHL pipeline) money is excluded from this base view - see Forecast for scenario and stress testing."
        }
        action={isLive ? <StatusPill tone="good">Live</StatusPill> : undefined}
      />
      {!isLive && live.error && (
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">
          {live.error} Showing Phase 1 mock data in the meantime.
        </div>
      )}
      {isLive && (
        <p className="text-xs text-slate-500 mb-6">
          Payment-schedule timing (e.g. &ldquo;10% deposit, 40% frame stage&rdquo;) isn&rsquo;t a Buildxact field - jobs show a
          single lump-sum forecast cost to complete instead of costs spread across stages. Recurring operating
          expenses are projected from each category&rsquo;s most recent real Xero transaction.
        </p>
      )}
      <CashFlowClient daily={daily} weekly={weekly} buffer={settings.minimumCashBuffer} items={items} />
    </div>
  );
}
