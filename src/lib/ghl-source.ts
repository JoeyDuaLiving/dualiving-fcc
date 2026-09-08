import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { jobs, pipelineOpportunities } from "@/db/schema";

// ---------------------------------------------------------------------------
// Reads live GHL data from Postgres (populated by src/sync/ghl.ts) - same
// "read from the database, not the live API" pattern as jobs-source.ts and
// xero-source.ts.
//
// Only "open" opportunities are surfaced here (matching the mock pipeline
// page's exclusion of won/lost) - status isn't a first-class column on
// pipeline_opportunities, so it's read out of the synced `raw` JSON.
//
// Scoped to Council Workflow, Non-Council Workflow and BA/Construction - the
// other 2 synced pipelines (Marketing Pipeline, Active Campaign Import)
// aren't genuine sales-value pipelines: Active Campaign Import alone was
// 1,793 of 1,817 "open" opportunities and $7.75M of $10.9M in live totals,
// almost entirely a bulk historical marketing-CRM import (stages like
// "Contacted No Response", "Follow Up Later Date") rather than real
// construction deals. All 5 pipelines still sync into the database in full
// for future reference - this filter only applies to what the Pipeline page
// displays.
// ---------------------------------------------------------------------------

// BA/Construction is tracked separately from the other two - per business
// direction (2026-09-07), these deals are effectively already committed
// jobs, used here only to forecast *when* they'll actually commence, not
// as genuinely uncertain pipeline value. It's excluded from the top-level
// pipeline totals (Total/Weighted pipeline etc.) for that reason, even
// though it's still shown as its own board/timeline on the page.
export const BA_CONSTRUCTION_PIPELINE_ID = "DZLQsBfrkOw8C72N5iR7";

export const SALES_PIPELINE_IDS = [
  "XPGm8d3T77gPiUVWldjA", // Council Workflow
  "sQkSEyojdMzfoZKqaWH8", // Non-Council Workflow
  BA_CONSTRUCTION_PIPELINE_ID, // BA/Construction
];

export interface LiveOpportunity {
  id: string;
  sourceId: string;
  name: string;
  contact: string | null;
  stage: string;
  pipelineId: string | null;
  pipelineStageId: string | null;
  value: number;
  probabilityPercent: number;
  expectedCloseDate: string | null; // YYYY-MM-DD
  leadSource: string | null;
  jobId: string | null;
  jobNumber: string | null;
}

export interface LivePipelineResult {
  opportunities: LiveOpportunity[];
  source: "live" | "unavailable";
  error?: string;
}

export async function loadLiveOpenOpportunities(): Promise<LivePipelineResult> {
  try {
    const pipelineIdList = sql.join(
      SALES_PIPELINE_IDS.map((id) => sql`${id}`),
      sql`, `
    );
    const rows = await db
      .select()
      .from(pipelineOpportunities)
      .where(sql`${pipelineOpportunities.raw}->>'status' = 'open' and ${pipelineOpportunities.raw}->>'pipelineId' in (${pipelineIdList})`);

    if (rows.length === 0) {
      const [any] = await db.select({ id: pipelineOpportunities.id }).from(pipelineOpportunities).where(eq(pipelineOpportunities.source, "ghl")).limit(1);
      if (!any) return { opportunities: [], source: "unavailable", error: "No GHL opportunities synced yet." };
    }

    const jobById = new Map(
      (await db.select({ id: jobs.id, sourceId: jobs.sourceId, jobNumber: jobs.jobNumber }).from(jobs)).map((j) => [
        j.id,
        { sourceId: j.sourceId, jobNumber: j.jobNumber },
      ])
    );

    const opportunities: LiveOpportunity[] = rows.map((row) => {
      const job = row.jobId ? jobById.get(row.jobId) : undefined;
      const raw = row.raw as { pipelineId?: string; pipelineStageId?: string } | null;
      return {
        id: row.id,
        sourceId: row.sourceId,
        name: row.name,
        contact: row.contact,
        stage: row.stage,
        pipelineId: raw?.pipelineId ?? null,
        pipelineStageId: raw?.pipelineStageId ?? null,
        value: row.value,
        probabilityPercent: row.probabilityPercent,
        expectedCloseDate: row.expectedCloseDate ? row.expectedCloseDate.toISOString().slice(0, 10) : null,
        leadSource: row.leadSource,
        jobId: job?.sourceId ?? null,
        jobNumber: job?.jobNumber ?? null,
      };
    });

    return {
      opportunities: opportunities.sort((a, b) => (a.expectedCloseDate ?? "9999").localeCompare(b.expectedCloseDate ?? "9999")),
      source: "live",
    };
  } catch (err) {
    return { opportunities: [], source: "unavailable", error: err instanceof Error ? err.message : "Unknown error reading the database" };
  }
}

export function liveTotalPipelineValue(opportunities: LiveOpportunity[]): number {
  return opportunities.reduce((s, o) => s + o.value, 0);
}

export function liveWeightedPipelineValue(opportunities: LiveOpportunity[]): number {
  return opportunities.reduce((s, o) => s + (o.value * o.probabilityPercent) / 100, 0);
}

export function liveExpectedDeposit(o: LiveOpportunity, depositPercent: number): number {
  return o.value * (depositPercent / 100);
}

export function liveWeightedExpectedDeposit(o: LiveOpportunity, depositPercent: number): number {
  return liveExpectedDeposit(o, depositPercent) * (o.probabilityPercent / 100);
}
