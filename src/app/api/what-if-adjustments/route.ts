import { db } from "@/db/client";
import { whatIfAdjustments } from "@/db/schema";

interface CreateAdjustmentBody {
  scenarioId: string;
  label: string;
  category: "wages" | "revenue" | "other";
  monthlyAmount: number; // signed - positive = extra cost, negative = saving/extra income
  startDate: string; // YYYY-MM-DD
  endDate?: string | null;
}

export async function POST(request: Request) {
  const body = (await request.json()) as CreateAdjustmentBody;

  if (!body.scenarioId || !body.label || !body.category || !Number.isFinite(body.monthlyAmount) || !body.startDate) {
    return Response.json({ error: "scenarioId, label, category, monthlyAmount and startDate are required" }, { status: 400 });
  }

  const [created] = await db
    .insert(whatIfAdjustments)
    .values({
      scenarioId: body.scenarioId,
      label: body.label,
      category: body.category,
      monthlyAmount: body.monthlyAmount,
      startDate: new Date(body.startDate),
      endDate: body.endDate ? new Date(body.endDate) : null,
    })
    .returning();

  return Response.json(created, { status: 201 });
}
