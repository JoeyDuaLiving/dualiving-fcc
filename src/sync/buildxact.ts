import "server-only";
import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { companies, jobInvoicePayments, jobs, purchaseOrders, syncErrors, syncRuns } from "@/db/schema";
import { getAllJobs, getJobInvoices, getJobPurchaseOrders, getTenants } from "@/integrations/buildxact/jobs";
import { mapBuildxactJobToJob } from "@/integrations/buildxact/mappers";
import type { BuildxactJob, BuildxactJobInvoice, BuildxactPurchaseOrder } from "@/integrations/buildxact/types";
import { rateLimit } from "./rate-limiter";

// ---------------------------------------------------------------------------
// Buildxact -> Postgres sync.
//
// Every write is an upsert keyed on (source, sourceId) - re-running this
// safely reconciles rather than duplicating (spec rule #25). Per-record
// failures are logged to sync_errors and skipped rather than aborting the
// whole run, so one bad job doesn't block the other 99.
//
// Rate-limit shape: 1 call for tenants, ~1-2 calls (paginated) for the job
// list, then 2 calls per job (purchase orders + invoices) when
// includeDetail is true - confirmed live to run past 300s for ~110 jobs
// once real per-request latency (not just rate-limit pacing) is accounted
// for, which is why jobs Buildxact has marked complete (`isCompleted`) skip
// the detail fetch entirely: their purchase orders and invoices are done
// changing, so re-fetching them on every sync buys nothing for a live cash
// dashboard. Their last-synced committedCost is left as-is rather than
// reset to 0. In_progress and contracted jobs (the ones whose cash position
// can still move) always get the full detail fetch.
// ---------------------------------------------------------------------------

export interface SyncResult {
  syncRunId: string;
  status: "success" | "partial" | "failed";
  recordsImported: number;
  recordsUpdated: number;
  errorCount: number;
  durationMs: number;
}

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function syncBuildxact(options: { includeDetail?: boolean } = {}): Promise<SyncResult> {
  const includeDetail = options.includeDetail ?? true;
  const startedAt = Date.now();

  const [run] = await db.insert(syncRuns).values({ source: "buildxact", status: "running" }).returning();

  let recordsImported = 0;
  let recordsUpdated = 0;
  let errorCount = 0;

  async function logError(sourceId: string | undefined, message: string) {
    errorCount++;
    await db.insert(syncErrors).values({ syncRunId: run.id, source: "buildxact", sourceId, message });
  }

  try {
    await syncTenants();

    await rateLimit();
    const bxJobs = await getAllJobs();

    for (const bx of bxJobs) {
      try {
        const { jobRowId, inserted } = await upsertJob(bx, 0);
        if (inserted) recordsImported++;
        else recordsUpdated++;

        if (includeDetail && !bx.isCompleted) {
          let committedCost = 0;

          try {
            await rateLimit();
            const pos = await getJobPurchaseOrders(bx.jobId);
            committedCost = pos.reduce((s, po) => s + po.orderTotalIncTax, 0);
            for (const po of pos) {
              const result = await upsertPurchaseOrder(jobRowId, po);
              if (result.inserted) recordsImported++;
              else recordsUpdated++;
            }
          } catch (err) {
            await logError(bx.jobId, `Purchase orders: ${err instanceof Error ? err.message : String(err)}`);
          }

          try {
            await rateLimit();
            const invs = await getJobInvoices(bx.jobId);
            for (const inv of invs) {
              const result = await upsertJobInvoicePayment(jobRowId, inv);
              if (result.inserted) recordsImported++;
              else recordsUpdated++;
            }
          } catch (err) {
            await logError(bx.jobId, `Job invoices: ${err instanceof Error ? err.message : String(err)}`);
          }

          // Re-save the job with the real committed cost now that POs are in.
          if (committedCost > 0) {
            await db.update(jobs).set({ committedCost, updatedAt: new Date() }).where(eq(jobs.id, jobRowId));
          }
        }
      } catch (err) {
        await logError(bx.jobId, err instanceof Error ? err.message : String(err));
      }
    }
  } catch (err) {
    await logError(undefined, `Sync aborted: ${err instanceof Error ? err.message : String(err)}`);
    await db
      .update(syncRuns)
      .set({
        status: "failed",
        finishedAt: new Date(),
        recordsImported,
        recordsUpdated,
        errorSummary: "Sync aborted before completing - see sync_errors",
      })
      .where(eq(syncRuns.id, run.id));
    return { syncRunId: run.id, status: "failed", recordsImported, recordsUpdated, errorCount, durationMs: Date.now() - startedAt };
  }

  const status: SyncResult["status"] = errorCount === 0 ? "success" : "partial";
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

async function syncTenants(): Promise<void> {
  await rateLimit();
  const tenants = await getTenants();
  for (const tenant of tenants) {
    const [existing] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.source, "buildxact"), eq(companies.sourceId, tenant.tenantId)));

    const values = {
      source: "buildxact",
      sourceId: tenant.tenantId,
      name: tenant.companyName,
      abn: tenant.abn,
      billingAddr: tenant.billingAddress1,
      billingCity: tenant.billingCityTown,
      billingState: tenant.billingState,
      billingPost: tenant.billingPostCode,
      phone: tenant.phone,
      website: tenant.website,
      raw: tenant,
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(companies).set(values).where(eq(companies.id, existing.id));
    } else {
      await db.insert(companies).values(values);
    }
  }
}

async function upsertJob(bx: BuildxactJob, committedCost: number): Promise<{ jobRowId: string; inserted: boolean }> {
  const mapped = mapBuildxactJobToJob(bx);

  const [existing] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.source, "buildxact"), eq(jobs.sourceId, bx.jobId)));

  const values = {
    source: "buildxact",
    sourceId: bx.jobId,
    jobNumber: mapped.jobNumber,
    client: mapped.client,
    product: mapped.product,
    status: mapped.status,
    location: mapped.location,
    contractValue: mapped.contractValue,
    approvedVariations: mapped.approvedVariations,
    originalBudgetRevenue: mapped.originalBudgetRevenue,
    originalBudgetCost: mapped.originalBudgetCost,
    actualCost: mapped.actualCost,
    committedCost,
    remainingForecastCost: mapped.remainingForecastCost,
    progressPercent: mapped.progressPercent,
    startDate: toDate(bx.creationDate),
    expectedCompletion: toDate(bx.targetDate ?? bx.completionDate),
    contractedCompletion: toDate(bx.targetDate ?? bx.completionDate),
    marginTargetPercent: mapped.marginTargetPercent,
    raw: bx,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(jobs).set(values).where(eq(jobs.id, existing.id));
    return { jobRowId: existing.id, inserted: false };
  }

  const [created] = await db.insert(jobs).values(values).returning({ id: jobs.id });
  return { jobRowId: created.id, inserted: true };
}

async function upsertPurchaseOrder(jobRowId: string, po: BuildxactPurchaseOrder): Promise<{ inserted: boolean }> {
  const [existing] = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.source, "buildxact"), eq(purchaseOrders.sourceId, po.purchaseOrderId)));

  const values = {
    jobId: jobRowId,
    source: "buildxact",
    sourceId: po.purchaseOrderId,
    orderNumber: po.orderNumber,
    description: po.description,
    orderStatus: po.orderStatus,
    orderTotalIncTax: po.orderTotalIncTax,
    invoiceTotalIncTax: po.invoiceTotalIncTax,
    orderDate: toDate(po.orderDate),
    raw: po,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(purchaseOrders).set(values).where(eq(purchaseOrders.id, existing.id));
    return { inserted: false };
  }
  await db.insert(purchaseOrders).values(values);
  return { inserted: true };
}

async function upsertJobInvoicePayment(jobRowId: string, inv: BuildxactJobInvoice): Promise<{ inserted: boolean }> {
  const [existing] = await db
    .select({ id: jobInvoicePayments.id })
    .from(jobInvoicePayments)
    .where(and(eq(jobInvoicePayments.source, "buildxact"), eq(jobInvoicePayments.sourceId, inv.jobPaymentId)));

  const values = {
    jobId: jobRowId,
    source: "buildxact",
    sourceId: inv.jobPaymentId,
    description: inv.description,
    totalIncTax: inv.totalIncTax,
    status: inv.status,
    dueDate: toDate(inv.dueDate),
    invoiceDate: toDate(inv.invoiceDate),
    invoiceNumber: inv.invoiceNumber,
    paymentOrder: inv.paymentOrder,
    raw: inv,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(jobInvoicePayments).set(values).where(eq(jobInvoicePayments.id, existing.id));
    return { inserted: false };
  }
  await db.insert(jobInvoicePayments).values(values);
  return { inserted: true };
}
