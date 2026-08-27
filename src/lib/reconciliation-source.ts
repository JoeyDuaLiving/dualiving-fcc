import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { bills, invoices, jobs } from "@/db/schema";
import type { XeroInvoice } from "@/integrations/xero/types";

// ---------------------------------------------------------------------------
// Buildxact <-> Xero reconciliation. GHL and contact-level matching are
// deliberately out of scope (per business direction) - this only compares
// Buildxact's own job cost/revenue figures against the Xero bills/invoices
// linked to that job.
//
// Job matching (done at sync time, see src/sync/xero.ts): primarily Xero's
// "Job Codes" tracking category (real per-line tagging, ~75% of bills once
// synced with this fix), falling back to a job-number-in-description regex
// for older untracked records. Flags here are computed live at page load,
// not persisted to the reconciliation_flags table (that table exists from
// the original Phase 2 schema but was never used - computing fresh each
// time matches how every other page in this app works, e.g. Alerts, rather
// than needing a separate flag-generation job to keep in sync).
//
// Scoped to active + contracted jobs only (not "complete") - completed
// jobs' Xero records mostly predate this year's job-tracking conventions,
// so including them would mostly surface old, uninteresting noise rather
// than real current discrepancies.
//
// Two more exclusions, per business direction:
//   - The "STOCK" placeholder job (Buildxact number "STOCK - J1057") isn't
//     a real client job - stock received but not yet allocated is planned
//     as its own separate tracking feature later, not part of job
//     reconciliation. Still counted as a "known" job for orphan-matching
//     purposes (a Xero record referencing J1057 is real, just not shown
//     in the main table), just excluded from the by-job comparison.
//   - "J4xxx"-series codes are from a previous/different CRM this
//     business used before Buildxact - they will never match a Buildxact
//     job and aren't actionable, so they're filtered out of the orphaned
//     list entirely rather than shown as noise every time.
// ---------------------------------------------------------------------------

const LEGACY_CRM_JOB_RE = /^J4\d+$/i;

const JOB_NUMBER_RE = /\bJ\d{3,5}\b/i;

function extractJobNumber(text: string | undefined | null): string | null {
  if (!text) return null;
  const match = JOB_NUMBER_RE.exec(text);
  return match ? match[0].toUpperCase() : null;
}

function extractJobNumberFromRaw(raw: unknown): string | null {
  const inv = raw as XeroInvoice;
  for (const line of inv.LineItems ?? []) {
    for (const tracking of line.Tracking ?? []) {
      if (tracking.Name !== "Job Codes") continue;
      const jobNumber = extractJobNumber(tracking.Option);
      if (jobNumber) return jobNumber;
    }
  }
  return extractJobNumber(inv.InvoiceNumber) ?? extractJobNumber(inv.Reference);
}

export interface JobReconciliationRow {
  jobId: string; // Buildxact sourceId
  jobNumber: string;
  client: string;
  bxCost: number; // committedCost + actualCost
  xeroBillsMatched: number;
  costVariance: number;
  costFlag: string | null;
  bxContractValue: number;
  xeroInvoicesMatched: number;
  revenueVariance: number;
  revenueFlag: string | null;
}

export interface OrphanedXeroRecord {
  type: "bill" | "invoice";
  id: string;
  number: string;
  party: string;
  amount: number;
  extractedJobNumber: string;
  date: string;
}

export interface ReconciliationResult {
  rows: JobReconciliationRow[];
  orphanedRecords: OrphanedXeroRecord[];
  source: "live" | "unavailable";
  error?: string;
}

function flagVariance(variance: number, base: number, label: string): string | null {
  const abs = Math.abs(variance);
  if (abs < 2000 && (base === 0 || abs / base < 0.2)) return null;
  const direction = variance > 0 ? "more" : "less";
  return `Xero shows $${Math.round(abs).toLocaleString()} ${direction} ${label} than Buildxact`;
}

export async function loadReconciliation(): Promise<ReconciliationResult> {
  try {
    const jobRows = await db.select().from(jobs).where(eq(jobs.source, "buildxact"));
    const activeJobs = jobRows.filter((j) => j.status !== "complete" && j.client.toUpperCase() !== "STOCK");
    if (activeJobs.length === 0) {
      return { rows: [], orphanedRecords: [], source: "unavailable", error: "No active Buildxact jobs synced yet." };
    }
    const activeJobIds = new Set(activeJobs.map((j) => j.id));

    const [billRows, invoiceRows] = await Promise.all([
      db.select().from(bills).where(eq(bills.source, "xero")),
      db.select().from(invoices).where(eq(invoices.source, "xero")),
    ]);

    const billsByJobId = new Map<string, number>();
    for (const b of billRows) {
      if (!b.jobId || !activeJobIds.has(b.jobId)) continue;
      billsByJobId.set(b.jobId, (billsByJobId.get(b.jobId) ?? 0) + b.amount);
    }
    const invoicesByJobId = new Map<string, number>();
    for (const inv of invoiceRows) {
      if (!inv.jobId || !activeJobIds.has(inv.jobId)) continue;
      invoicesByJobId.set(inv.jobId, (invoicesByJobId.get(inv.jobId) ?? 0) + inv.amount);
    }

    const rows: JobReconciliationRow[] = activeJobs.map((job) => {
      const bxCost = job.committedCost + job.actualCost;
      const xeroBillsMatched = billsByJobId.get(job.id) ?? 0;
      const costVariance = xeroBillsMatched - bxCost;
      const bxContractValue = job.contractValue + job.approvedVariations;
      const xeroInvoicesMatched = invoicesByJobId.get(job.id) ?? 0;
      const revenueVariance = xeroInvoicesMatched - bxContractValue;

      return {
        jobId: job.sourceId,
        jobNumber: job.jobNumber,
        client: job.client,
        bxCost,
        xeroBillsMatched,
        costVariance,
        costFlag:
          bxCost > 500 && xeroBillsMatched === 0
            ? `Buildxact shows $${Math.round(bxCost).toLocaleString()} of cost but no matched Xero bills`
            : flagVariance(costVariance, bxCost, "in matched bills"),
        bxContractValue,
        xeroInvoicesMatched,
        revenueVariance,
        revenueFlag:
          bxContractValue > 500 && xeroInvoicesMatched === 0
            ? `Buildxact shows a $${Math.round(bxContractValue).toLocaleString()} contract but no matched Xero invoices`
            : flagVariance(revenueVariance, bxContractValue, "in matched invoices"),
      };
    });

    // Orphaned: a Xero record that has an extractable job number (tracking
    // or regex) but doesn't match any known Buildxact job - a typo, an
    // archived/deleted job, or a genuinely orphaned entry.
    const jobNumberSet = new Set(jobRows.map((j) => j.jobNumber.toUpperCase()));
    const orphanedRecords: OrphanedXeroRecord[] = [];

    for (const b of billRows) {
      if (b.jobId) continue;
      const candidate = extractJobNumberFromRaw(b.raw);
      if (candidate && !jobNumberSet.has(candidate) && !LEGACY_CRM_JOB_RE.test(candidate)) {
        orphanedRecords.push({
          type: "bill",
          id: b.id,
          number: b.billNumber,
          party: (b.raw as XeroInvoice)?.Contact?.Name ?? "Unknown",
          amount: b.amount,
          extractedJobNumber: candidate,
          date: b.billDate ? b.billDate.toISOString().slice(0, 10) : "",
        });
      }
    }
    for (const inv of invoiceRows) {
      if (inv.jobId) continue;
      const candidate = extractJobNumberFromRaw(inv.raw);
      if (candidate && !jobNumberSet.has(candidate) && !LEGACY_CRM_JOB_RE.test(candidate)) {
        orphanedRecords.push({
          type: "invoice",
          id: inv.id,
          number: inv.invoiceNumber,
          party: (inv.raw as XeroInvoice)?.Contact?.Name ?? "Unknown",
          amount: inv.amount,
          extractedJobNumber: candidate,
          date: inv.issueDate ? inv.issueDate.toISOString().slice(0, 10) : "",
        });
      }
    }

    return {
      rows: rows.sort((a, b) => Math.abs(b.costVariance) + Math.abs(b.revenueVariance) - (Math.abs(a.costVariance) + Math.abs(a.revenueVariance))),
      orphanedRecords: orphanedRecords.sort((a, b) => b.date.localeCompare(a.date)),
      source: "live",
    };
  } catch (err) {
    return { rows: [], orphanedRecords: [], source: "unavailable", error: err instanceof Error ? err.message : "Unknown error reading the database" };
  }
}
