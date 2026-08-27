import "server-only";
import { GHL_API_BASE_URL, GHL_API_VERSION, getGhlConfig } from "./config";

export class GhlApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "GhlApiError";
  }
}

/** Every call needs the location id, the PIT bearer token, and the Version
 * header - this always injects locationId into the query string so callers
 * don't have to remember it on every request. */
export async function ghlGet<T>(path: string, query: Record<string, string> = {}): Promise<T> {
  const config = getGhlConfig();
  const qs = new URLSearchParams({ locationId: config.locationId, ...query }).toString();
  const url = `${GHL_API_BASE_URL}${path}?${qs}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.privateIntegrationToken}`,
      Version: GHL_API_VERSION,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text().catch(() => undefined);
    }
    throw new GhlApiError(`GHL API request failed: ${response.status} ${response.statusText}`, response.status, body);
  }

  return (await response.json()) as T;
}
