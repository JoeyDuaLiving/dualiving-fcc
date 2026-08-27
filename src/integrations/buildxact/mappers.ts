import "server-only";
import type { Job, JobStatus } from "@/types";
import type { BuildxactJob, BuildxactJobInvoice, BuildxactPurchaseOrder } from "./types";

// ---------------------------------------------------------------------------
// Buildxact -> internal type mapping. Kept in one place so a future path or
// field correction doesn't ripple through every caller.
//
// Known gap: Buildxact's job object has no confirmed "cost to complete"
// field (estimatedTotal was 0 on every sample job we've seen and its
// semantics aren't verified) - remainingForecastCost is set to 0 here rather
// than guessed at, per the "don't invent data" rule. That means forecast
// margin for live-synced jobs is calculated from actual + committed cost
// only and will read optimistic for any job that isn't near completion.
// Needs either a confirmed Buildxact field or a manual-override input before
// it's trustworthy - flagged in the UI, not hidden.
// ---------------------------------------------------------------------------

/** Status vocabulary is not confirmed as a fixed enum, and Buildxact's own
 * `status` text is confirmed stale in practice (per the business: jobs sit
 * at "Not Started" long after work begins - only 9 of 111 jobs are actually
 * yet to start, not the ~86 the raw status text implied). progressPercent is
 * the real signal and takes priority: 100% is complete, 0% is yet to start,
 * anything between is in progress. "On hold" / "quote" status text is still
 * respected where present, since those are real states progress alone can't
 * capture (a job can be on hold at any progress level). */
export function mapBuildxactStatus(status: string, isCompleted: boolean, progressPercent = 0): JobStatus {
  if (isCompleted || progressPercent >= 100) return "complete";
  const s = status.toLowerCase();
  if (s.includes("hold")) return "on_hold";
  if (s.includes("quote") || s.includes("estimate")) return "quoting";
  if (progressPercent <= 0) return "contracted";
  return "in_progress";
}

export function mapBuildxactJobToJob(bx: BuildxactJob): Job {
  const [jobNumber, ...clientParts] = bx.number.split(" - ");
  return {
    id: bx.jobId,
    source: "buildxact",
    sourceId: bx.jobId,
    jobNumber: jobNumber.trim(),
    client: clientParts.length > 0 ? clientParts.join(" - ").trim() : bx.clientName,
    product: bx.buildingType || "Unknown",
    status: mapBuildxactStatus(bx.status, bx.isCompleted, bx.progressPercent),
    location: [bx.worksLocationSuburb ?? bx.clientCityTown, bx.worksLocationState ?? bx.clientState].filter(Boolean).join(" "),
    contractValue: bx.contractTotalIncTax,
    approvedVariations: bx.variationTotalIncTax,
    originalBudgetRevenue: bx.contractTotalIncTax,
    // Best available proxy for a "budget" cost - Buildxact doesn't expose a
    // distinct original-estimate-cost field on the job object itself.
    originalBudgetCost: bx.actualTotalIncTax,
    actualCost: bx.actualTotalIncTax,
    committedCost: 0, // list-level fetch only - see getLiveJobDetail for the real figure
    remainingForecastCost: 0, // not available - see module comment above
    progressPercent: bx.progressPercent,
    startDate: bx.creationDate,
    expectedCompletion: bx.targetDate ?? bx.completionDate ?? bx.creationDate,
    contractedCompletion: bx.targetDate ?? bx.completionDate ?? bx.creationDate,
    paymentScheduleId: bx.jobId,
    marginTargetPercent: 25,
    // Not available at this cost granularity from Buildxact - zeroed rather
    // than guessed at; shown as "not available" in the UI.
    directCostBreakdown: { labour: 0, materials: 0, subcontractors: 0, freight: 0, engineering: 0, siteCosts: 0, other: 0 },
  };
}

export interface LiveJobCashPosition {
  committedCost: number;
  amountInvoicedToDate: number;
  cashReceived: number;
  cashOutstanding: number;
  wip: number;
}

/** Confirmed live 2026-08-28: summing every PO's full orderTotalIncTax
 * double-counts anything Buildxact has already delivered - that cost is
 * already reflected in the job's own actualTotalIncTax. "Received" and
 * "Completed" orders are excluded entirely (assumed already actual -
 * "Completed" is inconsistent with Buildxact's own isCompleted boolean and
 * barely invoiced in practice, but per business direction is still treated
 * as delivered/closed, not an open cost). "Cancelled" orders are excluded
 * too - never a real obligation. Everything else (Sent, Unsent,
 * PartReceived) counts only the not-yet-invoiced remainder as committed,
 * since a PO can be partially received/invoiced without a clean per-line
 * split from Buildxact. Shared by both the sync engine and this file's own
 * live job-detail computation below, so the two can't drift apart. */
export function committedAmountForPo(po: BuildxactPurchaseOrder): number {
  if (po.orderStatus === "Received" || po.orderStatus === "Completed" || po.orderStatus === "Cancelled") return 0;
  return Math.max(0, po.orderTotalIncTax - po.invoiceTotalIncTax);
}

/** Computed from real Purchase Order + Job Invoice data (2 extra API calls) -
 * only call this for a single job being viewed in detail, not in a list loop
 * (see rate-limit note in live-jobs.ts). */
export function computeLiveJobCashPosition(
  bx: BuildxactJob,
  purchaseOrders: BuildxactPurchaseOrder[],
  invoices: BuildxactJobInvoice[]
): LiveJobCashPosition {
  const committedCost = purchaseOrders.reduce((s, po) => s + committedAmountForPo(po), 0);
  const amountInvoicedToDate = invoices.reduce((s, inv) => s + inv.totalIncTax, 0);
  // "Received" is the only paid-status value confirmed live so far.
  const cashReceived = invoices.filter((inv) => inv.status === "Received").reduce((s, inv) => s + inv.totalIncTax, 0);
  return {
    committedCost,
    amountInvoicedToDate,
    cashReceived,
    cashOutstanding: amountInvoicedToDate - cashReceived,
    wip: Math.max(0, bx.actualTotalIncTax + committedCost - amountInvoicedToDate),
  };
}
