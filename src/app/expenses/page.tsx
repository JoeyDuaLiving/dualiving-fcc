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

const CATEGORY_LABEL: Record<string, string> = {
  wages: "Wages", marketing: "Marketing", rent: "Rent", vehicles: "Vehicles", fuel: "Fuel",
  insurance: "Insurance", software: "Software", phones: "Phones", accounting: "Accounting",
  professional_fees: "Professional fees", finance: "Finance", office: "Office",
  utilities: "Utilities", advertising: "Advertising", other: "Other",
};

export default function ExpensesPage() {
  const rows = opexCategoryBreakdown();
  const ytd = ytdFinancials();
  const revenueRequired = revenueRequiredToCoverOpex(ytd.marginPercent || 25);

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Operating expenses from Xero, classified as fixed or variable overhead - separate from job costs."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Current month" value={formatAUD(currentMonthOpex())} />
        <StatCard label="Monthly average" value={formatAUD(averageMonthlyOpex())} />
        <StatCard label="Annualised OPEX" value={formatAUD(annualisedOpex(), { compact: true })} />
        <StatCard label="Cash runway" value={simpleCashRunwayMonths() === Infinity ? "N/A" : `${simpleCashRunwayMonths().toFixed(1)} months`} sub={`${formatAUD(currentCashBalance(), { compact: true })} cash / avg burn`} />
      </div>

      <div className="grid md:grid-cols-3 gap-3 mb-6">
        <Card title="Monthly fixed cost">
          <div className="text-2xl font-semibold text-white tabular-nums">{formatAUD(monthlyFixedCost())}</div>
          <p className="text-xs text-slate-500 mt-2">Recurs regardless of job volume - wages, rent, insurance, subscriptions, finance.</p>
        </Card>
        <Card title="Monthly variable cost">
          <div className="text-2xl font-semibold text-white tabular-nums">{formatAUD(monthlyVariableCost())}</div>
          <p className="text-xs text-slate-500 mt-2">Scales with activity - marketing, fuel, vehicles, office, utilities.</p>
        </Card>
        <Card title="Revenue required to cover OPEX">
          <div className="text-2xl font-semibold text-white tabular-nums">{formatAUD(revenueRequired)}</div>
          <p className="text-xs text-slate-500 mt-2">Monthly revenue needed at the current {ytd.marginPercent.toFixed(1)}% blended margin to break even on overhead.</p>
        </Card>
      </div>

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
