// ---------------------------------------------------------------------------
// Raw Buildxact API shapes. Fields below are transcribed directly from real
// live responses against tenant de909cee-...-731c (2026-08-27) - not from
// docs. Kept separate from our internal `Job` type (src/types/index.ts)
// deliberately: map explicitly via mappers.ts rather than assuming the
// shapes line up.
// ---------------------------------------------------------------------------

export interface BuildxactEstimateItem {
  id: string;
  description?: string;
  unitCost: number;
  total: number;
  markup: number;
  totalIncMarkup: number;
  totalIncTax: number;
}

export interface BuildxactEstimate {
  id: string;
  jobNumber?: string; // NOT CONFIRMED present on this object - verify
  customerName?: string; // NOT CONFIRMED present on this object - verify
  total: number;
  markup: number;
  totalIncMarkup: number;
  taxIncMarkup: number;
  totalIncMarkupTax: number;
  taxRates?: unknown;
  taxContext?: unknown;
  items: BuildxactEstimateItem[];
}

// --- Webhooks --------------------------------------------------------------

export type BuildxactWebhookEventType = "EstimateAccepted" | "LeadCreated" | "LeadUpdated";

export interface BuildxactWebhookEnvelope<TPayload = unknown> {
  eventType: BuildxactWebhookEventType;
  eventId: string;
  occurredAt: string;
  payload: TPayload;
}

export interface EstimateAcceptedPayload {
  estimateId: string;
  jobNumber?: string;
  acceptedAt: string;
  totalIncMarkupTax: number;
}

export interface LeadPayload {
  leadId: string;
  name?: string;
  status?: string;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Jobs - CONFIRMED LIVE, GET /jobs/ (also usable as GET /jobs/{id}/... base)
// ---------------------------------------------------------------------------

export interface BuildxactJob {
  jobId: string;
  number: string; // e.g. "J1248 - Mcdonald"
  description: string;
  status: string; // observed: "Not Started" - full enum not confirmed
  isCompleted: boolean;
  completionDate: string | null;
  targetDate: string | null;
  progressPercent: number;
  invoiceMethod: string; // e.g. "ContractPrice"
  tenantId: string;
  estimateId: string | null;
  customerId: string;
  clientName: string;
  clientAddress: string;
  clientCityTown: string;
  clientState: string;
  clientPostCode: string;
  clientPhone: string;
  clientMobile: string;
  clientFax: string | null;
  clientEmail: string;
  buildingType: string;
  worksLocation: string | null;
  worksLocationAddress: string | null;
  worksLocationSuburb: string | null;
  worksLocationState: string | null;
  worksLocationPostcode: string | null;
  contractTotal: number; // ex tax
  contractTax: number;
  contractTotalIncTax: number;
  actualTotal: number; // ex tax
  actualTax: number;
  actualTotalIncTax: number;
  variationTotal: number;
  variationTax: number;
  variationTotalIncTax: number;
  paymentTotal: number; // sum of the full payment schedule (ex tax)
  paymentTax: number;
  paymentTotalIncTax: number;
  estimatedTotal: number; // semantics not fully confirmed - was 0 on every
  estimatedTax: number; // sample job we've seen; do not assume this is a
  estimatedTotalIncTax: number; // reliable "cost to complete" figure yet.
  balance: number; // meaning not fully confirmed - correlates with amounts
  // owing in samples, but treat as a raw Buildxact figure, not a mapped
  // "accounts receivable" concept, until verified against their UI.
  taxRate: number;
  costPlusPercentage: number;
  rowVersionN: number;
  createdBy: string;
  createdAt: string;
  modifiedBy: string;
  modifiedAt: string;
  creationDate: string;
  dateDeleted: string | null;
  colorCode: string | null;
}

// GET /jobs/{id}/purchaseorders - CONFIRMED LIVE
export interface BuildxactPurchaseOrder {
  purchaseOrderId: string;
  jobId: string;
  orderNumber: number;
  orderDate: string;
  description: string;
  orderStatus: string; // observed: "Received"
  orderType: string; // observed: "purchase"
  isCompleted: boolean;
  completedDate: string | null;
  receivedDate: string | null;
  orderTotalExTax: number;
  orderTax: number;
  orderTotalIncTax: number; // committed amount for this PO
  invoiceTotalIncTax: number; // what the supplier actually invoiced back
  deliveryAddress1: string | null;
  deliveryAddress2: string | null;
  deliveryCityTown: string | null;
  deliveryState: string | null;
  deliveryPostCode: string | null;
  deliveryCost: number;
  isPickup: boolean;
  isTaxFree: boolean;
  supplierAttention: string | null;
  supplierInvoiceRef: string | null;
  contactId: string;
  tenantId: string;
  createdBy: string | null;
  createdAt: string | null;
  modifiedBy: string | null;
  modifiedAt: string | null;
}

// GET /jobs/{id}/invoices - CONFIRMED LIVE (returns JobPaymentDto[])
export interface BuildxactJobInvoice {
  jobPaymentId: string;
  jobId: string;
  description: string; // e.g. "Stage 1 - 10% Deposit"
  percentageOfTotal: number;
  paymentValue: number; // ex tax
  tax: number;
  totalIncTax: number; // amount for this payment stage
  variationsValue: number;
  dueDate: string;
  invoiceDate: string | null;
  invoiceNumber: number | null;
  paymentOrder: number;
  status: string; // observed: "Received" (paid) vs "Invoiced" (issued, unpaid)
  comment: string | null;
  createdBy: string;
  createdAt: string;
  modifiedBy: string;
  modifiedAt: string;
}

export interface BuildxactTenant {
  tenantId: string;
  companyName: string;
  billingAddress1: string;
  billingAddress2: string | null;
  billingCityTown: string;
  billingState: string;
  billingPostCode: string;
  billingCountry: string;
  emailAddress: string;
  abn: string;
  phone: string;
  fax: string | null;
  website: string;
  creationDate: string;
  expiryDate: string;
  franchiseId: string | null;
  franchiseAreaId: string | null;
  timeZone: string;
  defaultMarkupRedistMethod: string;
  creationSource: string | null;
}
