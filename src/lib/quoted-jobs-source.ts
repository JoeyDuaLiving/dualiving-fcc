import "server-only";
import { db } from "@/db/client";
import { quotedJobStages, quotedJobs } from "@/db/schema";

// ---------------------------------------------------------------------------
// Quoted jobs - a deal close to starting that doesn't exist in Buildxact yet
// ("Q1280" style reference, becomes "J1280" once BX creates the real job).
// See src/db/schema.ts for why this is a fully separate table, not an
// extension of manual_payment_stages.
// ---------------------------------------------------------------------------

export interface QuotedJobStageDTO {
  id: string;
  label: string;
  percentOfContract: number;
  triggerDescription: string;
  expectedDate: string; // YYYY-MM-DD
}

export interface QuotedJobDTO {
  id: string;
  reference: string;
  client: string;
  estimatedContractValue: number;
  expectedStartDate: string; // YYYY-MM-DD
  notes: string;
  stages: QuotedJobStageDTO[];
}

export interface LoadQuotedJobsResult {
  quotedJobs: QuotedJobDTO[];
  source: "live" | "unavailable";
  error?: string;
}

export async function loadQuotedJobs(): Promise<LoadQuotedJobsResult> {
  try {
    const [jobRows, stageRows] = await Promise.all([db.select().from(quotedJobs), db.select().from(quotedJobStages)]);

    const stagesByQuotedJobId = new Map<string, QuotedJobStageDTO[]>();
    for (const s of stageRows) {
      const stage: QuotedJobStageDTO = {
        id: s.id,
        label: s.label,
        percentOfContract: s.percentOfContract,
        triggerDescription: s.triggerDescription ?? "",
        expectedDate: s.expectedDate.toISOString().slice(0, 10),
      };
      if (!stagesByQuotedJobId.has(s.quotedJobId)) stagesByQuotedJobId.set(s.quotedJobId, []);
      stagesByQuotedJobId.get(s.quotedJobId)!.push(stage);
    }

    const result: QuotedJobDTO[] = jobRows.map((j) => ({
      id: j.id,
      reference: j.reference,
      client: j.client,
      estimatedContractValue: j.estimatedContractValue,
      expectedStartDate: j.expectedStartDate.toISOString().slice(0, 10),
      notes: j.notes ?? "",
      stages: (stagesByQuotedJobId.get(j.id) ?? []).sort((a, b) => a.expectedDate.localeCompare(b.expectedDate)),
    }));

    return { quotedJobs: result.sort((a, b) => a.reference.localeCompare(b.reference)), source: "live" };
  } catch (err) {
    return { quotedJobs: [], source: "unavailable", error: err instanceof Error ? err.message : "Unknown error reading the database" };
  }
}
