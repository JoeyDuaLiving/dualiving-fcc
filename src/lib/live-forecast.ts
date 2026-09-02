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
import { loadManualStages, type ManualStageRow } from "./manual-stages-source";
import { loadRecurringLiabilities, projectLiabilityOccurrences, type RecurringLiabilityDTO } from "./recurring-liabilities-source";
import { loadQuotedJobs, type QuotedJobDTO } from "./quoted-jobs-source";
import { loadReconciliation, type JobReconciliationRow } from "./reconciliation-source";

// ---------------------------------------------------------------------------
// Live equivalent of the forecast/alerts engine in calculations.ts, built
// from real Buildxact/Xero/GHL data rather than mock-data.ts.
//
// FORECAST inflow timing from payment-schedule stages ("10% deposit, 40%
// frame stage") isn't a Buildxact API field - it's Dualiving's own internal
// invoicing plan per job, so it comes from manual_payment_stages (see
// src/lib/manual-stages-source.ts and the Forecast page's stage manager)
// instead. A job with no manual stages entered yet gets a lump-sum "cost to
// complete" FORECAST outflow instead of one spread across stages, and no
// FORECAST inflow at all - an honest gap until stages are entered, not a
// guess. The "supplier payment due before next customer payment" alert still
// isn't reproduced here, since it needs a *next payment date* per job that
// isn't reliable without every active job having stages entered.
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
  manualStagesByJobId: Map<string, ManualStageRow[]>;
  quotedJobs: QuotedJobDTO[];
  recurringLiabilities: RecurringLiabilityDTO[];
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
  const [jobsResult, receivablesResult, payablesResult, bankResult, opexResult, oppsResult, manualStagesResult, quotedJobsResult, recurringLiabilitiesResult] =
    await Promise.all([
      loadLiveActiveJobsCashPositions(),
      loadLiveReceivables(),
      loadLivePayables(),
      loadLiveBankSummary(),
      loadLiveOperatingExpenses(),
      loadLiveOpenOpportunities(),
      loadManualStages(),
      loadQuotedJobs(),
      loadRecurringLiabilities(),
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
      manualStagesByJobId: manualStagesResult.source === "live" ? manualStagesResult.stagesByJobId : new Map(),
      quotedJobs: quotedJobsResult.source === "live" ? quotedJobsResult.quotedJobs : [],
      recurringLiabilities: recurringLiabilitiesResult.source === "live" ? recurringLiabilitiesResult.liabilities : [],
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

  // Forecast inflows: not-yet-invoiced manual payment stages.
  for (const row of data.jobRows) {
    const stages = data.manualStagesByJobId.get(row.job.id);
    if (!stages) continue;
    const revisedRevenue = jobCosting(row.job).revisedRevenue;
    for (const stage of stages.filter((s) => !s.invoiced)) {
      items.push({
        id: `live-fc-stage-${stage.id}`,
        source: "manual",
        sourceId: stage.id,
        date: clampToday(stage.expectedDate),
        amount: Math.round((stage.percentOfContract / 100) * revisedRevenue),
        direction: "inflow",
        category: "customer_receipt",
        jobId: row.job.id,
        party: row.job.client,
        confidence: "forecast",
        status: stage.triggerDescription ? `Expected on ${stage.triggerDescription.toLowerCase()}` : "Manually entered payment stage",
        description: `${row.job.jobNumber} ${row.job.client} - ${stage.label} (not yet invoiced)`,
      });
    }
  }

  // Forecast inflows: quoted jobs close to starting, not yet a real
  // Buildxact job ("Q1280" style reference). No jobId - there's no jobs.id
  // row to link to yet.
  for (const quoted of data.quotedJobs) {
    for (const stage of quoted.stages) {
      items.push({
        id: `live-fc-quoted-${stage.id}`,
        source: "manual",
        sourceId: stage.id,
        date: clampToday(stage.expectedDate),
        amount: Math.round((stage.percentOfContract / 100) * quoted.estimatedContractValue),
        direction: "inflow",
        category: "customer_receipt",
        party: quoted.client,
        confidence: "forecast",
        status: stage.triggerDescription || "Quoted - not yet a Buildxact job",
        description: `${quoted.reference} ${quoted.client} - ${stage.label} (quoted, not yet a job)`,
      });
    }
  }

  // Forecast outflows: COGS for the same quoted jobs, per business
  // direction (2026-08-28) - 25% of estimated value 2wk after the
  // Manufacturing invoice, another 25% 6wk after that, and a final 25% 2wk
  // after the Final invoice. That's 75% of estimated value as cost,
  // implying a 25% margin - consistent with the marginTargetPercent default
  // used for real Buildxact jobs. Stages are matched by label text rather
  // than a fixed index, since a quote's stages can be edited via the API;
  // a quoted job that's had its Manufacturing or Final stage renamed or
  // removed just gets no COGS items rather than a guessed date.
  for (const quoted of data.quotedJobs) {
    const manufacturing = quoted.stages.find((s) => s.label.toLowerCase().includes("manufactur"));
    const final = quoted.stages.find((s) => s.label.toLowerCase().includes("final"));
    if (!manufacturing || !final) continue;

    const cogsAmount = Math.round(0.25 * quoted.estimatedContractValue);
    const payment1Date = addDays(manufacturing.expectedDate, 14);
    const cogsStages = [
      { label: "COGS payment 1", date: payment1Date, status: "2wk after Manufacturing invoice" },
      { label: "COGS payment 2", date: addDays(payment1Date, 42), status: "6wk after COGS payment 1" },
      { label: "COGS payment 3", date: addDays(final.expectedDate, 14), status: "2wk after Final invoice" },
    ];
    for (const [i, cogs] of cogsStages.entries()) {
      items.push({
        id: `live-fc-quoted-cogs-${quoted.id}-${i}`,
        source: "manual",
        sourceId: quoted.id,
        date: clampToday(cogs.date),
        amount: cogsAmount,
        direction: "outflow",
        category: "job_cost",
        party: quoted.client,
        confidence: "forecast",
        status: cogs.status,
        description: `${quoted.reference} ${quoted.client} - ${cogs.label} (quoted, not yet a job)`,
      });
    }
  }

  // Forecast outflows: remaining job cost, spread across a job's own
  // not-yet-invoiced manual stages when they exist (same weighting as the
  // mock engine), otherwise a single lump sum at expected completion.
  for (const row of data.jobRows) {
    if (row.job.remainingForecastCost <= 0) continue;
    const remainingStages = (data.manualStagesByJobId.get(row.job.id) ?? []).filter((s) => !s.invoiced);
    const remainingPercentTotal = remainingStages.reduce((s, st) => s + st.percentOfContract, 0);

    if (remainingStages.length === 0 || remainingPercentTotal === 0) {
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
      continue;
    }

    for (const stage of remainingStages) {
      items.push({
        id: `live-fc-cost-${row.job.id}-${stage.id}`,
        source: "buildxact",
        sourceId: `${stage.id}-cost`,
        date: clampToday(stage.expectedDate),
        amount: Math.round((stage.percentOfContract / remainingPercentTotal) * row.job.remainingForecastCost),
        direction: "outflow",
        category: "job_cost",
        jobId: row.job.id,
        party: row.job.client,
        confidence: "forecast",
        status: "Estimated cost to complete",
        description: `${row.job.jobNumber} ${row.job.client} - cost to reach ${stage.label}`,
      });
    }
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

  // Forecast outflows: recurring liability repayments (car loans, equipment
  // finance) - real scheduled cash out that never shows up in Xero's P&L
  // (see recurring-liabilities-source.ts), so it has to be projected here
  // from the manually entered schedule rather than from any synced data.
  // Same 90-day projection window as the rest of this forecast.
  const liabilityRangeEnd = addDays(TODAY, 90);
  for (const liability of data.recurringLiabilities) {
    for (const occurrence of projectLiabilityOccurrences(liability, TODAY, liabilityRangeEnd)) {
      items.push({
        id: `live-fc-liability-${liability.id}-${occurrence.date}`,
        source: "manual",
        sourceId: liability.id,
        date: clampToday(occurrence.date),
        amount: occurrence.amount,
        direction: "outflow",
        category: "loan_repayment",
        party: occurrence.description,
        confidence: "forecast",
        status: "Recurring liability repayment - not in Xero P&L",
        description: `${occurrence.description} repayment`,
      });
    }
  }

  return items.sort((a, b) => a.date.localeCompare(b.date));
}

export function generateLiveAlerts(
  data: LiveForecastData,
  forecastSummary: CashForecastSummary,
  reconciliationRows: JobReconciliationRow[] = []
): ManagementAlert[] {
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

  // A per-job "requires additional cash to finish" alert used to fire here
  // for every active job with a gap between committed cost and expected
  // remaining revenue - removed per business direction (2026-08-28): that
  // gap is normal mid-build (materials get ordered ahead of the progress
  // claim that pays for them), not a real problem, so it was pure noise.
  // The aggregate "Cash to complete active jobs" dashboard figure still
  // shows the underlying number without alert-spamming every job that has
  // one.
  for (const row of significantJobRows) {
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

  // Buildxact-vs-Xero mismatches from Reconciliation - same >$5k critical
  // threshold used on that page itself, so an alert here means the same
  // thing it would mean there.
  for (const row of reconciliationRows) {
    if (row.costFlag) {
      alerts.push({
        id: `live-alert-reconciliation-cost-${row.jobId}`,
        severity: Math.abs(row.costVariance) > 5000 ? "critical" : "warning",
        title: `${row.jobNumber} cost variance vs Xero`,
        description: row.costFlag,
        jobId: row.jobId,
        href: `/jobs/${row.jobId}`,
      });
    }
    if (row.revenueFlag) {
      alerts.push({
        id: `live-alert-reconciliation-revenue-${row.jobId}`,
        severity: Math.abs(row.revenueVariance) > 5000 ? "critical" : "warning",
        title: `${row.jobNumber} revenue variance vs Xero`,
        description: row.revenueFlag,
        jobId: row.jobId,
        href: `/jobs/${row.jobId}`,
      });
    }
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
  const [live, reconciliation] = await Promise.all([loadLiveForecastData(), loadReconciliation()]);
  if (live.source !== "live" || !live.data) {
    return { alerts: [], source: "unavailable", error: live.error };
  }
  const items = buildLiveForecastItems(live.data);
  const daily = cashForecastSeries(items, 90, live.data.currentCashBalance);
  const summary = summarizeForecast(daily, settings.minimumCashBuffer);
  const reconciliationRows = reconciliation.source === "live" ? reconciliation.rows : [];
  return { alerts: generateLiveAlerts(live.data, summary, reconciliationRows), source: "live" };
}
