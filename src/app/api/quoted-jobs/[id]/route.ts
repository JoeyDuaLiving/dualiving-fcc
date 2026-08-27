import { db } from "@/db/client";
import { quotedJobs } from "@/db/schema";
import { eq } from "drizzle-orm";

interface UpdateQuotedJobBody {
  reference?: string;
  client?: string;
  estimatedContractValue?: number;
  expectedStartDate?: string;
  notes?: string | null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as UpdateQuotedJobBody;

  const values: Partial<typeof quotedJobs.$inferInsert> = { updatedAt: new Date() };
  if (body.reference !== undefined) values.reference = body.reference;
  if (body.client !== undefined) values.client = body.client;
  if (body.estimatedContractValue !== undefined) values.estimatedContractValue = body.estimatedContractValue;
  if (body.expectedStartDate !== undefined) values.expectedStartDate = new Date(body.expectedStartDate);
  if (body.notes !== undefined) values.notes = body.notes;

  const [updated] = await db.update(quotedJobs).set(values).where(eq(quotedJobs.id, id)).returning();
  if (!updated) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(updated);
}

/** Cascades to delete the quoted job's stages too - use this once the real
 * Buildxact job exists, so the quoted version stops double-counting. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(quotedJobs).where(eq(quotedJobs.id, id));
  return Response.json({ success: true });
}
