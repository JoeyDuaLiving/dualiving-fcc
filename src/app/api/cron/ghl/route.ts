import { syncGhl } from "@/sync/ghl";
import { isCronRequest } from "@/lib/cron-auth";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await syncGhl();
  return Response.json(result);
}
