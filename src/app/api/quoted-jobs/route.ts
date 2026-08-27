import { db } from "@/db/client";
import { quotedJobStages, quotedJobs } from "@/db/schema";

interface CreateQuotedJobBody {
  reference: string; // "Q1280"
  client: string;
  estimatedContractValue: number;
  expectedStartDate: string; // YYYY-MM-DD
  notes?: string;
  createdBy?: string;
}

// Standard template: 10% deposit on start, 40% manufacturing 2 weeks later,
// 45% install 4 weeks after that, 5% final 8 weeks after that - see the
// forecast page discussion for why these specific offsets. Fully editable
// per-quote afterward; this is just the starting point.
const DEFAULT_STAGE_TEMPLATE = [
  { label: "10% Deposit", percentOfContract: 10, triggerDescription: "Deposit on quote acceptance", offsetDays: 0 },
  { label: "40% Manufacturing", percentOfContract: 40, triggerDescription: "Manufacturing stage", offsetDays: 14 },
  { label: "45% Install", percentOfContract: 45, triggerDescription: "Install stage", offsetDays: 14 + 28 },
  { label: "5% Final", percentOfContract: 5, triggerDescription: "Final payment", offsetDays: 14 + 28 + 56 },
];

export async function POST(request: Request) {
  const body = (await request.json()) as CreateQuotedJobBody;

  if (!body.reference || !body.client || !Number.isFinite(body.estimatedContractValue) || !body.expectedStartDate) {
    return Response.json({ error: "reference, client, estimatedContractValue and expectedStartDate are required" }, { status: 400 });
  }

  const startDate = new Date(body.expectedStartDate);

  const [created] = await db
    .insert(quotedJobs)
    .values({
      reference: body.reference,
      client: body.client,
      estimatedContractValue: body.estimatedContractValue,
      expectedStartDate: startDate,
      notes: body.notes || null,
      createdBy: body.createdBy || null,
    })
    .returning();

  const stageRows = DEFAULT_STAGE_TEMPLATE.map((stage) => ({
    quotedJobId: created.id,
    label: stage.label,
    percentOfContract: stage.percentOfContract,
    triggerDescription: stage.triggerDescription,
    expectedDate: new Date(startDate.getTime() + stage.offsetDays * 86_400_000),
  }));
  const stages = await db.insert(quotedJobStages).values(stageRows).returning();

  return Response.json({ ...created, stages });
}
