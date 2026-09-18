import { PageHeader } from "@/components/shared/PageHeader";
import { WhatIfClient } from "@/components/what-if/WhatIfClient";
import { WhatIfChatPanel } from "@/components/what-if/WhatIfChatPanel";
import { loadLiveForecastData } from "@/lib/live-forecast";
import { loadWhatIfScenarios } from "@/lib/what-if-source";
import { settings, TODAY } from "@/lib/mock-data";
import { isAnthropicConfigured } from "@/integrations/anthropic/client";
import { averageMonthlyRevenue, liveRevenueRequiredToCoverOpex, loadLiveFinancialYearSummary, loadLiveTrailingAverageRevenue } from "@/lib/xero-source";

export const dynamic = "force-dynamic";

export default async function WhatIfPage() {
  const [liveForecast, scenariosResult, financialYear, trailingAverageRevenueResult] = await Promise.all([
    loadLiveForecastData(),
    loadWhatIfScenarios(),
    loadLiveFinancialYearSummary(),
    loadLiveTrailingAverageRevenue(12),
  ]);
  const forecastIsLive = liveForecast.source === "live" && liveForecast.data !== null;

  const todayBalance = forecastIsLive ? liveForecast.data!.currentCashBalance : 0;
  const monthlyDelta = financialYear.trailingCashTrendMonthlyDelta;
  const expectedMonthlyRevenue = averageMonthlyRevenue(financialYear);
  const trailing12MonthRevenue = trailingAverageRevenueResult.source === "live" ? trailingAverageRevenueResult.average : null;
  const revenueRequiredToCoverOpex = forecastIsLive
    ? liveRevenueRequiredToCoverOpex(liveForecast.data!.operatingExpenses, settings.marginTargetPercent)
    : 0;

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
          monthlyDelta={monthlyDelta}
          minimumCashBuffer={settings.minimumCashBuffer}
          today={TODAY}
          initialScenarios={scenariosResult.scenarios}
          expectedMonthlyRevenue={expectedMonthlyRevenue}
          revenueRequiredToCoverOpex={revenueRequiredToCoverOpex}
          trailing12MonthRevenue={trailing12MonthRevenue}
        />
      )}
    </div>
  );
}
