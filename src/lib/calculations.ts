// ---------------------------------------------------------------------------
// Central calculation / forecasting engine.
//
// This is the only place financial numbers get derived. Pages read from
// these functions rather than re-deriving totals themselves, so a number
// means the same thing everywhere it appears on the dashboard.
//
// Hard rule enforced throughout: ACTUAL / COMMITTED / FORECAST / POTENTIAL
// are never summed together into one figure without the caller explicitly
// choosing to (see `cashForecastSeries`, which keeps POTENTIAL out of the
// base/conservative scenarios per spec rule #7 and #46).
// ---------------------------------------------------------------------------

import type {
  Bill,
  Confidence,
  ForecastItem,
  Invoice,
  Job,
  ManagementAlert,
  Opportunity,
  ScenarioAssumptions,
  ScenarioName,
  StressTestInputs,
} from "@/types";
import {
  bankAccounts,
  bills,
  invoices,
  jobs,
  operatingExpenses,
  opportunities,
  paymentSchedules,
  settings,
  TODAY,
} from "./mock-data";
import { addDays, daysBetween, formatDateAU } from "./format";

// ---------------------------------------------------------------------------
// Basic lookups
// ---------------------------------------------------------------------------

export const activeJobs = jobs.filter((j) => j.status !== "complete");
export const completedJobs = jobs.filter((j) => j.status === "complete");

export function getJob(jobId: string): Job | undefined {
  return jobs.find((j) => j.id === jobId);
}

export function jobInvoices(jobId: string): Invoice[] {
  return invoices.filter((i) => i.jobId === jobId);
}

export function jobBills(jobId: string): Bill[] {
  return bills.filter((b) => b.jobId === jobId);
}

export function currentCashBalance(): number {
  return bankAccounts.reduce((sum, b) => sum + b.balance, 0);
}

// ---------------------------------------------------------------------------
// Job costing (spec section 11/12)
// ---------------------------------------------------------------------------

export interface JobCosting {
  jobId: string;
  revisedRevenue: number;
  forecastFinalCost: number;
  originalBudgetRevenue: number;
  originalBudgetCost: number;
  originalBudgetGrossProfit: number;
  originalBudgetMarginPercent: number;
  forecastGrossProfit: number;
  forecastMarginPercent: number;
  grossProfitVariance: number;
  marginVariancePoints: number;
  belowTarget: boolean;
}

export function jobCosting(job: Job): JobCosting {
  const revisedRevenue = job.contractValue + job.approvedVariations;
  const forecastFinalCost = job.actualCost + job.committedCost + job.remainingForecastCost;
  const originalBudgetGrossProfit = job.originalBudgetRevenue - job.originalBudgetCost;
  // Guard against real $0-contract-value records (e.g. Buildxact "STOCK"
  // placeholder jobs, not actual client contracts) producing a meaningless
  // -Infinity/NaN margin - 0% and "not below target" rather than a nonsense
  // number, since there's no revenue to have a margin against.
  const originalBudgetMarginPercent = job.originalBudgetRevenue > 0 ? (originalBudgetGrossProfit / job.originalBudgetRevenue) * 100 : 0;
  const forecastGrossProfit = revisedRevenue - forecastFinalCost;
  const forecastMarginPercent = revisedRevenue > 0 ? (forecastGrossProfit / revisedRevenue) * 100 : 0;

  return {
    jobId: job.id,
    revisedRevenue,
    forecastFinalCost,
    originalBudgetRevenue: job.originalBudgetRevenue,
    originalBudgetCost: job.originalBudgetCost,
    originalBudgetGrossProfit,
    originalBudgetMarginPercent,
    forecastGrossProfit,
    forecastMarginPercent,
    grossProfitVariance: forecastGrossProfit - originalBudgetGrossProfit,
    marginVariancePoints: forecastMarginPercent - originalBudgetMarginPercent,
    belowTarget: revisedRevenue > 0 && forecastMarginPercent < job.marginTargetPercent,
  };
}

// ---------------------------------------------------------------------------
// Job cash position / cash requirement (spec section 13/14)
// ---------------------------------------------------------------------------

export interface JobCashPosition {
  jobId: string;
  contractValue: number; // revised revenue
  cashReceived: number;
  cashSpent: number;
  amountInvoicedToDate: number;
  remainingCost: number; // committed + remaining forecast (future cash cost)
  expectedRemainingRevenue: number; // revised revenue - cash received
  nextPaymentLabel: string | null;
  nextPaymentAmount: number | null;
  nextPaymentDate: string | null;
  cashRequiredToFinish: number; // max(0, remainingCost - expectedRemainingRevenue)
  wip: number; // actual + committed cost not yet invoiced to the client
}

export function jobCashPosition(job: Job): JobCashPosition {
  const jInvoices = jobInvoices(job.id);
  const jBills = jobBills(job.id);
  const costing = jobCosting(job);

  // Draft invoices haven't been sent to the customer yet, so they don't
  // count as issued/committed billing (spec rule #7).
  const issuedInvoices = jInvoices.filter((i) => i.status !== "draft");
  const cashReceived = issuedInvoices.reduce((s, i) => s + i.amountPaid, 0);
  const cashSpent = jBills.reduce((s, b) => s + b.amountPaid, 0);
  const amountInvoicedToDate = issuedInvoices.reduce((s, i) => s + i.amount, 0);

  const remainingCost = job.committedCost + job.remainingForecastCost;
  const expectedRemainingRevenue = costing.revisedRevenue - cashReceived;

  const schedule = paymentSchedules.find((p) => p.jobId === job.id);
  const nextStage = schedule?.stages
    .filter((s) => !s.invoiced)
    .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate))[0];

  const wip = Math.max(0, job.actualCost + job.committedCost - amountInvoicedToDate);

  return {
    jobId: job.id,
    contractValue: costing.revisedRevenue,
    cashReceived,
    cashSpent,
    amountInvoicedToDate,
    remainingCost,
    expectedRemainingRevenue,
    nextPaymentLabel: nextStage?.label ?? null,
    nextPaymentAmount: nextStage
      ? Math.round((nextStage.percentOfContract / 100) * costing.revisedRevenue)
      : null,
    nextPaymentDate: nextStage?.expectedDate ?? null,
    cashRequiredToFinish: Math.max(0, remainingCost - expectedRemainingRevenue),
    wip,
  };
}

export function totalActiveJobCashRequirement(): number {
  return activeJobs.reduce((sum, j) => sum + jobCashPosition(j).cashRequiredToFinish, 0);
}

export function totalWip(): number {
  return activeJobs.reduce((sum, j) => sum + jobCashPosition(j).wip, 0);
}

export type ProgressBucket = "0-25%" | "25-50%" | "50-75%" | "75-100%";

export function wipByProgressBucket(): Record<ProgressBucket, number> {
  const buckets: Record<ProgressBucket, number> = { "0-25%": 0, "25-50%": 0, "50-75%": 0, "75-100%": 0 };
  for (const job of activeJobs) {
    const wip = jobCashPosition(job).wip;
    if (job.progressPercent < 25) buckets["0-25%"] += wip;
    else if (job.progressPercent < 50) buckets["25-50%"] += wip;
    else if (job.progressPercent < 75) buckets["50-75%"] += wip;
    else buckets["75-100%"] += wip;
  }
  return buckets;
}

/** Illustrative trailing trend ending at the current computed total - Phase 1 has
 * no historical WIP snapshots to draw from, so this scales today's figure back
 * to show the shape of a build-up, clearly labelled as illustrative in the UI. */
export function wipTrend(months = 6): { label: string; value: number }[] {
  const current = totalWip();
  const shape = [0.58, 0.66, 0.74, 0.83, 0.91, 1];
  const labels = ["Mar", "Apr", "May", "Jun", "Jul", "Aug"];
  return shape.slice(-months).map((factor, idx) => ({
    label: labels[idx],
    value: Math.round(current * factor),
  }));
}

// ---------------------------------------------------------------------------
// Accounts receivable / payable ageing
// ---------------------------------------------------------------------------

export type AgeingBucket = "current" | "1-7" | "8-30" | "31-60" | "61-90" | "90+";

export function daysOverdue(dueDate: string): number {
  const d = Math.round((new Date(TODAY).getTime() - new Date(dueDate).getTime()) / 86400000);
  return d;
}

export function ageingBucket(dueDate: string): AgeingBucket {
  const d = daysOverdue(dueDate);
  if (d <= 0) return "current";
  if (d <= 7) return "1-7";
  if (d <= 30) return "8-30";
  if (d <= 60) return "31-60";
  if (d <= 90) return "61-90";
  return "90+";
}

export function outstandingInvoices(): Invoice[] {
  // A draft invoice hasn't been issued to the customer yet, so it isn't a
  // real receivable and can't be treated as COMMITTED cash (spec rule #7).
  return invoices.filter((i) => i.amountOutstanding > 0 && i.status !== "void" && i.status !== "draft");
}

export function outstandingBills(): Bill[] {
  return bills.filter((b) => b.amountOutstanding > 0);
}

export function arAgeingSummary() {
  const buckets: Record<AgeingBucket, number> = {
    current: 0, "1-7": 0, "8-30": 0, "31-60": 0, "61-90": 0, "90+": 0,
  };
  for (const inv of outstandingInvoices()) {
    buckets[ageingBucket(inv.dueDate)] += inv.amountOutstanding;
  }
  return buckets;
}

export function totalOverdue(minDays = 0): number {
  return outstandingInvoices()
    .filter((i) => daysOverdue(i.dueDate) > minDays)
    .reduce((s, i) => s + i.amountOutstanding, 0);
}

export function apUpcomingWithin(days: number): number {
  // daysUntilDue is negative for bills already overdue - those still belong
  // in every window (they're due "now" or earlier), so the filter is a
  // straightforward <=, not a match on daysOverdue (which runs the other way).
  return outstandingBills()
    .filter((b) => daysBetween(TODAY, b.dueDate) <= days)
    .reduce((s, b) => s + b.amountOutstanding, 0);
}

// ---------------------------------------------------------------------------
// Operating expenses
// ---------------------------------------------------------------------------

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function opexByMonth() {
  const map = new Map<string, number>();
  for (const e of operatingExpenses) {
    map.set(monthKey(e.date), (map.get(monthKey(e.date)) ?? 0) + e.amount);
  }
  return map;
}

export function currentMonthOpex(): number {
  return opexByMonth().get(monthKey(TODAY)) ?? 0;
}

export function averageMonthlyOpex(): number {
  const byMonth = opexByMonth();
  const values = Array.from(byMonth.values());
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function monthlyFixedCost(): number {
  const months = new Set(operatingExpenses.map((e) => monthKey(e.date)));
  const fixedTotal = operatingExpenses
    .filter((e) => e.classification === "fixed")
    .reduce((s, e) => s + e.amount, 0);
  return fixedTotal / months.size;
}

export function monthlyVariableCost(): number {
  const months = new Set(operatingExpenses.map((e) => monthKey(e.date)));
  const variableTotal = operatingExpenses
    .filter((e) => e.classification === "variable")
    .reduce((s, e) => s + e.amount, 0);
  return variableTotal / months.size;
}

export function revenueRequiredToCoverOpex(avgMarginPercent: number): number {
  return averageMonthlyOpex() / (avgMarginPercent / 100);
}

export interface OpexCategoryRow {
  category: string;
  classification: "fixed" | "variable";
  current: number;
  previous: number;
  ytd: number;
  monthlyAverage: number;
}

export function opexCategoryBreakdown(): OpexCategoryRow[] {
  const currentMonth = monthKey(TODAY);
  const [y, m] = currentMonth.split("-").map(Number);
  const prevDate = new Date(Date.UTC(y, m - 2, 1));
  const previousMonth = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, "0")}`;

  const categories = new Map<string, OpexCategoryRow>();
  const monthsSeen = new Set<string>();

  for (const e of operatingExpenses) {
    monthsSeen.add(monthKey(e.date));
    if (!categories.has(e.category)) {
      categories.set(e.category, {
        category: e.category,
        classification: e.classification,
        current: 0,
        previous: 0,
        ytd: 0,
        monthlyAverage: 0,
      });
    }
    const row = categories.get(e.category)!;
    if (monthKey(e.date) === currentMonth) row.current += e.amount;
    if (monthKey(e.date) === previousMonth) row.previous += e.amount;
    if (e.date.startsWith(TODAY.slice(0, 4))) row.ytd += e.amount;
  }

  const monthCount = monthsSeen.size || 1;
  for (const row of categories.values()) {
    row.monthlyAverage = row.ytd / monthCount;
  }

  return Array.from(categories.values()).sort((a, b) => b.ytd - a.ytd);
}

export function annualisedOpex(): number {
  return averageMonthlyOpex() * 12;
}

// ---------------------------------------------------------------------------
// GHL pipeline
// ---------------------------------------------------------------------------

export function openOpportunities(): Opportunity[] {
  return opportunities.filter((o) => o.stage !== "won" && o.stage !== "lost");
}

export function totalPipelineValue(): number {
  return openOpportunities().reduce((s, o) => s + o.value, 0);
}

export function weightedPipelineValue(): number {
  return openOpportunities().reduce((s, o) => s + (o.value * o.probabilityPercent) / 100, 0);
}

export function expectedDeposit(o: Opportunity): number {
  return o.value * (o.depositPercent / 100);
}

export function weightedExpectedDeposit(o: Opportunity): number {
  return expectedDeposit(o) * (o.probabilityPercent / 100);
}

export function totalWeightedExpectedDeposits(): number {
  return openOpportunities().reduce((s, o) => s + weightedExpectedDeposit(o), 0);
}

// ---------------------------------------------------------------------------
// Forecast item generation
//
// COMMITTED inflow  <- outstanding Xero invoices already issued
// FORECAST inflow   <- payment-schedule stages not yet invoiced (BX schedule)
// POTENTIAL inflow  <- GHL pipeline expected/weighted deposits
// COMMITTED outflow <- outstanding Xero bills (approved or later status)
// FORECAST outflow  <- BX remaining-forecast-cost, spread across remaining
//                       payment-schedule stages (proxy for cost timing)
// FORECAST outflow  <- projected recurring operating expenses
// ---------------------------------------------------------------------------

function clampToday(date: string): string {
  return date < TODAY ? TODAY : date;
}

export function buildForecastItems(): ForecastItem[] {
  const items: ForecastItem[] = [];

  // Committed inflows: invoices already issued, awaiting collection.
  for (const inv of outstandingInvoices()) {
    items.push({
      id: `fc-inv-${inv.id}`,
      source: "xero",
      sourceId: inv.sourceId,
      date: clampToday(inv.dueDate),
      amount: inv.amountOutstanding,
      direction: "inflow",
      category: "customer_receipt",
      jobId: inv.jobId,
      party: inv.customer,
      confidence: "committed",
      status: inv.status === "overdue" ? "Overdue - issued invoice awaiting payment" : "Issued invoice awaiting payment",
      description: `${inv.invoiceNumber} - ${inv.description}`,
    });
  }

  // Forecast inflows: not-yet-invoiced stages on active jobs.
  for (const job of activeJobs) {
    const schedule = paymentSchedules.find((p) => p.jobId === job.id);
    if (!schedule) continue;
    const revisedRevenue = job.contractValue + job.approvedVariations;
    for (const stage of schedule.stages.filter((s) => !s.invoiced)) {
      items.push({
        id: `fc-stage-${stage.id}`,
        source: "buildxact",
        sourceId: stage.id,
        date: clampToday(stage.expectedDate),
        amount: Math.round((stage.percentOfContract / 100) * revisedRevenue),
        direction: "inflow",
        category: "customer_receipt",
        jobId: job.id,
        party: job.client,
        confidence: "forecast",
        status: `Expected on ${stage.triggerDescription.toLowerCase()}`,
        description: `${job.jobNumber} ${job.client} - ${stage.label} (not yet invoiced)`,
      });
    }
  }

  // Potential inflows: GHL pipeline expected deposits.
  for (const opp of openOpportunities()) {
    items.push({
      id: `fc-opp-${opp.id}`,
      source: "ghl",
      sourceId: opp.sourceId,
      date: clampToday(addDays(opp.expectedCloseDate, 7)),
      amount: expectedDeposit(opp),
      direction: "inflow",
      category: "pipeline_deposit",
      party: opp.contact,
      confidence: "potential",
      status: `${opp.stage} - ${opp.probabilityPercent}% probability`,
      description: `${opp.name} - expected deposit (${opp.depositPercent}%)`,
    });
  }

  // Committed outflows: bills outstanding.
  for (const bill of outstandingBills()) {
    const confidence: Confidence = bill.status === "awaiting_approval" ? "forecast" : "committed";
    items.push({
      id: `fc-bill-${bill.id}`,
      source: "xero",
      sourceId: bill.sourceId,
      date: clampToday(bill.dueDate),
      amount: bill.amountOutstanding,
      direction: "outflow",
      category: "supplier_payment",
      jobId: bill.jobId,
      party: bill.supplier,
      confidence,
      status: bill.status === "overdue" ? "Overdue supplier bill" : `Bill ${bill.status.replace("_", " ")}`,
      description: `${bill.billNumber} - ${bill.description}`,
    });
  }

  // Forecast outflows: remaining (not-yet-committed) job costs, spread
  // across the job's remaining payment-schedule stages as a timing proxy.
  for (const job of activeJobs) {
    if (job.remainingForecastCost <= 0) continue;
    const schedule = paymentSchedules.find((p) => p.jobId === job.id);
    const remainingStages = schedule?.stages.filter((s) => !s.invoiced) ?? [];
    const remainingPercentTotal = remainingStages.reduce((s, st) => s + st.percentOfContract, 0);
    if (remainingStages.length === 0 || remainingPercentTotal === 0) {
      items.push({
        id: `fc-cost-${job.id}-lump`,
        source: "buildxact",
        sourceId: `${job.sourceId}-remaining-cost`,
        date: clampToday(job.expectedCompletion),
        amount: job.remainingForecastCost,
        direction: "outflow",
        category: "job_cost",
        jobId: job.id,
        party: job.client,
        confidence: "forecast",
        status: "Estimated cost to complete",
        description: `${job.jobNumber} ${job.client} - forecast cost to complete`,
      });
      continue;
    }
    for (const stage of remainingStages) {
      items.push({
        id: `fc-cost-${job.id}-${stage.id}`,
        source: "buildxact",
        sourceId: `${stage.id}-cost`,
        date: clampToday(stage.expectedDate),
        amount: Math.round((stage.percentOfContract / remainingPercentTotal) * job.remainingForecastCost),
        direction: "outflow",
        category: "job_cost",
        jobId: job.id,
        party: job.client,
        confidence: "forecast",
        status: "Estimated cost to complete",
        description: `${job.jobNumber} ${job.client} - cost to reach ${stage.label}`,
      });
    }
  }

  // Forecast outflows: projected recurring operating expenses (next 3 months).
  const recurring = operatingExpenses.filter((e) => e.recurring);
  const byCategory = new Map<string, { amount: number; dayOfMonth: number; classification: string }>();
  for (const e of recurring) {
    const key = e.category;
    const day = Number(e.date.slice(8, 10));
    const existing = byCategory.get(key);
    if (!existing || e.date > TODAY.slice(0, 4) + "-00-00") {
      byCategory.set(key, { amount: e.amount, dayOfMonth: day, classification: e.classification });
    }
  }
  const [todayY, todayM] = TODAY.split("-").map(Number);
  for (const [category, info] of byCategory) {
    for (let m = 0; m < 3; m++) {
      const base = new Date(Date.UTC(todayY, todayM - 1, 1));
      base.setUTCMonth(base.getUTCMonth() + m + 1, info.dayOfMonth);
      const date = base.toISOString().slice(0, 10);
      items.push({
        id: `fc-opex-${category}-${m}`,
        source: "xero",
        sourceId: `opex-projection-${category}-${m}`,
        date,
        amount: info.amount,
        direction: "outflow",
        category: "operating_expense",
        party: category.replace("_", " "),
        confidence: "forecast",
        status: "Projected recurring operating expense",
        description: `Projected ${category.replace("_", " ")} (based on recent average)`,
      });
    }
  }

  return items.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Scenarios (spec section 30)
// ---------------------------------------------------------------------------

export const SCENARIOS: Record<ScenarioName, ScenarioAssumptions> = {
  conservative: {
    name: "conservative",
    label: "Conservative",
    customerPaymentDelayDays: 14,
    jobCostVariancePercent: 5,
    pipelineIncludedConfidence: ["actual", "committed"],
    pipelineConversionAdjustPercent: -100,
    opexVariancePercent: 5,
    contingencyPercent: 5,
  },
  base: {
    name: "base",
    label: "Base",
    customerPaymentDelayDays: 0,
    jobCostVariancePercent: 0,
    pipelineIncludedConfidence: ["actual", "committed"],
    pipelineConversionAdjustPercent: -100,
    opexVariancePercent: 0,
    contingencyPercent: 0,
  },
  optimistic: {
    name: "optimistic",
    label: "Optimistic",
    customerPaymentDelayDays: -7,
    jobCostVariancePercent: -3,
    pipelineIncludedConfidence: ["actual", "committed", "potential"],
    pipelineConversionAdjustPercent: 15,
    opexVariancePercent: -3,
    contingencyPercent: 0,
  },
};

export function applyScenario(items: ForecastItem[], scenario: ScenarioAssumptions): ForecastItem[] {
  return items
    .filter((i) => scenario.pipelineIncludedConfidence.includes(i.confidence) || i.confidence !== "potential")
    .map((i) => {
      let amount = i.amount;
      let date = i.date;

      if (i.direction === "inflow" && i.category === "customer_receipt" && scenario.customerPaymentDelayDays !== 0) {
        date = clampToday(addDays(date, scenario.customerPaymentDelayDays));
      }
      if (i.direction === "outflow" && i.category === "job_cost" && scenario.jobCostVariancePercent !== 0) {
        amount = Math.round(amount * (1 + scenario.jobCostVariancePercent / 100));
      }
      if (i.direction === "outflow" && i.category === "operating_expense" && scenario.opexVariancePercent !== 0) {
        amount = Math.round(amount * (1 + scenario.opexVariancePercent / 100));
      }
      if (i.confidence === "potential" && i.category === "pipeline_deposit") {
        const adjustedProbability = Math.max(
          0,
          Math.min(100, extractProbability(i.status) + scenario.pipelineConversionAdjustPercent)
        );
        amount = Math.round(amount * (adjustedProbability / 100));
      }
      return { ...i, amount, date };
    })
    .filter((i) => i.amount > 0);
}

function extractProbability(status: string): number {
  const match = status.match(/(\d+)%/);
  return match ? Number(match[1]) : 0;
}

export function applyStressTest(items: ForecastItem[], stress: StressTestInputs): ForecastItem[] {
  let result = items.map((i) => ({ ...i }));

  if (stress.delayedReceiptsAmount > 0 && stress.delayedReceiptsDays > 0) {
    let remaining = stress.delayedReceiptsAmount;
    result = result.map((i) => {
      if (remaining <= 0 || i.direction !== "inflow" || i.confidence === "potential") return i;
      const delayAmount = Math.min(remaining, i.amount);
      remaining -= delayAmount;
      if (delayAmount === i.amount) {
        return { ...i, date: addDays(i.date, stress.delayedReceiptsDays) };
      }
      return i;
    });
  }

  if (stress.jobCostIncreasePercent !== 0) {
    result = result.map((i) =>
      i.direction === "outflow" && i.category === "job_cost"
        ? { ...i, amount: Math.round(i.amount * (1 + stress.jobCostIncreasePercent / 100)) }
        : i
    );
  }

  if (stress.delayedJobIds.length > 0 && stress.delayedJobWeeks !== 0) {
    result = result.map((i) =>
      i.jobId && stress.delayedJobIds.includes(i.jobId)
        ? { ...i, date: addDays(i.date, stress.delayedJobWeeks * 7) }
        : i
    );
  }

  if (stress.pipelineConversionDropPercent !== 0) {
    result = result.map((i) =>
      i.confidence === "potential"
        ? { ...i, amount: Math.round(i.amount * (1 - stress.pipelineConversionDropPercent / 100)) }
        : i
    );
  }

  if (stress.opexIncreaseAmount > 0) {
    result.push({
      id: "stress-opex-increase",
      source: "manual",
      sourceId: "stress-test",
      date: addDays(TODAY, 15),
      amount: stress.opexIncreaseAmount,
      direction: "outflow",
      category: "operating_expense",
      confidence: "forecast",
      status: "Stress test assumption",
      description: "Additional monthly operating expense (stress test)",
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Cash forecast series
// ---------------------------------------------------------------------------

export interface DailyCashPoint {
  date: string;
  openingBalance: number;
  inflows: number;
  outflows: number;
  closingBalance: number;
  items: ForecastItem[];
}

export function cashForecastSeries(
  items: ForecastItem[],
  days: number,
  openingBalance = currentCashBalance(),
  includePotential = false
): DailyCashPoint[] {
  const relevant = includePotential ? items : items.filter((i) => i.confidence !== "potential");
  const series: DailyCashPoint[] = [];
  let running = openingBalance;

  for (let d = 0; d <= days; d++) {
    const date = addDays(TODAY, d);
    const dayItems = relevant.filter((i) => i.date === date);
    const inflows = dayItems.filter((i) => i.direction === "inflow").reduce((s, i) => s + i.amount, 0);
    const outflows = dayItems.filter((i) => i.direction === "outflow").reduce((s, i) => s + i.amount, 0);
    const opening = running;
    running = running + inflows - outflows;
    series.push({ date, openingBalance: opening, inflows, outflows, closingBalance: running, items: dayItems });
  }
  return series;
}

export function weeklySeriesFromDaily(daily: DailyCashPoint[]): DailyCashPoint[] {
  const weeks: DailyCashPoint[] = [];
  for (let i = 0; i < daily.length; i += 7) {
    const chunk = daily.slice(i, i + 7);
    if (chunk.length === 0) continue;
    weeks.push({
      date: chunk[0].date,
      openingBalance: chunk[0].openingBalance,
      inflows: chunk.reduce((s, d) => s + d.inflows, 0),
      outflows: chunk.reduce((s, d) => s + d.outflows, 0),
      closingBalance: chunk[chunk.length - 1].closingBalance,
      items: chunk.flatMap((d) => d.items),
    });
  }
  return weeks;
}

export interface CashForecastSummary {
  today: number;
  day30: number;
  day60: number;
  day90: number;
  minBalance: number;
  minBalanceDate: string;
  bufferBreach: boolean;
  bufferBreachAmount: number;
}

export function summarizeForecast(daily: DailyCashPoint[], buffer: number): CashForecastSummary {
  const today = daily[0]?.openingBalance ?? currentCashBalance();
  const at = (n: number) => daily[Math.min(n, daily.length - 1)]?.closingBalance ?? today;
  let min = daily[0]?.closingBalance ?? today;
  let minDate = daily[0]?.date ?? TODAY;
  for (const point of daily) {
    if (point.closingBalance < min) {
      min = point.closingBalance;
      minDate = point.date;
    }
  }
  return {
    today,
    day30: at(30),
    day60: at(60),
    day90: at(90),
    minBalance: min,
    minBalanceDate: minDate,
    bufferBreach: min < buffer,
    bufferBreachAmount: min < buffer ? buffer - min : 0,
  };
}

// ---------------------------------------------------------------------------
// Alerts (spec section 32/33/36)
// ---------------------------------------------------------------------------

export function generateAlerts(): ManagementAlert[] {
  const alerts: ManagementAlert[] = [];
  const items = buildForecastItems();
  const daily = cashForecastSeries(items, 90);
  const summary = summarizeForecast(daily, settings.minimumCashBuffer);

  if (summary.bufferBreach) {
    alerts.push({
      id: "alert-buffer-breach",
      severity: "critical",
      title: "Cash forecast falls below minimum buffer",
      description: `Projected cash falls to $${Math.round(summary.minBalance).toLocaleString()} on ${formatDateAU(summary.minBalanceDate)}, $${Math.round(summary.bufferBreachAmount).toLocaleString()} below the $${settings.minimumCashBuffer.toLocaleString()} minimum buffer.`,
      href: "/cash-flow",
    });
  }

  for (const job of activeJobs) {
    const pos = jobCashPosition(job);
    if (pos.cashRequiredToFinish > 0) {
      alerts.push({
        id: `alert-job-cash-${job.id}`,
        severity: "critical",
        title: `${job.id} requires additional cash to finish`,
        description: `${job.client} (${job.jobNumber}) requires approximately $${Math.round(pos.cashRequiredToFinish).toLocaleString()} of additional cash${pos.nextPaymentLabel ? ` before the ${pos.nextPaymentLabel} payment` : ""}.`,
        jobId: job.id,
        href: `/jobs/${job.id}`,
      });
    }
    const costing = jobCosting(job);
    if (costing.belowTarget) {
      alerts.push({
        id: `alert-margin-${job.id}`,
        severity: costing.forecastMarginPercent < 10 ? "critical" : "warning",
        title: `${job.id} gross margin below target`,
        description: `${job.client} (${job.jobNumber}) is forecast at ${costing.forecastMarginPercent.toFixed(1)}% margin, below the ${job.marginTargetPercent}% target.`,
        jobId: job.id,
        href: `/jobs/${job.id}`,
      });
    }
    if (costing.forecastFinalCost > costing.revisedRevenue) {
      alerts.push({
        id: `alert-overrun-${job.id}`,
        severity: "critical",
        title: `${job.id} forecast cost exceeds contract value`,
        description: `${job.client} (${job.jobNumber}) forecast final cost of $${Math.round(costing.forecastFinalCost).toLocaleString()} exceeds revised revenue of $${Math.round(costing.revisedRevenue).toLocaleString()}.`,
        jobId: job.id,
        href: `/jobs/${job.id}`,
      });
    }
    if (new Date(job.expectedCompletion) > new Date(job.contractedCompletion)) {
      alerts.push({
        id: `alert-delay-${job.id}`,
        severity: "warning",
        title: `${job.id} completion delayed`,
        description: `${job.client} (${job.jobNumber}) is now expected ${formatDateAU(job.expectedCompletion)}, past the contracted date of ${formatDateAU(job.contractedCompletion)}.`,
        jobId: job.id,
        href: `/jobs/${job.id}`,
      });
    }
  }

  const overdueAmount = totalOverdue(0);
  if (overdueAmount > 0) {
    alerts.push({
      id: "alert-overdue",
      severity: "warning",
      title: "Customer invoices overdue",
      description: `$${Math.round(overdueAmount).toLocaleString()} is currently overdue from customers across ${outstandingInvoices().filter((i) => daysOverdue(i.dueDate) > 0).length} invoices.`,
      href: "/receivables",
    });
  }

  // Supplier payment due before expected customer payment for the same job
  for (const job of activeJobs) {
    const nextBill = jobBills(job.id)
      .filter((b) => b.amountOutstanding > 0)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    const pos = jobCashPosition(job);
    if (nextBill && pos.nextPaymentDate && nextBill.dueDate < pos.nextPaymentDate) {
      alerts.push({
        id: `alert-timing-${job.id}`,
        severity: "warning",
        title: `${job.id} supplier payment due before next customer payment`,
        description: `${nextBill.supplier} bill (${nextBill.billNumber}, $${nextBill.amountOutstanding.toLocaleString()}) is due ${formatDateAU(nextBill.dueDate)}, before the next expected customer payment on ${formatDateAU(pos.nextPaymentDate)}.`,
        jobId: job.id,
        href: `/jobs/${job.id}`,
      });
    }
  }

  const near7 = openOpportunities().filter((o) => {
    const days = Math.round((new Date(o.expectedCloseDate).getTime() - new Date(TODAY).getTime()) / 86400000);
    return days >= 0 && days <= 7 && o.probabilityPercent >= 70;
  });
  for (const opp of near7) {
    alerts.push({
      id: `alert-sales-${opp.id}`,
      severity: "positive",
      title: "Large customer contract expected to close within 7 days",
      description: `${opp.name} ($${opp.value.toLocaleString()}, ${opp.probabilityPercent}% probability) is expected to close by ${formatDateAU(opp.expectedCloseDate)}.`,
      href: "/pipeline",
    });
  }

  const severityOrder: Record<ManagementAlert["severity"], number> = { critical: 0, warning: 1, positive: 2 };
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

// ---------------------------------------------------------------------------
// Portfolio-level KPIs
// ---------------------------------------------------------------------------

export function ytdFinancials(year = TODAY.slice(0, 4)) {
  const ytdInvoices = invoices.filter((i) => i.issueDate.startsWith(year));
  let revenue = 0;
  let cost = 0;
  for (const inv of ytdInvoices) {
    revenue += inv.amount;
    const job = inv.jobId ? getJob(inv.jobId) : undefined;
    const marginPercent = job ? jobCosting(job).forecastMarginPercent : 25;
    cost += inv.amount * (1 - marginPercent / 100);
  }
  const grossProfit = revenue - cost;
  return {
    revenue,
    grossProfit,
    marginPercent: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
  };
}

export function confirmedFutureRevenue(): number {
  return activeJobs.reduce((sum, j) => sum + jobCashPosition(j).expectedRemainingRevenue, 0);
}

// ---------------------------------------------------------------------------
// Cash runway
// ---------------------------------------------------------------------------

export function simpleCashRunwayMonths(): number {
  const burn = averageMonthlyOpex();
  return burn > 0 ? currentCashBalance() / burn : Infinity;
}

export function sophisticatedCashRunwayMonths(): number {
  const items = buildForecastItems().filter((i) => i.confidence !== "potential");
  const monthlyCommittedInflow =
    items.filter((i) => i.direction === "inflow" && i.confidence === "committed").reduce((s, i) => s + i.amount, 0) / 3;
  const monthlyCommittedOutflow =
    items.filter((i) => i.direction === "outflow" && i.confidence === "committed").reduce((s, i) => s + i.amount, 0) / 3;
  const monthlyJobFundingGap = totalActiveJobCashRequirement() / 3;
  const netMonthly = monthlyCommittedInflow - monthlyCommittedOutflow - monthlyJobFundingGap - averageMonthlyOpex();
  if (netMonthly >= 0) return Infinity;
  return currentCashBalance() / Math.abs(netMonthly);
}
