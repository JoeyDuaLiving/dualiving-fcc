import { db } from "@/db/client";
import { jobs, manualPaymentStages } from "@/db/schema";
import { eq } from "drizzle-orm";

interface CreateStageBody {
  jobId: string; // Job.id as used everywhere else in the app - Buildxact's sourceId, not the DB's internal jobs.id
  label: string;
  percentOfContract: number;
  expectedDate: string; // YYYY-MM-DD
  triggerDescription?: string;
  createdBy?: string;
}

export async function POST(request: Request) {
  const body = (await request.json()) as CreateStageBody;

  if (!body.jobId || !body.label || !Number.isFinite(body.percentOfContract) || !body.expectedDate) {
    return Response.json({ error: "jobId, label, percentOfContract and expectedDate are required" }, { status: 400 });
  }

  // manual_payment_stages.job_id FKs to the DB's internal jobs.id, not the
  // Buildxact sourceId the rest of the app uses as "Job.id" - translate here.
  const [job] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.sourceId, body.jobId));
  if (!job) {
    return Response.json({ error: "Unknown jobId" }, { status: 400 });
  }

  const [created] = await db
    .insert(manualPaymentStages)
    .values({
      jobId: job.id,
      label: body.label,
      percentOfContract: body.percentOfContract,
      triggerDescription: body.triggerDescription || null,
      expectedDate: new Date(body.expectedDate),
      createdBy: body.createdBy || null,
    })
    .returning();

  return Response.json({ ...created, jobId: body.jobId });
}
