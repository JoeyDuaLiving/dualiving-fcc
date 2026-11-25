import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { bills, poBillLinks, poReconciliations, purchaseOrders, jobs } from "@/db/schema";

// Our own PO <-> Xero bill reconciliation on the job page. Writes only to our
// own po_bill_links / po_reconciliations tables - never to synced data, so a
// resync can't undo it and the WIP figures aren't affected.

// A suggestion for a PO that was invoiced in two parts links both bills at once.
const MAX_LINKS_PER_REQUEST = 100;

type Body =
  | { action: "link"; jobSourceId: string; poSourceId: string; billSourceId: string }
  | { action: "linkMany"; jobSourceId: string; links: { poSourceId: string; billSourceId: string }[] }
  | { action: "unlink"; billSourceId: string }
  | { action: "setStatus"; jobSourceId: string; poSourceId: string; reconciled: boolean; note?: string | null };

async function findJob(jobSourceId: string) {
  const [row] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.sourceId, jobSourceId));
  return row ?? null;
}

export async function POST(request: Request) {
  const body = (await request.json()) as Body;

  if (body.action === "link") {
    if (!body.jobSourceId || !body.poSourceId || !body.billSourceId) {
      return Response.json({ error: "jobSourceId, poSourceId and billSourceId are required" }, { status: 400 });
    }
    const job = await findJob(body.jobSourceId);
    if (!job) return Response.json({ error: "Job not found" }, { status: 404 });

    // The PO must belong to this job, and the bill must be a real Xero bill.
    const [po] = await db
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.jobId, job.id), eq(purchaseOrders.sourceId, body.poSourceId)));
    if (!po) return Response.json({ error: "Purchase order not found on this job" }, { status: 404 });
    const [bill] = await db
      .select({ id: bills.id })
      .from(bills)
      .where(and(eq(bills.source, "xero"), eq(bills.sourceId, body.billSourceId)));
    if (!bill) return Response.json({ error: "Xero bill not found" }, { status: 404 });

    // A bill belongs to one PO - linking it again moves it.
    await db
      .insert(poBillLinks)
      .values({ jobId: job.id, poSourceId: body.poSourceId, billSourceId: body.billSourceId })
      .onConflictDoUpdate({
        target: poBillLinks.billSourceId,
        set: { jobId: job.id, poSourceId: body.poSourceId, createdAt: new Date() },
      });
    return Response.json({ success: true });
  }

  if (body.action === "linkMany") {
    const links = Array.isArray(body.links) ? body.links : [];
    if (!body.jobSourceId || links.length === 0 || links.length > MAX_LINKS_PER_REQUEST) {
      return Response.json({ error: `jobSourceId and 1-${MAX_LINKS_PER_REQUEST} links are required` }, { status: 400 });
    }
    const job = await findJob(body.jobSourceId);
    if (!job) return Response.json({ error: "Job not found" }, { status: 404 });

    // Every PO must belong to this job and every bill must be a real Xero bill, or nothing is saved.
    const poIds = [...new Set(links.map((l) => l.poSourceId))];
    const billIds = [...new Set(links.map((l) => l.billSourceId))];
    const [poRows, billRows] = await Promise.all([
      db.select({ sourceId: purchaseOrders.sourceId }).from(purchaseOrders).where(and(eq(purchaseOrders.jobId, job.id), inArray(purchaseOrders.sourceId, poIds))),
      db.select({ sourceId: bills.sourceId }).from(bills).where(and(eq(bills.source, "xero"), inArray(bills.sourceId, billIds))),
    ]);
    if (poRows.length !== poIds.length) return Response.json({ error: "A purchase order was not found on this job" }, { status: 404 });
    if (billRows.length !== billIds.length) return Response.json({ error: "A Xero bill was not found" }, { status: 404 });
    if (billIds.length !== links.length) return Response.json({ error: "A bill can only be linked to one purchase order" }, { status: 400 });

    for (const l of links) {
      await db
        .insert(poBillLinks)
        .values({ jobId: job.id, poSourceId: l.poSourceId, billSourceId: l.billSourceId })
        .onConflictDoUpdate({
          target: poBillLinks.billSourceId,
          set: { jobId: job.id, poSourceId: l.poSourceId, createdAt: new Date() },
        });
    }
    return Response.json({ success: true, linked: links.length });
  }

  if (body.action === "unlink") {
    if (!body.billSourceId) return Response.json({ error: "billSourceId is required" }, { status: 400 });
    await db.delete(poBillLinks).where(eq(poBillLinks.billSourceId, body.billSourceId));
    return Response.json({ success: true });
  }

  if (body.action === "setStatus") {
    if (!body.jobSourceId || !body.poSourceId || typeof body.reconciled !== "boolean") {
      return Response.json({ error: "jobSourceId, poSourceId and reconciled are required" }, { status: 400 });
    }
    const job = await findJob(body.jobSourceId);
    if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
    const [po] = await db
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.jobId, job.id), eq(purchaseOrders.sourceId, body.poSourceId)));
    if (!po) return Response.json({ error: "Purchase order not found on this job" }, { status: 404 });

    const note = body.note?.trim() || null;
    await db
      .insert(poReconciliations)
      .values({ jobId: job.id, poSourceId: body.poSourceId, reconciled: body.reconciled, note })
      .onConflictDoUpdate({
        target: poReconciliations.poSourceId,
        set: { reconciled: body.reconciled, note, updatedAt: new Date() },
      });
    return Response.json({ success: true });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
