import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { manualBankBalance } from "@/db/schema";

interface SetManualBankBalanceBody {
  balance: number;
  asOf: string; // YYYY-MM-DD
}

// Single-row table (see schema.ts) - always update the existing row if one
// exists, otherwise insert the first one.
export async function POST(request: Request) {
  const body = (await request.json()) as SetManualBankBalanceBody;

  if (!Number.isFinite(body.balance) || !body.asOf) {
    return Response.json({ error: "balance and asOf are required" }, { status: 400 });
  }

  const [existing] = await db.select({ id: manualBankBalance.id }).from(manualBankBalance).limit(1);

  const [saved] = existing
    ? await db
        .update(manualBankBalance)
        .set({ balance: body.balance, asOf: new Date(body.asOf), updatedAt: new Date() })
        .where(eq(manualBankBalance.id, existing.id))
        .returning()
    : await db.insert(manualBankBalance).values({ balance: body.balance, asOf: new Date(body.asOf) }).returning();

  return Response.json(saved, { status: 200 });
}
