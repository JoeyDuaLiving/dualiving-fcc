import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Card } from "@/components/shared/Card";
import { SeverityBadge, StatusPill } from "@/components/shared/Badges";
import { CashFlowChart } from "@/components/charts/CashFlowChart";
import { formatAUD, formatDateAU } from "@/lib/format";
import {
  activeJobs,
  averageMonthlyOpex,
  buildForecastItems,
  cashForecastSeries,
  confirmedFutureRevenue,
  currentCashBalance,
  generateAlerts,
  jobCashPosition,
  outstandingBills,
  outstandingInvoices,
  simpleCashRunwayMonths,
  summarizeForecast,
  totalActiveJobCashRequirement,
  totalWip,
  weightedPipelineValue,
  ytdFinancials,
} from "@/lib/calculations";
import { bankAccounts, settings } from "@/lib/mock-data";
import { loadLiveBankSummary, loadLiveReceivables, loadLivePayables } from "@/lib/xero-source";
import { buildLiveForecastItems, generateLiveAlerts, liveCashRequiredToFinish, liveTotalActiveJobCashRequirement, liveTotalWip, loadLiveForecastData } from "@/lib/live-forecast";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [liveBank, liveReceivables, livePayables, liveForecast] = await Promise.all([
    loadLiveBankSummary(),
    loadLiveReceivables(),
    loadLivePayables(),
    loadLiveForecastData(),
  ]);
  const cashIsLive = liveBank.source === "live";
  const arIsLive = liveReceivables.source === "live";
  const apIsLive = livePayables.source === "live";
  const forecastIsLive = liveForecast.source === "live" && liveForecast.data !== null;

  const items = forecastIsLive ? buildLiveForecastItems(liveForecast.data!) : buildForecastItems();
  const daily = cashForecastSeries(items, 90, forecastIsLive ? liveForecast.data!.currentCashBalance : undefined);
  const summary = summarizeForecast(daily, settings.minimumCashBuffer);
  const alerts = (forecastIsLive ? generateLiveAlerts(liveForecast.data!, summary) : generateAlerts()).slice(0, 5);

  const operatingBalance = bankAccounts.find((b) => b.id === "bank-1")?.balance ?? 0;
  const bankBalance = cashIsLive ? liveBank.totalBalance : currentCashBalance();
  const ar = arIsLive ? liveReceivables.invoices.reduce((s, i) => s + i.amountOutstanding, 0) : outstandingInvoices().reduce((s, i) => s + i.amountOutstanding, 0);
  const arCount = arIsLive ? liveReceivables.invoices.length : outstandingInvoices().length;
  const ap = apIsLive ? livePayables.bills.reduce((s, b) => s + b.amountOutstanding, 0) : outstandingBills().reduce((s, b) => s + b.amountOutstanding, 0);
  const apCount = apIsLive ? livePayables.bills.length : outstandingBills().length;
  const wip = forecastIsLive ? liveTotalWip(liveForecast.data!.jobRows) : totalWip();
  const cashRequired = forecastIsLive ? liveTotalActiveJobCashRequirement(liveForecast.data!.jobRows) : totalActiveJobCashRequirement();
  const ytd = ytdFinancials();

  const topCashRiskJobs = forecastIsLive
    ? liveForecast
        .data!.jobRows.map((row) => ({
          job: row.job,
          pos: { remainingCost: row.job.committedCost + row.job.remainingForecastCost, nextPaymentAmount: null as number | null, cashRequiredToFinish: liveCashRequiredToFinish(row) },
        }))
        .filter((x) => x.pos.cashRequiredToFinish > 0)
        .sort((a, b) => b.pos.cashRequiredToFinish - a.pos.cashRequiredToFinish)
        .slice(0, 5)
    : [...activeJobs]
        .map((j) => ({ job: j, pos: jobCashPosition(j) }))
        .filter((x) => x.pos.cashRequiredToFinish > 0)
        .sort((a, b) => b.pos.cashRequiredToFinish - a.pos.cashRequiredToFinish)
        .slice(0, 5);

  return (
    <div>
      <PageHeader
        title="Executive Dashboard"
        description="Where our cash is today, what's coming in and going out, and where management attention is needed."
      />

      {/* What needs my attention */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-400" />
            <h2 className="text-sm font-semibold text-white">What needs my attention</h2>
          </div>
        }
        action={
          <Link href="/alerts" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
            View all <ArrowRight size={12} />
          </Link>
        }
        className="mb-6"
      >
        {alerts.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <CheckCircle2 size={16} className="text-emerald-400" /> No management issues detected right now.
          </div>
        ) : (
          <ul className="divide-y divide-slate-800">
            {alerts.map((alert, idx) => (
              <li key={alert.id} className="py-2.5 first:pt-0 last:pb-0">
                <Link href={alert.href ?? "/alerts"} className="flex items-start gap-3 group">
                  <span className="text-xs text-slate-600 font-mono w-4 pt-0.5">{idx + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-slate-100 group-hover:text-white font-medium">{alert.title}</span>
                      <SeverityBadge severity={alert.severity} />
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{alert.description}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Cash position */}
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-slate-300">Cash position</h2>
        {(cashIsLive || arIsLive || apIsLive || forecastIsLive) && <StatusPill tone="good">Live where connected</StatusPill>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
        <StatCard label="Current bank balance" value={formatAUD(bankBalance)} tone={cashIsLive && bankBalance < 0 ? "bad" : "default"} sub={cashIsLive ? "Xero, live" : "All accounts"} href="/cash-flow" />
        <StatCard label="Cash available" value={formatAUD(cashIsLive ? bankBalance : operatingBalance)} tone={cashIsLive && bankBalance < 0 ? "bad" : "default"} sub={cashIsLive ? "Xero, live" : "Operating account"} href="/cash-flow" />
        <StatCard label="Accounts receivable" value={formatAUD(ar)} sub={`${arCount} open invoices${arIsLive ? " · live" : ""}`} href="/receivables" />
        <StatCard label="Accounts payable" value={formatAUD(ap)} sub={`${apCount} open bills${apIsLive ? " · live" : ""}`} href="/payables" />
        <StatCard label="Current WIP" value={formatAUD(wip)} sub="Cost incurred, not yet billed" href="/jobs" />
        <StatCard
          label="Cash to complete active jobs"
          value={formatAUD(cashRequired)}
          sub={`${topCashRiskJobs.length} job(s) flagged`}
          tone={cashRequired > 0 ? "warn" : "good"}
          href="/jobs"
        />
        <StatCard label="Minimum cash buffer" value={formatAUD(settings.minimumCashBuffer)} sub="Management assumption" href="/settings" />
      </div>

      {/* 30/60/90 forecast */}
      <Card title="30 / 60 / 90 Day Cash Forecast" action={<Link href="/cash-flow" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">Full forecast <ArrowRight size={12} /></Link>} className="mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          {[
            { label: "Today", value: summary.today },
            { label: "30 Days", value: summary.day30 },
            { label: "60 Days", value: summary.day60 },
            { label: "90 Days", value: summary.day90 },
          ].map((p) => (
            <div key={p.label}>
              <div className="text-xs text-slate-400">{p.label}</div>
              <div className="text-2xl font-semibold text-white tabular-nums mt-1">{formatAUD(p.value)}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm mb-4 pb-4 border-b border-slate-800">
          <div>
            <span className="text-slate-400">Lowest projected balance </span>
            <span className="text-white font-medium tabular-nums">{formatAUD(summary.minBalance)}</span>
            <span className="text-slate-500"> on {formatDateAU(summary.minBalanceDate)}</span>
          </div>
          <div>
            {summary.bufferBreach ? (
              <span className="text-red-400 font-medium">
                {formatAUD(summary.bufferBreachAmount)} below the minimum buffer
              </span>
            ) : (
              <span className="text-emerald-400 font-medium">Buffer maintained across the forecast window</span>
            )}
          </div>
        </div>
        <CashFlowChart data={daily} buffer={settings.minimumCashBuffer} />
      </Card>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Revenue YTD" value={formatAUD(ytd.revenue, { compact: true })} href="/jobs" />
        <StatCard label="Gross profit YTD" value={formatAUD(ytd.grossProfit, { compact: true })} sub={`${ytd.marginPercent.toFixed(1)}% margin`} href="/jobs" />
        <StatCard label="Monthly OPEX" value={formatAUD(averageMonthlyOpex(), { compact: true })} sub="Avg of last 2 months" href="/expenses" />
        <StatCard label="Cash runway" value={simpleCashRunwayMonths() === Infinity ? "N/A" : `${simpleCashRunwayMonths().toFixed(1)} mo`} sub="Cash / avg monthly burn" href="/expenses" />
        <StatCard label="Confirmed future revenue" value={formatAUD(confirmedFutureRevenue(), { compact: true })} sub="Remaining active-job revenue" href="/jobs" />
        <StatCard label="Weighted pipeline" value={formatAUD(weightedPipelineValue(), { compact: true })} sub="GHL, probability-weighted" href="/pipeline" tone="default" />
        <StatCard label="Active jobs" value={String(forecastIsLive ? liveForecast.data!.jobRows.length : activeJobs.length)} sub="In progress or on hold" href="/jobs" />
        <StatCard label="Jobs needing cash" value={String(topCashRiskJobs.length)} tone={topCashRiskJobs.length > 0 ? "warn" : "good"} href="/jobs" />
      </div>

      {/* Job cash risk quick table */}
      <Card
        title="Jobs consuming the most cash"
        action={<Link href="/jobs" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">All jobs <ArrowRight size={12} /></Link>}
      >
        {topCashRiskJobs.length === 0 ? (
          <p className="text-sm text-slate-400">No active jobs currently require additional cash to finish.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                  <th className="pb-2 font-medium">Job</th>
                  <th className="pb-2 font-medium">Client</th>
                  <th className="pb-2 font-medium text-right">Remaining cost</th>
                  <th className="pb-2 font-medium text-right">Next payment</th>
                  <th className="pb-2 font-medium text-right">Cash required</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {topCashRiskJobs.map(({ job, pos }) => (
                  <tr key={job.id} className="hover:bg-slate-900/60">
                    <td className="py-2.5">
                      <Link href={`/jobs/${job.id}`} className="text-brand-400 hover:text-brand-300 font-medium">
                        {job.id}
                      </Link>
                    </td>
                    <td className="py-2.5 text-slate-300">{job.client}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-300">{formatAUD(pos.remainingCost)}</td>
                    <td className="py-2.5 text-right tabular-nums text-slate-300">
                      {pos.nextPaymentAmount ? formatAUD(pos.nextPaymentAmount) : "—"}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-amber-400 font-medium">{formatAUD(pos.cashRequiredToFinish)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
