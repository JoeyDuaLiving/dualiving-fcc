import "server-only";
import { ghlGet } from "./client";
import { rateLimitGhl } from "@/sync/rate-limiter";
import type { GhlOpportunity, GhlOpportunitySearchResponse, GhlPipeline, GhlPipelinesResponse } from "./types";

export async function getPipelines(): Promise<GhlPipeline[]> {
  const res = await ghlGet<GhlPipelinesResponse>("/opportunities/pipelines");
  return res.pipelines;
}

const PAGE_LIMIT = 100;

/** Pages through every opportunity (all statuses) via GHL's cursor-based
 * pagination - `meta.startAfter`/`startAfterId` from one page feed directly
 * into the next, per the confirmed live response shape. */
export async function getAllOpportunities(): Promise<GhlOpportunity[]> {
  const all: GhlOpportunity[] = [];
  let startAfter: number | undefined;
  let startAfterId: string | undefined;

  for (;;) {
    await rateLimitGhl();
    const query: Record<string, string> = { limit: String(PAGE_LIMIT) };
    if (startAfter !== undefined) query.startAfter = String(startAfter);
    if (startAfterId !== undefined) query.startAfterId = startAfterId;

    const res = await ghlGet<GhlOpportunitySearchResponse>("/opportunities/search", query);
    all.push(...res.opportunities);

    if (!res.meta.nextPage || res.opportunities.length < PAGE_LIMIT) break;
    startAfter = res.meta.startAfter;
    startAfterId = res.meta.startAfterId;
    if (startAfter === undefined || startAfterId === undefined) break;
  }

  return all;
}
