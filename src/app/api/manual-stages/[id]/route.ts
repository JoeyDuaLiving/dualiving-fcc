import { db } from "@/db/client";
import { manualPaymentStages } from "@/db/schema";
import { eq } from "drizzle-orm";

interface UpdateStageBody {
  label?: string;
  percentOfContract?: number;
  expectedDate?: string; // YYYY-MM-DD
  triggerDescription?: string | null;
  invoiced?: boolean;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as UpdateStageBody;

  const values: Partial<typeof manualPaymentStages.$inferInsert> = { updatedAt: new Date() };
  if (body.label !== undefined) values.label = body.label;
  if (body.percentOfContract !== undefined) values.percentOfContract = body.percentOfContract;
  if (body.expectedDate !== undefined) values.expectedDate = new Date(body.expectedDate);
  if (body.triggerDescription !== undefined) values.triggerDescription = body.triggerDescription;
  if (body.invoiced !== undefined) values.invoiced = body.invoiced;

  const [updated] = await db.update(manualPaymentStages).set(values).where(eq(manualPaymentStages.id, id)).returning();
  if (!updated) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(manualPaymentStages).where(eq(manualPaymentStages.id, id));
  return Response.json({ success: true });
}
