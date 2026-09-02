import { db } from "@/db/client";
import { recurringLiabilities } from "@/db/schema";
import { eq } from "drizzle-orm";

interface UpdateRecurringLiabilityBody {
  description?: string;
  amount?: number;
  frequency?: "weekly" | "fortnightly" | "monthly";
  startDate?: string;
  endDate?: string | null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as UpdateRecurringLiabilityBody;

  const values: Partial<typeof recurringLiabilities.$inferInsert> = { updatedAt: new Date() };
  if (body.description !== undefined) values.description = body.description;
  if (body.amount !== undefined) values.amount = body.amount;
  if (body.frequency !== undefined) values.frequency = body.frequency;
  if (body.startDate !== undefined) values.startDate = new Date(body.startDate);
  if (body.endDate !== undefined) values.endDate = body.endDate ? new Date(body.endDate) : null;

  const [updated] = await db.update(recurringLiabilities).set(values).where(eq(recurringLiabilities.id, id)).returning();
  if (!updated) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(recurringLiabilities).where(eq(recurringLiabilities.id, id));
  return Response.json({ success: true });
}
