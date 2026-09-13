import "server-only";
import { xeroGet } from "./client";
import type {
  XeroAccount,
  XeroAccountsResponse,
  XeroBankTransaction,
  XeroBankTransactionsResponse,
  XeroContact,
  XeroContactsResponse,
  XeroInvoice,
  XeroInvoicesResponse,
  XeroReportResponse,
  XeroReportRow,
} from "./types";

// ---------------------------------------------------------------------------
// CONFIRMED LIVE 2026-08-27 against tenant "Humpy North Pty Ltd" - every
// path/param/field here was verified with a real request, not assumed from
// docs. See types.ts for the full response shapes.
//
// Scope decision: this tenant has ~1,500 AR invoices, ~9,000 AP bills (most
// receipt-level via a Dext integration), ~1,500 contacts and ~3,600 bank
// transactions. Pulling all of that isn't useful for a cash dashboard and
// would be slow - the adapters below default to what the dashboard actually
// needs (outstanding invoices/bills, not the full historical archive) via
// Xero's `where` filtering, done server-side so we don't page through
// thousands of already-settled records just to discard them.
// ---------------------------------------------------------------------------

export async function getBankAccounts(): Promise<XeroAccount[]> {
  const result = await xeroGet<XeroAccountsResponse>("/Accounts", { where: 'Type=="BANK"' });
  return result.Accounts;
}

export interface BankAccountBalance {
  accountId: string;
  name: string;
  openingBalance: number;
  cashReceived: number;
  cashSpent: number;
  closingBalance: number;
}

/** Xero's report format is a Header row (column names) + Section rows of
 * per-account Rows whose Cells line up positionally - there's no keyed JSON
 * for this, so this parses cell position by the confirmed column order:
 * [Name, Opening, Received, Spent, Closing]. */
export async function getBankSummary(): Promise<BankAccountBalance[]> {
  const result = await xeroGet<XeroReportResponse>("/Reports/BankSummary");
  const report = result.Reports[0];
  const balances: BankAccountBalance[] = [];

  for (const row of report.Rows) {
    if (row.RowType !== "Section" || !row.Rows) continue;
    for (const item of row.Rows) {
      if (item.RowType !== "Row" || !item.Cells || item.Cells.length < 5) continue;
      const [nameCell, openingCell, receivedCell, spentCell, closingCell] = item.Cells;
      const accountId = nameCell.Attributes?.find((a) => a.Id === "accountID")?.Value;
      if (!accountId) continue;
      balances.push({
        accountId,
        name: nameCell.Value ?? "",
        openingBalance: Number(openingCell.Value ?? 0),
        cashReceived: Number(receivedCell.Value ?? 0),
        cashSpent: Number(spentCell.Value ?? 0),
        closingBalance: Number(closingCell.Value ?? 0),
      });
    }
  }
  return balances;
}

async function paginateInvoices(where: string, maxPages = 50): Promise<XeroInvoice[]> {
  const all: XeroInvoice[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const result = await xeroGet<XeroInvoicesResponse>("/Invoices", { where, order: "Date DESC", page: String(page) });
    all.push(...result.Invoices);
    if (!result.pagination || page >= result.pagination.pageCount) break;
  }
  return all;
}

/** AR invoices - not voided/deleted. ~1,500 records at last check, so a
 * full pull (not just outstanding) is still reasonable here. */
export async function getInvoices(): Promise<XeroInvoice[]> {
  return paginateInvoices('Type=="ACCREC" AND Status!="VOIDED" AND Status!="DELETED"');
}

/** AP bills - scoped to outstanding only (not PAID/VOIDED/DELETED). The
 * full AP history is ~9,000 records (mostly Dext-synced receipts); Accounts
 * Payable only cares about what's still owed. */
export async function getOutstandingBills(): Promise<XeroInvoice[]> {
  return paginateInvoices('Type=="ACCPAY" AND Status!="PAID" AND Status!="VOIDED" AND Status!="DELETED"');
}

/** Confirmed live 2026-08-27: this tenant pays some real recurring expenses
 * (rent to "Pro Commercial", $5,106/month) as Bills, not bank transactions -
 * a bill's own line items carry the account code, same as a bank
 * transaction's, but the underlying spend event is a different Xero object
 * entirely. The opex sync (see sync/xero.ts) needs both sources to match
 * what Xero's own P&L report shows. Scoped to trailing N months like
 * getSpendTransactions, not the full ~9,000-record AP history - and PAID
 * bills are included here (unlike getOutstandingBills) since opex reporting
 * cares about what was actually spent, not just what's still owed.
 *
 * The cutoff is the 1st of the month N months back, not N months back from
 * today's exact day - a day-based cutoff lands mid-month, producing a
 * near-empty "month" at the start of the window (e.g. only the last 3 days
 * of a month) that understates any monthly average computed over it. */
export async function getBillsForOpex(monthsBack = 14): Promise<XeroInvoice[]> {
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const where = `Type=="ACCPAY" AND Status!="VOIDED" AND Status!="DELETED" AND Date >= DateTime(${since.getFullYear()},${since.getMonth() + 1},${since.getDate()})`;
  return paginateInvoices(where);
}

async function paginateContacts(maxPages = 50): Promise<XeroContact[]> {
  const all: XeroContact[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const result = await xeroGet<XeroContactsResponse>("/Contacts", { page: String(page) });
    all.push(...result.Contacts);
    if (!result.pagination || page >= result.pagination.pageCount) break;
  }
  return all;
}

export async function getContacts(): Promise<XeroContact[]> {
  return paginateContacts();
}

/** Recent bank transactions only (not the full ~3,600-record history) -
 * scoped to what's useful for cash-flow context, not a full ledger export. */
export async function getRecentBankTransactions(sinceDaysAgo = 90, maxPages = 20): Promise<XeroBankTransaction[]> {
  const since = new Date(Date.now() - sinceDaysAgo * 86_400_000);
  const where = `Date >= DateTime(${since.getFullYear()},${since.getMonth() + 1},${since.getDate()})`;
  const all: XeroBankTransaction[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const result = await xeroGet<XeroBankTransactionsResponse>("/BankTransactions", { where, order: "Date DESC", page: String(page) });
    all.push(...result.BankTransactions);
    if (!result.pagination || page >= result.pagination.pageCount) break;
  }
  return all;
}

/** Confirmed live 2026-08-27: this tenant's chart of accounts has 126
 * Class=="EXPENSE" accounts, split Type=="DIRECTCOSTS" (49, e.g. "Cost of
 * Sales", "COGS ...") / "EXPENSE" (74, general) / "OVERHEADS" (3 only -
 * "ATO - GIC", "Fines", "Workers Comp Payments"; this tenant doesn't use
 * Xero's OVERHEADS type for the usual rent/insurance/subscriptions style
 * accounts). DIRECTCOSTS accounts are excluded from the opex sync entirely
 * (see sync/xero.ts) since they're job costs already captured via
 * Buildxact's actualCost/committedCost - counting them again here would
 * double-count the same spend under two different categories.
 *
 * Also confirmed live: this tenant pays wages (~$9-10k/week, real recurring
 * cash out, weekly as of Aug 2026 - previously a different cadence) and
 * superannuation through Xero Payroll, which post to "Wages Payable -
 * Payroll" and "Superannuation Liability" respectively - both
 * Class=="LIABILITY" clearing accounts (Type "CURRLIAB"), paid out to a
 * clearing house (SuperChoice, for super), not EXPENSE accounts. A
 * cash-flow forecast that only looked at Class=="EXPENSE" would silently
 * miss two of the largest recurring cash outflows in the business, so
 * wage/salary/payroll/super-named accounts are included regardless of
 * Class. */
export async function getExpenseAccounts(): Promise<XeroAccount[]> {
  const result = await xeroGet<XeroAccountsResponse>("/Accounts", {});
  return result.Accounts.filter((a) => a.Class === "EXPENSE" || /wage|salar|payroll|super/i.test(a.Name));
}

/** Spend-side bank transactions (money out), trailing N months - enough for
 * YTD + a monthly-average opex projection without pulling the full ledger.
 * Cutoff aligned to a calendar-month boundary - see getBillsForOpex. */
export async function getSpendTransactions(monthsBack = 14, maxPages = 50): Promise<XeroBankTransaction[]> {
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const where = `Type=="SPEND" AND Status=="AUTHORISED" AND Date >= DateTime(${since.getFullYear()},${since.getMonth() + 1},${since.getDate()})`;
  const all: XeroBankTransaction[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const result = await xeroGet<XeroBankTransactionsResponse>("/BankTransactions", { where, order: "Date DESC", page: String(page) });
    all.push(...result.BankTransactions);
    if (!result.pagination || page >= result.pagination.pageCount) break;
  }
  return all;
}

interface OrganisationResponse {
  Organisations: { FinancialYearEndDay?: number; FinancialYearEndMonth?: number }[];
}

/** The financial-year-start date (UTC midnight) containing `asOf`, derived
 * from Xero's own Organisation settings rather than hardcoded to 1 July -
 * confirmed live 2026-09-13 this tenant runs a standard AU year
 * (FinancialYearEndMonth 6, FinancialYearEndDay 30), so this correctly
 * resolves to 1 July, but it works for any FYE Xero has on file. Treats the
 * FY as starting on the 1st of the month after FinancialYearEndMonth -
 * true for every standard (calendar-month-aligned) FYE, which covers this
 * tenant and the vast majority of real orgs. */
export async function getFinancialYearStart(asOf: Date): Promise<Date> {
  const result = await xeroGet<OrganisationResponse>("/Organisation");
  const org = result.Organisations[0];
  const endMonth = org?.FinancialYearEndMonth ?? 6; // 1-indexed; default to AU's 30 June if Xero omits it
  const startMonthIndex = endMonth % 12; // 0-indexed month the FY starts in (June=6 -> July=6 0-indexed)

  const candidateThisYear = new Date(Date.UTC(asOf.getUTCFullYear(), startMonthIndex, 1));
  return asOf.getTime() >= candidateThisYear.getTime() ? candidateThisYear : new Date(Date.UTC(asOf.getUTCFullYear() - 1, startMonthIndex, 1));
}

export interface ProfitAndLossSummary {
  revenue: number;
  grossProfit: number;
  netProfit: number;
}

/** Confirmed live 2026-09-13: unlike BankSummary's fixed 5-column layout,
 * ProfitAndLoss rows carry a real label in Cells[0] ("Total Income",
 * "Gross Profit", "Net Profit" among others) - so this walks every row
 * regardless of section/nesting and picks the 3 headline figures out by
 * that label, robust to Xero reordering or renaming other lines. */
export async function getProfitAndLossSummary(fromDate: string, toDate: string): Promise<ProfitAndLossSummary> {
  const result = await xeroGet<XeroReportResponse>("/Reports/ProfitAndLoss", { fromDate, toDate });
  const report = result.Reports[0];
  const valueByLabel = new Map<string, number>();

  function walk(rows: XeroReportRow[]) {
    for (const row of rows) {
      if (row.Cells && row.Cells.length >= 2 && row.Cells[0].Value) {
        valueByLabel.set(row.Cells[0].Value, Number(row.Cells[1].Value ?? 0));
      }
      if (row.Rows) walk(row.Rows);
    }
  }
  walk(report.Rows);

  return {
    revenue: valueByLabel.get("Total Income") ?? 0,
    grossProfit: valueByLabel.get("Gross Profit") ?? 0,
    netProfit: valueByLabel.get("Net Profit") ?? 0,
  };
}
