import type { WhatIfAdjustmentDTO } from "./what-if-source";

// ---------------------------------------------------------------------------
// Long-term (month-by-month, not day-by-day) cash projection for the What
// If page. The daily 90-day forecast engine (calculations.ts /
// live-forecast.ts) already models every real committed/forecast item it
// knows about, but that granular item list only reaches ~90 days out -
// projecting a year of individual line items would mostly be inventing
// data. Instead, this takes the business's own current net monthly cash
// trend from that same 90-day forecast (day 90 balance vs today, spread
// over 3 months) and holds it flat forward - an explicit, stated
// assumption ("the current trajectory continues"), which is exactly what a
// what-if scenario is meant to test changes against.
// ---------------------------------------------------------------------------

export interface MonthlyProjectionPoint {
  monthIndex: number; // 0 = current month
  monthKey: string; // YYYY-MM
  balance: number;
}

/** (day90 - today) / 3 from the live 90-day forecast - the business's own
 * current net monthly cash trend (revenue collections and job costs and
 * opex and recurring liabilities, all already modelled), not a separate
 * guess. */
export function baselineMonthlyDelta(todayBalance: number, day90Balance: number): number {
  return (day90Balance - todayBalance) / 3;
}

function monthKeyAt(startFrom: string, monthsAhead: number): string {
  const [y, m] = startFrom.slice(0, 7).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + monthsAhead, 1));
  return date.toISOString().slice(0, 7);
}

function isAdjustmentActive(adjustment: WhatIfAdjustmentDTO, monthKey: string): boolean {
  return monthKey >= adjustment.startDate.slice(0, 7) && (!adjustment.endDate || monthKey <= adjustment.endDate.slice(0, 7));
}

/** Projects month 0 (today's real balance) through `horizonMonths` ahead,
 * applying the baseline trend every month plus whichever adjustments are
 * active that month (by their own start/end dates) - an empty adjustments
 * array reproduces the plain baseline trend. */
export function projectMonthlyBalance(
  currentBalance: number,
  monthlyDelta: number,
  adjustments: WhatIfAdjustmentDTO[],
  horizonMonths: number,
  startFrom: string
): MonthlyProjectionPoint[] {
  const points: MonthlyProjectionPoint[] = [{ monthIndex: 0, monthKey: monthKeyAt(startFrom, 0), balance: currentBalance }];
  let balance = currentBalance;

  for (let i = 1; i <= horizonMonths; i++) {
    const monthKey = monthKeyAt(startFrom, i);
    const activeAdjustmentsTotal = adjustments.filter((a) => isAdjustmentActive(a, monthKey)).reduce((s, a) => s + a.monthlyAmount, 0);
    balance = balance + monthlyDelta - activeAdjustmentsTotal;
    points.push({ monthIndex: i, monthKey, balance });
  }
  return points;
}

/** First month a projection drops below `buffer`, or null if it never does
 * within the projected horizon. */
export function firstMonthBelowBuffer(points: MonthlyProjectionPoint[], buffer: number): MonthlyProjectionPoint | null {
  return points.find((p) => p.balance < buffer) ?? null;
}
