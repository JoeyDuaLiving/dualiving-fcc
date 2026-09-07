import type {
  BankAccount,
  Bill,
  Invoice,
  Job,
  JobMapping,
  ManualAdjustment,
  OperatingExpense,
  Opportunity,
  PaymentSchedule,
  PaymentScheduleStage,
  ReconciliationFlag,
  Settings,
} from "@/types";
import { addDays } from "./format";

// Was hardcoded to a fixed date ("2026-08-27") from early Phase 1
// development and never wired to the real clock - every date-relative
// calculation across the app (overdue bills, "current month", cash
// runway, forecast day-0, the Payables weekly buckets) was silently
// running against that frozen date, drifting further stale every day
// this app has been live. Now tracks the real date.
export const TODAY = new Date().toISOString().slice(0, 10);

// Small deterministic PRNG so mock data is stable across reloads/builds
// without hand-entering every random-looking value.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h;
}

// ---------------------------------------------------------------------------
// Bank
// ---------------------------------------------------------------------------

export const bankAccounts: BankAccount[] = [
  {
    id: "bank-1",
    source: "xero",
    sourceId: "xero-bank-088-001",
    name: "Dualiving Operating Account",
    accountNumber: "083-123 41 226 9981",
    balance: 118300,
    asOf: TODAY,
  },
  {
    id: "bank-2",
    source: "xero",
    sourceId: "xero-bank-088-002",
    name: "Dualiving GST Reserve",
    accountNumber: "083-123 41 227 0142",
    balance: 41750,
    asOf: TODAY,
  },
];

// ---------------------------------------------------------------------------
// Jobs (Buildxact)
// ---------------------------------------------------------------------------

interface JobSeed {
  id: string;
  jobNumber: string;
  client: string;
  product: string;
  location: string;
  status: Job["status"];
  progressPercent: number;
  contractValue: number;
  approvedVariations: number;
  originalBudgetCost: number;
  actualCost: number;
  committedCost: number;
  remainingForecastCost: number;
  startDate: string;
  expectedCompletion: string;
  contractedCompletion: string;
}

const jobSeeds: JobSeed[] = [
  // --- Active jobs ---
  {
    id: "DUA-1041", jobNumber: "J1041", client: "Henderson", product: "Granny Flat", location: "Cranbourne VIC",
    status: "in_progress", progressPercent: 88, contractValue: 195000, approvedVariations: 6500,
    originalBudgetCost: 142000, actualCost: 148500, committedCost: 3000, remainingForecastCost: 3000,
    startDate: "2026-04-06", expectedCompletion: "2026-09-05", contractedCompletion: "2026-09-05",
  },
  {
    id: "DUA-1042", jobNumber: "J1042", client: "Whitfield", product: "Pod", location: "Frankston VIC",
    status: "in_progress", progressPercent: 55, contractValue: 128000, approvedVariations: 0,
    originalBudgetCost: 92000, actualCost: 54000, committedCost: 12000, remainingForecastCost: 24000,
    startDate: "2026-06-01", expectedCompletion: "2026-10-10", contractedCompletion: "2026-10-10",
  },
  {
    id: "DUA-1043", jobNumber: "J1043", client: "Nguyen", product: "Studio", location: "Berwick VIC",
    status: "in_progress", progressPercent: 42, contractValue: 168000, approvedVariations: 3200,
    originalBudgetCost: 121000, actualCost: 78000, committedCost: 15000, remainingForecastCost: 68000,
    startDate: "2026-06-15", expectedCompletion: "2026-11-14", contractedCompletion: "2026-10-30",
  },
  {
    id: "DUA-1044", jobNumber: "J1044", client: "Carmichael", product: "Custom Build", location: "Mornington VIC",
    status: "in_progress", progressPercent: 28, contractValue: 412000, approvedVariations: 18000,
    originalBudgetCost: 305000, actualCost: 96000, committedCost: 62000, remainingForecastCost: 165000,
    startDate: "2026-05-18", expectedCompletion: "2027-01-30", contractedCompletion: "2027-01-30",
  },
  {
    id: "DUA-1045", jobNumber: "J1045", client: "Doyle", product: "Granny Flat", location: "Pakenham VIC",
    status: "in_progress", progressPercent: 62, contractValue: 205000, approvedVariations: 0,
    originalBudgetCost: 151000, actualCost: 132000, committedCost: 9000, remainingForecastCost: 118000,
    startDate: "2026-05-04", expectedCompletion: "2026-10-02", contractedCompletion: "2026-09-25",
  },
  {
    id: "DUA-1046", jobNumber: "J1046", client: "Okafor", product: "Pod", location: "Officer VIC",
    status: "in_progress", progressPercent: 18, contractValue: 132000, approvedVariations: 0,
    originalBudgetCost: 95000, actualCost: 21000, committedCost: 8000, remainingForecastCost: 64000,
    startDate: "2026-07-20", expectedCompletion: "2026-12-01", contractedCompletion: "2026-12-01",
  },
  {
    id: "DUA-1047", jobNumber: "J1047", client: "Vasquez", product: "Studio", location: "Clyde North VIC",
    status: "practical_completion", progressPercent: 96, contractValue: 175000, approvedVariations: 4500,
    originalBudgetCost: 126000, actualCost: 129000, committedCost: 1000, remainingForecastCost: 2000,
    startDate: "2026-03-16", expectedCompletion: "2026-09-01", contractedCompletion: "2026-09-01",
  },
  {
    id: "DUA-1048", jobNumber: "J1048", client: "Reyes", product: "Custom Build", location: "Narre Warren VIC",
    status: "in_progress", progressPercent: 47, contractValue: 388000, approvedVariations: 9000,
    originalBudgetCost: 296000, actualCost: 168000, committedCost: 44000, remainingForecastCost: 140000,
    startDate: "2026-04-27", expectedCompletion: "2027-01-15", contractedCompletion: "2026-12-20",
  },
  {
    id: "DUA-1049", jobNumber: "J1049", client: "Tan", product: "Granny Flat", location: "Clyde VIC",
    status: "in_progress", progressPercent: 12, contractValue: 198000, approvedVariations: 0,
    originalBudgetCost: 145000, actualCost: 14000, committedCost: 6000, remainingForecastCost: 120000,
    startDate: "2026-08-03", expectedCompletion: "2026-12-22", contractedCompletion: "2026-12-22",
  },
  {
    id: "DUA-1050", jobNumber: "J1050", client: "Ferraro", product: "Pod", location: "Hampton Park VIC",
    status: "on_hold", progressPercent: 24, contractValue: 122000, approvedVariations: 0,
    originalBudgetCost: 89000, actualCost: 34000, committedCost: 2000, remainingForecastCost: 50000,
    startDate: "2026-05-25", expectedCompletion: "2026-12-19", contractedCompletion: "2026-11-01",
  },
  // --- Completed jobs ---
  {
    id: "DUA-1030", jobNumber: "J1030", client: "Anderson", product: "Granny Flat", location: "Cranbourne VIC",
    status: "complete", progressPercent: 100, contractValue: 190000, approvedVariations: 2000,
    originalBudgetCost: 140000, actualCost: 136000, committedCost: 0, remainingForecastCost: 0,
    startDate: "2025-11-03", expectedCompletion: "2026-04-18", contractedCompletion: "2026-04-20",
  },
  {
    id: "DUA-1031", jobNumber: "J1031", client: "Braithwaite", product: "Pod", location: "Frankston VIC",
    status: "complete", progressPercent: 100, contractValue: 118000, approvedVariations: 0,
    originalBudgetCost: 86000, actualCost: 91500, committedCost: 0, remainingForecastCost: 0,
    startDate: "2025-12-01", expectedCompletion: "2026-05-02", contractedCompletion: "2026-04-25",
  },
  {
    id: "DUA-1032", jobNumber: "J1032", client: "Cusack", product: "Studio", location: "Berwick VIC",
    status: "complete", progressPercent: 100, contractValue: 165000, approvedVariations: 5000,
    originalBudgetCost: 118000, actualCost: 114000, committedCost: 0, remainingForecastCost: 0,
    startDate: "2025-10-13", expectedCompletion: "2026-03-20", contractedCompletion: "2026-03-15",
  },
  {
    id: "DUA-1033", jobNumber: "J1033", client: "Delacroix", product: "Custom Build", location: "Mornington VIC",
    status: "complete", progressPercent: 100, contractValue: 395000, approvedVariations: 12000,
    originalBudgetCost: 298000, actualCost: 312000, committedCost: 0, remainingForecastCost: 0,
    startDate: "2025-08-11", expectedCompletion: "2026-06-30", contractedCompletion: "2026-05-30",
  },
  {
    id: "DUA-1034", jobNumber: "J1034", client: "Emerson", product: "Granny Flat", location: "Officer VIC",
    status: "complete", progressPercent: 100, contractValue: 175000, approvedVariations: 0,
    originalBudgetCost: 128000, actualCost: 122000, committedCost: 0, remainingForecastCost: 0,
    startDate: "2025-12-15", expectedCompletion: "2026-05-28", contractedCompletion: "2026-05-25",
  },
];

function directCostBreakdown(total: number, seed: number) {
  const rnd = mulberry32(seed);
  const weights = {
    labour: 0.33 + rnd() * 0.04,
    materials: 0.28 + rnd() * 0.04,
    subcontractors: 0.22 + rnd() * 0.04,
    freight: 0.03 + rnd() * 0.01,
    engineering: 0.03 + rnd() * 0.01,
    siteCosts: 0.03 + rnd() * 0.01,
    other: 0.01,
  };
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  return {
    labour: Math.round((weights.labour / sum) * total),
    materials: Math.round((weights.materials / sum) * total),
    subcontractors: Math.round((weights.subcontractors / sum) * total),
    freight: Math.round((weights.freight / sum) * total),
    engineering: Math.round((weights.engineering / sum) * total),
    siteCosts: Math.round((weights.siteCosts / sum) * total),
    other: Math.round((weights.other / sum) * total),
  };
}

export const jobs: Job[] = jobSeeds.map((s) => {
  const forecastFinalCost = s.actualCost + s.committedCost + s.remainingForecastCost;
  return {
    id: s.id,
    source: "buildxact",
    sourceId: `bx-${s.jobNumber}`,
    jobNumber: s.jobNumber,
    client: s.client,
    product: s.product,
    status: s.status,
    location: s.location,
    contractValue: s.contractValue,
    approvedVariations: s.approvedVariations,
    originalBudgetRevenue: s.contractValue,
    originalBudgetCost: s.originalBudgetCost,
    actualCost: s.actualCost,
    committedCost: s.committedCost,
    remainingForecastCost: s.remainingForecastCost,
    progressPercent: s.progressPercent,
    startDate: s.startDate,
    expectedCompletion: s.expectedCompletion,
    contractedCompletion: s.contractedCompletion,
    paymentScheduleId: `ps-${s.id}`,
    marginTargetPercent: 25,
    directCostBreakdown: directCostBreakdown(forecastFinalCost, seedFromId(s.id)),
  };
});

export const jobMappings: JobMapping[] = jobs.map((j) => ({
  dualivingJobId: j.id,
  buildxactJobId: j.sourceId,
  buildxactJobNumber: j.jobNumber,
  xeroTrackingCategoryOptionId: `xero-track-${j.jobNumber}`,
  xeroContactId: `xero-contact-${j.client.toLowerCase()}`,
  ghlOpportunityId: undefined,
  matchConfidence: "confirmed",
}));

// ---------------------------------------------------------------------------
// Payment schedules + invoices (derived together so amounts stay consistent)
// ---------------------------------------------------------------------------

const STAGE_TEMPLATE = [
  { label: "Deposit", percent: 0.1, trigger: "Contract signing" },
  { label: "Base Stage", percent: 0.15, trigger: "Base/slab complete" },
  { label: "Frame Stage", percent: 0.2, trigger: "Frame complete" },
  { label: "Lock-up Stage", percent: 0.25, trigger: "Lock-up complete" },
  { label: "Fixing Stage", percent: 0.2, trigger: "Fixing complete" },
  { label: "Practical Completion", percent: 0.1, trigger: "PC / handover" },
];

export const paymentSchedules: PaymentSchedule[] = [];
export const invoices: Invoice[] = [];

let invoiceCounter = 4400;

for (const job of jobs) {
  const revisedRevenue = job.contractValue + job.approvedVariations;
  const rnd = mulberry32(seedFromId(job.id));
  const stages: PaymentScheduleStage[] = [];
  let cumulativePercent = 0;
  const totalSpan = Math.max(
    30,
    (new Date(job.expectedCompletion).getTime() - new Date(job.startDate).getTime()) / 86400000
  );

  STAGE_TEMPLATE.forEach((tpl, idx) => {
    cumulativePercent += tpl.percent * 100;
    const stageDate = addDays(job.startDate, Math.round(totalSpan * cumulativePercent) / 100);
    const isComplete = job.status === "complete";
    // A stage can only have been invoiced if its milestone date has actually
    // arrived - progress can outpace the calendar model for jobs nearing
    // completion, but you can't issue an invoice dated in the future.
    const invoiced = (isComplete || job.progressPercent >= cumulativePercent - 5) && stageDate <= TODAY;
    const stageId = `${job.id}-stage-${idx + 1}`;
    const amount = Math.round(revisedRevenue * tpl.percent);

    stages.push({
      id: stageId,
      label: tpl.label,
      percentOfContract: tpl.percent * 100,
      triggerDescription: tpl.trigger,
      expectedDate: stageDate,
      invoiced,
      invoiceId: invoiced ? `INV-${invoiceCounter}` : undefined,
    });

    if (invoiced) {
      invoiceCounter += 1;
      const issueDate = stageDate;
      const dueDate = addDays(issueDate, 14);
      const overdueDaysIfUnpaid = Math.max(0, Math.round((new Date(TODAY).getTime() - new Date(dueDate).getTime()) / 86400000));

      // Vary payment status: most paid, a handful outstanding/overdue for AR ageing.
      const paymentRoll = rnd();
      let amountPaid = amount;
      let status: Invoice["status"] = "paid";

      if (overdueDaysIfUnpaid <= 0) {
        // due date hasn't passed yet
        if (paymentRoll < 0.55) {
          amountPaid = amount;
          status = "paid";
        } else {
          amountPaid = 0;
          status = "sent";
        }
      } else if (overdueDaysIfUnpaid > 45) {
        // due date passed well over a month ago - in a functioning business
        // this has been collected by now, so it no longer sits in AR ageing.
        amountPaid = amount;
        status = "paid";
      } else {
        // due date passed recently - this is where genuine AR ageing sits
        if (paymentRoll < 0.75) {
          amountPaid = amount;
          status = "paid";
        } else if (paymentRoll < 0.92) {
          amountPaid = Math.round(amount * 0.5);
          status = "part_paid";
        } else {
          amountPaid = 0;
          status = "overdue";
        }
      }

      invoices.push({
        id: `inv-${job.id}-${idx + 1}`,
        source: "xero",
        sourceId: `xero-${stageId}`,
        invoiceNumber: `INV-${invoiceCounter - 1}`,
        jobId: job.id,
        customer: job.client,
        description: `${job.product} - ${tpl.label} (${job.jobNumber})`,
        amount,
        amountPaid,
        amountOutstanding: amount - amountPaid,
        issueDate,
        dueDate,
        status,
      });
    }
  });

  paymentSchedules.push({ id: `ps-${job.id}`, jobId: job.id, stages });
}

// A couple of standalone (non-job) invoices — e.g. minor variation works, callbacks
invoices.push(
  {
    id: "inv-misc-1", source: "xero", sourceId: "xero-misc-1", invoiceNumber: "INV-4498",
    jobId: undefined, customer: "Anderson (post-handover)", description: "Minor callback works - fence repair",
    amount: 1450, amountPaid: 1450, amountOutstanding: 0, issueDate: "2026-07-30", dueDate: "2026-08-13", status: "paid",
  },
  {
    id: "inv-misc-2", source: "xero", sourceId: "xero-misc-2", invoiceNumber: "INV-4501",
    jobId: undefined, customer: "Delacroix (post-handover)", description: "Variation - additional decking",
    amount: 3200, amountPaid: 0, amountOutstanding: 3200, issueDate: "2026-08-15", dueDate: "2026-08-29", status: "sent",
  }
);

// ---------------------------------------------------------------------------
// Supplier bills (Xero)
// ---------------------------------------------------------------------------

export const bills: Bill[] = [
  { id: "bill-1", source: "xero", sourceId: "xero-bill-1", billNumber: "BILL-2201", jobId: "DUA-1042", supplier: "Southern Steel Frames", description: "Frame package - Whitfield", category: "Subcontractors", amount: 18400, amountPaid: 18400, amountOutstanding: 0, billDate: "2026-08-02", dueDate: "2026-08-16", status: "paid" },
  { id: "bill-2", source: "xero", sourceId: "xero-bill-2", billNumber: "BILL-2202", jobId: "DUA-1045", supplier: "Doyle Timber & Trusses", description: "Truss package - Doyle", category: "Materials", amount: 22750, amountPaid: 0, amountOutstanding: 22750, billDate: "2026-08-19", dueDate: "2026-09-02", status: "approved" },
  { id: "bill-3", source: "xero", sourceId: "xero-bill-3", billNumber: "BILL-2203", jobId: "DUA-1045", supplier: "Prime Plumbing Group", description: "Rough-in plumbing - Doyle", category: "Subcontractors", amount: 9800, amountPaid: 0, amountOutstanding: 9800, billDate: "2026-08-21", dueDate: "2026-09-04", status: "approved" },
  { id: "bill-4", source: "xero", sourceId: "xero-bill-4", billNumber: "BILL-2204", jobId: "DUA-1043", supplier: "Nguyen Concrete Co", description: "Slab + base stage - Nguyen", category: "Subcontractors", amount: 14200, amountPaid: 14200, amountOutstanding: 0, billDate: "2026-07-18", dueDate: "2026-08-01", status: "paid" },
  { id: "bill-5", source: "xero", sourceId: "xero-bill-5", billNumber: "BILL-2205", jobId: "DUA-1044", supplier: "Carmichael Excavation", description: "Site cut & excavation", category: "Site Costs", amount: 26500, amountPaid: 26500, amountOutstanding: 0, billDate: "2026-07-05", dueDate: "2026-07-19", status: "paid" },
  { id: "bill-6", source: "xero", sourceId: "xero-bill-6", billNumber: "BILL-2206", jobId: "DUA-1048", supplier: "Reyes Electrical", description: "Rough-in electrical", category: "Subcontractors", amount: 17300, amountPaid: 0, amountOutstanding: 17300, billDate: "2026-08-24", dueDate: "2026-09-07", status: "approved" },
  { id: "bill-7", source: "xero", sourceId: "xero-bill-7", billNumber: "BILL-2207", jobId: "DUA-1048", supplier: "Metro Roofing Supplies", description: "Roofing materials", category: "Materials", amount: 12900, amountPaid: 0, amountOutstanding: 12900, billDate: "2026-08-20", dueDate: "2026-09-03", status: "approved" },
  { id: "bill-8", source: "xero", sourceId: "xero-bill-8", billNumber: "BILL-2208", jobId: "DUA-1046", supplier: "Okafor Site Sheds", description: "Site establishment", category: "Site Costs", amount: 6200, amountPaid: 6200, amountOutstanding: 0, billDate: "2026-07-28", dueDate: "2026-08-11", status: "paid" },
  { id: "bill-9", source: "xero", sourceId: "xero-bill-9", billNumber: "BILL-2209", jobId: "DUA-1047", supplier: "Vasquez Painting", description: "Final paint & touch-ups", category: "Subcontractors", amount: 4100, amountPaid: 0, amountOutstanding: 4100, billDate: "2026-08-22", dueDate: "2026-09-05", status: "approved" },
  { id: "bill-10", source: "xero", sourceId: "xero-bill-10", billNumber: "BILL-2210", jobId: "DUA-1041", supplier: "Henderson Landscaping", description: "Final landscaping & fencing", category: "Subcontractors", amount: 5600, amountPaid: 0, amountOutstanding: 5600, billDate: "2026-08-18", dueDate: "2026-09-01", status: "approved" },
  { id: "bill-11", source: "xero", sourceId: "xero-bill-11", billNumber: "BILL-2211", jobId: "DUA-1033", supplier: "Delacroix Joinery", description: "Custom joinery overrun", category: "Materials", amount: 15800, amountPaid: 15800, amountOutstanding: 0, billDate: "2026-06-10", dueDate: "2026-06-24", status: "paid" },
  { id: "bill-12", source: "xero", sourceId: "xero-bill-12", billNumber: "BILL-2212", jobId: "DUA-1049", supplier: "Tan Earthworks", description: "Site cut & pad prep", category: "Site Costs", amount: 8900, amountPaid: 0, amountOutstanding: 8900, billDate: "2026-08-15", dueDate: "2026-08-29", status: "approved" },
  { id: "bill-13", source: "xero", sourceId: "xero-bill-13", billNumber: "BILL-2213", jobId: "DUA-1050", supplier: "Ferraro Frame Supplies", description: "Frame timber package", category: "Materials", amount: 11200, amountPaid: 0, amountOutstanding: 11200, billDate: "2026-08-08", dueDate: "2026-08-22", status: "overdue" },
  { id: "bill-14", source: "xero", sourceId: "xero-bill-14", billNumber: "BILL-2214", jobId: undefined, supplier: "National Skip Bins", description: "Waste management - fleet-wide", category: "Site Costs", amount: 2450, amountPaid: 2450, amountOutstanding: 0, billDate: "2026-08-05", dueDate: "2026-08-19", status: "paid" },
  { id: "bill-15", source: "xero", sourceId: "xero-bill-15", billNumber: "BILL-2215", jobId: "DUA-1042", supplier: "Southern Steel Frames", description: "Frame variation - additional bracing", category: "Subcontractors", amount: 3100, amountPaid: 0, amountOutstanding: 3100, billDate: "2026-08-25", dueDate: "2026-09-08", status: "awaiting_approval" },
];

// ---------------------------------------------------------------------------
// Operating expenses (Xero, non-job overheads)
// ---------------------------------------------------------------------------

function monthsAgo(n: number, day: number): string {
  const [y, m] = TODAY.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - n);
  d.setUTCDate(day);
  return d.toISOString().slice(0, 10);
}

export const operatingExpenses: OperatingExpense[] = [
  // Current month (Aug 2026)
  { id: "opex-1", source: "xero", sourceId: "xero-opex-1", category: "wages", classification: "fixed", description: "Office & admin payroll", amount: 24500, date: monthsAgo(0, 15), recurring: true },
  { id: "opex-2", source: "xero", sourceId: "xero-opex-2", category: "rent", classification: "fixed", description: "Office & yard lease", amount: 6200, date: monthsAgo(0, 1), recurring: true },
  { id: "opex-3", source: "xero", sourceId: "xero-opex-3", category: "insurance", classification: "fixed", description: "Contract works & public liability insurance", amount: 3800, date: monthsAgo(0, 3), recurring: true },
  { id: "opex-4", source: "xero", sourceId: "xero-opex-4", category: "software", classification: "fixed", description: "Buildxact + Xero + GHL subscriptions", amount: 1450, date: monthsAgo(0, 5), recurring: true },
  { id: "opex-5", source: "xero", sourceId: "xero-opex-5", category: "vehicles", classification: "variable", description: "Ute lease payments (x3)", amount: 4100, date: monthsAgo(0, 2), recurring: true },
  { id: "opex-6", source: "xero", sourceId: "xero-opex-6", category: "fuel", classification: "variable", description: "Fleet fuel", amount: 2680, date: monthsAgo(0, 18), recurring: false },
  { id: "opex-7", source: "xero", sourceId: "xero-opex-7", category: "marketing", classification: "variable", description: "Meta & Google Ads", amount: 5200, date: monthsAgo(0, 4), recurring: true },
  { id: "opex-8", source: "xero", sourceId: "xero-opex-8", category: "phones", classification: "fixed", description: "Mobile plans", amount: 640, date: monthsAgo(0, 7), recurring: true },
  { id: "opex-9", source: "xero", sourceId: "xero-opex-9", category: "accounting", classification: "fixed", description: "Bookkeeping services", amount: 1800, date: monthsAgo(0, 10), recurring: true },
  { id: "opex-10", source: "xero", sourceId: "xero-opex-10", category: "professional_fees", classification: "variable", description: "Legal - contract review", amount: 1200, date: monthsAgo(0, 12), recurring: false },
  { id: "opex-11", source: "xero", sourceId: "xero-opex-11", category: "finance", classification: "fixed", description: "Business loan repayment", amount: 3400, date: monthsAgo(0, 1), recurring: true },
  { id: "opex-12", source: "xero", sourceId: "xero-opex-12", category: "office", classification: "variable", description: "Office supplies & printing", amount: 480, date: monthsAgo(0, 9), recurring: false },
  { id: "opex-13", source: "xero", sourceId: "xero-opex-13", category: "utilities", classification: "variable", description: "Electricity & water - office/yard", amount: 890, date: monthsAgo(0, 6), recurring: true },
  { id: "opex-14", source: "xero", sourceId: "xero-opex-14", category: "advertising", classification: "variable", description: "Local print advertising", amount: 650, date: monthsAgo(0, 14), recurring: false },
  { id: "opex-15", source: "xero", sourceId: "xero-opex-15", category: "other", classification: "variable", description: "Site amenities hire", amount: 920, date: monthsAgo(0, 16), recurring: false },

  // Previous month (Jul 2026)
  { id: "opex-16", source: "xero", sourceId: "xero-opex-16", category: "wages", classification: "fixed", description: "Office & admin payroll", amount: 24500, date: monthsAgo(1, 15), recurring: true },
  { id: "opex-17", source: "xero", sourceId: "xero-opex-17", category: "rent", classification: "fixed", description: "Office & yard lease", amount: 6200, date: monthsAgo(1, 1), recurring: true },
  { id: "opex-18", source: "xero", sourceId: "xero-opex-18", category: "insurance", classification: "fixed", description: "Vehicle insurance renewal", amount: 2900, date: monthsAgo(1, 20), recurring: false },
  { id: "opex-19", source: "xero", sourceId: "xero-opex-19", category: "software", classification: "fixed", description: "Buildxact + Xero + GHL subscriptions", amount: 1450, date: monthsAgo(1, 5), recurring: true },
  { id: "opex-20", source: "xero", sourceId: "xero-opex-20", category: "vehicles", classification: "variable", description: "Ute lease payments (x3)", amount: 4100, date: monthsAgo(1, 2), recurring: true },
  { id: "opex-21", source: "xero", sourceId: "xero-opex-21", category: "fuel", classification: "variable", description: "Fleet fuel", amount: 3120, date: monthsAgo(1, 17), recurring: false },
  { id: "opex-22", source: "xero", sourceId: "xero-opex-22", category: "marketing", classification: "variable", description: "Meta & Google Ads", amount: 4800, date: monthsAgo(1, 4), recurring: true },
  { id: "opex-23", source: "xero", sourceId: "xero-opex-23", category: "phones", classification: "fixed", description: "Mobile plans", amount: 640, date: monthsAgo(1, 7), recurring: true },
  { id: "opex-24", source: "xero", sourceId: "xero-opex-24", category: "accounting", classification: "fixed", description: "Bookkeeping services", amount: 1800, date: monthsAgo(1, 10), recurring: true },
  { id: "opex-25", source: "xero", sourceId: "xero-opex-25", category: "finance", classification: "fixed", description: "Business loan repayment", amount: 3400, date: monthsAgo(1, 1), recurring: true },
  { id: "opex-26", source: "xero", sourceId: "xero-opex-26", category: "office", classification: "variable", description: "Office supplies & printing", amount: 310, date: monthsAgo(1, 9), recurring: false },
  { id: "opex-27", source: "xero", sourceId: "xero-opex-27", category: "utilities", classification: "variable", description: "Electricity & water - office/yard", amount: 860, date: monthsAgo(1, 6), recurring: true },
  { id: "opex-28", source: "xero", sourceId: "xero-opex-28", category: "professional_fees", classification: "variable", description: "Accountant - EOFY prep", amount: 2600, date: monthsAgo(1, 22), recurring: false },
  { id: "opex-29", source: "xero", sourceId: "xero-opex-29", category: "advertising", classification: "variable", description: "Local print advertising", amount: 650, date: monthsAgo(1, 14), recurring: false },
  { id: "opex-30", source: "xero", sourceId: "xero-opex-30", category: "other", classification: "variable", description: "Site amenities hire", amount: 920, date: monthsAgo(1, 16), recurring: false },
];

// ---------------------------------------------------------------------------
// GHL pipeline opportunities
// ---------------------------------------------------------------------------

export const opportunities: Opportunity[] = [
  { id: "opp-1", source: "ghl", sourceId: "ghl-opp-1", name: "Sinclair - Granny Flat Feasibility", contact: "Marcus Sinclair", pipeline: "New Business", stage: "feasibility", value: 185000, probabilityPercent: 40, expectedCloseDate: "2026-09-18", salesperson: "Priya Malhotra", leadSource: "Website", product: "Granny Flat", location: "Pakenham VIC", depositPercent: 10 },
  { id: "opp-2", source: "ghl", sourceId: "ghl-opp-2", name: "Doran - Pod Proposal", contact: "Ellie Doran", pipeline: "New Business", stage: "proposal", value: 128000, probabilityPercent: 55, expectedCloseDate: "2026-09-10", salesperson: "Priya Malhotra", leadSource: "Referral", product: "Pod", location: "Frankston VIC", depositPercent: 10 },
  { id: "opp-3", source: "ghl", sourceId: "ghl-opp-3", name: "Castellano - Custom Build Contract", contact: "Luca Castellano", pipeline: "New Business", stage: "contract", value: 445000, probabilityPercent: 80, expectedCloseDate: "2026-09-05", salesperson: "James Whitlock", leadSource: "Referral", product: "Custom Build", location: "Mornington VIC", depositPercent: 10 },
  { id: "opp-4", source: "ghl", sourceId: "ghl-opp-4", name: "Petrova - Studio Qualified", contact: "Anna Petrova", pipeline: "New Business", stage: "qualified", value: 162000, probabilityPercent: 25, expectedCloseDate: "2026-10-30", salesperson: "James Whitlock", leadSource: "Instagram", product: "Studio", location: "Berwick VIC", depositPercent: 10 },
  { id: "opp-5", source: "ghl", sourceId: "ghl-opp-5", name: "Nakamura - Granny Flat Lead", contact: "Kenji Nakamura", pipeline: "New Business", stage: "lead", value: 195000, probabilityPercent: 10, expectedCloseDate: "2026-11-20", salesperson: "Priya Malhotra", leadSource: "Website", product: "Granny Flat", location: "Officer VIC", depositPercent: 10 },
  { id: "opp-6", source: "ghl", sourceId: "ghl-opp-6", name: "Blackwood - Pod Proposal", contact: "Sam Blackwood", pipeline: "New Business", stage: "proposal", value: 135000, probabilityPercent: 55, expectedCloseDate: "2026-09-22", salesperson: "James Whitlock", leadSource: "Google Ads", product: "Pod", location: "Clyde North VIC", depositPercent: 10 },
  { id: "opp-7", source: "ghl", sourceId: "ghl-opp-7", name: "Farrow - Custom Build Feasibility", contact: "Diane Farrow", pipeline: "New Business", stage: "feasibility", value: 520000, probabilityPercent: 35, expectedCloseDate: "2026-12-05", salesperson: "James Whitlock", leadSource: "Referral", product: "Custom Build", location: "Mount Eliza VIC", depositPercent: 10 },
  { id: "opp-8", source: "ghl", sourceId: "ghl-opp-8", name: "Iverson - Studio Contract", contact: "Grace Iverson", pipeline: "New Business", stage: "contract", value: 172000, probabilityPercent: 85, expectedCloseDate: "2026-09-01", salesperson: "Priya Malhotra", leadSource: "Referral", product: "Studio", location: "Cranbourne VIC", depositPercent: 10 },
  { id: "opp-9", source: "ghl", sourceId: "ghl-opp-9", name: "Kowalski - Granny Flat Qualified", contact: "Tomasz Kowalski", pipeline: "New Business", stage: "qualified", value: 205000, probabilityPercent: 25, expectedCloseDate: "2026-10-15", salesperson: "Priya Malhotra", leadSource: "Website", product: "Granny Flat", location: "Clyde VIC", depositPercent: 10 },
  { id: "opp-10", source: "ghl", sourceId: "ghl-opp-10", name: "Ahmadi - Pod Lead", contact: "Leila Ahmadi", pipeline: "New Business", stage: "lead", value: 118000, probabilityPercent: 10, expectedCloseDate: "2026-11-30", salesperson: "James Whitlock", leadSource: "Instagram", product: "Pod", location: "Hampton Park VIC", depositPercent: 10 },
  { id: "opp-11", source: "ghl", sourceId: "ghl-opp-11", name: "Osei - Studio Proposal", contact: "Kwame Osei", pipeline: "New Business", stage: "proposal", value: 158000, probabilityPercent: 55, expectedCloseDate: "2026-09-28", salesperson: "Priya Malhotra", leadSource: "Referral", product: "Studio", location: "Berwick VIC", depositPercent: 10 },
  { id: "opp-12", source: "ghl", sourceId: "ghl-opp-12", name: "Villanueva - Granny Flat Feasibility", contact: "Rosa Villanueva", pipeline: "New Business", stage: "feasibility", value: 189000, probabilityPercent: 40, expectedCloseDate: "2026-10-08", salesperson: "James Whitlock", leadSource: "Website", product: "Granny Flat", location: "Pakenham VIC", depositPercent: 10 },
  { id: "opp-13", source: "ghl", sourceId: "ghl-opp-13", name: "Thornbury - Custom Build Qualified", contact: "Hugh Thornbury", pipeline: "New Business", stage: "qualified", value: 398000, probabilityPercent: 25, expectedCloseDate: "2026-12-20", salesperson: "James Whitlock", leadSource: "Referral", product: "Custom Build", location: "Mornington VIC", depositPercent: 10 },
  { id: "opp-14", source: "ghl", sourceId: "ghl-opp-14", name: "Delgado - Pod Contract", contact: "Mateo Delgado", pipeline: "New Business", stage: "contract", value: 122000, probabilityPercent: 80, expectedCloseDate: "2026-09-08", salesperson: "Priya Malhotra", leadSource: "Google Ads", product: "Pod", location: "Officer VIC", depositPercent: 10 },
  { id: "opp-15", source: "ghl", sourceId: "ghl-opp-15", name: "Bianchi - Studio Lead", contact: "Sofia Bianchi", pipeline: "New Business", stage: "lead", value: 149000, probabilityPercent: 10, expectedCloseDate: "2026-12-01", salesperson: "James Whitlock", leadSource: "Instagram", product: "Studio", location: "Narre Warren VIC", depositPercent: 10 },
];

// ---------------------------------------------------------------------------
// Reconciliation flags (Buildxact vs Xero vs GHL)
// ---------------------------------------------------------------------------

export const reconciliationFlags: ReconciliationFlag[] = [
  {
    id: "recon-1", jobId: "DUA-1033", type: "cost_variance", severity: "warning",
    description: "Buildxact budget cost for Delacroix ($298,000) is well below Xero-recorded job cost ($312,000 + $15,800 joinery overrun bill).",
    buildxactValue: 298000, xeroValue: 327800, variance: 29800, resolved: false,
  },
  {
    id: "recon-2", jobId: "DUA-1045", type: "po_bill_variance", severity: "info",
    description: "Doyle truss package PO in Buildxact ($21,900) differs from the Xero bill received ($22,750).",
    buildxactValue: 21900, xeroValue: 22750, variance: 850, resolved: false,
  },
  {
    id: "recon-3", jobId: "DUA-1050", type: "payment_variance", severity: "warning",
    description: "Ferraro frame supplies bill is overdue in Xero but the job is on hold in Buildxact - confirm whether to release payment.",
    buildxactValue: undefined, xeroValue: 11200, variance: undefined, resolved: false,
  },
  {
    id: "recon-4", jobId: "DUA-1031", type: "cost_variance", severity: "info",
    description: "Braithwaite actual cost slightly exceeds original budget ($91,500 vs $86,000) - within normal tolerance, no action required.",
    buildxactValue: 86000, xeroValue: 91500, variance: 5500, resolved: true,
  },
];

// ---------------------------------------------------------------------------
// Manual adjustments (example of an override, for the audit trail)
// ---------------------------------------------------------------------------

export const manualAdjustments: ManualAdjustment[] = [
  {
    id: "adj-1",
    field: "Expected customer payment date",
    jobId: "DUA-1044",
    originalValue: "2026-09-15",
    newValue: "2026-09-29",
    reason: "Carmichael confirmed frame-stage sign-off will slip two weeks due to engineering revisions.",
    user: "joey@dualiving.com.au",
    date: "2026-08-20",
  },
];

export const settings: Settings = {
  minimumCashBuffer: 100000,
  defaultDepositPercent: 10,
  marginTargetPercent: 25,
  activeScenario: "base",
};
