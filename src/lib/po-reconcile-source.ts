import "server-only";
import { and, desc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { db } from "@/db/client";
import { bills, poBillLinks, poReconciliations, purchaseOrders } from "@/db/schema";
import type { XeroInvoice } from "@/integrations/xero/types";
import { poNumbersReferencedByBill } from "@/lib/po-reference";
import { suggestMatches, type SuggestionTier } from "@/lib/po-suggest";

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

export async function loadPoReconcile(jobDbId: string): Promise<PoReconcileData> {
  const [poRows, jobBillRows, linkRows, statusRows] = await Promise.all([
    db.select().from(purchaseOrders).where(eq(purchaseOrders.jobId, jobDbId)),
    db
      .select()
      .from(bills)
      .where(and(eq(bills.jobId, jobDbId), eq(bills.source, "xero"), notInArray(bills.status, IGNORED_BILL_STATUSES))),
    db.select().from(poBillLinks).where(eq(poBillLinks.jobId, jobDbId)),
    db.select().from(poReconciliations).where(eq(poReconciliations.jobId, jobDbId)),
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
    } else if (row.jobId === jobDbId) {
      unlinked.push({ ...toBill(row), scope: "job" });
    }
  }

  const statusByPo = new Map(statusRows.map((s) => [s.poSourceId, s]));
  const rows: PoReconcileRow[] = poRows.map((po) => {
    const matched = billsByPo.get(po.sourceId) ?? [];
    const xeroTotal = matched.reduce((s, b) => s + b.amount, 0);
    const expected = po.orderStatus === "Cancelled" ? 0 : po.orderTotalIncTax;
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
      suggestions: [],
    };
  });

  const linkedBillIds = new Set(linkRows.map((l) => l.billSourceId));
  const unassignedRows = await db
    .select()
    .from(bills)
    .where(and(eq(bills.source, "xero"), isNull(bills.jobId), notInArray(bills.status, IGNORED_BILL_STATUSES)))
    .orderBy(desc(bills.billDate))
    .limit(MAX_UNASSIGNED_BILLS);
  const unassignedBills: PoReconcileCandidateBill[] = unassignedRows
    .filter((r) => !linkedBillIds.has(r.sourceId))
    .map((r) => ({ ...toBill(r), scope: "unassigned" as const }));

  // Propose matches for POs that still need one. Bills already matched (by
  // reference or by hand) are out of the pool, so nothing is suggested twice.
  const pool = [...unlinked, ...unassignedBills];
  const poRowBySourceId = new Map(poRows.map((p) => [p.sourceId, p]));
  const suggestions = suggestMatches(
    rows.map((r) => ({
      poSourceId: r.poSourceId,
      orderNumber: r.orderNumber,
      orderStatus: r.orderStatus,
      total: r.total,
      invoiced: r.invoiced,
      orderDate: poRowBySourceId.get(r.poSourceId)?.orderDate?.toISOString().slice(0, 10) ?? "",
      supplierInvoiceRef: (poRowBySourceId.get(r.poSourceId)?.raw as { supplierInvoiceRef?: string | null } | null)?.supplierInvoiceRef ?? null,
      reconciled: r.reconciled,
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
