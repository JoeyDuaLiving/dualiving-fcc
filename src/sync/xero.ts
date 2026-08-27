import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { bankAccounts, bills, customers, invoices, jobs, suppliers, syncErrors, syncRuns } from "@/db/schema";
import {
  getBankAccounts,
  getBankSummary,
  getContacts,
  getInvoices,
  getOutstandingBills,
} from "@/integrations/xero/accounting";
import { parseXeroDate } from "@/integrations/xero/mappers";
import type { XeroContact, XeroInvoice } from "@/integrations/xero/types";

// ---------------------------------------------------------------------------
// Xero -> Postgres sync. Same upsert-by-(source,sourceId) approach as the
// Buildxact sync, but batched (insert many rows, ON CONFLICT DO UPDATE) since
// this tenant has ~1,500 invoices and ~1,500 contacts - one-row-at-a-time
// upserts (like the first Buildxact sync used) would be far too slow at
// this volume.
//
// Scope (see integrations/xero/accounting.ts): outstanding bills only, not
// the full ~9,000-record AP history; recent bank transactions aren't synced
// yet at all (not needed for the dashboard's current cash-position views).
//
// Job linking: Xero invoice numbers observed in this tenant carry the
// Buildxact job number as a prefix (e.g. "J1268 - Klein/INV0277") - this
// heuristically extracts that and links to our jobs table where it matches,
// which is real auto-reconciliation, not guessed data (a match either
// exists in both systems or it doesn't; no match just leaves jobId null).
// ---------------------------------------------------------------------------

export interface XeroSyncResult {
  syncRunId: string;
  status: "success" | "partial" | "failed";
  recordsImported: number;
  recordsUpdated: number;
  errorCount: number;
  durationMs: number;
}

const JOB_NUMBER_RE = /\bJ\d{3,5}\b/i;

function extractJobNumber(text: string | undefined): string | null {
  if (!text) return null;
  const match = JOB_NUMBER_RE.exec(text);
  return match ? match[0].toUpperCase() : null;
}

export async function syncXero(): Promise<XeroSyncResult> {
  const startedAt = Date.now();
  const [run] = await db.insert(syncRuns).values({ source: "xero", status: "running" }).returning();

  let recordsImported = 0;
  let recordsUpdated = 0;
  let errorCount = 0;

  async function logError(sourceId: string | undefined, message: string) {
    errorCount++;
    await db.insert(syncErrors).values({ syncRunId: run.id, source: "xero", sourceId, message });
  }

  try {
    // Job number -> internal job id, for the invoice/bill linking heuristic.
    const jobRows = await db.select({ id: jobs.id, jobNumber: jobs.jobNumber }).from(jobs);
    const jobIdByNumber = new Map(jobRows.map((j) => [j.jobNumber.toUpperCase(), j.id]));

    // --- Bank accounts + balances (small - always a full sync) -----------
    try {
      const [accounts, balances] = await Promise.all([getBankAccounts(), getBankSummary()]);
      const balanceByAccountId = new Map(balances.map((b) => [b.accountId, b.closingBalance]));

      for (const account of accounts) {
        if (account.Status !== "ACTIVE") continue; // e.g. the archived duplicate account seen in this tenant
        const [result] = await db
          .insert(bankAccounts)
          .values({
            source: "xero",
            sourceId: account.AccountID,
            name: account.Name,
            balance: balanceByAccountId.get(account.AccountID) ?? 0,
            asOf: new Date(),
            raw: account,
          })
          .onConflictDoUpdate({
            target: [bankAccounts.source, bankAccounts.sourceId],
            set: { name: sql`excluded.name`, balance: sql`excluded.balance`, asOf: sql`excluded.as_of`, raw: sql`excluded.raw`, updatedAt: new Date() },
          })
          .returning({ id: bankAccounts.id, wasNew: sql<boolean>`(xmax = 0)` });
        if (result?.wasNew) recordsImported++;
        else recordsUpdated++;
      }
    } catch (err) {
      await logError(undefined, `Bank accounts: ${err instanceof Error ? err.message : String(err)}`);
    }

    // --- Contacts (customers + suppliers) ---------------------------------
    let customerIdBySourceId = new Map<string, string>();
    let supplierIdBySourceId = new Map<string, string>();
    try {
      const contacts = await getContacts();
      const { customerMap, supplierMap, imported, updated } = await upsertContacts(contacts);
      customerIdBySourceId = customerMap;
      supplierIdBySourceId = supplierMap;
      recordsImported += imported;
      recordsUpdated += updated;
    } catch (err) {
      await logError(undefined, `Contacts: ${err instanceof Error ? err.message : String(err)}`);
    }

    // --- AR invoices -------------------------------------------------------
    try {
      const arInvoices = await getInvoices();
      const { imported, updated } = await upsertInvoices(arInvoices, customerIdBySourceId, jobIdByNumber);
      recordsImported += imported;
      recordsUpdated += updated;
    } catch (err) {
      await logError(undefined, `Invoices: ${err instanceof Error ? err.message : String(err)}`);
    }

    // --- AP bills (outstanding only - see accounting.ts scope note) -------
    try {
      const apBills = await getOutstandingBills();
      const { imported, updated } = await upsertBills(apBills, supplierIdBySourceId, jobIdByNumber);
      recordsImported += imported;
      recordsUpdated += updated;
    } catch (err) {
      await logError(undefined, `Bills: ${err instanceof Error ? err.message : String(err)}`);
    }
  } catch (err) {
    await logError(undefined, `Sync aborted: ${err instanceof Error ? err.message : String(err)}`);
    await db
      .update(syncRuns)
      .set({ status: "failed", finishedAt: new Date(), recordsImported, recordsUpdated, errorSummary: "Sync aborted before completing - see sync_errors" })
      .where(eq(syncRuns.id, run.id));
    return { syncRunId: run.id, status: "failed", recordsImported, recordsUpdated, errorCount, durationMs: Date.now() - startedAt };
  }

  const status: XeroSyncResult["status"] = errorCount === 0 ? "success" : "partial";
  await db
    .update(syncRuns)
    .set({
      status,
      finishedAt: new Date(),
      recordsImported,
      recordsUpdated,
      errorSummary: errorCount > 0 ? `${errorCount} record(s) failed - see sync_errors` : null,
    })
    .where(eq(syncRuns.id, run.id));

  return { syncRunId: run.id, status, recordsImported, recordsUpdated, errorCount, durationMs: Date.now() - startedAt };
}

const BATCH_SIZE = 200;

async function upsertContacts(contacts: XeroContact[]) {
  const customerMap = new Map<string, string>();
  const supplierMap = new Map<string, string>();
  let imported = 0;
  let updated = 0;

  const customerContacts = contacts.filter((c) => c.IsCustomer);
  const supplierContacts = contacts.filter((c) => c.IsSupplier);

  for (let i = 0; i < customerContacts.length; i += BATCH_SIZE) {
    const batch = customerContacts.slice(i, i + BATCH_SIZE);
    const rows = await db
      .insert(customers)
      .values(batch.map((c) => ({ source: "xero", sourceId: c.ContactID, name: c.Name, email: c.EmailAddress, raw: c })))
      .onConflictDoUpdate({
        target: [customers.source, customers.sourceId],
        set: { name: sql`excluded.name`, email: sql`excluded.email`, raw: sql`excluded.raw` },
      })
      .returning({ id: customers.id, sourceId: customers.sourceId, wasNew: sql<boolean>`(xmax = 0)` });
    for (const r of rows) {
      customerMap.set(r.sourceId, r.id);
      if (r.wasNew) imported++;
      else updated++;
    }
  }

  for (let i = 0; i < supplierContacts.length; i += BATCH_SIZE) {
    const batch = supplierContacts.slice(i, i + BATCH_SIZE);
    const rows = await db
      .insert(suppliers)
      .values(batch.map((c) => ({ source: "xero", sourceId: c.ContactID, name: c.Name, raw: c })))
      .onConflictDoUpdate({
        target: [suppliers.source, suppliers.sourceId],
        set: { name: sql`excluded.name`, raw: sql`excluded.raw` },
      })
      .returning({ id: suppliers.id, sourceId: suppliers.sourceId, wasNew: sql<boolean>`(xmax = 0)` });
    for (const r of rows) {
      supplierMap.set(r.sourceId, r.id);
      if (r.wasNew) imported++;
      else updated++;
    }
  }

  return { customerMap, supplierMap, imported, updated };
}

async function upsertInvoices(arInvoices: XeroInvoice[], customerIdBySourceId: Map<string, string>, jobIdByNumber: Map<string, string>) {
  let imported = 0;
  let updated = 0;

  for (let i = 0; i < arInvoices.length; i += BATCH_SIZE) {
    const batch = arInvoices.slice(i, i + BATCH_SIZE);
    const rows = await db
      .insert(invoices)
      .values(
        batch.map((inv) => {
          const jobNumber = extractJobNumber(inv.InvoiceNumber) ?? extractJobNumber(inv.Reference);
          return {
            source: "xero",
            sourceId: inv.InvoiceID,
            customerId: customerIdBySourceId.get(inv.Contact.ContactID) ?? null,
            jobId: jobNumber ? (jobIdByNumber.get(jobNumber) ?? null) : null,
            invoiceNumber: inv.InvoiceNumber,
            amount: inv.Total ?? 0,
            amountPaid: inv.AmountPaid,
            amountOutstanding: inv.AmountDue,
            issueDate: parseXeroDate(inv.Date),
            dueDate: parseXeroDate(inv.DueDate),
            status: inv.Status,
            raw: inv,
          };
        })
      )
      .onConflictDoUpdate({
        target: [invoices.source, invoices.sourceId],
        set: {
          customerId: sql`excluded.customer_id`,
          jobId: sql`excluded.job_id`,
          amount: sql`excluded.amount`,
          amountPaid: sql`excluded.amount_paid`,
          amountOutstanding: sql`excluded.amount_outstanding`,
          dueDate: sql`excluded.due_date`,
          status: sql`excluded.status`,
          raw: sql`excluded.raw`,
          updatedAt: new Date(),
        },
      })
      .returning({ wasNew: sql<boolean>`(xmax = 0)` });
    for (const r of rows) {
      if (r.wasNew) imported++;
      else updated++;
    }
  }

  return { imported, updated };
}

async function upsertBills(apBills: XeroInvoice[], supplierIdBySourceId: Map<string, string>, jobIdByNumber: Map<string, string>) {
  let imported = 0;
  let updated = 0;

  for (let i = 0; i < apBills.length; i += BATCH_SIZE) {
    const batch = apBills.slice(i, i + BATCH_SIZE);
    const rows = await db
      .insert(bills)
      .values(
        batch.map((bill) => {
          const jobNumber = extractJobNumber(bill.InvoiceNumber) ?? extractJobNumber(bill.Reference);
          return {
            source: "xero",
            sourceId: bill.InvoiceID,
            supplierId: supplierIdBySourceId.get(bill.Contact.ContactID) ?? null,
            jobId: jobNumber ? (jobIdByNumber.get(jobNumber) ?? null) : null,
            billNumber: bill.InvoiceNumber,
            amount: bill.Total ?? 0,
            amountPaid: bill.AmountPaid,
            amountOutstanding: bill.AmountDue,
            billDate: parseXeroDate(bill.Date),
            dueDate: parseXeroDate(bill.DueDate),
            status: bill.Status,
            raw: bill,
          };
        })
      )
      .onConflictDoUpdate({
        target: [bills.source, bills.sourceId],
        set: {
          supplierId: sql`excluded.supplier_id`,
          jobId: sql`excluded.job_id`,
          amount: sql`excluded.amount`,
          amountPaid: sql`excluded.amount_paid`,
          amountOutstanding: sql`excluded.amount_outstanding`,
          dueDate: sql`excluded.due_date`,
          status: sql`excluded.status`,
          raw: sql`excluded.raw`,
          updatedAt: new Date(),
        },
      })
      .returning({ wasNew: sql<boolean>`(xmax = 0)` });
    for (const r of rows) {
      if (r.wasNew) imported++;
      else updated++;
    }
  }

  return { imported, updated };
}
