import { db } from "@/db/client";
import { jobManualLabourCosts, jobs } from "@/db/schema";
import { eq } from "drizzle-orm";

interface SetJobLabourCostBody {
  jobSourceId: string; // Buildxact's job GUID, as used in the job detail URL
  amount: number;
  note?: string | null;
}

// One row per job (see schema.ts) - update if it exists, otherwise insert.
export async function POST(request: Request) {
  const body = (await request.json()) as SetJobLabourCostBody;

  if (!body.jobSourceId || !Number.isFinite(body.amount)) {
    return Response.json({ error: "jobSourceId and amount are required" }, { status: 400 });
  }

  const [jobRow] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.sourceId, body.jobSourceId));
  if (!jobRow) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  const [existing] = await db.select({ id: jobManualLabourCosts.id }).from(jobManualLabourCosts).where(eq(jobManualLabourCosts.jobId, jobRow.id));

  const [saved] = existing
    ? await db
        .update(jobManualLabourCosts)
        .set({ amount: body.amount, note: body.note || null, updatedAt: new Date() })
        .where(eq(jobManualLabourCosts.id, existing.id))
        .returning()
    : await db.insert(jobManualLabourCosts).values({ jobId: jobRow.id, amount: body.amount, note: body.note || null }).returning();

  return Response.json(saved, { status: 200 });
}

export async function DELETE(request: Request) {
  const { jobSourceId } = (await request.json()) as { jobSourceId: string };
  const [jobRow] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.sourceId, jobSourceId));
  if (jobRow) await db.delete(jobManualLabourCosts).where(eq(jobManualLabourCosts.jobId, jobRow.id));
  return Response.json({ success: true });
}
