import "server-only";

// ---------------------------------------------------------------------------
// Xero connection config.
//
// Confirmed live from developer.xero.com (Aug 2026, standard authorization
// code flow docs - https://developer.xero.com/documentation/guides/oauth2/auth-flow/):
//   - Authorize:      https://login.xero.com/identity/connect/authorize
//   - Token exchange: POST https://identity.xero.com/connect/token
//                      (Basic auth: base64(client_id:client_secret))
//   - Connections:    GET https://api.xero.com/connections (Bearer token)
//   - Accounting API: https://api.xero.com/api.xro/2.0/{Resource}
//                      (Bearer token + Xero-tenant-id header, required on
//                      every call)
//   - Token lifetimes: access_token 30 min, refresh_token 60 days unused,
//     refresh tokens ROTATE on every use - the new one must replace the old
//     one in storage, or the next refresh will fail.
//   - redirect_uri must be https, except localhost is explicitly allowed for
//     testing (http://localhost/... - NOT http://127.0.0.1).
//
// As of March-April 2026, new apps get "granular" scopes rather than the
// old broad ones (e.g. accounting.invoices.read instead of
// accounting.transactions.read) - see integrations/xero's SCOPES constant.
// Broad scopes still work until September 2027 for apps that already have
// them, but any app created now gets granular scopes automatically.
// ---------------------------------------------------------------------------

export const XERO_AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
export const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
export const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
export const XERO_API_BASE_URL = "https://api.xero.com/api.xro/2.0";

// Minimum scopes for what the dashboard needs: bank accounts + transactions,
// invoices (covers both AR invoices and AP bills - Xero's Invoices resource
// distinguishes them by Type=ACCREC/ACCPAY), payments, contacts, chart of
// accounts/organisation settings, and P&L/Balance Sheet reports.
export const XERO_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "accounting.invoices.read",
  "accounting.payments.read",
  "accounting.banktransactions.read",
  "accounting.contacts.read",
  "accounting.settings.read",
  "accounting.reports.profitandloss.read",
  "accounting.reports.balancesheet.read",
  "accounting.reports.banksummary.read",
].join(" ");

export interface XeroConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function readConfig(): XeroConfig | null {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const redirectUri = process.env.XERO_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function isXeroConfigured(): boolean {
  return readConfig() !== null;
}

/** Throws with a message safe to surface in the UI - never includes secret values. */
export function getXeroConfig(): XeroConfig {
  const config = readConfig();
  if (!config) {
    throw new Error("Xero is not configured. Set XERO_CLIENT_ID, XERO_CLIENT_SECRET and XERO_REDIRECT_URI in the server environment.");
  }
  return config;
}
