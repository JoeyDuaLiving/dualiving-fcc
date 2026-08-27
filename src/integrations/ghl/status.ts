import "server-only";
import { isGhlConfigured } from "./config";
import { ghlGet, GhlApiError } from "./client";

export type GhlConnectionStatus =
  | { state: "not_configured"; message: string }
  | { state: "connected"; message: string; pipelineCount: number }
  | { state: "error"; message: string };

interface PipelinesResponse {
  pipelines: { id: string; name: string }[];
}

/** Never throws - safe to call directly from a Server Component. */
export async function checkGhlConnection(): Promise<GhlConnectionStatus> {
  if (!isGhlConfigured()) {
    return { state: "not_configured", message: "Set GHL_PRIVATE_INTEGRATION_TOKEN and GHL_LOCATION_ID to connect." };
  }

  try {
    const result = await ghlGet<PipelinesResponse>("/opportunities/pipelines");
    return {
      state: "connected",
      message: "Successfully authenticated and fetched pipeline data.",
      pipelineCount: result.pipelines?.length ?? 0,
    };
  } catch (err) {
    if (err instanceof GhlApiError) {
      return { state: "error", message: `GHL returned ${err.status}: ${err.message}` };
    }
    return { state: "error", message: err instanceof Error ? err.message : "Unknown error contacting GHL." };
  }
}
