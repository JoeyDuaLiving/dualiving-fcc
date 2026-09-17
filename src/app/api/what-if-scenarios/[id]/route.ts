import { db } from "@/db/client";
import { whatIfScenarios } from "@/db/schema";
import { eq } from "drizzle-orm";

interface UpdateScenarioBody {
  name?: string;
  description?: string | null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as UpdateScenarioBody;

  const values: Partial<typeof whatIfScenarios.$inferInsert> = { updatedAt: new Date() };
  if (body.name !== undefined) values.name = body.name;
  if (body.description !== undefined) values.description = body.description;

  const [updated] = await db.update(whatIfScenarios).set(values).where(eq(whatIfScenarios.id, id)).returning();
  if (!updated) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(updated);
}

/** Cascades to delete the scenario's adjustments too. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(whatIfScenarios).where(eq(whatIfScenarios.id, id));
  return Response.json({ success: true });
}
