import "server-only";
import { db } from "@/db/client";
import { recurringLiabilities } from "@/db/schema";

// ---------------------------------------------------------------------------
// Recurring liability repayments (car loans, equipment finance, etc.) - see
// schema.ts for why these are tracked separately from operatingExpenses:
// they're real cash outflows that never appear in Xero's P&L, so the opex
// sync has no way to see them. Fully manual, entered by the business.
// ---------------------------------------------------------------------------

export type LiabilityFrequency = "weekly" | "fortnightly" | "monthly";

export interface RecurringLiabilityDTO {
  id: string;
  description: string;
  amount: number;
  frequency: LiabilityFrequency;
  startDate: string; // YYYY-MM-DD
  endDate: string | null;
}

export interface LoadRecurringLiabilitiesResult {
  liabilities: RecurringLiabilityDTO[];
  source: "live" | "unavailable";
  error?: string;
}

export async function loadRecurringLiabilities(): Promise<LoadRecurringLiabilitiesResult> {
  try {
    const rows = await db.select().from(recurringLiabilities);
    return {
      liabilities: rows.map((r) => ({
        id: r.id,
        description: r.description,
        amount: r.amount,
        frequency: r.frequency as LiabilityFrequency,
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : null,
      })),
      source: "live",
    };
  } catch (err) {
    return { liabilities: [], source: "unavailable", error: err instanceof Error ? err.message : "Unknown error reading the database" };
  }
}

/** A monthly-equivalent figure for display alongside OPEX, which is
 * normalised to a monthly average elsewhere on the Expenses page - lets
 * "$X/month in loan repayments" be compared directly against "$Y/month
 * OPEX" without the reader doing the weekly/fortnightly conversion math
 * themselves. */
export function monthlyEquivalent(liability: Pick<RecurringLiabilityDTO, "amount" | "frequency">): number {
  if (liability.frequency === "weekly") return (liability.amount * 52) / 12;
  if (liability.frequency === "fortnightly") return (liability.amount * 26) / 12;
  return liability.amount;
}

function addFrequency(dateIso: string, frequency: LiabilityFrequency): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  if (frequency === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else if (frequency === "fortnightly") d.setUTCDate(d.getUTCDate() + 14);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export interface LiabilityOccurrence {
  liabilityId: string;
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
}

/** Projects every occurrence of a liability's repayment schedule that falls
 * within [rangeStart, rangeEnd] (inclusive), stepping forward from its
 * startDate by `frequency` - not a fixed day-of-month, since a
 * weekly/fortnightly direct debit doesn't land on one. Stops at endDate if
 * the loan has a known payoff date, even if that's before rangeEnd. */
export function projectLiabilityOccurrences(liability: RecurringLiabilityDTO, rangeStart: string, rangeEnd: string): LiabilityOccurrence[] {
  const occurrences: LiabilityOccurrence[] = [];
  let cursor = liability.startDate;
  // Fast-forward past any occurrences before the range without emitting them.
  let guard = 0;
  while (cursor < rangeStart && guard < 10_000) {
    cursor = addFrequency(cursor, liability.frequency);
    guard++;
  }
  guard = 0;
  while (cursor <= rangeEnd && guard < 1000) {
    if (liability.endDate && cursor > liability.endDate) break;
    occurrences.push({ liabilityId: liability.id, description: liability.description, amount: liability.amount, date: cursor });
    cursor = addFrequency(cursor, liability.frequency);
    guard++;
  }
  return occurrences;
}
