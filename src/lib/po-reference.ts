import type { XeroInvoice } from "@/integrations/xero/types";

// A Buildxact PO number quoted on a Xero bill. Requires an explicit "PO"
// prefix (PO#2045, PO 2045) and is never run on InvoiceNumber, so a supplier
// invoice number like INV-1650 can't be mistaken for Buildxact PO #1650.
// Shared by the Xero sync (to link a bill to a job) and the job page's PO
// reconciliation table (to link a bill to a PO), so the two can't drift.
export const PO_REF_RE = /\bPO\s*#?\s*(\d{3,5})\b/i;
const PO_REF_RE_ALL = new RegExp(PO_REF_RE.source, "gi");

/** Every Buildxact PO number referenced in a bill's Reference or line descriptions. */
export function poNumbersReferencedByBill(bill: Pick<XeroInvoice, "Reference" | "LineItems">): number[] {
  const texts = [bill.Reference, ...(bill.LineItems ?? []).map((l) => l.Description)];
  const found = new Set<number>();
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(PO_REF_RE_ALL)) found.add(Number(match[1]));
  }
  return [...found];
}
