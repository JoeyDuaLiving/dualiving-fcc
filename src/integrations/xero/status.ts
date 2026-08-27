import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { integrationConnections } from "@/db/schema";
import { isXeroConfigured } from "./config";
import { xeroGet, XeroApiError } from "./client";

export type XeroConnectionStatus =
  | { state: "not_configured"; message: string }
  | { state: "not_connected"; message: string }
  | { state: "connected"; message: string; tenantName: string | null }
  | { state: "error"; message: string };

interface OrganisationResponse {
  Organisations: { Name: string }[];
}

/** Never throws - safe to call directly from a Server Component. */
export async function checkXeroConnection(): Promise<XeroConnectionStatus> {
  if (!isXeroConfigured()) {
    return { state: "not_configured", message: "Set XERO_CLIENT_ID, XERO_CLIENT_SECRET and XERO_REDIRECT_URI to enable connecting." };
  }

  const [connection] = await db.select().from(integrationConnections).where(eq(integrationConnections.provider, "xero"));
  if (!connection) {
    return { state: "not_connected", message: "Not connected yet - use the Connect button to authorize Dualiving's Xero organisation." };
  }

  try {
    const result = await xeroGet<OrganisationResponse>("/Organisation");
    return {
      state: "connected",
      message: "Successfully authenticated and fetched organisation data.",
      tenantName: connection.tenantName ?? result.Organisations[0]?.Name ?? null,
    };
  } catch (err) {
    if (err instanceof XeroApiError) {
      return { state: "error", message: `Xero returned ${err.status}: ${err.message}` };
    }
    return { state: "error", message: err instanceof Error ? err.message : "Unknown error contacting Xero." };
  }
}
