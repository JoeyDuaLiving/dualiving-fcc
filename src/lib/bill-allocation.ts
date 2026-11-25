import type { XeroInvoice, XeroLineItem } from "@/integrations/xero/types";

// ---------------------------------------------------------------------------
// Splits one Xero bill across the jobs its line items are coded to. Pure and
// side-effect free, shared by the Xero sync and the backfill script.
//
// A bill is usually coded to one job, in which case it has one allocation for
// its full total, exactly as before. When different lines carry different Job
// Codes (e.g. one supplier invoice covering four jobs), each job gets its own
// lines. Lines with no job code (freight, say) follow the tagged lines: they're
// spread across the tagged jobs in proportion to what those jobs already carry.
// Shares are inc GST and always add back to the bill total to the cent.
// ---------------------------------------------------------------------------

const JOB_NUMBER_RE = /\bJ\d{3,5}\b/i;

export function extractJobNumber(text: string | undefined | null): string | null {
  if (!text) return null;
  const match = JOB_NUMBER_RE.exec(text);
  return match ? match[0].toUpperCase() : null;
}

/** The job number on a line's "Job Codes" tracking option, if it has one. */
export function lineJobNumber(line: XeroLineItem): string | null {
  for (const tracking of line.Tracking ?? []) {
    if (tracking.Name !== "Job Codes") continue;
    const jobNumber = extractJobNumber(tracking.Option);
    if (jobNumber) return jobNumber;
  }
  return null;
}

/** A line's value inc GST. Xero's LineAmount excludes tax unless the bill is "Inclusive". */
function lineGross(line: XeroLineItem, lineAmountTypes: string | undefined): number {
  const amount = line.LineAmount ?? 0;
  if (lineAmountTypes === "Inclusive") return amount;
  return amount + (line.TaxAmount ?? 0);
}

const toCents = (n: number) => Math.round(n * 100) / 100;

export interface BillAllocation {
  jobId: string;
  amount: number;
}

/**
 * @param fallbackJobId the job the bill resolves to when no line carries a job
 *   code the database knows (invoice number, reference or PO reference match).
 */
export function allocateBillToJobs(
  bill: Pick<XeroInvoice, "Total" | "LineItems" | "LineAmountTypes">,
  jobIdByNumber: Map<string, string>,
  fallbackJobId: string | null
): BillAllocation[] {
  const total = bill.Total ?? 0;
  const lines = bill.LineItems ?? [];

  const taggedGross = new Map<string, number>();
  let untaggedGross = 0;
  for (const line of lines) {
    const gross = lineGross(line, bill.LineAmountTypes);
    const number = lineJobNumber(line);
    const jobId = number ? jobIdByNumber.get(number) : undefined;
    if (jobId) taggedGross.set(jobId, (taggedGross.get(jobId) ?? 0) + gross);
    else untaggedGross += gross;
  }

  // No line is coded to a known job: the whole bill goes to the resolved job, as it always has.
  if (taggedGross.size === 0) return fallbackJobId ? [{ jobId: fallbackJobId, amount: toCents(total) }] : [];
  // One job carries every tagged line: the whole bill is that job's (untagged lines follow it).
  if (taggedGross.size === 1) return [{ jobId: [...taggedGross.keys()][0], amount: toCents(total) }];

  // Several jobs: spread the untagged lines in proportion to each job's own lines.
  const taggedSum = [...taggedGross.values()].reduce((s, v) => s + v, 0);
  const raw = new Map<string, number>();
  for (const [jobId, gross] of taggedGross) {
    const share = taggedSum !== 0 ? gross / taggedSum : 1 / taggedGross.size;
    raw.set(jobId, gross + untaggedGross * share);
  }

  // Scale so the shares add back to the bill total (discounts and rounding make the lines drift from it).
  const rawSum = [...raw.values()].reduce((s, v) => s + v, 0);
  const factor = rawSum !== 0 ? total / rawSum : 0;
  const out = [...raw.entries()].map(([jobId, v]) => ({ jobId, amount: toCents(v * factor) }));

  // Whatever the cent rounding left over goes on the largest share, so the total is exact.
  const residual = toCents(total - out.reduce((s, a) => s + a.amount, 0));
  if (residual !== 0) {
    const largest = out.reduce((best, a) => (Math.abs(a.amount) > Math.abs(best.amount) ? a : best), out[0]);
    largest.amount = toCents(largest.amount + residual);
  }
  return out.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}
