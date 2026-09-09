import "server-only";

// ---------------------------------------------------------------------------
// Fixed vs variable for this tenant's real Xero chart of accounts.
//
// Previously this used Xero's own account "Type" field (fixed only when it
// said "OVERHEADS"), but this tenant's chart of accounts barely tags
// anything that way - real fixed costs like Rent, Wages and Insurance were
// all falling through to "variable" by default, leaving only 1 category
// (an incidentally-tagged one) actually marked fixed. That made the
// Monthly fixed/variable split on the Expenses page meaningless.
//
// This is a business judgment call, not a fact Xero exposes: "fixed" here
// means "recurs on its own schedule regardless of job volume" (wages, rent,
// insurance, subscriptions, phones, accounting, loan/bank finance charges,
// statutory registrations) - the same standard already used for the mock
// Phase 1 data. Everything else (fuel, vehicle running costs, advertising,
// office supplies, staff/travel/one-off spend) scales with activity or is
// discretionary, so it's "variable". Unknown categories (a new Xero account
// added later) default to "variable", matching that same philosophy.
// ---------------------------------------------------------------------------

const FIXED_CATEGORIES = new Set([
  "Wages Payable - Payroll",
  "Superannuation Liability",
  "Rent",
  "Subscriptions and Memberships",
  "Telephone and Internet",
  "Accounting Fees",
  "Bookkeeping Fees",
  "Insurance for Business",
  "Motor Vehicle - Insurances",
  "Workcover",
  "Interest Expense",
  "Bank Fees",
  "IT Computer Expenses",
  "IT and Software",
  "Website Expenses",
  "Licenses, Fees and Registration",
  "Motor Vehicle- Registration",
  "Filing fee",
]);

export function classifyOpexCategory(category: string): "fixed" | "variable" {
  return FIXED_CATEGORIES.has(category) ? "fixed" : "variable";
}
