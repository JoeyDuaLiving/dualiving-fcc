import { db } from "@/db/client";
import { recurringLiabilities } from "@/db/schema";

interface CreateRecurringLiabilityBody {
  description: string;
  amount: number;
  frequency: "weekly" | "fortnightly" | "monthly";
  startDate: string; // YYYY-MM-DD - a real known repayment date
  endDate?: string | null;
  createdBy?: string;
}

export async function POST(request: Request) {
  const body = (await request.json()) as CreateRecurringLiabilityBody;

  if (!body.description || !Number.isFinite(body.amount) || !body.frequency || !body.startDate) {
    return Response.json({ error: "description, amount, frequency and startDate are required" }, { status: 400 });
  }
  if (!["weekly", "fortnightly", "monthly"].includes(body.frequency)) {
    return Response.json({ error: "frequency must be weekly, fortnightly or monthly" }, { status: 400 });
  }

  const [created] = await db
    .insert(recurringLiabilities)
    .values({
      description: body.description,
      amount: body.amount,
      frequency: body.frequency,
      startDate: new Date(body.startDate),
      endDate: body.endDate ? new Date(body.endDate) : null,
      createdBy: body.createdBy || null,
    })
    .returning();

  return Response.json(created, { status: 201 });
}
