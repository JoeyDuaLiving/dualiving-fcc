import { syncBuildxact } from "@/sync/buildxact";
import { isCronRequest } from "@/lib/cron-auth";

// Split from the other two integrations - a full Buildxact sync (100+ jobs,
// several follow-up calls each, rate-limited) runs close to the 300s Pro
// ceiling on its own; stacking it with Xero/GHL in one function call
// (the original combined /api/cron/sync-all) exceeded it every time.
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await syncBuildxact();
  return Response.json(result);
}
