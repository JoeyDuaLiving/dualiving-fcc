import type { WhatIfAdjustmentDTO } from "./what-if-source";

// ---------------------------------------------------------------------------
// Long-term (month-by-month, not day-by-day) cash projection for the What
// If page. Projecting a year of individual real line items the way the
// daily 90-day forecast does would mostly be inventing data past ~90 days
// out, so this instead holds a single monthly delta flat forward - an
// explicit, stated assumption ("the current trend continues"), which is
// exactly what a what-if scenario is meant to test changes against.
//
// That delta is the business's own actual trailing-3-month bank cash
// movement (Xero BankSummary closing vs opening balance for that window,
// synced in src/sync/xero.ts and read via loadLiveFinancialYearSummary's
// trailingCashTrendMonthlyDelta) - a real historical average, not a
// forward-looking projection of committed/forecast items (that was this
// module's original approach; changed per business direction 2026-09-18,
// since a forecast-based figure conflated "what's coming" with "what's
// actually been happening").
// ---------------------------------------------------------------------------

export interface MonthlyProjectionPoint {
  monthIndex: number; // 0 = current month
  monthKey: string; // YYYY-MM
  balance: number;
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
