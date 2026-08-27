import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { jobs, manualPaymentStages } from "@/db/schema";
import type { PaymentScheduleStage } from "@/types";

// ---------------------------------------------------------------------------
// Manual payment-schedule stages for live jobs (see src/db/schema.ts for
// why: Buildxact has no API field for Dualiving's own invoicing plan, so
// this is a genuine manual-entry gap-filler, not synced from anywhere).
//
// manual_payment_stages.job_id FKs to the DB's internal jobs.id, but every
// other live-forecast module keys jobs by Buildxact's sourceId (that's what
// "Job.id" means everywhere else in the app - see jobs-source.ts's
// dbJobToJob) - so this joins back to jobs.source_id and keys the returned
// map by that, to match.
// ---------------------------------------------------------------------------

export interface ManualStageRow extends PaymentScheduleStage {
  jobId: string; // Buildxact sourceId, matching Job.id elsewhere
}

export interface LoadManualStagesResult {
  stagesByJobId: Map<string, ManualStageRow[]>;
  source: "live" | "unavailable";
  error?: string;
}

export async function loadManualStages(): Promise<LoadManualStagesResult> {
  try {
    const rows = await db
      .select({
        id: manualPaymentStages.id,
        label: manualPaymentStages.label,
        percentOfContract: manualPaymentStages.percentOfContract,
        triggerDescription: manualPaymentStages.triggerDescription,
        expectedDate: manualPaymentStages.expectedDate,
        invoiced: manualPaymentStages.invoiced,
        jobSourceId: jobs.sourceId,
      })
      .from(manualPaymentStages)
      .innerJoin(jobs, eq(manualPaymentStages.jobId, jobs.id));

    const stagesByJobId = new Map<string, ManualStageRow[]>();
    for (const row of rows) {
      const stage: ManualStageRow = {
        id: row.id,
        jobId: row.jobSourceId,
        label: row.label,
        percentOfContract: row.percentOfContract,
        triggerDescription: row.triggerDescription ?? "",
        expectedDate: row.expectedDate.toISOString().slice(0, 10),
        invoiced: row.invoiced,
      };
      if (!stagesByJobId.has(row.jobSourceId)) stagesByJobId.set(row.jobSourceId, []);
      stagesByJobId.get(row.jobSourceId)!.push(stage);
    }
    return { stagesByJobId, source: "live" };
  } catch (err) {
    return { stagesByJobId: new Map(), source: "unavailable", error: err instanceof Error ? err.message : "Unknown error reading the database" };
  }
}
