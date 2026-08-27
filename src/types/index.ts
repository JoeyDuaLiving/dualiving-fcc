// ---------------------------------------------------------------------------
// Core domain types for the Dualiving Financial Command Centre.
//
// SYSTEM OF RECORD:
//   Buildxact -> jobs, budgets, actual/committed costs, PO's, job progress
//   Xero      -> bank, invoices, payments, bills, opex, chart of accounts
//   GHL       -> pipeline opportunities
//   Sheets    -> manual overrides / assumptions only (never a primary source
//                for data that already exists in Buildxact or Xero)
//
// Every record that originates in an external system carries `source` and
// `sourceId` so re-syncing can never create a duplicate.
//
// Every forecast/financial item carries a `Confidence` so ACTUAL, COMMITTED,
// FORECAST and POTENTIAL money is never mixed together in a total.
// ---------------------------------------------------------------------------

export type Source = "buildxact" | "xero" | "ghl" | "sheet" | "manual";

/**
 * The single most important classification in the system.
 * See rule #7 of the build spec — never mix these categories.
 */
export type Confidence = "actual" | "committed" | "forecast" | "potential";

export type CashDirection = "inflow" | "outflow";

export type JobStatus =
  | "quoting"
  | "contracted"
  | "in_progress"
  | "practical_completion"
  | "complete"
  | "on_hold";

export interface JobMapping {
  dualivingJobId: string; // DUA-1045 style master id
  buildxactJobId: string;
  buildxactJobNumber: string;
  xeroTrackingCategoryOptionId?: string;
  xeroContactId?: string;
  ghlOpportunityId?: string;
  matchConfidence: "confirmed" | "probable" | "unmatched";
}

export interface Job {
  id: string; // DUA-1045
  source: "buildxact";
  sourceId: string;
  jobNumber: string;
  client: string;
  product: string; // pod / studio / granny flat / custom
  status: JobStatus;
  location: string;
  contractValue: number;
  approvedVariations: number;
  originalBudgetRevenue: number;
  originalBudgetCost: number;
  actualCost: number; // from Buildxact actual cost ledger
  committedCost: number; // open POs / commitments
  remainingForecastCost: number; // BX estimate-to-complete
  progressPercent: number;
  startDate: string;
  expectedCompletion: string;
  contractedCompletion: string;
  paymentScheduleId: string;
  marginTargetPercent: number; // management target, configurable in Settings
  directCostBreakdown: {
    labour: number;
    materials: number;
    subcontractors: number;
    freight: number;
    engineering: number;
    siteCosts: number;
    other: number;
  };
}

export interface PaymentScheduleStage {
  id: string;
  label: string; // e.g. "Deposit", "Base Stage", "Frame Stage", "Practical Completion"
  percentOfContract: number;
  triggerDescription: string;
  expectedDate: string; // forecast trigger date, can be overridden
  invoiced: boolean;
  invoiceId?: string;
}

export interface PaymentSchedule {
  id: string;
  jobId: string;
  stages: PaymentScheduleStage[];
}

// --- Xero -------------------------------------------------------------

export interface BankAccount {
  id: string;
  source: "xero";
  sourceId: string;
  name: string;
  accountNumber: string;
  balance: number;
  asOf: string;
}

export type InvoiceStatus = "draft" | "sent" | "part_paid" | "paid" | "overdue" | "void";

export interface Invoice {
  id: string;
  source: "xero";
  sourceId: string;
  invoiceNumber: string;
  jobId?: string;
  customer: string;
  description: string;
  amount: number;
  amountPaid: number;
  amountOutstanding: number;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
}

export type BillStatus = "awaiting_approval" | "approved" | "part_paid" | "paid" | "overdue";

export interface Bill {
  id: string;
  source: "xero";
  sourceId: string;
  billNumber: string;
  jobId?: string;
  supplier: string;
  description: string;
  category: string;
  amount: number;
  amountPaid: number;
  amountOutstanding: number;
  billDate: string;
  dueDate: string;
  status: BillStatus;
}

export type OpexCategory =
  | "wages"
  | "marketing"
  | "rent"
  | "vehicles"
  | "fuel"
  | "insurance"
  | "software"
  | "phones"
  | "accounting"
  | "professional_fees"
  | "finance"
  | "office"
  | "utilities"
  | "advertising"
  | "other";

export type OpexClassification = "fixed" | "variable";

export interface OperatingExpense {
  id: string;
  source: "xero";
  sourceId: string;
  category: OpexCategory;
  classification: OpexClassification;
  description: string;
  amount: number;
  date: string;
  recurring: boolean;
}

// --- GHL ----------------------------------------------------------------

export type PipelineStage =
  | "lead"
  | "qualified"
  | "feasibility"
  | "proposal"
  | "contract"
  | "won"
  | "lost";

export interface Opportunity {
  id: string;
  source: "ghl";
  sourceId: string;
  name: string;
  contact: string;
  pipeline: string;
  stage: PipelineStage;
  value: number;
  probabilityPercent: number;
  expectedCloseDate: string;
  salesperson: string;
  leadSource: string;
  product: string;
  location: string;
  depositPercent: number; // configured assumption, used to forecast expected deposit
  jobId?: string; // populated once won + matched to a Buildxact job
}

// --- Forecast / cash engine ----------------------------------------------

export type ForecastCategory =
  | "customer_receipt"
  | "supplier_payment"
  | "payroll"
  | "operating_expense"
  | "job_cost"
  | "pipeline_deposit"
  | "other";

export interface ForecastItem {
  id: string;
  source: Source;
  sourceId: string;
  date: string;
  amount: number; // always positive; direction says which way it moves cash
  direction: CashDirection;
  category: ForecastCategory;
  jobId?: string;
  party?: string; // customer / supplier name
  confidence: Confidence;
  status: string; // free text status label, e.g. "Invoiced, awaiting payment"
  description: string;
}

export interface ManualAdjustment {
  id: string;
  field: string;
  jobId?: string;
  forecastItemId?: string;
  originalValue: string;
  newValue: string;
  reason: string;
  user: string;
  date: string;
}

export interface ReconciliationFlag {
  id: string;
  jobId: string;
  type: "unmatched_job" | "cost_variance" | "po_bill_variance" | "payment_variance";
  severity: "info" | "warning" | "critical";
  description: string;
  buildxactValue?: number;
  xeroValue?: number;
  variance?: number;
  resolved: boolean;
}

export type AlertSeverity = "critical" | "warning" | "positive";

export interface ManagementAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  jobId?: string;
  href?: string;
}

export type ScenarioName = "conservative" | "base" | "optimistic";

export interface ScenarioAssumptions {
  name: ScenarioName;
  label: string;
  customerPaymentDelayDays: number;
  jobCostVariancePercent: number; // + increases forecast cost
  pipelineIncludedConfidence: Confidence[]; // which confidence buckets count toward cash
  pipelineConversionAdjustPercent: number; // applied to probability
  opexVariancePercent: number;
  contingencyPercent: number;
}

export interface StressTestInputs {
  delayedReceiptsAmount: number;
  delayedReceiptsDays: number;
  jobCostIncreasePercent: number;
  delayedJobIds: string[];
  delayedJobWeeks: number;
  pipelineConversionDropPercent: number;
  opexIncreaseAmount: number;
}

export interface Settings {
  minimumCashBuffer: number;
  defaultDepositPercent: number;
  marginTargetPercent: number;
  activeScenario: ScenarioName;
}
