import "server-only";
import { buildxactGet } from "./client";
import type { BuildxactEstimate } from "./types";

// ---------------------------------------------------------------------------
// CONFIRMED live 2026-08-27: GET https://api-v3.buildxact.com/estimates/
// returns a plain JSON array of estimates (same "OData queryable but plain
// array response" shape as /jobs/ - see jobs.ts). The exact field list is
// richer than BuildxactEstimate below captures (client/address fields mirror
// BuildxactJob) - extend as needed once a real estimate record's full shape
// has been reviewed end to end.
//
// For job cost/PO/invoice data, see jobs.ts instead - those endpoints are
// now confirmed available (this file previously documented them as
// unavailable based on an incomplete read of the public docs catalog).
// ---------------------------------------------------------------------------

export async function getEstimates(options: { top?: number } = {}): Promise<BuildxactEstimate[]> {
  return buildxactGet<BuildxactEstimate[]>("/estimates/", { top: options.top ?? 50 });
}
