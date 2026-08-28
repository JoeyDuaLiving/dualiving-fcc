import "server-only";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { bills, invoices, jobInvoicePayments, jobs, purchaseOrders, syncRuns } from "@/db/schema";
import type { BuildxactJob, BuildxactJobInvoice, BuildxactPurchaseOrder } from "@/integrations/buildxact/types";
import type { XeroInvoice } from "@/integrations/xero/types";
import type { ManualStageRow } from "@/lib/manual-stages-source";
import { STOCK_JOB_NUMBER } from "@/lib/stock-source";
import type { Job, JobStatus } from "@/types";

// ---------------------------------------------------------------------------
// Reads live job data from Postgres (populated by src/sync/buildxact.ts),
// not from the Buildxact API directly - that keeps every page load fast and
// off Buildxact's rate limit. The API is only ever called by the sync job
// now (see /api/sync/buildxact, triggered from Settings or `npm run
// sync:buildxact`).
//
// Scope note (2026-08-27): only the Jobs list + a live job detail view read
// from the database so far. Cash-required/WIP/margin across the rest of the
// dashboard (Cash Flow, Alerts, Expenses, etc.) still runs on Phase 1 mock
// data, since those depend on invoice/bill records that are cross-referenced
// by ID with the mock dataset and would silently produce wrong numbers if
// fed real Buildxact job IDs without the matching Xero data behind them.
// ---------------------------------------------------------------------------

type JobRow = typeof jobs.$inferSelect;

function dbJobToJob(row: JobRow): Job {
  return {
    id: row.sourceId, // Buildxact's own job GUID - stable across re-syncs
    source: "buildxact",
    sourceId: row.sourceId,
    jobNumber: row.jobNumber,
    client: row.client,
    product: row.product,
    status: row.status as JobStatus,
    location: row.location ?? "",
    contractValue: row.contractValue,
    approvedVariations: row.approvedVariations,
    originalBudgetRevenue: row.originalBudgetRevenue,
    originalBudgetCost: row.originalBudgetCost,
    actualCost: row.actualCost,
    committedCost: row.committedCost,
    remainingForecastCost: row.remainingForecastCost,
    progressPercent: row.progressPercent,
    startDate: row.startDate?.toISOString() ?? "",
    expectedCompletion: row.expectedCompletion?.toISOString() ?? "",
    contractedCompletion: row.contractedCompletion?.toISOString() ?? "",
    paymentScheduleId: row.sourceId,
    marginTargetPercent: row.marginTargetPercent,
    // Not available at this cost granularity from Buildxact - see
    // integrations/buildxact/mappers.ts for the same caveat.
    directCostBreakdown: { labour: 0, materials: 0, subcontractors: 0, freight: 0, engineering: 0, siteCosts: 0, other: 0 },
  };
}

export interface LiveJobsListResult {
  jobs: Job[];
  // Keyed by Job.id (Buildxact sourceId) - sum of that job's invoice/payment
  // records with status "Received" (payment actually received), for a
  // to-date profit figure that isn't just the full contract value.
  cashReceivedByJobId: Map<string, number>;
  // Xero bills/invoices matched to this job by job code (see
  // src/sync/xero.ts resolveJobNumber) - shown as a reference cross-check
  // against Buildxact's own actualCost/contractValue, not used in any
  // calculation on this page. Keyed by Job.id (Buildxact sourceId).
  xeroBillsByJobId: Map<string, number>;
  xeroInvoicesByJobId: Map<string, number>;
  source: "live" | "unavailable";
  error?: string;
  lastSyncedAt?: string;
}

/** Reads the synced job list from Postgres. Returns source: "unavailable"
 * (not an error) when nothing has been synced yet or the database can't be
 * reached - the caller decides whether to show the mock Jobs/WIP dashboard
 * instead. */
export async function loadLiveJobsList(): Promise<LiveJobsListResult> {
  try {
    // Newest first by creation date, matching Buildxact's own job list order
    // - not updatedAt, which just reflects whichever jobs the last sync
    // happened to touch and isn't a meaningful business order. J1057
    // (STOCK) is a bulk-purchasing placeholder, not a real job - see
    // stock-source.ts, which has its own dedicated page.
    const rows = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.source, "buildxact"), ne(jobs.jobNumber, STOCK_JOB_NUMBER)))
      .orderBy(desc(jobs.startDate));
    if (rows.length === 0) {
      return {
        jobs: [],
        cashReceivedByJobId: new Map(),
        xeroBillsByJobId: new Map(),
        xeroInvoicesByJobId: new Map(),
        source: "unavailable",
        error: "No Buildxact jobs synced yet - run a sync from Settings.",
      };
    }

    const jobRowIds = rows.map((r) => r.id);
    const [lastRun, invRows, billRows, xeroInvoiceRows] = await Promise.all([
      db
        .select({ finishedAt: syncRuns.finishedAt })
        .from(syncRuns)
        .where(eq(syncRuns.source, "buildxact"))
        .orderBy(desc(syncRuns.startedAt))
        .limit(1)
        .then((r) => r[0]),
      db
        .select({ jobId: jobInvoicePayments.jobId, totalIncTax: jobInvoicePayments.totalIncTax })
        .from(jobInvoicePayments)
        .where(and(inArray(jobInvoicePayments.jobId, jobRowIds), eq(jobInvoicePayments.status, "Received"))),
      db
        .select({ jobId: bills.jobId, amount: bills.amount })
        .from(bills)
        .where(and(inArray(bills.jobId, jobRowIds), eq(bills.source, "xero"))),
      db
        .select({ jobId: invoices.jobId, amount: invoices.amount })
        .from(invoices)
        .where(and(inArray(invoices.jobId, jobRowIds), eq(invoices.source, "xero"))),
    ]);

    const sourceIdByRowId = new Map(rows.map((r) => [r.id, r.sourceId]));
    const cashReceivedByJobId = new Map<string, number>();
    for (const inv of invRows) {
      if (!inv.jobId) continue;
      const sourceId = sourceIdByRowId.get(inv.jobId);
      if (!sourceId) continue;
      cashReceivedByJobId.set(sourceId, (cashReceivedByJobId.get(sourceId) ?? 0) + inv.totalIncTax);
    }
    const xeroBillsByJobId = new Map<string, number>();
    for (const b of billRows) {
      if (!b.jobId) continue;
      const sourceId = sourceIdByRowId.get(b.jobId);
      if (!sourceId) continue;
      xeroBillsByJobId.set(sourceId, (xeroBillsByJobId.get(sourceId) ?? 0) + b.amount);
    }
    const xeroInvoicesByJobId = new Map<string, number>();
    for (const inv of xeroInvoiceRows) {
      if (!inv.jobId) continue;
      const sourceId = sourceIdByRowId.get(inv.jobId);
      if (!sourceId) continue;
      xeroInvoicesByJobId.set(sourceId, (xeroInvoicesByJobId.get(sourceId) ?? 0) + inv.amount);
    }

    return {
      jobs: rows.map(dbJobToJob),
      cashReceivedByJobId,
      xeroBillsByJobId,
      xeroInvoicesByJobId,
      source: "live",
      lastSyncedAt: lastRun?.finishedAt?.toISOString(),
    };
  } catch (err) {
    return {
      jobs: [],
      cashReceivedByJobId: new Map(),
      xeroBillsByJobId: new Map(),
      xeroInvoicesByJobId: new Map(),
      source: "unavailable",
      error: err instanceof Error ? err.message : "Unknown error reading the database",
    };
  }
}

export interface LiveJobCashPositionRow {
  job: Job;
  amountInvoicedToDate: number;
  cashReceived: number;
  cashOutstanding: number;
  wip: number;
}

export interface LiveJobsCashPositionsResult {
  rows: LiveJobCashPositionRow[];
  source: "live" | "unavailable";
  error?: string;
}

/** Remaining revenue not yet received in cash, across active jobs - same
 * "revised revenue - cash received" definition as the mock engine's
 * confirmedFutureRevenue(), using contractValue + approvedVariations as
 * live's revised-revenue figure (Buildxact doesn't need a separate
 * forecast-revenue estimate the way cost does). */
export function liveConfirmedFutureRevenue(rows: LiveJobCashPositionRow[]): number {
  return rows.reduce((sum, row) => sum + Math.max(0, row.job.contractValue + row.job.approvedVariations - row.cashReceived), 0);
}

/** Earliest not-yet-invoiced manual payment stage for a job, if any -
 * mirrors jobCashPosition's "next payment" figure for the mock engine, used
 * so the live "Jobs consuming the most cash" table doesn't show a
 * permanently blank column. */
export function liveNextPayment(row: LiveJobCashPositionRow, manualStagesByJobId: Map<string, ManualStageRow[]>): number | null {
  const stages = (manualStagesByJobId.get(row.job.id) ?? []).filter((s) => !s.invoiced).sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
  if (stages.length === 0) return null;
  return Math.round((stages[0].percentOfContract / 100) * (row.job.contractValue + row.job.approvedVariations));
}

/** Same per-job cash-position formula as loadLiveJobDetail below, batched
 * across every active (not "complete") job in 2 queries instead of N+1 -
 * built for the live forecast engine, which needs this for every active job
 * at once rather than one job's detail page. */
export async function loadLiveActiveJobsCashPositions(): Promise<LiveJobsCashPositionsResult> {
  try {
    const jobRows = await db.select().from(jobs).where(eq(jobs.source, "buildxact"));
    const activeRows = jobRows.filter((r) => r.status !== "complete" && r.jobNumber !== STOCK_JOB_NUMBER);
    if (activeRows.length === 0) {
      return { rows: [], source: jobRows.length === 0 ? "unavailable" : "live" };
    }

    const jobIds = activeRows.map((r) => r.id);
    const invRows = await db
      .select()
      .from(jobInvoicePayments)
      .where(inArray(jobInvoicePayments.jobId, jobIds));

    const byJob = new Map<string, typeof invRows>();
    for (const inv of invRows) {
      if (!inv.jobId) continue;
      if (!byJob.has(inv.jobId)) byJob.set(inv.jobId, []);
      byJob.get(inv.jobId)!.push(inv);
    }

    const rows: LiveJobCashPositionRow[] = activeRows.map((jobRow) => {
      const jobInvoices = byJob.get(jobRow.id) ?? [];
      const amountInvoicedToDate = jobInvoices.reduce((s, r) => s + r.totalIncTax, 0);
      const cashReceived = jobInvoices.filter((r) => r.status === "Received").reduce((s, r) => s + r.totalIncTax, 0);
      return {
        job: dbJobToJob(jobRow),
        amountInvoicedToDate,
        cashReceived,
        cashOutstanding: amountInvoicedToDate - cashReceived,
        wip: Math.max(0, jobRow.actualCost + jobRow.committedCost - amountInvoicedToDate),
      };
    });

    return { rows, source: "live" };
  } catch (err) {
    return { rows: [], source: "unavailable", error: err instanceof Error ? err.message : "Unknown error reading the database" };
  }
}

export interface XeroMatchedRecord {
  id: string;
  number: string;
  party: string;
  amount: number;
  date: string;
  status: string;
}

export interface LiveJobDetail {
  job: Job;
  cashPosition: {
    committedCost: number;
    amountInvoicedToDate: number;
    cashReceived: number;
    cashOutstanding: number;
    wip: number;
  };
  purchaseOrders: BuildxactPurchaseOrder[];
  invoices: BuildxactJobInvoice[];
  // Xero bills/invoices matched to this job by job code - a cross-check
  // against the Buildxact figures above, not a source for them. See
  // src/sync/xero.ts resolveJobNumber for how the match is made.
  xeroBills: XeroMatchedRecord[];
  xeroInvoices: XeroMatchedRecord[];
  // Original cost estimate from Buildxact's linked Estimate object, at the
  // time the job was quoted - "what we allowed for". Confirmed live
  // 2026-08-28: populated on 107 of 111 synced jobs, and its implied margin
  // (contract value vs this figure) clusters tightly around 20-26% across
  // real jobs, in line with the business's known ~25% margin target - a
  // reliable field, despite an earlier note elsewhere in this codebase
  // saying otherwise (that was based on a stale/incomplete sample). Null
  // when Buildxact has no estimate value for this job, rather than shown as
  // $0 - a missing estimate isn't the same as a $0 one.
  estimatedCost: number | null;
}

export interface LiveJobDetailResult {
  detail: LiveJobDetail | null;
  source: "live" | "unavailable";
  error?: string;
}

/** jobId here is Buildxact's job GUID (job.sourceId), matching the id used
 * in URLs by loadLiveJobsList() above - not the database's own primary key. */
export async function loadLiveJobDetail(jobId: string): Promise<LiveJobDetailResult> {
  try {
    const [jobRow] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.sourceId, jobId));

    if (!jobRow || jobRow.source !== "buildxact") {
      return { detail: null, source: "unavailable" };
    }

    const [poRows, invRows, xeroBillRows, xeroInvoiceRows] = await Promise.all([
      db.select().from(purchaseOrders).where(eq(purchaseOrders.jobId, jobRow.id)),
      db.select().from(jobInvoicePayments).where(eq(jobInvoicePayments.jobId, jobRow.id)),
      db.select().from(bills).where(and(eq(bills.jobId, jobRow.id), eq(bills.source, "xero"))),
      db.select().from(invoices).where(and(eq(invoices.jobId, jobRow.id), eq(invoices.source, "xero"))),
    ]);

    const purchaseOrdersOut = poRows.map((r) => r.raw as BuildxactPurchaseOrder);
    const invoicesOut = invRows.map((r) => r.raw as BuildxactJobInvoice);

    const amountInvoicedToDate = invRows.reduce((s, r) => s + r.totalIncTax, 0);
    const cashReceived = invRows.filter((r) => r.status === "Received").reduce((s, r) => s + r.totalIncTax, 0);

    const rawJob = jobRow.raw as BuildxactJob | null;
    const estimatedCost = rawJob?.estimatedTotalIncTax ? rawJob.estimatedTotalIncTax : null;

    const xeroBillsOut: XeroMatchedRecord[] = xeroBillRows.map((b) => ({
      id: b.id,
      number: b.billNumber,
      party: (b.raw as XeroInvoice)?.Contact?.Name ?? "Unknown",
      amount: b.amount,
      date: b.billDate ? b.billDate.toISOString().slice(0, 10) : "",
      status: b.status,
    }));
    const xeroInvoicesOut: XeroMatchedRecord[] = xeroInvoiceRows.map((inv) => ({
      id: inv.id,
      number: inv.invoiceNumber,
      party: (inv.raw as XeroInvoice)?.Contact?.Name ?? "Unknown",
      amount: inv.amount,
      date: inv.issueDate ? inv.issueDate.toISOString().slice(0, 10) : "",
      status: inv.status,
    }));

    return {
      detail: {
        job: dbJobToJob(jobRow),
        cashPosition: {
          committedCost: jobRow.committedCost,
          amountInvoicedToDate,
          cashReceived,
          cashOutstanding: amountInvoicedToDate - cashReceived,
          wip: Math.max(0, jobRow.actualCost + jobRow.committedCost - amountInvoicedToDate),
        },
        purchaseOrders: purchaseOrdersOut,
        invoices: invoicesOut,
        xeroBills: xeroBillsOut,
        xeroInvoices: xeroInvoicesOut,
        estimatedCost,
      },
      source: "live",
    };
  } catch (err) {
    return { detail: null, source: "unavailable", error: err instanceof Error ? err.message : "Unknown error reading the database" };
  }
}
