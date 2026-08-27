import "server-only";

// ---------------------------------------------------------------------------
// Buildxact connection config.
//
// Server-only: importing this from a Client Component is a build error
// (the `server-only` package throws), which is the guardrail against ever
// shipping a subscription key or API key to the browser.
//
// CONFIRMED LIVE (Aug 2026, tested end to end against the real tenant -
// see the incident notes below, not just scraped docs):
//   - Base URL: https://api-v3.buildxact.com
//   - Auth: POST /accounts/auth/login, body { email, apiKey, tenantId? },
//     returns { accessToken, refreshToken, idToken, expiresIn, isSuccessful }.
//     This is Buildxact's "first-party" flow (a Buildxact customer accessing
//     their own data) - the apiKey comes from
//     https://app.buildxact.com/account/api/keys, NOT an OAuth client_id/secret
//     (that was an earlier incorrect guess before we could see the real docs).
//   - The Ocp-Apim-Subscription-Key header MUST be present on every call,
//     including /login and /refresh-token (Buildxact's docs call this out in
//     bold - it's a common integration mistake).
//   - Access tokens are Auth0-issued JWTs, expire in ~1hr (expiresIn), and
//     carry a long-lived refreshToken (max 200 active per account) to avoid
//     re-authenticating with email+apiKey every time.
//   - Rate limit: 100 requests / 30 seconds (429 on breach); the response
//     also carries x-bx-remainingcalls / x-bx-totalcalls headers.
//
// Incident note (2026-08-27): this account briefly returned 403 Forbidden
// (empty body) on every data endpoint despite a successful login - suspected
// entitlement propagation delay shortly after subscription approval. Not
// reproducible once retested with a fresh login; if it recurs, re-check
// https://developer.buildxact.com/profile shows the subscription as Active
// and retry a fresh login rather than reusing an old token.
// ---------------------------------------------------------------------------

export interface BuildxactConfig {
  environment: "staging" | "production";
  apiBaseUrl: string;
  loginUrl: string;
  refreshUrl: string;
  subscriptionKey: string;
  loginEmail: string;
  apiKey: string;
  tenantId?: string;
  webhookSecret: string;
}

function readConfig(): BuildxactConfig | null {
  const subscriptionKey = process.env.BUILDXACT_SUBSCRIPTION_KEY;
  const loginEmail = process.env.BUILDXACT_LOGIN_EMAIL;
  const apiKey = process.env.BUILDXACT_API_KEY;

  if (!subscriptionKey || !loginEmail || !apiKey) {
    return null;
  }

  const environment = process.env.BUILDXACT_ENVIRONMENT === "staging" ? "staging" : "production";
  const apiBaseUrl = process.env.BUILDXACT_API_BASE_URL ?? "https://api-v3.buildxact.com";

  return {
    environment,
    apiBaseUrl,
    loginUrl: process.env.BUILDXACT_TOKEN_URL ?? `${apiBaseUrl}/accounts/auth/login`,
    refreshUrl: `${apiBaseUrl}/accounts/auth/refresh-token`,
    subscriptionKey,
    loginEmail,
    apiKey,
    tenantId: process.env.BUILDXACT_TENANT_ID || undefined,
    webhookSecret: process.env.BUILDXACT_WEBHOOK_SECRET ?? "",
  };
}

export function isBuildxactConfigured(): boolean {
  return readConfig() !== null;
}

/** Throws with a message safe to surface in the UI - never includes secret values. */
export function getBuildxactConfig(): BuildxactConfig {
  const config = readConfig();
  if (!config) {
    throw new Error(
      "Buildxact is not configured. Set BUILDXACT_SUBSCRIPTION_KEY, BUILDXACT_LOGIN_EMAIL and BUILDXACT_API_KEY in the server environment."
    );
  }
  return config;
}
