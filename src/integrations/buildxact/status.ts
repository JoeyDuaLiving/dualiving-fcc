import "server-only";
import { isBuildxactConfigured } from "./config";
import { getJobs } from "./jobs";
import { BuildxactApiError } from "./client";

export type BuildxactConnectionStatus =
  | { state: "not_configured"; message: string }
  | { state: "connected"; message: string; sampleCount: number }
  | { state: "error"; message: string };

/** Never throws - safe to call directly from a Server Component. */
export async function checkBuildxactConnection(): Promise<BuildxactConnectionStatus> {
  if (!isBuildxactConfigured()) {
    return {
      state: "not_configured",
      message: "Set BUILDXACT_SUBSCRIPTION_KEY, BUILDXACT_LOGIN_EMAIL and BUILDXACT_API_KEY to connect.",
    };
  }

  try {
    const jobs = await getJobs({ top: 1 });
    return {
      state: "connected",
      message: "Successfully authenticated and fetched live job data.",
      sampleCount: jobs.length,
    };
  } catch (err) {
    if (err instanceof BuildxactApiError) {
      return { state: "error", message: `Buildxact returned ${err.status}: ${err.message}` };
    }
    return { state: "error", message: err instanceof Error ? err.message : "Unknown error contacting Buildxact." };
  }
}
