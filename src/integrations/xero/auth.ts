import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { integrationConnections } from "@/db/schema";
import { XERO_AUTHORIZE_URL, XERO_CONNECTIONS_URL, XERO_SCOPES, XERO_TOKEN_URL, getXeroConfig } from "./config";

// ---------------------------------------------------------------------------
// OAuth 2.0 standard authorization code flow - see config.ts for the
// confirmed endpoint reference this implements against.
// ---------------------------------------------------------------------------

export function buildAuthorizeUrl(state: string): string {
  const config = getXeroConfig();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: XERO_SCOPES,
    state,
  });
  return `${XERO_AUTHORIZE_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

class XeroAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "XeroAuthError";
  }
}

function basicAuthHeader(): string {
  const config = getXeroConfig();
  return "Basic " + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new XeroAuthError(`Xero token request failed: ${response.status} ${response.statusText} ${text}`, response.status);
  }
  return (await response.json()) as TokenResponse;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const config = getXeroConfig();
  return tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
    })
  );
}

async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  return tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    })
  );
}

export interface XeroConnectionInfo {
  id: string;
  tenantId: string;
  tenantType: string;
  tenantName: string | null;
}

export async function getConnections(accessToken: string): Promise<XeroConnectionInfo[]> {
  const response = await fetch(XERO_CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new XeroAuthError(`Failed to fetch Xero connections: ${response.status} ${response.statusText}`, response.status);
  }
  return (await response.json()) as XeroConnectionInfo[];
}

/** Called once, right after the OAuth callback - persists one row per
 * connected tenant (usually just one, Dualiving's own Xero org). */
export async function saveConnection(tenant: XeroConnectionInfo, tokens: TokenResponse): Promise<void> {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  const [existing] = await db
    .select({ id: integrationConnections.id })
    .from(integrationConnections)
    .where(eq(integrationConnections.tenantId, tenant.tenantId));

  const values = {
    provider: "xero",
    tenantId: tenant.tenantId,
    tenantName: tenant.tenantName,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt,
    scope: tokens.scope,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(integrationConnections).set(values).where(eq(integrationConnections.id, existing.id));
  } else {
    await db.insert(integrationConnections).values(values);
  }
}

/** Returns a valid access token + tenantId for the (assumed single) Xero
 * connection, refreshing and persisting the rotated tokens if the current
 * access token is expired or about to be. Throws if nothing has been
 * connected yet - callers should treat that as "not connected", not crash. */
export async function getValidXeroAccessToken(): Promise<{ accessToken: string; tenantId: string }> {
  const [connection] = await db.select().from(integrationConnections).where(eq(integrationConnections.provider, "xero"));

  if (!connection) {
    throw new Error("No Xero connection found - connect Xero from Settings first.");
  }

  if (connection.expiresAt.getTime() > Date.now() + 60_000) {
    return { accessToken: connection.accessToken, tenantId: connection.tenantId };
  }

  const refreshed = await refreshTokens(connection.refreshToken);
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

  await db
    .update(integrationConnections)
    .set({
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token, // rotated - must persist the new one
      expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(integrationConnections.id, connection.id));

  return { accessToken: refreshed.access_token, tenantId: connection.tenantId };
}

export { XeroAuthError };
