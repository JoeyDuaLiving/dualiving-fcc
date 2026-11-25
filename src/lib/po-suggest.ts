// ---------------------------------------------------------------------------
// Suggested PO <-> Xero bill matches for the job page's reconciliation table.
// Pure and side-effect free: it only proposes, the team accepts each one (or
// the strong ones in bulk). Nothing here writes anything.
//
// Buildxact POs carry no supplier name, so matching rests on three signals:
//   1. the PO's supplierInvoiceRef equals a Xero bill number   -> "strong"
//   2. one bill whose amount equals what's still unmatched on the PO
//      (its total, or what Buildxact says has been invoiced)    -> "likely"
//   3. two bills from the SAME Xero supplier that together equal it - a PO
//      is often split over a deposit and a final invoice        -> "possible"
// A bill that fits more than one PO, or that has no job code in Xero, is only
// ever "possible", because a coincidence is more likely there.
// ---------------------------------------------------------------------------

/** Within a dollar counts as equal - Xero and Buildxact round GST differently. */
export const SUGGEST_TOLERANCE = 1;
/** Bills with no job code in Xero must match to the cent. */
const UNASSIGNED_TOLERANCE = 0.02;
/** A bill dated more than this many days before its PO was raised can't be for it. */
const DATE_GRACE_DAYS = 7;
const MAX_SUGGESTIONS_PER_PO = 3;

export type SuggestionTier = "strong" | "likely" | "possible";

export interface SuggestPo {
  poSourceId: string;
  orderNumber: number;
  orderStatus: string;
  total: number;
  invoiced: number;
  /** ISO date the PO was raised, or "" if unknown. */
  orderDate: string;
  supplierInvoiceRef: string | null;
  reconciled: boolean;
  /** Bills already matched to this PO (by reference or by hand). */
  matchedBillTotal: number;
  matchedBillCount: number;
}

export interface SuggestBill {
  sourceId: string;
  number: string;
  party: string;
  contactId: string;
  amount: number;
  date: string;
  /** "job" = on this job in Xero; "unassigned" = no job code on the bill. */
  scope: "job" | "unassigned";
}

export interface PoSuggestion {
  billSourceIds: string[];
  tier: SuggestionTier;
  reason: string;
}

const normaliseRef = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, "");
const near = (a: number, b: number) => Math.abs(a - b) < SUGGEST_TOLERANCE;

function dayDiff(a: string, b: string): number {
  return (Date.parse(a) - Date.parse(b)) / 86_400_000;
}

/** Bill dated before the PO existed (beyond a small grace) can't be its invoice. Unknown dates pass. */
function dateFits(bill: SuggestBill, po: SuggestPo): boolean {
  if (!bill.date || !po.orderDate) return true;
  return dayDiff(bill.date, po.orderDate) >= -DATE_GRACE_DAYS;
}

/** What's still to be explained on a PO: nothing matched yet means its total (or invoiced
 * amount), otherwise only the unmatched remainder of each. */
function targetsFor(po: SuggestPo): number[] {
  const out = new Set<number>();
  for (const base of [po.total, po.invoiced]) {
    const remaining = base - po.matchedBillTotal;
    if (remaining >= SUGGEST_TOLERANCE) out.add(Math.round(remaining * 100) / 100);
  }
  return [...out];
}

interface Candidate {
  poSourceId: string;
  billSourceIds: string[];
  tier: SuggestionTier;
  reason: string;
  kind: "ref" | "single" | "pair";
}

export function suggestMatches(pos: SuggestPo[], pool: SuggestBill[]): Map<string, PoSuggestion[]> {
  const billById = new Map(pool.map((b) => [b.sourceId, b]));
  const open = pos.filter((p) => p.orderStatus !== "Cancelled" && !p.reconciled);
  const candidates: Candidate[] = [];

  for (const po of open) {
    const targets = targetsFor(po);
    const ref = normaliseRef(po.supplierInvoiceRef);
    const singles: Candidate[] = [];

    for (const bill of pool) {
      if (!dateFits(bill, po)) continue;
      const refHit = ref.length >= 3 && normaliseRef(bill.number) === ref;
      // A bill with no job code is a long shot, so it has to match to the cent;
      // within a dollar is fine for bills already on this job.
      const tolerance = bill.scope === "unassigned" ? UNASSIGNED_TOLERANCE : SUGGEST_TOLERANCE;
      const amountHit = targets.some((t) => Math.abs(bill.amount - t) < tolerance);
      if (refHit) {
        singles.push({
          poSourceId: po.poSourceId,
          billSourceIds: [bill.sourceId],
          tier: "strong",
          reason: amountHit ? "Supplier invoice ref and amount both match" : "Supplier invoice ref matches the bill number",
          kind: "ref",
        });
      } else if (amountHit) {
        singles.push({
          poSourceId: po.poSourceId,
          billSourceIds: [bill.sourceId],
          tier: bill.scope === "unassigned" ? "possible" : "likely",
          reason: bill.scope === "unassigned" ? "Amount matches, but the bill has no job code in Xero" : "Amount matches",
          kind: "single",
        });
      }
    }
    candidates.push(...singles);

    // Two invoices for one PO: only worth proposing when no single bill explains it.
    if (singles.length === 0 && targets.length > 0) {
      const byContact = new Map<string, SuggestBill[]>();
      for (const b of pool) {
        // Pairs only from bills already on this job: across the whole pool, small
        // supplier bills (hardware runs) add up to small POs by sheer coincidence.
        if (b.scope !== "job" || !b.contactId || !dateFits(b, po) || b.amount <= 0) continue;
        byContact.set(b.contactId, [...(byContact.get(b.contactId) ?? []), b]);
      }
      for (const group of byContact.values()) {
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            const sum = group[i].amount + group[j].amount;
            if (!targets.some((t) => near(sum, t))) continue;
            candidates.push({
              poSourceId: po.poSourceId,
              billSourceIds: [group[i].sourceId, group[j].sourceId],
              tier: "possible",
              reason: `Two bills from ${group[i].party} add up to the PO`,
              kind: "pair",
            });
          }
        }
      }
    }
  }

  // A bill claimed by more than one PO is a coincidence risk: show it, but never as more than "possible".
  const claims = new Map<string, Set<string>>();
  for (const c of candidates) {
    for (const id of c.billSourceIds) claims.set(id, (claims.get(id) ?? new Set()).add(c.poSourceId));
  }
  // A PO with several equally good single matches is just as ambiguous.
  const singlesPerPo = new Map<string, number>();
  for (const c of candidates) if (c.kind !== "pair") singlesPerPo.set(c.poSourceId, (singlesPerPo.get(c.poSourceId) ?? 0) + 1);

  const rank: Record<SuggestionTier, number> = { strong: 0, likely: 1, possible: 2 };
  const out = new Map<string, PoSuggestion[]>();
  for (const c of candidates) {
    let { tier, reason } = c;
    const sharedWith = c.billSourceIds.flatMap((id) => [...(claims.get(id) ?? [])]).filter((p) => p !== c.poSourceId);
    if (sharedWith.length > 0 && tier !== "strong") {
      tier = "possible";
      const nums = [...new Set(sharedWith)]
        .map((id) => pos.find((p) => p.poSourceId === id)?.orderNumber)
        .filter((n): n is number => n !== undefined)
        .map((n) => `#${n}`);
      reason = `${reason}; the bill also fits PO ${nums.join(", ")}`;
    } else if ((singlesPerPo.get(c.poSourceId) ?? 0) > 1 && tier === "likely") {
      tier = "possible";
      reason = `${reason}; more than one bill has this amount`;
    }
    const list = out.get(c.poSourceId) ?? [];
    list.push({ billSourceIds: c.billSourceIds, tier, reason });
    out.set(c.poSourceId, list);
  }

  for (const [poSourceId, list] of out) {
    list.sort((a, b) => rank[a.tier] - rank[b.tier]);
    // Drop suggestions that reference bills we no longer have (defensive) and cap the noise.
    out.set(
      poSourceId,
      list.filter((s) => s.billSourceIds.every((id) => billById.has(id))).slice(0, MAX_SUGGESTIONS_PER_PO)
    );
  }
  return out;
}
