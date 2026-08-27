import { PageHeader } from "@/components/shared/PageHeader";
import { CashFlowClient } from "@/components/cash-flow/CashFlowClient";
import { buildForecastItems, cashForecastSeries, weeklySeriesFromDaily } from "@/lib/calculations";
import { settings } from "@/lib/mock-data";

export default function CashFlowPage() {
  const items = buildForecastItems();
  const daily = cashForecastSeries(items, 90);
  const weekly = weeklySeriesFromDaily(daily);

  return (
    <div>
      <PageHeader
        title="Cash Flow"
        description="Committed and forecast cash movements over the next 90 days. Potential (GHL pipeline) money is excluded from this base view - see Forecast for scenario and stress testing."
      />
      <CashFlowClient daily={daily} weekly={weekly} buffer={settings.minimumCashBuffer} items={items} />
    </div>
  );
}
