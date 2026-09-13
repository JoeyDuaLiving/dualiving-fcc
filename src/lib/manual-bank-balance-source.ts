import "server-only";
import { db } from "@/db/client";
import { manualBankBalance } from "@/db/schema";

export interface ManualBankBalance {
  balance: number;
  asOf: string; // YYYY-MM-DD
  set: boolean; // false if nothing has ever been entered
}

export async function loadManualBankBalance(): Promise<ManualBankBalance> {
  const [row] = await db.select().from(manualBankBalance).limit(1);
  if (!row) return { balance: 0, asOf: "", set: false };
  return { balance: row.balance, asOf: row.asOf.toISOString().slice(0, 10), set: true };
}
