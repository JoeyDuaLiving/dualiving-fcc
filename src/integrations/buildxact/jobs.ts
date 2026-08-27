import "server-only";
import { buildxactGet } from "./client";
import type { BuildxactJob, BuildxactJobInvoice, BuildxactPurchaseOrder, BuildxactTenant } from "./types";

// ---------------------------------------------------------------------------
// Adapter surface for Jobs data. Every path here is CONFIRMED against a real
// live response on 2026-08-27 (tenant de909cee-...-731c) - see the incident
// note in config.ts. The rest of the app should call these functions rather
// than importing buildxactGet directly, so a future path/shape correction
// only needs to happen in one place.
//
// Response shape note: unlike a typical OData service, these endpoints
// return a plain JSON array directly (not wrapped in `{ value: [...] }`)
// despite supporting OData query params ($filter, $top, etc).
// ---------------------------------------------------------------------------

export async function getTenants(): Promise<BuildxactTenant[]> {
  return buildxactGet<BuildxactTenant[]>("/accounts/tenants");
}

export async function getJobs(options: { top?: number; skip?: number; filter?: string } = {}): Promise<BuildxactJob[]> {
  return buildxactGet<BuildxactJob[]>("/jobs/", { top: options.top, skip: options.skip, filter: options.filter });
}

/** Pages through the full job list via $top/$skip - the collection endpoint
 * caps out at 100 rows per request (observed live), so anything beyond that
 * needs this rather than a single getJobs() call. */
export async function getAllJobs(pageSize = 100): Promise<BuildxactJob[]> {
  const all: BuildxactJob[] = [];
  let skip = 0;
  for (;;) {
    const page = await getJobs({ top: pageSize, skip });
    all.push(...page);
    if (page.length < pageSize) break;
    skip += pageSize;
  }
  return all;
}

/**
 * No single-job GET endpoint has been confirmed yet (only the collection
 * endpoint has been tested live) - this filters the queryable collection by
 * jobId instead, which is confirmed-safe since /jobs/ supports $filter.
 *
 * jobId is typed as Edm.Guid in their OData model, so the filter literal
 * must be unquoted (`jobId eq <guid>`) - a quoted string literal (the OData
 * convention for Edm.String) throws a 400 type-mismatch error. Confirmed
 * live 2026-08-27.
 */
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getJob(jobId: string): Promise<BuildxactJob | undefined> {
  // jobId is interpolated directly into an OData $filter expression - reject
  // anything that isn't shaped like a GUID rather than passing arbitrary
  // route-param input through to the query string.
  if (!GUID_RE.test(jobId)) return undefined;
  const jobs = await buildxactGet<BuildxactJob[]>("/jobs/", { filter: `jobId eq ${jobId}` });
  return jobs[0];
}

export async function getJobPurchaseOrders(jobId: string): Promise<BuildxactPurchaseOrder[]> {
  return buildxactGet<BuildxactPurchaseOrder[]>(`/jobs/${encodeURIComponent(jobId)}/purchaseorders`);
}

export async function getJobInvoices(jobId: string): Promise<BuildxactJobInvoice[]> {
  return buildxactGet<BuildxactJobInvoice[]>(`/jobs/${encodeURIComponent(jobId)}/invoices`);
}
