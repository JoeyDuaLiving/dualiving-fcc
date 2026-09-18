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
  averageMonthlyRevenue,
  liveAnnualisedOpex,
  liveAverageMonthlyOpex,
  liveCurrentMonthOpex,
  liveMonthlyFixedCost,
  liveMonthlyVariableCost,
  liveOpexCategoryBreakdown,
  liveRevenueRequiredToCoverOpex,
  loadLiveBankSummary,
  loadLiveFinancialYearSummary,
  loadLiveOperatingExpenses,
  loadLivePreviousMonthRevenue,
} from "@/lib/xero-source";
import { RecurringLiabilitiesManager } from "@/components/expenses/RecurringLiabilitiesManager";
import { loadRecurringLiabilities, monthlyEquivalent, projectLiabilityOccurrences } from "@/lib/recurring-liabilities-source";
import { addDays } from "@/lib/format";
import { TODAY } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  wages: "Wages", marketing: "Marketing", rent: "Rent", vehicles: "Vehicles", fuel: "Fuel",
  insurance: "Insurance", software: "Software", phones: "Phones", accounting: "Accounting",
  professional_fees: "Professional fees", finance: "Finance", office: "Office",
  utilities: "Utilities", advertising: "Advertising", other: "Other",
};

export default async function ExpensesPage() {
  const [liveOpex, liveBank, liveLiabilities, financialYear, previousMonthRevenueResult] = await Promise.all([
    loadLiveOperatingExpenses(),
    loadLiveBankSummary(),
    loadRecurringLiabilities(),
    loadLiveFinancialYearSummary(),
    loadLivePreviousMonthRevenue(),
  ]);
  const isLive = liveOpex.source === "live";

  const liabilityRangeEnd = addDays(TODAY, 365);
  const liabilitiesForDisplay = liveLiabilities.liabilities.map((l) => ({
    ...l,
    nextOccurrence: projectLiabilityOccurrences(l, TODAY, liabilityRangeEnd)[0]?.date ?? null,
    monthlyEquivalent: monthlyEquivalent(l),
  }));

  // A category with nothing recorded in the current period, previous period
  // or YTD isn't useful in this table - just noise. Mock rows carry a
  // placeholder "typicalPaymentDay" since that's derived from real
  // transaction dates only available in live mode - unifies the row type
  // so the table doesn't need a separate mock-mode column layout.
  const rows = (
    isLive
      ? liveOpexCategoryBreakdown(liveOpex.expenses)
      : opexCategoryBreakdown().map((r) => ({ ...r, typicalPaymentDay: "—" }))
  ).filter((r) => r.current !== 0 || r.previous !== 0 || r.ytd !== 0);
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
  // Actual revenue was never checked against this target anywhere on the
  // page - it just showed the requirement in isolation. This is this
  // financial year's real Xero revenue spread evenly across months
  // elapsed, the same run-rate figure the What If page shows.
  const actualMonthlyRevenue = isLive ? averageMonthlyRevenue(financialYear) : null;
  const revenueGap = actualMonthlyRevenue !== null ? actualMonthlyRevenue - revenueRequired : null;
  const previousMonthRevenue = isLive && previousMonthRevenueResult.source === "live" ? previousMonthRevenueResult.revenue : null;

  const cashBalance = isLive && liveBank.source === "live" ? liveBank.totalBalance : currentCashBalance();
  // Cash runway needs the true monthly cash burn, not just P&L opex - loan
  // repayments are real, unavoidable cash out that OPEX alone doesn't see
  // (see RecurringLiabilitiesManager). "Monthly OPEX" itself stays a clean
  // P&L figure; only this burn-rate figure blends the two.
  const totalLiabilityMonthly = liabilitiesForDisplay.reduce((s, l) => s + l.monthlyEquivalent, 0);
  const monthlyBurn = monthlyAverage + totalLiabilityMonthly;
  const runwayMonths = monthlyBurn > 0 ? cashBalance / monthlyBurn : Infinity;
  const runway = isLive ? runwayMonths : simpleCashRunwayMonths();

  return (
    <div>
      <PageHeader
        title="Expenses"
        description={
          isLive
            ? "Live from Xero - operating expenses, classified fixed/variable by whether the category recurs regardless of job volume. Separate from job costs."
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
        <StatCard
          label="Cash runway"
          value={runway === Infinity ? "N/A" : `${runway.toFixed(1)} months`}
          sub={isLive ? `${formatAUD(cashBalance, { compact: true })} cash / avg burn incl. loans` : `${formatAUD(cashBalance, { compact: true })} cash / avg burn`}
        />
      </div>

      <div className="grid md:grid-cols-3 gap-3 mb-6">
        <Card title="Monthly fixed cost">
          <div className="text-2xl font-semibold text-white tabular-nums">{formatAUD(fixedCost)}</div>
          <p className="text-xs text-slate-500 mt-2">
            Recurs regardless of job volume - wages, rent, insurance, subscriptions, phones, accounting, finance and
            statutory registrations{isLive ? " (see By category below for the full list)" : ""}.
          </p>
        </Card>
        <Card title="Monthly variable cost">
          <div className="text-2xl font-semibold text-white tabular-nums">{formatAUD(variableCost)}</div>
          <p className="text-xs text-slate-500 mt-2">
            Scales with job activity or is discretionary/ad hoc - fuel, vehicle running costs, advertising, office
            supplies and similar.
          </p>
        </Card>
        <Card title="Revenue required to cover OPEX">
          <div className="text-2xl font-semibold text-white tabular-nums">{formatAUD(revenueRequired)}</div>
          <p className="text-xs text-slate-500 mt-2">
            Monthly revenue needed at the {isLive ? "management target" : "current"} {marginPercent.toFixed(1)}% margin to break even on overhead.
          </p>
          {actualMonthlyRevenue !== null && revenueGap !== null && (
            <div className="mt-3 pt-3 border-t border-slate-800">
              {previousMonthRevenue !== null && (
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-slate-400">Actual (previous month)</span>
                  <span className="text-sm font-medium text-white tabular-nums">{formatAUD(previousMonthRevenue)}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-xs text-slate-400">Actual (this FY&rsquo;s run-rate)</span>
                <span className="text-sm font-medium text-white tabular-nums">{formatAUD(actualMonthlyRevenue)}</span>
              </div>
              <div className={`flex items-baseline justify-between mt-1 ${revenueGap < 0 ? "text-red-400" : "text-emerald-400"}`}>
                <span className="text-xs">{revenueGap < 0 ? "Shortfall" : "Surplus"}</span>
                <span className="text-sm font-semibold tabular-nums">{formatAUD(Math.abs(revenueGap))}/month</span>
              </div>
            </div>
          )}
        </Card>
      </div>

      {isLive && (
        <p className="text-xs text-slate-500 mb-6">
          Fixed/variable is a management judgment call (&ldquo;does this recur regardless of job volume&rdquo;) applied
          per Xero account - not Xero&rsquo;s own account Type, which this tenant&rsquo;s chart of accounts barely tags
          usefully. Job-related accounts (Xero&rsquo;s &ldquo;DIRECTCOSTS&rdquo; type) are excluded entirely since
          they&rsquo;re already captured via Buildxact&rsquo;s actual/committed cost.
        </p>
      )}

      <Card title="By category" className="mb-6">
        {isLive && (
          <p className="text-xs text-slate-500 mb-3">
            &ldquo;Typical date paid&rdquo; is derived from this category&rsquo;s own transaction/bill dates (the
            same dates the bank feed and Xero bills carry in) - a category needs at least 6 dated occurrences
            before a pattern is trusted, otherwise it shows as varying or not enough history.
          </p>
        )}
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
                <th className="pb-2 pl-6 font-medium">Typical date paid</th>
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
                  <td className="py-2.5 pl-6 text-slate-400">{row.typicalPaymentDay}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <RecurringLiabilitiesManager liabilities={liabilitiesForDisplay} />
    </div>
  );
}
