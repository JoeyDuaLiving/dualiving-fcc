import "server-only";

// ---------------------------------------------------------------------------
// GoHighLevel (GHL) connection config.
//
// Confirmed live from marketplace.gohighlevel.com docs (Aug 2026):
//   - Auth model: Private Integration Token (PIT) - a static bearer token
//     scoped to a single sub-account (location), generated from
//     Settings > Private Integrations in the GHL account itself. This is
//     the right choice for Dualiving connecting to its OWN GHL account
//     (not a Marketplace OAuth app, which is only needed when other people
//     install your integration on accounts you don't own).
//   - Base URL: https://services.leadconnectorhq.com
//   - Every request needs: `Authorization: Bearer <PIT>`, `Version: v3`
//     (the Opportunities/Pipelines endpoints specifically use "v3" - other
//     resource families may use a dated version string like "2021-07-28",
//     confirm per-endpoint if extending beyond Opportunities/Pipelines),
//     and `Accept: application/json`.
//   - Confirmed endpoints: GET /opportunities/search, GET
//     /opportunities/pipelines - both require a `locationId` query param
//     (the GHL sub-account id, found in GHL under Settings > Business Info,
//     or the URL while viewing the sub-account).
//   - Rate limit: 100 requests / 10 seconds burst, 200,000/day.
//   - PIT tokens don't expire unless manually rotated (unlike Xero's
//     30-minute access tokens) - no refresh logic needed, closer to
//     Buildxact's API key model than Xero's OAuth model.
// ---------------------------------------------------------------------------

export const GHL_API_BASE_URL = "https://services.leadconnectorhq.com";
export const GHL_API_VERSION = "v3";

export interface GhlConfig {
  privateIntegrationToken: string;
  locationId: string;
}

function readConfig(): GhlConfig | null {
  const privateIntegrationToken = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!privateIntegrationToken || !locationId) return null;
  return { privateIntegrationToken, locationId };
}

export function isGhlConfigured(): boolean {
  return readConfig() !== null;
}

/** Throws with a message safe to surface in the UI - never includes secret values. */
export function getGhlConfig(): GhlConfig {
  const config = readConfig();
  if (!config) {
    throw new Error("GHL is not configured. Set GHL_PRIVATE_INTEGRATION_TOKEN and GHL_LOCATION_ID in the server environment.");
  }
  return config;
}
