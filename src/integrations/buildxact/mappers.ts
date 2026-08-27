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

/** Status vocabulary is not confirmed as a fixed enum (only "Not Started"
 * has been observed live) - this is a best-effort heuristic, not a lookup
 * table, so it degrades gracefully for status strings we haven't seen yet.
 * Buildxact's own `status` text is often stale (jobs sit at "Not Started"
 * well past 0% progress) so progressPercent takes priority for that case. */
export function mapBuildxactStatus(status: string, isCompleted: boolean, progressPercent = 0): JobStatus {
  if (isCompleted) return "complete";
  const s = status.toLowerCase();
  if (s.includes("complete")) return "complete";
  if (s.includes("hold")) return "on_hold";
  if (s.includes("quote") || s.includes("estimate")) return "quoting";
  if (s.includes("not started")) return progressPercent > 0 ? "in_progress" : "contracted";
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

/** Computed from real Purchase Order + Job Invoice data (2 extra API calls) -
 * only call this for a single job being viewed in detail, not in a list loop
 * (see rate-limit note in live-jobs.ts). */
export function computeLiveJobCashPosition(
  bx: BuildxactJob,
  purchaseOrders: BuildxactPurchaseOrder[],
  invoices: BuildxactJobInvoice[]
): LiveJobCashPosition {
  const committedCost = purchaseOrders.reduce((s, po) => s + po.orderTotalIncTax, 0);
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
