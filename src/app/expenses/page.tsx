import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Card } from "@/components/shared/Card";
import { StatusPill } from "@/components/shared/Badges";
import { formatAUD } from "@/lib/format";
import {
  annualisedOpex,
  averageMonthlyOpex,
  currentMonthOpex,
  monthlyFixedCost,
  monthlyVariableCost,
  opexCategoryBreakdown,
  revenueRequiredToCoverOpex,
  simpleCashRunwayMonths,
  ytdFinancials,
} from "@/lib/calculations";
import { currentCashBalance } from "@/lib/calculations";
import { settings } from "@/lib/mock-data";
import {
  liveAnnualisedOpex,
  liveAverageMonthlyOpex,
  liveCurrentMonthOpex,
  liveMonthlyFixedCost,
  liveMonthlyVariableCost,
  liveOpexCategoryBreakdown,
  liveRevenueRequiredToCoverOpex,
  loadLiveBankSummary,
  loadLiveOperatingExpenses,
} from "@/lib/xero-source";

export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  wages: "Wages", marketing: "Marketing", rent: "Rent", vehicles: "Vehicles", fuel: "Fuel",
  insurance: "Insurance", software: "Software", phones: "Phones", accounting: "Accounting",
  professional_fees: "Professional fees", finance: "Finance", office: "Office",
  utilities: "Utilities", advertising: "Advertising", other: "Other",
};

export default async function ExpensesPage() {
  const [liveOpex, liveBank] = await Promise.all([loadLiveOperatingExpenses(), loadLiveBankSummary()]);
  const isLive = liveOpex.source === "live";

  const rows = isLive ? liveOpexCategoryBreakdown(liveOpex.expenses) : opexCategoryBreakdown();
  const currentMonth = isLive ? liveCurrentMonthOpex(liveOpex.expenses) : currentMonthOpex();
  const monthlyAverage = isLive ? liveAverageMonthlyOpex(liveOpex.expenses) : averageMonthlyOpex();
  const annualised = isLive ? liveAnnualisedOpex(liveOpex.expenses) : annualisedOpex();
  const fixedCost = isLive ? liveMonthlyFixedCost(liveOpex.expenses) : monthlyFixedCost();
  const variableCost = isLive ? liveMonthlyVariableCost(liveOpex.expenses) : monthlyVariableCost();

  // Live mode uses the management margin-target assumption (Settings) rather
  // than a computed YTD margin, since a real blended margin needs the full
  // year's invoice history, not just outstanding invoices - not built yet.
  const marginPercent = isLive ? settings.marginTargetPercent : ytdFinancials().marginPercent || 25;
  const revenueRequired = isLive ? liveRevenueRequiredToCoverOpex(liveOpex.expenses, marginPercent) : revenueRequiredToCoverOpex(marginPercent);

  const cashBalance = isLive && liveBank.source === "live" ? liveBank.totalBalance : currentCashBalance();
  const runwayMonths = monthlyAverage > 0 ? cashBalance / monthlyAverage : Infinity;
  const runway = isLive ? runwayMonths : simpleCashRunwayMonths();

  return (
    <div>
      <PageHeader
        title="Expenses"
        description={
          isLive
            ? "Live from Xero - operating expenses, classified fixed/variable using Xero's own chart-of-accounts type where available. Separate from job costs."
            : "Operating expenses from Xero, classified as fixed or variable overhead - separate from job costs."
        }
        action={isLive ? <StatusPill tone="good">Live</StatusPill> : undefined}
      />

      {!isLive && liveOpex.error && (
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">
          {liveOpex.error} Showing Phase 1 mock data in the meantime.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Current month" value={formatAUD(currentMonth)} />
        <StatCard label="Monthly average" value={formatAUD(monthlyAverage)} />
        <StatCard label="Annualised OPEX" value={formatAUD(annualised, { compact: true })} />
        <StatCard label="Cash runway" value={runway === Infinity ? "N/A" : `${runway.toFixed(1)} months`} sub={`${formatAUD(cashBalance, { compact: true })} cash / avg burn`} />
      </div>

      <div className="grid md:grid-cols-3 gap-3 mb-6">
        <Card title="Monthly fixed cost">
          <div className="text-2xl font-semibold text-white tabular-nums">{formatAUD(fixedCost)}</div>
          <p className="text-xs text-slate-500 mt-2">
            {isLive
              ? 'Recurs regardless of job volume - accounts using Xero\'s "OVERHEADS" type only (few in this tenant\'s chart of accounts, see By category below).'
              : "Recurs regardless of job volume - wages, rent, insurance, subscriptions, finance."}
          </p>
        </Card>
        <Card title="Monthly variable cost">
          <div className="text-2xl font-semibold text-white tabular-nums">{formatAUD(variableCost)}</div>
          <p className="text-xs text-slate-500 mt-2">
            {isLive ? "Everything else - most real categories default here (see caveat below)." : "Scales with activity - marketing, fuel, vehicles, office, utilities."}
          </p>
        </Card>
        <Card title="Revenue required to cover OPEX">
          <div className="text-2xl font-semibold text-white tabular-nums">{formatAUD(revenueRequired)}</div>
          <p className="text-xs text-slate-500 mt-2">
            Monthly revenue needed at the {isLive ? "management target" : "current"} {marginPercent.toFixed(1)}% margin to break even on overhead.
          </p>
        </Card>
      </div>

      {isLive && (
        <p className="text-xs text-slate-500 mb-6">
          Fixed/variable is Xero&rsquo;s own account Type where it says so (&ldquo;OVERHEADS&rdquo;), which this
          tenant barely uses - almost everything defaults to &ldquo;variable&rdquo; rather than a real per-category
          judgment. Job-related accounts (Xero&rsquo;s &ldquo;DIRECTCOSTS&rdquo; type) are excluded entirely since
          they&rsquo;re already captured via Buildxact&rsquo;s actual/committed cost.
        </p>
      )}

      <Card title="By category">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="pb-2 font-medium">Category</th>
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium text-right">Current month</th>
                <th className="pb-2 font-medium text-right">Previous month</th>
                <th className="pb-2 font-medium text-right">YTD</th>
                <th className="pb-2 font-medium text-right">Monthly average</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {rows.map((row) => (
                <tr key={row.category} className="hover:bg-slate-900/60">
                  <td className="py-2.5 text-slate-200">{CATEGORY_LABEL[row.category] ?? row.category}</td>
                  <td className="py-2.5">
                    <StatusPill tone={row.classification === "fixed" ? "neutral" : "warn"}>{row.classification}</StatusPill>
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(row.current)}</td>
                  <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(row.previous)}</td>
                  <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(row.ytd)}</td>
                  <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(row.monthlyAverage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
