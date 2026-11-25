import "server-only";
import { and, desc, eq, inArray, isNull, ne, notInArray } from "drizzle-orm";
import { db } from "@/db/client";
import { billJobAllocations, bills, jobs, poBillLinks, poReconciliations, purchaseOrders } from "@/db/schema";
import type { XeroInvoice } from "@/integrations/xero/types";
import { poNumbersReferencedByBill } from "@/lib/po-reference";
import { suggestMatches, type SuggestionTier } from "@/lib/po-suggest";
import { isStockPoDescription, STOCK_JOB_NUMBER } from "@/lib/stock-source";

// ---------------------------------------------------------------------------
// Our own PO <-> Xero bill reconciliation for one job. Comparison only: it
// never changes the WIP, actual cost or committed cost, which still come from
// Buildxact. Matching order for each Xero bill on the job:
//   1. a manual link (po_bill_links) - always wins, lets the team fix a bad
//      or missing match
//   2. a "PO 1234" reference on the bill (see lib/po-reference.ts)
// Whatever matches neither is listed as an unlinked bill, with a picker to
// link it to a PO by hand.
// ---------------------------------------------------------------------------

export interface PoReconcileBill {
  sourceId: string;
  number: string;
  party: string;
  amount: number;
  date: string;
  status: string;
  how: "reference" | "manual";
}

export interface PoReconcileRow {
  poSourceId: string;
  orderNumber: number;
  description: string;
  orderStatus: string;
  /** PO total inc GST. */
  total: number;
  /** Amount Buildxact says has been invoiced against the PO. */
  invoiced: number;
  bills: PoReconcileBill[];
  /** Sum of the Xero bills matched to this PO. */
  xeroTotal: number;
  /** xeroTotal minus what Xero should hold (the PO total, or $0 if cancelled). Positive = Xero holds more than the PO. */
  variance: number;
  reconciled: boolean;
  note: string | null;
  /** Drawn from stock: the bill was paid when the stock was bought in bulk on J1057, so no Xero bill is expected on this job. */
  fromStock: boolean;
  /** Proposed Xero bill(s) for this PO, best first. Nothing is applied until someone accepts one. */
  suggestions: PoReconcileSuggestion[];
}

export interface PoReconcileSuggestion {
  tier: SuggestionTier;
  reason: string;
  /** One bill, or two when the PO was invoiced in two parts. */
  bills: PoReconcileCandidateBill[];
}

export interface PoReconcileCandidateBill {
  sourceId: string;
  number: string;
  party: string;
  contactId: string;
  amount: number;
  date: string;
  /** "job" = already matched to this job in Xero but not to a PO; "unassigned" = no job on the bill at all. */
  scope: "job" | "unassigned";
}

export interface PoReconcileData {
  rows: PoReconcileRow[];
  /** Xero bills on this job that match no PO yet. */
  unlinkedBills: PoReconcileCandidateBill[];
  /** Bills with no job at all, offered in the link picker (most recent first). */
  unassignedBills: PoReconcileCandidateBill[];
}

const IGNORED_BILL_STATUSES = ["VOIDED", "DELETED"];
const MAX_UNASSIGNED_BILLS = 150;

function toBill(row: typeof bills.$inferSelect): Omit<PoReconcileBill, "how"> & { contactId: string } {
  return {
    sourceId: row.sourceId,
    number: row.billNumber,
    party: (row.raw as XeroInvoice | null)?.Contact?.Name ?? "Unknown",
    contactId: (row.raw as XeroInvoice | null)?.Contact?.ContactID ?? "",
    amount: row.amount,
    date: row.billDate ? row.billDate.toISOString().slice(0, 10) : "",
    status: row.status,
  };
}

type BillRow = typeof bills.$inferSelect;
type PoRow = typeof purchaseOrders.$inferSelect;
type LinkRow = typeof poBillLinks.$inferSelect;
type StatusRow = typeof poReconciliations.$inferSelect;

interface BuildInput {
  isStockJob: boolean;
  poRows: PoRow[];
  /** Bills on this job, each already carrying this job's share of the bill as `amount`. */
  jobBillRows: BillRow[];
  /** Bills linked to a PO of this job by hand that are not on the job in Xero. */
  extraLinkedBills: BillRow[];
  linkRows: LinkRow[];
  statusRows: StatusRow[];
  /** Recent bills with no job code at all, offered as a pool for links and suggestions. */
  unassignedRows: BillRow[];
}

/** The reconciliation of one job's POs against its Xero bills, from rows already loaded. */
function buildPoReconcile(input: BuildInput): PoReconcileData {
  const { isStockJob, poRows, jobBillRows, extraLinkedBills, linkRows, statusRows, unassignedRows } = input;
  const jobBillIds = new Set(jobBillRows.map((b) => b.sourceId));
  const allBills = [...jobBillRows, ...extraLinkedBills];

  const poBySourceId = new Map(poRows.map((p) => [p.sourceId, p]));
  const poSourceIdByNumber = new Map(poRows.map((p) => [p.orderNumber, p.sourceId]));
  const manualPoByBill = new Map(linkRows.filter((l) => poBySourceId.has(l.poSourceId)).map((l) => [l.billSourceId, l.poSourceId]));

  const billsByPo = new Map<string, PoReconcileBill[]>();
  const unlinked: PoReconcileCandidateBill[] = [];
  for (const row of allBills) {
    const manualPo = manualPoByBill.get(row.sourceId);
    let poSourceId = manualPo;
    let how: PoReconcileBill["how"] = "manual";
    if (!poSourceId) {
      const raw = row.raw as XeroInvoice | null;
      const referenced = raw ? poNumbersReferencedByBill(raw) : [];
      const match = referenced.map((n) => poSourceIdByNumber.get(n)).find((sid): sid is string => Boolean(sid));
      poSourceId = match;
      how = "reference";
    }
    if (poSourceId) {
      const list = billsByPo.get(poSourceId) ?? [];
      list.push({ ...toBill(row), how });
      billsByPo.set(poSourceId, list);
    } else if (jobBillIds.has(row.sourceId)) {
      unlinked.push({ ...toBill(row), scope: "job" });
    }
  }

  const statusByPo = new Map(statusRows.map((s) => [s.poSourceId, s]));
  const rows: PoReconcileRow[] = poRows.map((po) => {
    const matched = billsByPo.get(po.sourceId) ?? [];
    const xeroTotal = matched.reduce((s, b) => s + b.amount, 0);
    // A PO drawn from stock was paid for on J1057 when the stock was bought, so it expects no bill on this job.
    // (J1057's own POs are the bulk purchases themselves and are reconciled against their bills as normal.)
    const fromStock = !isStockJob && po.orderStatus !== "Cancelled" && isStockPoDescription(po.description);
    const expected = po.orderStatus === "Cancelled" || fromStock ? 0 : po.orderTotalIncTax;
    const state = statusByPo.get(po.sourceId);
    return {
      poSourceId: po.sourceId,
      orderNumber: po.orderNumber,
      description: po.description ?? "",
      orderStatus: po.orderStatus,
      total: po.orderTotalIncTax,
      invoiced: po.invoiceTotalIncTax,
      bills: matched,
      xeroTotal,
      variance: xeroTotal - expected,
      reconciled: state?.reconciled ?? false,
      note: state?.note ?? null,
      fromStock,
      suggestions: [],
    };
  });

  const linkedBillIds = new Set(linkRows.map((l) => l.billSourceId));
  const unassignedBills: PoReconcileCandidateBill[] = unassignedRows
    .filter((r) => !linkedBillIds.has(r.sourceId))
    .map((r) => ({ ...toBill(r), scope: "unassigned" as const }));

  // Propose matches for POs that still need one. Bills already matched (by
  // reference or by hand) are out of the pool, so nothing is suggested twice.
  const pool = [...unlinked, ...unassignedBills];
  const suggestions = suggestMatches(
    rows.map((r) => ({
      poSourceId: r.poSourceId,
      orderNumber: r.orderNumber,
      orderStatus: r.orderStatus,
      total: r.total,
      invoiced: r.invoiced,
      orderDate: poBySourceId.get(r.poSourceId)?.orderDate?.toISOString().slice(0, 10) ?? "",
      supplierInvoiceRef: (poBySourceId.get(r.poSourceId)?.raw as { supplierInvoiceRef?: string | null } | null)?.supplierInvoiceRef ?? null,
      // Stock POs expect no bill, so there is nothing to suggest for them.
      reconciled: r.reconciled || r.fromStock,
      matchedBillTotal: r.xeroTotal,
      matchedBillCount: r.bills.length,
    })),
    pool
  );
  const poolById = new Map(pool.map((b) => [b.sourceId, b]));
  for (const row of rows) {
    row.suggestions = (suggestions.get(row.poSourceId) ?? []).map((sg) => ({
      tier: sg.tier,
      reason: sg.reason,
      bills: sg.billSourceIds.map((id) => poolById.get(id)).filter((b): b is PoReconcileCandidateBill => Boolean(b)),
    }));
  }

  return { rows, unlinkedBills: unlinked, unassignedBills };
}

/** Recent bills with no job code, the shared pool every job's links and suggestions draw from. */
function loadUnassignedBills(): Promise<BillRow[]> {
  return db
    .select()
    .from(bills)
    .where(and(eq(bills.source, "xero"), isNull(bills.jobId), notInArray(bills.status, IGNORED_BILL_STATUSES)))
    .orderBy(desc(bills.billDate))
    .limit(MAX_UNASSIGNED_BILLS);
}

export async function loadPoReconcile(jobDbId: string, isStockJob = false): Promise<PoReconcileData> {
  const [poRows, jobBillRows, linkRows, statusRows, unassignedRows] = await Promise.all([
    db.select().from(purchaseOrders).where(eq(purchaseOrders.jobId, jobDbId)),
    // This job's share of each bill: a bill split across jobs only counts its own part here.
    db
      .select({ bill: bills, allocated: billJobAllocations.amount })
      .from(billJobAllocations)
      .innerJoin(bills, eq(bills.id, billJobAllocations.billId))
      .where(and(eq(billJobAllocations.jobId, jobDbId), eq(bills.source, "xero"), notInArray(bills.status, IGNORED_BILL_STATUSES)))
      .then((rows) => rows.map((r) => ({ ...r.bill, amount: r.allocated }))),
    db.select().from(poBillLinks).where(eq(poBillLinks.jobId, jobDbId)),
    db.select().from(poReconciliations).where(eq(poReconciliations.jobId, jobDbId)),
    loadUnassignedBills(),
  ]);

  // Bills linked by hand may not be tagged to this job in Xero at all (that's
  // often why they needed linking), so fetch them by id as well.
  const jobBillIds = new Set(jobBillRows.map((b) => b.sourceId));
  const missingLinkedIds = linkRows.map((l) => l.billSourceId).filter((sid) => !jobBillIds.has(sid));
  const extraLinkedBills = missingLinkedIds.length
    ? await db
        .select()
        .from(bills)
        .where(and(eq(bills.source, "xero"), inArray(bills.sourceId, missingLinkedIds), notInArray(bills.status, IGNORED_BILL_STATUSES)))
    : [];

  return buildPoReconcile({ isStockJob, poRows, jobBillRows, extraLinkedBills, linkRows, statusRows, unassignedRows });
}

// ---------------------------------------------------------------------------
// Report across jobs: one summary row per active job, plus headline totals.
// Same matching as the job page (buildPoReconcile), fed from a handful of bulk
// queries instead of one set per job. Scope matches the Reconciliation page:
// jobs not marked complete, excluding the STOCK job.
// ---------------------------------------------------------------------------

export interface PoReconcileJobSummary {
  /** Buildxact job id, as used in /jobs/[id]. */
  jobId: string;
  jobNumber: string;
  client: string;
  /** POs excluding cancelled ones. */
  poCount: number;
  /** POs drawn from stock (reconciled against J1057). */
  stockCount: number;
  /** Signed off by hand, or drawn from stock. */
  reconciledCount: number;
  /** POs with no Xero bill that haven't been signed off. */
  noBillCount: number;
  noBillValue: number;
  /** Unreconciled POs that have bills but whose Xero total is off the PO total by $1 or more. */
  mismatchCount: number;
  /** Xero total minus PO total across those POs: positive means Xero holds more than the POs. */
  netVariance: number;
  /** Xero bills on the job that match no PO. */
  unmatchedBillCount: number;
  unmatchedBillValue: number;
  /** POs whose best suggested match is strong or likely, waiting to be accepted. */
  suggestionCount: number;
}

export interface PoReconcileReport {
  jobs: PoReconcileJobSummary[];
  totals: Omit<PoReconcileJobSummary, "jobId" | "jobNumber" | "client"> & { jobCount: number };
}

const MISMATCH_TOLERANCE = 1;

function summariseJob(jobId: string, jobNumber: string, client: string, data: PoReconcileData): PoReconcileJobSummary {
  const live = data.rows.filter((r) => r.orderStatus !== "Cancelled");
  const open = live.filter((r) => !r.fromStock && !r.reconciled);
  const noBill = open.filter((r) => r.bills.length === 0);
  const withBills = open.filter((r) => r.bills.length > 0);
  return {
    jobId,
    jobNumber,
    client,
    poCount: live.length,
    stockCount: live.filter((r) => r.fromStock).length,
    reconciledCount: live.filter((r) => r.reconciled || r.fromStock).length,
    noBillCount: noBill.length,
    noBillValue: noBill.reduce((s, r) => s + r.total, 0),
    mismatchCount: withBills.filter((r) => Math.abs(r.variance) >= MISMATCH_TOLERANCE).length,
    netVariance: withBills.reduce((s, r) => s + r.variance, 0),
    unmatchedBillCount: data.unlinkedBills.length,
    unmatchedBillValue: data.unlinkedBills.reduce((s, b) => s + b.amount, 0),
    suggestionCount: open.filter((r) => r.suggestions[0] && r.suggestions[0].tier !== "possible").length,
  };
}

export async function loadPoReconcileReport(): Promise<PoReconcileReport> {
  const jobRows = (
    await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.source, "buildxact"), ne(jobs.status, "complete"), ne(jobs.jobNumber, STOCK_JOB_NUMBER)))
  ).filter((j) => j.client.toUpperCase() !== "STOCK");
  const jobIds = jobRows.map((j) => j.id);

  const empty: PoReconcileReport = {
    jobs: [],
    totals: { jobCount: 0, poCount: 0, stockCount: 0, reconciledCount: 0, noBillCount: 0, noBillValue: 0, mismatchCount: 0, netVariance: 0, unmatchedBillCount: 0, unmatchedBillValue: 0, suggestionCount: 0 },
  };
  if (jobIds.length === 0) return empty;

  const [poRows, allocRows, linkRows, statusRows, unassignedRows] = await Promise.all([
    db.select().from(purchaseOrders).where(inArray(purchaseOrders.jobId, jobIds)),
    db
      .select({ jobId: billJobAllocations.jobId, bill: bills, allocated: billJobAllocations.amount })
      .from(billJobAllocations)
      .innerJoin(bills, eq(bills.id, billJobAllocations.billId))
      .where(and(inArray(billJobAllocations.jobId, jobIds), eq(bills.source, "xero"), notInArray(bills.status, IGNORED_BILL_STATUSES))),
    db.select().from(poBillLinks).where(inArray(poBillLinks.jobId, jobIds)),
    db.select().from(poReconciliations).where(inArray(poReconciliations.jobId, jobIds)),
    loadUnassignedBills(),
  ]);

  // Bills linked by hand that aren't on their job in Xero, fetched once for every job.
  const onJob = new Set(allocRows.map((r) => `${r.jobId}:${r.bill.sourceId}`));
  const extraIds = [...new Set(linkRows.filter((l) => !onJob.has(`${l.jobId}:${l.billSourceId}`)).map((l) => l.billSourceId))];
  const extraBills = extraIds.length
    ? await db
        .select()
        .from(bills)
        .where(and(eq(bills.source, "xero"), inArray(bills.sourceId, extraIds), notInArray(bills.status, IGNORED_BILL_STATUSES)))
    : [];
  const extraBySourceId = new Map(extraBills.map((b) => [b.sourceId, b]));

  const group = <T extends { jobId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.jobId, [...(m.get(r.jobId) ?? []), r]);
    return m;
  };
  const posByJob = group(poRows);
  const allocByJob = group(allocRows);
  const linksByJob = group(linkRows);
  const statusByJob = group(statusRows);

  const summaries: PoReconcileJobSummary[] = [];
  for (const job of jobRows) {
    const jobPos = posByJob.get(job.id) ?? [];
    if (jobPos.length === 0) continue;
    const jobLinks = linksByJob.get(job.id) ?? [];
    const data = buildPoReconcile({
      isStockJob: false,
      poRows: jobPos,
      jobBillRows: (allocByJob.get(job.id) ?? []).map((r) => ({ ...r.bill, amount: r.allocated })),
      extraLinkedBills: jobLinks.filter((l) => !onJob.has(`${job.id}:${l.billSourceId}`)).map((l) => extraBySourceId.get(l.billSourceId)).filter((b): b is BillRow => Boolean(b)),
      linkRows: jobLinks,
      statusRows: statusByJob.get(job.id) ?? [],
      unassignedRows,
    });
    summaries.push(summariseJob(job.sourceId, job.jobNumber, job.client, data));
  }

  const sum = (pick: (j: PoReconcileJobSummary) => number) => summaries.reduce((s, j) => s + pick(j), 0);
  return {
    jobs: summaries,
    totals: {
      jobCount: summaries.length,
      poCount: sum((j) => j.poCount),
      stockCount: sum((j) => j.stockCount),
      reconciledCount: sum((j) => j.reconciledCount),
      noBillCount: sum((j) => j.noBillCount),
      noBillValue: sum((j) => j.noBillValue),
      mismatchCount: sum((j) => j.mismatchCount),
      netVariance: sum((j) => j.netVariance),
      unmatchedBillCount: sum((j) => j.unmatchedBillCount),
      unmatchedBillValue: sum((j) => j.unmatchedBillValue),
      suggestionCount: sum((j) => j.suggestionCount),
    },
  };
}
