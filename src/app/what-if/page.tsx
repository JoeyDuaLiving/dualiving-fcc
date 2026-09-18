import { PageHeader } from "@/components/shared/PageHeader";
import { WhatIfClient } from "@/components/what-if/WhatIfClient";
import { WhatIfChatPanel } from "@/components/what-if/WhatIfChatPanel";
import { cashForecastSeries, summarizeForecast } from "@/lib/calculations";
import { buildLiveForecastItems, loadLiveForecastData } from "@/lib/live-forecast";
import { loadWhatIfScenarios } from "@/lib/what-if-source";
import { settings, TODAY } from "@/lib/mock-data";
import { isAnthropicConfigured } from "@/integrations/anthropic/client";
import { averageMonthlyRevenue, loadLiveFinancialYearSummary } from "@/lib/xero-source";

export const dynamic = "force-dynamic";

export default async function WhatIfPage() {
  const [liveForecast, scenariosResult, financialYear] = await Promise.all([
    loadLiveForecastData(),
    loadWhatIfScenarios(),
    loadLiveFinancialYearSummary(),
  ]);
  const forecastIsLive = liveForecast.source === "live" && liveForecast.data !== null;

  let todayBalance = 0;
  let day90Balance = 0;
  if (forecastIsLive) {
    const items = buildLiveForecastItems(liveForecast.data!);
    const daily = cashForecastSeries(items, 90, liveForecast.data!.currentCashBalance);
    const summary = summarizeForecast(daily, settings.minimumCashBuffer);
    todayBalance = summary.today;
    day90Balance = summary.day90;
  }
  const expectedMonthlyRevenue = averageMonthlyRevenue(financialYear);

  return (
    <div>
      <PageHeader
        title="What If"
        description="Long-term cash forecasting - test hypothetical changes (a new hire, a wage increase, cutting a cost) against the business's current cash trajectory."
      />

      {!forecastIsLive && (
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">
          {liveForecast.error ?? "Live cash forecast not available yet."} What If needs the live forecast to establish
          today&rsquo;s baseline trend.
        </div>
      )}

      {forecastIsLive && isAnthropicConfigured() && <WhatIfChatPanel scenarios={scenariosResult.scenarios} />}

      {forecastIsLive && (
        <WhatIfClient
          todayBalance={todayBalance}
          day90Balance={day90Balance}
          minimumCashBuffer={settings.minimumCashBuffer}
          today={TODAY}
          initialScenarios={scenariosResult.scenarios}
          expectedMonthlyRevenue={expectedMonthlyRevenue}
        />
      )}
    </div>
  );
}
