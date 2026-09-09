import "server-only";
import { and, eq, gt, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { bankAccounts, bills, customers, invoices, jobs, operatingExpenses, suppliers, syncErrors, syncRuns } from "@/db/schema";
import {
  getBankAccounts,
  getBankSummary,
  getBillsForOpex,
  getContacts,
  getExpenseAccounts,
  getInvoices,
  getOutstandingBills,
  getSpendTransactions,
} from "@/integrations/xero/accounting";
import { parseXeroDate } from "@/integrations/xero/mappers";
import { classifyOpexCategory } from "@/lib/opex-classification";
import type { XeroAccount, XeroBankTransaction, XeroContact, XeroInvoice } from "@/integrations/xero/types";

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

/** Confirmed live 2026-08-28: this tenant has just started using a "Job
 * Codes" Xero tracking category (real per-line-item tagging, e.g. "J1259"
 * or "J1247 - Frizzell" - not every option is a job, some are overhead
 * buckets like "Administration"), covering ~61% of recent AP bills already.
 * That's a real, intentional match, not a guess off free text, so it takes
 * priority over the InvoiceNumber/Reference regex - the regex stays as a
 * fallback for older bills entered before tracking was adopted. */
function extractJobNumberFromTracking(item: XeroInvoice): string | null {
  for (const line of item.LineItems ?? []) {
    for (const tracking of line.Tracking ?? []) {
      if (tracking.Name !== "Job Codes") continue;
      const jobNumber = extractJobNumber(tracking.Option);
      if (jobNumber) return jobNumber;
    }
  }
  return null;
}

function resolveJobNumber(item: XeroInvoice): string | null {
  return extractJobNumberFromTracking(item) ?? extractJobNumber(item.InvoiceNumber) ?? extractJobNumber(item.Reference);
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
      const { imported, updated, reconciled } = await upsertBills(apBills, supplierIdBySourceId, jobIdByNumber);
      recordsImported += imported;
      recordsUpdated += updated + reconciled;
    } catch (err) {
      await logError(undefined, `Bills: ${err instanceof Error ? err.message : String(err)}`);
    }

    // --- Relink previously-unmatched bills/invoices ------------------------
    // getOutstandingBills() only ever returns currently-unpaid bills (see
    // accounting.ts scope note) - once a bill is paid it drops out of every
    // future sync's fetch window for good, freezing whatever jobId it was
    // given (or not given) the last time it was touched. A bill synced
    // before job-code tracking existed, or before a mapper fix landed, can
    // end up permanently stuck with jobId null even though its own raw
    // payload clearly names a real job. This re-checks every already-stored
    // xero bill/invoice with jobId still null against the job list using
    // today's matching logic, using the raw payload already on hand (no
    // extra Xero API calls) - cheap since the null-jobId set is small, and
    // self-healing for any future matching improvement too.
    try {
      const relinked = await relinkOrphanedJobRecords(jobIdByNumber);
      recordsUpdated += relinked;
    } catch (err) {
      await logError(undefined, `Relink orphaned records: ${err instanceof Error ? err.message : String(err)}`);
    }

    // --- Operating expenses (bank spend txns + bills, DIRECTCOSTS excluded)
    // Two Xero objects can both recognise an expense: a direct bank spend
    // (e.g. card purchases), or a Bill from a supplier (e.g. rent, invoiced
    // monthly by a property manager) - confirmed live that this tenant's
    // real "Rent" P&L line comes entirely from Bills, not bank transactions,
    // so both sources are needed to match what Xero's own P&L shows.
    try {
      const [expenseAccounts, spendTxns, opexBills] = await Promise.all([getExpenseAccounts(), getSpendTransactions(), getBillsForOpex()]);
      const { imported, updated } = await upsertOperatingExpenses(expenseAccounts, spendTxns, opexBills);
      recordsImported += imported;
      recordsUpdated += updated;
    } catch (err) {
      await logError(undefined, `Operating expenses: ${err instanceof Error ? err.message : String(err)}`);
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
          const jobNumber = resolveJobNumber(inv);
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
          const jobNumber = resolveJobNumber(bill);
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

  // Reconcile bills that dropped off Xero's outstanding-bills feed.
  // getOutstandingBills() filters Status!="PAID" server-side, so once a
  // bill is paid it simply stops being returned here - forever. Without
  // this step, our copy stays frozen at its last-known unpaid amount
  // permanently (confirmed live 2026-09-07: 79 such "ghost" bills had
  // accumulated, worth ~$66k of AP that had actually already been paid
  // off in Xero). Anything still marked outstanding in our database that
  // Xero didn't just return in this fetch has been resolved since it was
  // last seen.
  let reconciled = 0;
  if (apBills.length > 0) {
    const currentSourceIds = apBills.map((b) => b.InvoiceID);
    const result = await db
      .update(bills)
      .set({ amountOutstanding: 0, status: "PAID", updatedAt: new Date() })
      .where(and(eq(bills.source, "xero"), gt(bills.amountOutstanding, 0), notInArray(bills.sourceId, currentSourceIds)))
      .returning({ id: bills.id });
    reconciled = result.length;
  }

  return { imported, updated, reconciled };
}

async function relinkOrphanedJobRecords(jobIdByNumber: Map<string, string>): Promise<number> {
  let relinked = 0;

  const orphanBills = await db
    .select({ id: bills.id, raw: bills.raw })
    .from(bills)
    .where(and(eq(bills.source, "xero"), isNull(bills.jobId)));
  for (const row of orphanBills) {
    const jobNumber = resolveJobNumber(row.raw as XeroInvoice);
    const jobId = jobNumber ? jobIdByNumber.get(jobNumber) : undefined;
    if (!jobId) continue;
    await db.update(bills).set({ jobId, updatedAt: new Date() }).where(eq(bills.id, row.id));
    relinked++;
  }

  const orphanInvoices = await db
    .select({ id: invoices.id, raw: invoices.raw })
    .from(invoices)
    .where(and(eq(invoices.source, "xero"), isNull(invoices.jobId)));
  for (const row of orphanInvoices) {
    const jobNumber = resolveJobNumber(row.raw as XeroInvoice);
    const jobId = jobNumber ? jobIdByNumber.get(jobNumber) : undefined;
    if (!jobId) continue;
    await db.update(invoices).set({ jobId, updatedAt: new Date() }).where(eq(invoices.id, row.id));
    relinked++;
  }

  return relinked;
}

interface OperatingExpenseRow {
  source: string;
  sourceId: string;
  category: string;
  classification: "fixed" | "variable";
  description: string | null;
  amount: number;
  date: Date;
  recurring: boolean;
  raw: unknown;
}

async function upsertOperatingExpenses(expenseAccounts: XeroAccount[], spendTxns: XeroBankTransaction[], opexBills: XeroInvoice[]) {
  let imported = 0;
  let updated = 0;

  const accountByCode = new Map(expenseAccounts.filter((a) => a.Code).map((a) => [a.Code, a]));
  const rows: OperatingExpenseRow[] = [];
  const monthsByCategory = new Map<string, Set<string>>();

  function addLine(sourceId: string, accountCode: string | undefined, lineAmount: number, description: string | undefined, date: Date, raw: unknown) {
    const account = accountCode ? accountByCode.get(accountCode) : undefined;
    // Job costs (DIRECTCOSTS) are already captured via Buildxact's
    // actualCost/committedCost - counting them again here would
    // double-count the same spend under a different category.
    if (!account || account.Type === "DIRECTCOSTS") return;

    const category = account.Name;
    const monthKey = date.toISOString().slice(0, 7);
    rows.push({
      source: "xero",
      sourceId,
      category,
      // Not Xero's own account Type - see opex-classification.ts for why.
      classification: classifyOpexCategory(category),
      description: description ?? null,
      amount: lineAmount,
      date,
      recurring: false, // filled in below once every category's spread across months is known
      raw,
    });

    if (!monthsByCategory.has(category)) monthsByCategory.set(category, new Set());
    monthsByCategory.get(category)!.add(monthKey);
  }

  for (const txn of spendTxns) {
    const date = parseXeroDate(txn.Date);
    if (!date) continue;
    for (const line of txn.LineItems ?? []) {
      addLine(`${txn.BankTransactionID}-${line.LineItemID}`, line.AccountCode, line.LineAmount, line.Description, date, { transaction: txn, lineItem: line });
    }
  }

  // Some real recurring expenses (e.g. rent, invoiced monthly by a property
  // manager) are recognised via a Bill rather than a direct bank spend - see
  // accounting.ts's getBillsForOpex note.
  for (const bill of opexBills) {
    const date = parseXeroDate(bill.Date);
    if (!date) continue;
    for (const line of bill.LineItems ?? []) {
      addLine(`${bill.InvoiceID}-${line.LineItemID}`, line.AccountCode, line.LineAmount, line.Description, date, { bill, lineItem: line });
    }
  }

  // A category counts as recurring if it shows spend in at least 2 of the
  // trailing 3 calendar months - a real, data-driven signal for which
  // categories are worth projecting forward, not a guess.
  const now = new Date();
  const recentMonths = new Set<string>();
  for (let i = 0; i < 3; i++) {
    recentMonths.add(new Date(now.getFullYear(), now.getMonth() - i, 1).toISOString().slice(0, 7));
  }
  const recurringCategories = new Set(
    [...monthsByCategory.entries()]
      .filter(([, months]) => [...months].filter((m) => recentMonths.has(m)).length >= 2)
      .map(([category]) => category)
  );
  for (const row of rows) row.recurring = recurringCategories.has(row.category);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const result = await db
      .insert(operatingExpenses)
      .values(batch)
      .onConflictDoUpdate({
        target: [operatingExpenses.source, operatingExpenses.sourceId],
        set: {
          category: sql`excluded.category`,
          classification: sql`excluded.classification`,
          description: sql`excluded.description`,
          amount: sql`excluded.amount`,
          date: sql`excluded.date`,
          recurring: sql`excluded.recurring`,
          raw: sql`excluded.raw`,
        },
      })
      .returning({ wasNew: sql<boolean>`(xmax = 0)` });
    for (const r of result) {
      if (r.wasNew) imported++;
      else updated++;
    }
  }

  return { imported, updated };
}
