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
