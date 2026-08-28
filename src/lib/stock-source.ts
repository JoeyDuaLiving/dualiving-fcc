import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { jobs, purchaseOrders } from "@/db/schema";
import type { BuildxactPurchaseOrder } from "@/integrations/buildxact/types";

// ---------------------------------------------------------------------------
// J1057 "STOCK" is a real Buildxact job used as a workaround: consumables
// and bulk-bought materials that don't cleanly split to a single job's PO at
// purchase time get ordered against it. When stock is later drawn onto a
// real job, per business direction (2026-08-28) that's done by raising a
// normal PO directly on the real job with "STOCK" in its description -
// Buildxact's own sync already adds that cost to the real job's
// actual/committed cost with no extra work needed here. This module's only
// job is to find those STOCK-tagged POs across every other job and net them
// against J1057's own bulk-purchase total, so there's visibility into what's
// been drawn down and (roughly) what's still on the shelf.
//
// Detection is description-text based, not a Buildxact "supplier" field -
// confirmed live that BuildxactPurchaseOrder carries no synced supplier
// name (only a bare contactId, and this app has no Buildxact contacts
// integration to resolve it), so a free-text tag is the only workable
// signal today. Matched as a whole word, case-insensitive, so an unrelated
// description mentioning "Stockland" or "restocking fee" doesn't false-hit.
// ---------------------------------------------------------------------------

export const STOCK_JOB_NUMBER = "J1057";
const STOCK_TAG_RE = /\bSTOCK\b/i;

export interface StockDrawdownRow {
  poId: string;
  orderNumber: number;
  description: string;
  amount: number;
  status: string;
  date: string;
  jobId: string; // Buildxact sourceId of the job the stock was drawn onto
  jobNumber: string;
  client: string;
}

export interface StockPositionResult {
  totalPurchased: number; // J1057's own actual + committed cost
  totalDrawnDown: number;
  remaining: number;
  drawdowns: StockDrawdownRow[];
  stockJob: { id: string; actualCost: number; committedCost: number; purchaseOrders: BuildxactPurchaseOrder[] } | null;
  source: "live" | "unavailable";
  error?: string;
}

export async function loadStockPosition(): Promise<StockPositionResult> {
  const empty = { totalPurchased: 0, totalDrawnDown: 0, remaining: 0, drawdowns: [], stockJob: null };
  try {
    const [stockJobRow] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.source, "buildxact"), eq(jobs.jobNumber, STOCK_JOB_NUMBER)));

    if (!stockJobRow) {
      return { ...empty, source: "unavailable", error: `No Buildxact job numbered ${STOCK_JOB_NUMBER} found - has the STOCK job been renamed?` };
    }

    const otherJobRows = await db.select().from(jobs).where(and(eq(jobs.source, "buildxact"), ne(jobs.jobNumber, STOCK_JOB_NUMBER)));
    const jobById = new Map(otherJobRows.map((j) => [j.id, j]));
    const otherJobIds = otherJobRows.map((j) => j.id);

    const [otherPoRows, stockPoRows] = await Promise.all([
      otherJobIds.length > 0 ? db.select().from(purchaseOrders).where(inArray(purchaseOrders.jobId, otherJobIds)) : Promise.resolve([]),
      db.select().from(purchaseOrders).where(eq(purchaseOrders.jobId, stockJobRow.id)),
    ]);

    const drawdowns: StockDrawdownRow[] = [];
    for (const po of otherPoRows) {
      if (po.orderStatus === "Cancelled") continue;
      if (!STOCK_TAG_RE.test(po.description ?? "")) continue;
      const job = jobById.get(po.jobId);
      if (!job) continue;
      drawdowns.push({
        poId: po.id,
        orderNumber: po.orderNumber,
        description: po.description ?? "",
        amount: po.orderTotalIncTax,
        status: po.orderStatus,
        date: po.orderDate ? po.orderDate.toISOString().slice(0, 10) : "",
        jobId: job.sourceId,
        jobNumber: job.jobNumber,
        client: job.client,
      });
    }

    const totalPurchased = stockJobRow.actualCost + stockJobRow.committedCost;
    const totalDrawnDown = drawdowns.reduce((s, d) => s + d.amount, 0);

    return {
      totalPurchased,
      totalDrawnDown,
      remaining: totalPurchased - totalDrawnDown,
      drawdowns: drawdowns.sort((a, b) => b.date.localeCompare(a.date)),
      stockJob: {
        id: stockJobRow.sourceId,
        actualCost: stockJobRow.actualCost,
        committedCost: stockJobRow.committedCost,
        purchaseOrders: stockPoRows.map((r) => r.raw as BuildxactPurchaseOrder),
      },
      source: "live",
    };
  } catch (err) {
    return { ...empty, source: "unavailable", error: err instanceof Error ? err.message : "Unknown error reading the database" };
  }
}
