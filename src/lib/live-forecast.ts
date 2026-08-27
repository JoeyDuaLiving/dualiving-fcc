import "server-only";
import type { ForecastItem, ManagementAlert } from "@/types";
import { jobCosting, daysOverdue, cashForecastSeries, summarizeForecast, type CashForecastSummary } from "./calculations";
import { addDays, formatDateAU } from "./format";
import { TODAY, settings } from "./mock-data";
import { loadLiveActiveJobsCashPositions, type LiveJobCashPositionRow } from "./jobs-source";
import {
  loadLiveBankSummary,
  loadLiveOperatingExpenses,
  loadLivePayables,
  loadLiveReceivables,
  type LiveBill,
  type LiveInvoice,
  type LiveOperatingExpense,
} from "./xero-source";
import { liveExpectedDeposit, loadLiveOpenOpportunities, type LiveOpportunity } from "./ghl-source";

// ---------------------------------------------------------------------------
// Live equivalent of the forecast/alerts engine in calculations.ts, built
// from real Buildxact/Xero/GHL data rather than mock-data.ts. Two categories
// are deliberately NOT reproduced here because no live data source exists
// for them yet (see chat/commit history, not invented):
//
//   - FORECAST inflow timing from payment-schedule stages ("10% deposit,
//     40% frame stage") - Dualiving's own internal invoicing plan per job,
//     not a Buildxact API field. Jobs still get a single lump-sum "cost to
//     complete" FORECAST outflow (using the job's own real
//     remainingForecastCost and expectedCompletion date - real numbers, just
//     not spread across stages like the mock version does).
//   - The "supplier payment due before next customer payment" alert, which
//     needs that same schedule data to know the next customer payment date.
//
// Reuses the pure, data-agnostic pieces of calculations.ts directly
// (jobCosting, daysOverdue) rather than re-deriving them - those already
// work on any Job/date regardless of source.
// ---------------------------------------------------------------------------

export interface LiveForecastData {
  jobRows: LiveJobCashPositionRow[];
  receivables: LiveInvoice[];
  payables: LiveBill[];
  opportunities: LiveOpportunity[];
  operatingExpenses: LiveOperatingExpense[];
  currentCashBalance: number;
}

export interface LoadLiveForecastResult {
  data: LiveForecastData | null;
  source: "live" | "unavailable";
  error?: string;
}

/** The live forecast activates once the core position (jobs, receivables,
 * payables, bank balance) is available - operating expenses can lag behind
 * (e.g. before the first Xero opex sync has run) without blocking the rest,
 * since that only removes the recurring-opex forecast items, not the whole
 * picture. */
export async function loadLiveForecastData(): Promise<LoadLiveForecastResult> {
  const [jobsResult, receivablesResult, payablesResult, bankResult, opexResult, oppsResult] = await Promise.all([
    loadLiveActiveJobsCashPositions(),
    loadLiveReceivables(),
    loadLivePayables(),
    loadLiveBankSummary(),
    loadLiveOperatingExpenses(),
    loadLiveOpenOpportunities(),
  ]);

  if (jobsResult.source !== "live" || receivablesResult.source !== "live" || payablesResult.source !== "live" || bankResult.source !== "live") {
    const firstError = [jobsResult, receivablesResult, payablesResult, bankResult].find((r) => r.error)?.error;
    return { data: null, source: "unavailable", error: firstError ?? "Live data not fully available yet." };
  }

  return {
    data: {
      jobRows: jobsResult.rows,
      receivables: receivablesResult.invoices,
      payables: payablesResult.bills,
      opportunities: oppsResult.source === "live" ? oppsResult.opportunities : [],
      operatingExpenses: opexResult.source === "live" ? opexResult.expenses : [],
      currentCashBalance: bankResult.totalBalance,
    },
    source: "live",
  };
}

export function liveCashRequiredToFinish(row: LiveJobCashPositionRow): number {
  const remainingCost = row.job.committedCost + row.job.remainingForecastCost;
  const expectedRemainingRevenue = jobCosting(row.job).revisedRevenue - row.cashReceived;
  return Math.max(0, remainingCost - expectedRemainingRevenue);
}

export function liveTotalActiveJobCashRequirement(rows: LiveJobCashPositionRow[]): number {
  return rows.reduce((s, r) => s + liveCashRequiredToFinish(r), 0);
}

export function liveTotalWip(rows: LiveJobCashPositionRow[]): number {
  return rows.reduce((s, r) => s + r.wip, 0);
}

export type ProgressBucket = "0-25%" | "25-50%" | "50-75%" | "75-100%";

export function liveWipByProgressBucket(rows: LiveJobCashPositionRow[]): Record<ProgressBucket, number> {
  const buckets: Record<ProgressBucket, number> = { "0-25%": 0, "25-50%": 0, "50-75%": 0, "75-100%": 0 };
  for (const row of rows) {
    if (row.job.progressPercent < 25) buckets["0-25%"] += row.wip;
    else if (row.job.progressPercent < 50) buckets["25-50%"] += row.wip;
    else if (row.job.progressPercent < 75) buckets["50-75%"] += row.wip;
    else buckets["75-100%"] += row.wip;
  }
  return buckets;
}

function clampToday(date: string): string {
  return date < TODAY ? TODAY : date;
}

export function buildLiveForecastItems(data: LiveForecastData): ForecastItem[] {
  const items: ForecastItem[] = [];
  const depositPercent = settings.defaultDepositPercent;

  // Committed inflows: invoices already issued, awaiting collection.
  for (const inv of data.receivables) {
    const overdue = daysOverdue(inv.dueDate) > 0;
    items.push({
      id: `live-fc-inv-${inv.id}`,
      source: "xero",
      sourceId: inv.id,
      date: clampToday(inv.dueDate),
      amount: inv.amountOutstanding,
      direction: "inflow",
      category: "customer_receipt",
      jobId: inv.jobId ?? undefined,
      party: inv.customer,
      confidence: "committed",
      status: overdue ? "Overdue - issued invoice awaiting payment" : "Issued invoice awaiting payment",
      description: `${inv.invoiceNumber}`,
    });
  }

  // Potential inflows: real GHL pipeline expected deposits.
  for (const opp of data.opportunities) {
    items.push({
      id: `live-fc-opp-${opp.id}`,
      source: "ghl",
      sourceId: opp.sourceId,
      date: clampToday(addDays(opp.expectedCloseDate ?? TODAY, 7)),
      amount: liveExpectedDeposit(opp, depositPercent),
      direction: "inflow",
      category: "pipeline_deposit",
      party: opp.contact ?? undefined,
      confidence: "potential",
      status: `${opp.stage} - ${opp.probabilityPercent}% probability`,
      description: `${opp.name} - expected deposit (${depositPercent}%)`,
    });
  }

  // Committed outflows: bills outstanding.
  for (const bill of data.payables) {
    const overdue = daysOverdue(bill.dueDate) > 0;
    items.push({
      id: `live-fc-bill-${bill.id}`,
      source: "xero",
      sourceId: bill.id,
      date: clampToday(bill.dueDate),
      amount: bill.amountOutstanding,
      direction: "outflow",
      category: "supplier_payment",
      jobId: bill.jobId ?? undefined,
      party: bill.supplier,
      confidence: "committed",
      status: overdue ? "Overdue supplier bill" : `Bill ${bill.status.toLowerCase()}`,
      description: `${bill.billNumber}`,
    });
  }

  // Forecast outflows: remaining job cost as a single lump sum at expected
  // completion - no live payment-schedule data to spread it across stages
  // (see module comment).
  for (const row of data.jobRows) {
    if (row.job.remainingForecastCost <= 0) continue;
    items.push({
      id: `live-fc-cost-${row.job.id}-lump`,
      source: "buildxact",
      sourceId: `${row.job.sourceId}-remaining-cost`,
      date: clampToday(row.job.expectedCompletion || TODAY),
      amount: row.job.remainingForecastCost,
      direction: "outflow",
      category: "job_cost",
      jobId: row.job.id,
      party: row.job.client,
      confidence: "forecast",
      status: "Estimated cost to complete",
      description: `${row.job.jobNumber} ${row.job.client} - forecast cost to complete`,
    });
  }

  // Forecast outflows: recurring operating expense categories, projected
  // forward using each category's most recent real amount.
  const recurring = data.operatingExpenses.filter((e) => e.recurring);
  const latestByCategory = new Map<string, LiveOperatingExpense>();
  for (const e of recurring) {
    const existing = latestByCategory.get(e.category);
    if (!existing || e.date > existing.date) latestByCategory.set(e.category, e);
  }
  const [todayY, todayM] = TODAY.split("-").map(Number);
  for (const [category, info] of latestByCategory) {
    const dayOfMonth = Number(info.date.slice(8, 10));
    for (let m = 0; m < 3; m++) {
      const base = new Date(Date.UTC(todayY, todayM - 1, 1));
      base.setUTCMonth(base.getUTCMonth() + m + 1, dayOfMonth);
      items.push({
        id: `live-fc-opex-${category}-${m}`,
        source: "xero",
        sourceId: `live-opex-projection-${category}-${m}`,
        date: base.toISOString().slice(0, 10),
        amount: info.amount,
        direction: "outflow",
        category: "operating_expense",
        party: category,
        confidence: "forecast",
        status: "Projected recurring operating expense",
        description: `Projected ${category} (based on most recent transaction)`,
      });
    }
  }

  return items.sort((a, b) => a.date.localeCompare(b.date));
}

export function generateLiveAlerts(data: LiveForecastData, forecastSummary: CashForecastSummary): ManagementAlert[] {
  const alerts: ManagementAlert[] = [];

  if (forecastSummary.bufferBreach) {
    alerts.push({
      id: "live-alert-buffer-breach",
      severity: "critical",
      title: "Cash forecast falls below minimum buffer",
      description: `Projected cash falls to $${Math.round(forecastSummary.minBalance).toLocaleString()} on ${formatDateAU(forecastSummary.minBalanceDate)}, $${Math.round(forecastSummary.bufferBreachAmount).toLocaleString()} below the $${settings.minimumCashBuffer.toLocaleString()} minimum buffer.`,
      href: "/cash-flow",
    });
  }

  // Small/placeholder jobs (e.g. Buildxact's $0 "STOCK" job, or genuinely
  // minor jobs under $25k) generate a disproportionate share of alert noise
  // relative to their real financial significance - job-level alerts only
  // fire above that threshold. WIP/cash-required totals elsewhere are NOT
  // filtered, since those should reflect true financial exposure regardless
  // of job size.
  const MINIMUM_ALERT_JOB_VALUE = 25_000;
  const significantJobRows = data.jobRows.filter((row) => jobCosting(row.job).revisedRevenue >= MINIMUM_ALERT_JOB_VALUE);

  for (const row of significantJobRows) {
    const cashRequired = liveCashRequiredToFinish(row);
    if (cashRequired > 0) {
      alerts.push({
        id: `live-alert-job-cash-${row.job.id}`,
        severity: "critical",
        title: `${row.job.jobNumber} requires additional cash to finish`,
        description: `${row.job.client} (${row.job.jobNumber}) requires approximately $${Math.round(cashRequired).toLocaleString()} of additional cash to complete.`,
        jobId: row.job.id,
        href: `/jobs/${row.job.id}`,
      });
    }

    const costing = jobCosting(row.job);
    if (costing.belowTarget) {
      alerts.push({
        id: `live-alert-margin-${row.job.id}`,
        severity: costing.forecastMarginPercent < 10 ? "critical" : "warning",
        title: `${row.job.jobNumber} gross margin below target`,
        description: `${row.job.client} (${row.job.jobNumber}) is forecast at ${costing.forecastMarginPercent.toFixed(1)}% margin, below the ${row.job.marginTargetPercent}% target.`,
        jobId: row.job.id,
        href: `/jobs/${row.job.id}`,
      });
    }
    if (costing.forecastFinalCost > costing.revisedRevenue) {
      alerts.push({
        id: `live-alert-overrun-${row.job.id}`,
        severity: "critical",
        title: `${row.job.jobNumber} forecast cost exceeds contract value`,
        description: `${row.job.client} (${row.job.jobNumber}) forecast final cost of $${Math.round(costing.forecastFinalCost).toLocaleString()} exceeds revised revenue of $${Math.round(costing.revisedRevenue).toLocaleString()}.`,
        jobId: row.job.id,
        href: `/jobs/${row.job.id}`,
      });
    }
    if (row.job.expectedCompletion && row.job.contractedCompletion && row.job.expectedCompletion > row.job.contractedCompletion) {
      alerts.push({
        id: `live-alert-delay-${row.job.id}`,
        severity: "warning",
        title: `${row.job.jobNumber} completion delayed`,
        description: `${row.job.client} (${row.job.jobNumber}) is now expected ${formatDateAU(row.job.expectedCompletion)}, past the contracted date of ${formatDateAU(row.job.contractedCompletion)}.`,
        jobId: row.job.id,
        href: `/jobs/${row.job.id}`,
      });
    }
  }

  const overdueInvoices = data.receivables.filter((i) => daysOverdue(i.dueDate) > 0);
  const overdueAmount = overdueInvoices.reduce((s, i) => s + i.amountOutstanding, 0);
  if (overdueAmount > 0) {
    alerts.push({
      id: "live-alert-overdue",
      severity: "warning",
      title: "Customer invoices overdue",
      description: `$${Math.round(overdueAmount).toLocaleString()} is currently overdue from customers across ${overdueInvoices.length} invoices.`,
      href: "/receivables",
    });
  }

  const near7 = data.opportunities.filter((o) => {
    if (!o.expectedCloseDate) return false;
    const days = Math.round((new Date(o.expectedCloseDate).getTime() - new Date(TODAY).getTime()) / 86400000);
    return days >= 0 && days <= 7 && o.probabilityPercent >= 70;
  });
  for (const opp of near7) {
    alerts.push({
      id: `live-alert-sales-${opp.id}`,
      severity: "positive",
      title: "Large customer contract expected to close within 7 days",
      description: `${opp.name} ($${opp.value.toLocaleString()}, ${opp.probabilityPercent}% probability) is expected to close by ${formatDateAU(opp.expectedCloseDate!)}.`,
      href: "/pipeline",
    });
  }

  const severityOrder: Record<ManagementAlert["severity"], number> = { critical: 0, warning: 1, positive: 2 };
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

export interface LiveAlertsResult {
  alerts: ManagementAlert[];
  source: "live" | "unavailable";
  error?: string;
}

/** One-call convenience for pages that just want the alert list (Dashboard,
 * TopBar, Alerts page) without re-running the load-items-summarize pipeline
 * themselves. */
export async function computeLiveAlerts(): Promise<LiveAlertsResult> {
  const live = await loadLiveForecastData();
  if (live.source !== "live" || !live.data) {
    return { alerts: [], source: "unavailable", error: live.error };
  }
  const items = buildLiveForecastItems(live.data);
  const daily = cashForecastSeries(items, 90, live.data.currentCashBalance);
  const summary = summarizeForecast(daily, settings.minimumCashBuffer);
  return { alerts: generateLiveAlerts(live.data, summary), source: "live" };
}
