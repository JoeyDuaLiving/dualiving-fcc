import { db } from "@/db/client";
import { whatIfAdjustments } from "@/db/schema";
import { eq } from "drizzle-orm";

interface UpdateAdjustmentBody {
  label?: string;
  category?: "wages" | "other";
  monthlyAmount?: number;
  startDate?: string; // YYYY-MM-DD
  endDate?: string | null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as UpdateAdjustmentBody;

  const values: Partial<typeof whatIfAdjustments.$inferInsert> = { updatedAt: new Date() };
  if (body.label !== undefined) values.label = body.label;
  if (body.category !== undefined) values.category = body.category;
  if (body.monthlyAmount !== undefined) values.monthlyAmount = body.monthlyAmount;
  if (body.startDate !== undefined) values.startDate = new Date(body.startDate);
  if (body.endDate !== undefined) values.endDate = body.endDate ? new Date(body.endDate) : null;

  const [updated] = await db.update(whatIfAdjustments).set(values).where(eq(whatIfAdjustments.id, id)).returning();
  if (!updated) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(whatIfAdjustments).where(eq(whatIfAdjustments.id, id));
  return Response.json({ success: true });
}
