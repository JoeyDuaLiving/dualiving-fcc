// Dualiving Financial Command Centre - database schema (Phase 2)
//
// Design principles (see master build spec):
//   - Every record synced from an external system carries `source` +
//     `sourceId`, unique together, so a re-run sync can never create
//     duplicates (spec rule #25).
//   - Raw payloads are kept in a `raw` jsonb column alongside mapped fields -
//     field mappings will keep evolving as more of each API is verified, and
//     re-deriving from raw data beats re-fetching from the API.
//   - Tables below are grouped by how far along each integration is:
//     ACTIVE tables are populated by the Buildxact sync; STUB tables exist
//     so the schema is complete per the spec, ready for Xero/GHL sync work,
//     but hold no rows yet - do not build UI against them assuming data is
//     present until a sync job actually populates them.

import { relations } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { randomUUID } from "node:crypto";

const id = () => text("id").primaryKey().$defaultFn(() => randomUUID());

// ---------------------------------------------------------------------------
// Cross-cutting
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const companies = pgTable(
  "companies",
  {
    id: id(),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    name: text("name").notNull(),
    abn: text("abn"),
    billingAddr: text("billing_addr"),
    billingCity: text("billing_city"),
    billingState: text("billing_state"),
    billingPost: text("billing_post"),
    phone: text("phone"),
    website: text("website"),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("companies_source_idx").on(t.source, t.sourceId)]
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// OAuth token storage for integrations that use a real OAuth 2.0 consent
// flow (Xero today, potentially GHL later) rather than a static API key like
// Buildxact. Unlike an API key, these tokens rotate on every refresh and
// expire (Xero: access token 30 min, refresh token 60 days unused) - they
// live in the database, not just env vars, because they change at runtime
// and must survive a server restart.
export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: id(),
    provider: text("provider").notNull(), // "xero"
    tenantId: text("tenant_id").notNull(), // Xero's org/tenant id
    tenantName: text("tenant_name"),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    scope: text("scope"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("integration_connections_provider_tenant_idx").on(t.provider, t.tenantId)]
);

export const manualAdjustments = pgTable("manual_adjustments", {
  id: id(),
  field: text("field").notNull(),
  jobId: text("job_id").references(() => jobs.id),
  forecastItemRef: text("forecast_item_ref"),
  originalValue: text("original_value").notNull(),
  newValue: text("new_value").notNull(),
  reason: text("reason").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  date: timestamp("date").notNull().defaultNow(),
});

// Manual payment-schedule stages for live (Buildxact) jobs - fills the gap
// where Buildxact has no API field for Dualiving's own invoicing plan (e.g.
// "10% deposit", "40% frame stage"), so the live forecast engine has no
// FORECAST-confidence inflow timing without this. No source/sourceId pair
// since this is genuinely manual data, not synced from anywhere - createdBy
// is a plain free-text label (e.g. the site's shared login name), not a
// users.id FK, since the app has no real per-user accounts yet.
export const manualPaymentStages = pgTable("manual_payment_stages", {
  id: id(),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id),
  label: text("label").notNull(),
  percentOfContract: doublePrecision("percent_of_contract").notNull(),
  triggerDescription: text("trigger_description"),
  expectedDate: timestamp("expected_date").notNull(),
  invoiced: boolean("invoiced").notNull().default(false),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Recurring liability repayments (car loans, equipment finance, etc.) -
// real, scheduled cash outflows that never appear in Xero's P&L since
// they reduce a liability account, not an expense account (only an
// interest component, if separately itemised, would ever hit an expense
// account) - so the opex sync has no way to see them. Genuinely manual,
// same reasoning as manualPaymentStages: entered directly since no synced
// system has this data. startDate is an anchor (a real known repayment
// date), not necessarily the loan's origination date - occurrences are
// projected forward from it by `frequency`, not by a day-of-month, since
// weekly/fortnightly debits don't land on a fixed day. endDate is
// optional - once a loan is paid off, stop projecting new occurrences
// without deleting the historical record.
export const recurringLiabilities = pgTable("recurring_liabilities", {
  id: id(),
  description: text("description").notNull(), // e.g. "Ute loan"
  amount: doublePrecision("amount").notNull(),
  frequency: text("frequency").notNull(), // "weekly" | "fortnightly" | "monthly"
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Quoted jobs - a deal close to starting that doesn't exist in Buildxact
// yet ("Q1280" style reference, becomes "J1280" once BX creates the real
// job). Genuinely separate from jobs/manualPaymentStages since there's no
// jobs.id row to attach to - estimatedContractValue is entered directly
// rather than read from anywhere, since no system has it yet.
export const quotedJobs = pgTable("quoted_jobs", {
  id: id(),
  reference: text("reference").notNull(), // "Q1280"
  client: text("client").notNull(),
  estimatedContractValue: doublePrecision("estimated_contract_value").notNull(),
  expectedStartDate: timestamp("expected_start_date").notNull(),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Defaults to the standard 10% deposit / 40% manufacturing (+2wk) / 45%
// install (+4wk) / 5% final (+8wk) template when a quoted job is created
// (see sync-free creation logic in the API route) - stages are fully
// editable/removable afterward, this is just the starting point.
export const quotedJobStages = pgTable("quoted_job_stages", {
  id: id(),
  quotedJobId: text("quoted_job_id")
    .notNull()
    .references(() => quotedJobs.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  percentOfContract: doublePrecision("percent_of_contract").notNull(),
  triggerDescription: text("trigger_description"),
  expectedDate: timestamp("expected_date").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  action: text("action").notNull(), // "sync" | "manual_adjustment" | "login" | "settings_change"
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  userId: text("user_id").references(() => users.id),
  details: jsonb("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Sync bookkeeping
// ---------------------------------------------------------------------------

export const syncRuns = pgTable("sync_runs", {
  id: id(),
  source: text("source").notNull(), // "buildxact" | "xero" | "ghl"
  status: text("status").notNull().default("running"), // "running" | "success" | "partial" | "failed"
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
  recordsImported: integer("records_imported").notNull().default(0),
  recordsUpdated: integer("records_updated").notNull().default(0),
  errorSummary: text("error_summary"),
});

export const syncErrors = pgTable("sync_errors", {
  id: id(),
  syncRunId: text("sync_run_id")
    .notNull()
    .references(() => syncRuns.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  sourceId: text("source_id"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// ACTIVE: Buildxact - jobs, purchase orders, invoices
// ---------------------------------------------------------------------------

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    source: text("source").notNull(), // "buildxact"
    sourceId: text("source_id").notNull(), // Buildxact jobId (guid)

    jobNumber: text("job_number").notNull(),
    client: text("client").notNull(),
    product: text("product").notNull(),
    status: text("status").notNull(),
    location: text("location"),

    contractValue: doublePrecision("contract_value").notNull(),
    approvedVariations: doublePrecision("approved_variations").notNull().default(0),
    originalBudgetRevenue: doublePrecision("original_budget_revenue").notNull(),
    originalBudgetCost: doublePrecision("original_budget_cost").notNull(),
    actualCost: doublePrecision("actual_cost").notNull().default(0),
    committedCost: doublePrecision("committed_cost").notNull().default(0),
    // Not available from Buildxact yet - see integrations/buildxact/mappers.ts.
    // Kept as an explicit column so a manual override or a future confirmed
    // field has somewhere to land without a schema change.
    remainingForecastCost: doublePrecision("remaining_forecast_cost").notNull().default(0),
    progressPercent: integer("progress_percent").notNull().default(0),

    startDate: timestamp("start_date"),
    expectedCompletion: timestamp("expected_completion"),
    contractedCompletion: timestamp("contracted_completion"),

    marginTargetPercent: doublePrecision("margin_target_percent").notNull().default(25),

    raw: jsonb("raw"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("jobs_source_idx").on(t.source, t.sourceId),
  ]
);

export const jobMappings = pgTable("job_mappings", {
  id: id(),
  jobId: text("job_id")
    .notNull()
    .unique()
    .references(() => jobs.id, { onDelete: "cascade" }),
  buildxactJobNumber: text("buildxact_job_number"),
  xeroTrackingCategoryId: text("xero_tracking_category_id"),
  xeroContactId: text("xero_contact_id"),
  ghlOpportunityId: text("ghl_opportunity_id"),
  matchConfidence: text("match_confidence").notNull().default("unmatched"), // "confirmed" | "probable" | "unmatched"
});

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: id(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // "buildxact"
    sourceId: text("source_id").notNull(), // purchaseOrderId (guid)

    orderNumber: integer("order_number").notNull(),
    description: text("description"),
    orderStatus: text("order_status").notNull(),
    orderTotalIncTax: doublePrecision("order_total_inc_tax").notNull(),
    invoiceTotalIncTax: doublePrecision("invoice_total_inc_tax").notNull().default(0),
    orderDate: timestamp("order_date"),

    raw: jsonb("raw"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("purchase_orders_source_idx").on(t.source, t.sourceId),
  ]
);

// Named jobInvoicePayments (not "invoices") because this is Buildxact's own
// job payment-schedule/invoice object - NOT the Xero `invoices` table below,
// which is the accounting system of record once Xero is connected. The two
// should be reconciled against each other, not treated as one source.
export const jobInvoicePayments = pgTable(
  "job_invoice_payments",
  {
    id: id(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // "buildxact"
    sourceId: text("source_id").notNull(), // jobPaymentId (guid)

    description: text("description").notNull(),
    totalIncTax: doublePrecision("total_inc_tax").notNull(),
    status: text("status").notNull(), // "Received" (paid) | "Invoiced" (issued, unpaid)
    dueDate: timestamp("due_date"),
    invoiceDate: timestamp("invoice_date"),
    invoiceNumber: integer("invoice_number"),
    paymentOrder: integer("payment_order"),

    raw: jsonb("raw"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("job_invoice_payments_source_idx").on(t.source, t.sourceId),
  ]
);

export const reconciliationFlags = pgTable("reconciliation_flags", {
  id: id(),
  jobId: text("job_id").references(() => jobs.id),
  type: text("type").notNull(), // "unmatched_job" | "cost_variance" | "po_bill_variance" | "payment_variance"
  severity: text("severity").notNull(), // "info" | "warning" | "critical"
  description: text("description").notNull(),
  buildxactValue: doublePrecision("buildxact_value"),
  xeroValue: doublePrecision("xero_value"),
  variance: doublePrecision("variance"),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// STUB: Xero - not yet synced, schema ready for Phase 4
// ---------------------------------------------------------------------------

export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: id(),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    name: text("name").notNull(),
    balance: doublePrecision("balance").notNull(),
    asOf: timestamp("as_of").notNull(),
    raw: jsonb("raw"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("bank_accounts_source_idx").on(t.source, t.sourceId)]
);

// Single-row-per-source snapshot of Xero's own Profit & Loss report for the
// current financial year to date - real Total Income/Gross Profit/Net
// Profit figures, not derived from our own invoice/margin assumptions. See
// getProfitAndLossSummary/getFinancialYearStart in integrations/xero.
export const financialSummary = pgTable(
  "financial_summary",
  {
    id: id(),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(), // "fy-to-date" - one row per source today
    fyStartDate: timestamp("fy_start_date").notNull(),
    revenueFyTd: doublePrecision("revenue_fy_td").notNull(),
    grossProfitFyTd: doublePrecision("gross_profit_fy_td").notNull(),
    netProfitFyTd: doublePrecision("net_profit_fy_td").notNull(),
    asOf: timestamp("as_of").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("financial_summary_source_idx").on(t.source, t.sourceId)]
);

// Single-row manual entry of the real bank statement balance, since Xero's
// Accounting API only exposes the reconciled ledger balance (bank_accounts
// above) - the live "Statement Balance" shown on Xero's own Bank Accounts
// screen comes from the bank feed directly and isn't exposed to a normal
// OAuth Accounting API app (confirmed live 2026-09-13: no such field on
// /Accounts or /Reports/BankSummary). The user punches this in whenever
// they check it in Xero/online banking; the Dashboard's "Current bank
// balance" card reads it, falling back to the Xero ledger balance until
// it's ever been set.
export const manualBankBalance = pgTable("manual_bank_balance", {
  id: id(),
  balance: doublePrecision("balance").notNull(),
  asOf: timestamp("as_of").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const customers = pgTable(
  "customers",
  {
    id: id(),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    raw: jsonb("raw"),
  },
  (t) => [uniqueIndex("customers_source_idx").on(t.source, t.sourceId)]
);

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    source: text("source").notNull(), // "xero"
    sourceId: text("source_id").notNull(),
    customerId: text("customer_id").references(() => customers.id),
    jobId: text("job_id").references(() => jobs.id),
    invoiceNumber: text("invoice_number").notNull(),
    amount: doublePrecision("amount").notNull(),
    amountPaid: doublePrecision("amount_paid").notNull().default(0),
    amountOutstanding: doublePrecision("amount_outstanding").notNull(),
    issueDate: timestamp("issue_date"),
    dueDate: timestamp("due_date"),
    status: text("status").notNull(),
    raw: jsonb("raw"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("invoices_source_idx").on(t.source, t.sourceId)]
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: id(),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    name: text("name").notNull(),
    raw: jsonb("raw"),
  },
  (t) => [uniqueIndex("suppliers_source_idx").on(t.source, t.sourceId)]
);

export const bills = pgTable(
  "bills",
  {
    id: id(),
    source: text("source").notNull(), // "xero"
    sourceId: text("source_id").notNull(),
    supplierId: text("supplier_id").references(() => suppliers.id),
    jobId: text("job_id").references(() => jobs.id),
    billNumber: text("bill_number").notNull(),
    category: text("category"),
    amount: doublePrecision("amount").notNull(),
    amountPaid: doublePrecision("amount_paid").notNull().default(0),
    amountOutstanding: doublePrecision("amount_outstanding").notNull(),
    billDate: timestamp("bill_date"),
    dueDate: timestamp("due_date"),
    status: text("status").notNull(),
    raw: jsonb("raw"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("bills_source_idx").on(t.source, t.sourceId)]
);

export const operatingExpenses = pgTable(
  "operating_expenses",
  {
    id: id(),
    source: text("source").notNull(), // "xero"
    sourceId: text("source_id").notNull(),
    category: text("category").notNull(),
    classification: text("classification").notNull(), // "fixed" | "variable"
    description: text("description"),
    amount: doublePrecision("amount").notNull(),
    date: timestamp("date").notNull(),
    recurring: boolean("recurring").notNull().default(false),
    raw: jsonb("raw"),
  },
  (t) => [uniqueIndex("operating_expenses_source_idx").on(t.source, t.sourceId)]
);

// ---------------------------------------------------------------------------
// STUB: GoHighLevel - not yet synced, schema ready for Phase 5
// ---------------------------------------------------------------------------

export const pipelineOpportunities = pgTable(
  "pipeline_opportunities",
  {
    id: id(),
    source: text("source").notNull(), // "ghl"
    sourceId: text("source_id").notNull(),
    name: text("name").notNull(),
    contact: text("contact"),
    stage: text("stage").notNull(),
    value: doublePrecision("value").notNull(),
    probabilityPercent: doublePrecision("probability_percent").notNull(),
    expectedCloseDate: timestamp("expected_close_date"),
    salesperson: text("salesperson"),
    leadSource: text("lead_source"),
    product: text("product"),
    jobId: text("job_id").references(() => jobs.id),
    raw: jsonb("raw"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pipeline_opportunities_source_idx").on(t.source, t.sourceId)]
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const jobsRelations = relations(jobs, ({ many, one }) => ({
  purchaseOrders: many(purchaseOrders),
  jobInvoicePayments: many(jobInvoicePayments),
  manualAdjustments: many(manualAdjustments),
  reconciliationFlags: many(reconciliationFlags),
  mapping: one(jobMappings, { fields: [jobs.id], references: [jobMappings.jobId] }),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one }) => ({
  job: one(jobs, { fields: [purchaseOrders.jobId], references: [jobs.id] }),
}));

export const jobInvoicePaymentsRelations = relations(jobInvoicePayments, ({ one }) => ({
  job: one(jobs, { fields: [jobInvoicePayments.jobId], references: [jobs.id] }),
}));

export const syncRunsRelations = relations(syncRuns, ({ many }) => ({
  errors: many(syncErrors),
}));

export const syncErrorsRelations = relations(syncErrors, ({ one }) => ({
  syncRun: one(syncRuns, { fields: [syncErrors.syncRunId], references: [syncRuns.id] }),
}));
