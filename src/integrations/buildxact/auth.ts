import "server-only";
import { getBuildxactConfig } from "./config";

// ---------------------------------------------------------------------------
// Access token acquisition - confirmed live against the real API (see
// config.ts for the incident note). Buildxact's first-party flow:
//
//   POST /accounts/auth/login   { email, apiKey, tenantId? }
//   -> { accessToken, refreshToken, idToken, expiresIn, isSuccessful }
//
// The Ocp-Apim-Subscription-Key header is required even on this call.
// ---------------------------------------------------------------------------

interface CachedToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

let cached: CachedToken | null = null;

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number; // seconds
  isSuccessful: boolean;
}

class BuildxactAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "BuildxactAuthError";
  }
}

async function login(): Promise<LoginResponse> {
  const config = getBuildxactConfig();

  const response = await fetch(config.loginUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": config.subscriptionKey,
    },
    body: JSON.stringify({
      email: config.loginEmail,
      apiKey: config.apiKey,
      ...(config.tenantId ? { tenantId: config.tenantId } : {}),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new BuildxactAuthError(`Buildxact login failed: ${response.status} ${response.statusText}`, response.status);
  }

  return (await response.json()) as LoginResponse;
}

async function refresh(refreshToken: string): Promise<LoginResponse> {
  const config = getBuildxactConfig();

  const response = await fetch(config.refreshUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": config.subscriptionKey,
    },
    body: JSON.stringify({
      email: config.loginEmail,
      apiKey: config.apiKey,
      refreshToken,
      ...(config.tenantId ? { tenantId: config.tenantId } : {}),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new BuildxactAuthError(`Buildxact token refresh failed: ${response.status} ${response.statusText}`, response.status);
  }

  return (await response.json()) as LoginResponse;
}

export async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.accessToken;
  }

  let result: LoginResponse;
  if (cached?.refreshToken) {
    try {
      result = await refresh(cached.refreshToken);
    } catch {
      // Refresh token may have been rotated out (max 200 active) or expired -
      // fall back to a full login rather than failing the caller.
      result = await login();
    }
  } else {
    result = await login();
  }

  cached = {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresAt: Date.now() + result.expiresIn * 1000,
  };
  return cached.accessToken;
}

/** Test-only: clears the in-memory token cache so a fresh login is requested. */
export function clearTokenCache(): void {
  cached = null;
}
