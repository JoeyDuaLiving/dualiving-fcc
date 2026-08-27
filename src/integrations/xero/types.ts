// ---------------------------------------------------------------------------
// Raw Xero API shapes - fields below are transcribed directly from real live
// responses against tenant "Humpy North Pty Ltd" (2026-08-27), via
// GET /Accounts, /Invoices, /Contacts, /BankTransactions and
// /Reports/BankSummary. Dates arrive as .NET-style "/Date(epochMs+tz)/"
// strings - see parseXeroDate in mappers.ts.
// ---------------------------------------------------------------------------

export interface XeroAccount {
  AccountID: string;
  Code?: string;
  Name: string;
  Status: "ACTIVE" | "ARCHIVED" | string;
  Type: string; // "BANK" for bank accounts
  BankAccountNumber?: string;
  BankAccountType?: string;
  CurrencyCode?: string;
}

export interface XeroContact {
  ContactID: string;
  ContactStatus: string;
  Name: string;
  EmailAddress?: string;
  IsSupplier: boolean;
  IsCustomer: boolean;
  UpdatedDateUTC: string;
}

export interface XeroPayment {
  PaymentID: string;
  Date: string;
  Amount: number;
  Reference?: string;
}

export interface XeroInvoice {
  Type: "ACCREC" | "ACCPAY";
  InvoiceID: string;
  InvoiceNumber: string;
  Reference?: string;
  Contact: { ContactID: string; Name: string };
  DateString: string;
  Date: string;
  DueDateString?: string;
  DueDate?: string;
  Status: "DRAFT" | "SUBMITTED" | "AUTHORISED" | "PAID" | "VOIDED" | "DELETED" | string;
  AmountDue: number;
  AmountPaid: number;
  AmountCredited: number;
  Total?: number;
  SubTotal?: number;
  TotalTax?: number;
  Payments?: XeroPayment[];
  UpdatedDateUTCString?: string;
}

export interface XeroBankTransaction {
  BankTransactionID: string;
  BankAccount: { AccountID: string; Code?: string; Name: string };
  Type: "SPEND" | "RECEIVE" | string;
  IsReconciled: boolean;
  Contact?: { ContactID: string; Name: string };
  DateString: string;
  Date: string;
  Status: string;
  Total: number;
  CurrencyCode?: string;
}

export interface XeroPagination {
  page: number;
  pageSize: number;
  pageCount: number;
  itemCount: number;
}

export interface XeroAccountsResponse {
  Accounts: XeroAccount[];
}
export interface XeroContactsResponse {
  pagination: XeroPagination;
  Contacts: XeroContact[];
}
export interface XeroInvoicesResponse {
  pagination: XeroPagination;
  Invoices: XeroInvoice[];
}
export interface XeroBankTransactionsResponse {
  pagination: XeroPagination;
  BankTransactions: XeroBankTransaction[];
}

// --- Reports -----------------------------------------------------------
// Xero's generic report format: a Header row names the columns, then
// Section rows contain per-item Row entries whose Cells line up
// positionally with the header. Fragile by nature (position-based, not
// keyed) - see parseBankSummary in mappers.ts for the one parser this app
// needs today.

export interface XeroReportCell {
  Value?: string;
  Attributes?: { Value: string; Id: string }[];
}

export interface XeroReportRow {
  RowType: "Header" | "Section" | "Row" | "SummaryRow";
  Title?: string;
  Cells?: XeroReportCell[];
  Rows?: XeroReportRow[];
}

export interface XeroReportResponse {
  Reports: {
    ReportID: string;
    ReportName: string;
    ReportTitles: string[];
    Rows: XeroReportRow[];
  }[];
}
