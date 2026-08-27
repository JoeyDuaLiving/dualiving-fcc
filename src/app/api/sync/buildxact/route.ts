import { syncBuildxact } from "@/sync/buildxact";

// A full sync (jobs + purchase orders + invoices, rate-limited) can take
// 60-90s for ~100 jobs - this isn't meant to be triggered on every page
// load, only from the Settings "Sync Now" button or a scheduled job.
export const maxDuration = 300;

export async function POST() {
  try {
    const result = await syncBuildxact();
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown sync error" },
      { status: 500 }
    );
  }
}
