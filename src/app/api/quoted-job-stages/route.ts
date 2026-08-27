import { db } from "@/db/client";
import { quotedJobStages } from "@/db/schema";

interface CreateStageBody {
  quotedJobId: string;
  label: string;
  percentOfContract: number;
  expectedDate: string; // YYYY-MM-DD
  triggerDescription?: string;
}

/** For adding an extra one-off stage beyond the default 4-stage template. */
export async function POST(request: Request) {
  const body = (await request.json()) as CreateStageBody;

  if (!body.quotedJobId || !body.label || !Number.isFinite(body.percentOfContract) || !body.expectedDate) {
    return Response.json({ error: "quotedJobId, label, percentOfContract and expectedDate are required" }, { status: 400 });
  }

  const [created] = await db
    .insert(quotedJobStages)
    .values({
      quotedJobId: body.quotedJobId,
      label: body.label,
      percentOfContract: body.percentOfContract,
      triggerDescription: body.triggerDescription || null,
      expectedDate: new Date(body.expectedDate),
    })
    .returning();

  return Response.json(created);
}
