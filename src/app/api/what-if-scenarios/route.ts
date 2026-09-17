import { db } from "@/db/client";
import { whatIfScenarios } from "@/db/schema";

interface CreateScenarioBody {
  name: string;
  description?: string;
  createdBy?: string;
}

export async function POST(request: Request) {
  const body = (await request.json()) as CreateScenarioBody;

  if (!body.name) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  const [created] = await db
    .insert(whatIfScenarios)
    .values({ name: body.name, description: body.description || null, createdBy: body.createdBy || null })
    .returning();

  return Response.json({ ...created, adjustments: [] }, { status: 201 });
}
