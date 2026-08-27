import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { jobs, pipelineOpportunities, syncErrors, syncRuns } from "@/db/schema";
import { getAllOpportunities, getPipelines } from "@/integrations/ghl/opportunities";
import type { GhlOpportunity, GhlPipeline } from "@/integrations/ghl/types";

// ---------------------------------------------------------------------------
// GHL -> Postgres sync. Same upsert-by-(source,sourceId) approach as
// Buildxact/Xero, batched like the Xero sync (this location has ~1,800
// opportunities across 5 pipelines).
//
// Syncs every opportunity regardless of status (open/won/lost/abandoned) -
// the live Pipeline page filters to "open" at read time via the `raw` JSON
// (see src/lib/ghl-source.ts), so historical won/lost records stay available
// for future win-rate analysis without a second sync path.
//
// `stage` is stored as "<pipeline name>: <stage name>" since GHL stage names
// are only unique within a pipeline (multiple pipelines reuse names like
// "Warm"), and this location mixes 5 different pipelines into one table.
//
// salesperson/product are left null - resolving GHL's `assignedTo` user id to
// a name, or a customField id to its label, needs API scopes this PIT wasn't
// granted (see integrations/ghl/types.ts). Both raw values are kept in `raw`
// so they can be backfilled later without a data model change.
//
// Job linking: same heuristic as Xero - a Buildxact job number embedded in
// the opportunity name (e.g. "J1268 - Smith renovation").
// ---------------------------------------------------------------------------

export interface GhlSyncResult {
  syncRunId: string;
  status: "success" | "partial" | "failed";
  recordsImported: number;
  recordsUpdated: number;
  errorCount: number;
  durationMs: number;
}

const JOB_NUMBER_RE = /\bJ\d{3,5}\b/i;

function extractJobNumber(text: string | undefined): string | null {
  if (!text) return null;
  const match = JOB_NUMBER_RE.exec(text);
  return match ? match[0].toUpperCase() : null;
}

interface StageInfo {
  pipelineName: string;
  stageName: string;
  stageWinProbability: number;
}

function buildStageIndex(pipelines: GhlPipeline[]): Map<string, StageInfo> {
  const index = new Map<string, StageInfo>();
  for (const pipeline of pipelines) {
    for (const stage of pipeline.stages) {
      index.set(stage.id, { pipelineName: pipeline.name, stageName: stage.name, stageWinProbability: stage.stageWinProbability });
    }
  }
  return index;
}

const BATCH_SIZE = 200;

export async function syncGhl(): Promise<GhlSyncResult> {
  const startedAt = Date.now();
  const [run] = await db.insert(syncRuns).values({ source: "ghl", status: "running" }).returning();

  let recordsImported = 0;
  let recordsUpdated = 0;
  let errorCount = 0;

  async function logError(sourceId: string | undefined, message: string) {
    errorCount++;
    await db.insert(syncErrors).values({ syncRunId: run.id, source: "ghl", sourceId, message });
  }

  try {
    const jobRows = await db.select({ id: jobs.id, jobNumber: jobs.jobNumber }).from(jobs);
    const jobIdByNumber = new Map(jobRows.map((j) => [j.jobNumber.toUpperCase(), j.id]));

    const pipelines = await getPipelines();
    const stageIndex = buildStageIndex(pipelines);

    const opportunities = await getAllOpportunities();

    for (let i = 0; i < opportunities.length; i += BATCH_SIZE) {
      const batch = opportunities.slice(i, i + BATCH_SIZE);
      const rows = await db
        .insert(pipelineOpportunities)
        .values(batch.map((opp) => toRow(opp, stageIndex, jobIdByNumber)))
        .onConflictDoUpdate({
          target: [pipelineOpportunities.source, pipelineOpportunities.sourceId],
          set: {
            name: sql`excluded.name`,
            contact: sql`excluded.contact`,
            stage: sql`excluded.stage`,
            value: sql`excluded.value`,
            probabilityPercent: sql`excluded.probability_percent`,
            expectedCloseDate: sql`excluded.expected_close_date`,
            leadSource: sql`excluded.lead_source`,
            jobId: sql`excluded.job_id`,
            raw: sql`excluded.raw`,
            updatedAt: new Date(),
          },
        })
        .returning({ wasNew: sql<boolean>`(xmax = 0)` });
      for (const r of rows) {
        if (r.wasNew) recordsImported++;
        else recordsUpdated++;
      }
    }
  } catch (err) {
    await logError(undefined, `Sync aborted: ${err instanceof Error ? err.message : String(err)}`);
    await db
      .update(syncRuns)
      .set({ status: "failed", finishedAt: new Date(), recordsImported, recordsUpdated, errorSummary: "Sync aborted before completing - see sync_errors" })
      .where(eq(syncRuns.id, run.id));
    return { syncRunId: run.id, status: "failed", recordsImported, recordsUpdated, errorCount, durationMs: Date.now() - startedAt };
  }

  const status: GhlSyncResult["status"] = errorCount === 0 ? "success" : "partial";
  await db
    .update(syncRuns)
    .set({
      status,
      finishedAt: new Date(),
      recordsImported,
      recordsUpdated,
      errorSummary: errorCount > 0 ? `${errorCount} record(s) failed - see sync_errors` : null,
    })
    .where(eq(syncRuns.id, run.id));

  return { syncRunId: run.id, status, recordsImported, recordsUpdated, errorCount, durationMs: Date.now() - startedAt };
}

function toRow(opp: GhlOpportunity, stageIndex: Map<string, StageInfo>, jobIdByNumber: Map<string, string>) {
  const stageInfo = stageIndex.get(opp.pipelineStageId);
  const jobNumber = extractJobNumber(opp.name);

  return {
    source: "ghl",
    sourceId: opp.id,
    name: opp.name,
    contact: opp.contact?.name ?? null,
    stage: stageInfo ? `${stageInfo.pipelineName}: ${stageInfo.stageName}` : "Unknown stage",
    value: opp.monetaryValue ?? 0,
    probabilityPercent: opp.effectiveProbability ?? stageInfo?.stageWinProbability ?? 0,
    expectedCloseDate: opp.forecastExpectedCloseDate ? new Date(opp.forecastExpectedCloseDate) : null,
    salesperson: null,
    leadSource: opp.source ?? null,
    product: null,
    jobId: jobNumber ? (jobIdByNumber.get(jobNumber) ?? null) : null,
    raw: opp,
  };
}
