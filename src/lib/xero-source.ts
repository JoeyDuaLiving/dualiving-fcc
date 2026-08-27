import "server-only";
import { eq, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { bankAccounts, bills as billsTable, invoices as invoicesTable, jobs } from "@/db/schema";
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
