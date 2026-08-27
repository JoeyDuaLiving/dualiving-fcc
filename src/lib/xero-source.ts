import "server-only";
import { eq, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { bankAccounts, bills as billsTable, invoices as invoicesTable, jobs, operatingExpenses } from "@/db/schema";
import type { XeroInvoice } from "@/integrations/xero/types";
import { ageingBucket, daysOverdue, type AgeingBucket } from "@/lib/calculations";
import { daysBetween } from "@/lib/format";
import { TODAY } from "@/lib/mock-data";

// ---------------------------------------------------------------------------
// Reads live Xero data from Postgres (populated by src/sync/xero.ts) - same
// "read from the database, not the live API" pattern as jobs-source.ts, and
// for the same reason: keeps page loads fast and off Xero's rate limit.
//
// Reuses ageingBucket()/daysOverdue() from calculations.ts rather than
// duplicating the bucket logic - those are pure functions of a due date
// against the app's `TODAY` reference, which is not mock-specific data, just
// the app's anchor for "now" (it happens to equal the real current date).
// ---------------------------------------------------------------------------

export interface LiveBankSummary {
  totalBalance: number;
  accounts: { name: string; balance: number; asOf: string }[];
  source: "live" | "unavailable";
  error?: string;
}

export async function loadLiveBankSummary(): Promise<LiveBankSummary> {
  try {
    const rows = await db.select().from(bankAccounts).where(eq(bankAccounts.source, "xero"));
    if (rows.length === 0) {
      return { totalBalance: 0, accounts: [], source: "unavailable", error: "No Xero bank accounts synced yet." };
    }
    return {
      totalBalance: rows.reduce((s, r) => s + r.balance, 0),
      accounts: rows.map((r) => ({ name: r.name, balance: r.balance, asOf: r.asOf.toISOString() })),
      source: "live",
    };
  } catch (err) {
    return { totalBalance: 0, accounts: [], source: "unavailable", error: err instanceof Error ? err.message : "Unknown error reading the database" };
  }
}

export interface LiveInvoice {
  id: string;
  invoiceNumber: string;
  customer: string;
  jobId: string | null;
  jobNumber: string | null;
  amount: number;
  amountOutstanding: number;
  dueDate: string; // YYYY-MM-DD
  status: string;
}

export interface LiveReceivablesResult {
  invoices: LiveInvoice[];
  source: "live" | "unavailable";
  error?: string;
}

function toDateOnly(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : TODAY;
}

export async function loadLiveReceivables(): Promise<LiveReceivablesResult> {
  try {
    const outstandingRows = await db.select().from(invoicesTable).where(gt(invoicesTable.amountOutstanding, 0));

    if (outstandingRows.length === 0) {
      const [any] = await db.select({ id: invoicesTable.id }).from(invoicesTable).where(eq(invoicesTable.source, "xero")).limit(1);
      if (!any) return { invoices: [], source: "unavailable", error: "No Xero invoices synced yet." };
    }

    // jobId on the invoice row is our internal job id (for the FK) - map it
    // back to Buildxact's job GUID (used in URLs, see jobs-source.ts) and its
    // human-readable job number (for display - the GUID alone is meaningless
    // in a table cell).
    const jobById = new Map(
      (await db.select({ id: jobs.id, sourceId: jobs.sourceId, jobNumber: jobs.jobNumber }).from(jobs)).map((j) => [
        j.id,
        { sourceId: j.sourceId, jobNumber: j.jobNumber },
      ])
    );

    const result: LiveInvoice[] = outstandingRows.map((row) => {
      const raw = row.raw as XeroInvoice | null;
      const job = row.jobId ? jobById.get(row.jobId) : undefined;
      return {
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        customer: raw?.Contact?.Name ?? "Unknown",
        jobId: job?.sourceId ?? null,
        jobNumber: job?.jobNumber ?? null,
        amount: row.amount,
        amountOutstanding: row.amountOutstanding,
        dueDate: toDateOnly(row.dueDate),
        status: row.status,
      };
    });

    return { invoices: result.sort((a, b) => a.dueDate.localeCompare(b.dueDate)), source: "live" };
  } catch (err) {
    return { invoices: [], source: "unavailable", error: err instanceof Error ? err.message : "Unknown error reading the database" };
  }
}

export function liveArAgeingSummary(invoices: LiveInvoice[]): Record<AgeingBucket, number> {
  const buckets: Record<AgeingBucket, number> = { current: 0, "1-7": 0, "8-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  for (const inv of invoices) buckets[ageingBucket(inv.dueDate)] += inv.amountOutstanding;
  return buckets;
}

export function liveTotalOverdue(invoices: LiveInvoice[], minDays = 0): number {
  return invoices.filter((i) => daysOverdue(i.dueDate) > minDays).reduce((s, i) => s + i.amountOutstanding, 0);
}

export interface LiveBill {
  id: string;
  billNumber: string;
  supplier: string;
  jobId: string | null;
  jobNumber: string | null;
  amount: number;
  amountOutstanding: number;
  dueDate: string;
  status: string;
}

export interface LivePayablesResult {
  bills: LiveBill[];
  source: "live" | "unavailable";
  error?: string;
}

export async function loadLivePayables(): Promise<LivePayablesResult> {
  try {
    const rows = await db.select().from(billsTable).where(gt(billsTable.amountOutstanding, 0));
    if (rows.length === 0) {
      const [any] = await db.select({ id: billsTable.id }).from(billsTable).where(eq(billsTable.source, "xero")).limit(1);
      if (!any) return { bills: [], source: "unavailable", error: "No Xero bills synced yet." };
    }

    const jobById = new Map(
      (await db.select({ id: jobs.id, sourceId: jobs.sourceId, jobNumber: jobs.jobNumber }).from(jobs)).map((j) => [
        j.id,
        { sourceId: j.sourceId, jobNumber: j.jobNumber },
      ])
    );

    const result: LiveBill[] = rows.map((row) => {
      const raw = row.raw as XeroInvoice | null;
      const job = row.jobId ? jobById.get(row.jobId) : undefined;
      return {
        id: row.id,
        billNumber: row.billNumber,
        supplier: raw?.Contact?.Name ?? "Unknown",
        jobId: job?.sourceId ?? null,
        jobNumber: job?.jobNumber ?? null,
        amount: row.amount,
        amountOutstanding: row.amountOutstanding,
        dueDate: toDateOnly(row.dueDate),
        status: row.status,
      };
    });

    return { bills: result.sort((a, b) => a.dueDate.localeCompare(b.dueDate)), source: "live" };
  } catch (err) {
    return { bills: [], source: "unavailable", error: err instanceof Error ? err.message : "Unknown error reading the database" };
  }
}

export function liveApUpcomingWithin(bills: LiveBill[], days: number): number {
  return bills.filter((b) => daysBetween(TODAY, b.dueDate) <= days).reduce((s, b) => s + b.amountOutstanding, 0);
}

export interface LiveOperatingExpense {
  category: string;
  classification: "fixed" | "variable";
  description: string | null;
  amount: number;
  date: string; // YYYY-MM-DD
  recurring: boolean;
}

export interface LiveOperatingExpensesResult {
  expenses: LiveOperatingExpense[];
  source: "live" | "unavailable";
  error?: string;
}

/** Populated by src/sync/xero.ts's opex step (spend transactions, DIRECTCOSTS
 * accounts excluded - see that file for why). */
export async function loadLiveOperatingExpenses(): Promise<LiveOperatingExpensesResult> {
  try {
    const rows = await db.select().from(operatingExpenses).where(eq(operatingExpenses.source, "xero"));
    if (rows.length === 0) {
      return { expenses: [], source: "unavailable", error: "No Xero operating expenses synced yet." };
    }
    return {
      expenses: rows.map((r) => ({
        category: r.category,
        classification: r.classification as "fixed" | "variable",
        description: r.description,
        amount: r.amount,
        date: toDateOnly(r.date),
        recurring: r.recurring,
      })),
      source: "live",
    };
  } catch (err) {
    return { expenses: [], source: "unavailable", error: err instanceof Error ? err.message : "Unknown error reading the database" };
  }
}

// ---------------------------------------------------------------------------
// Live opex aggregates - same logic as the mock opex functions in
// calculations.ts, operating on the already-loaded LiveOperatingExpense[]
// instead of the module-level mock array.
// ---------------------------------------------------------------------------

function opexMonthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function liveOpexByMonth(expenses: LiveOperatingExpense[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of expenses) map.set(opexMonthKey(e.date), (map.get(opexMonthKey(e.date)) ?? 0) + e.amount);
  return map;
}

export function liveCurrentMonthOpex(expenses: LiveOperatingExpense[]): number {
  return liveOpexByMonth(expenses).get(opexMonthKey(TODAY)) ?? 0;
}

/** Excludes the current, still-in-progress month - a partial month's lower
 * total would otherwise drag the average down purely because the month
 * isn't over yet, not because spend is actually lower. "Current month" is
 * already shown as its own figure elsewhere on the page. */
export function liveAverageMonthlyOpex(expenses: LiveOperatingExpense[]): number {
  const currentMonth = opexMonthKey(TODAY);
  const completeMonths = Array.from(liveOpexByMonth(expenses).entries()).filter(([month]) => month !== currentMonth);
  return completeMonths.length ? completeMonths.reduce((s, [, v]) => s + v, 0) / completeMonths.length : 0;
}

export function liveMonthlyFixedCost(expenses: LiveOperatingExpense[]): number {
  const currentMonth = opexMonthKey(TODAY);
  const completeExpenses = expenses.filter((e) => opexMonthKey(e.date) !== currentMonth);
  const months = new Set(completeExpenses.map((e) => opexMonthKey(e.date)));
  const fixedTotal = completeExpenses.filter((e) => e.classification === "fixed").reduce((s, e) => s + e.amount, 0);
  return months.size ? fixedTotal / months.size : 0;
}

export function liveMonthlyVariableCost(expenses: LiveOperatingExpense[]): number {
  const currentMonth = opexMonthKey(TODAY);
  const completeExpenses = expenses.filter((e) => opexMonthKey(e.date) !== currentMonth);
  const months = new Set(completeExpenses.map((e) => opexMonthKey(e.date)));
  const variableTotal = completeExpenses.filter((e) => e.classification === "variable").reduce((s, e) => s + e.amount, 0);
  return months.size ? variableTotal / months.size : 0;
}

export function liveAnnualisedOpex(expenses: LiveOperatingExpense[]): number {
  return liveAverageMonthlyOpex(expenses) * 12;
}

export function liveRevenueRequiredToCoverOpex(expenses: LiveOperatingExpense[], avgMarginPercent: number): number {
  return liveAverageMonthlyOpex(expenses) / (avgMarginPercent / 100);
}

export interface LiveOpexCategoryRow {
  category: string;
  classification: "fixed" | "variable";
  current: number;
  previous: number;
  ytd: number;
  monthlyAverage: number;
}

export function liveOpexCategoryBreakdown(expenses: LiveOperatingExpense[]): LiveOpexCategoryRow[] {
  const currentMonth = opexMonthKey(TODAY);
  const [y, m] = currentMonth.split("-").map(Number);
  const prevDate = new Date(Date.UTC(y, m - 2, 1));
  const previousMonth = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, "0")}`;

  const categories = new Map<string, LiveOpexCategoryRow>();
  // monthlyAverage is spend over complete months only, divided by the same
  // count of complete months for every category - not "ytd" divided by
  // however many months of data happen to be on hand. Those two used to be
  // mismatched (a YTD-2026-only numerator divided by a denominator that
  // included months from 2025), which understated every category's average
  // by roughly half.
  const completeMonthTotals = new Map<string, number>();
  const completeMonthsSeen = new Set<string>();

  for (const e of expenses) {
    const monthKey = opexMonthKey(e.date);
    if (!categories.has(e.category)) {
      categories.set(e.category, { category: e.category, classification: e.classification, current: 0, previous: 0, ytd: 0, monthlyAverage: 0 });
    }
    const row = categories.get(e.category)!;
    if (monthKey === currentMonth) row.current += e.amount;
    if (monthKey === previousMonth) row.previous += e.amount;
    if (e.date.startsWith(TODAY.slice(0, 4))) row.ytd += e.amount;
    if (monthKey !== currentMonth) {
      completeMonthTotals.set(e.category, (completeMonthTotals.get(e.category) ?? 0) + e.amount);
      completeMonthsSeen.add(monthKey);
    }
  }

  const monthCount = completeMonthsSeen.size || 1;
  for (const row of categories.values()) row.monthlyAverage = (completeMonthTotals.get(row.category) ?? 0) / monthCount;

  return Array.from(categories.values()).sort((a, b) => b.ytd - a.ytd);
}
