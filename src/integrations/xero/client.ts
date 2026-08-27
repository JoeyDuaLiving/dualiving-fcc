import "server-only";
import { XERO_API_BASE_URL } from "./config";
import { getValidXeroAccessToken } from "./auth";

export class XeroApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "XeroApiError";
  }
}

/** Every Accounting API call needs both a valid bearer token and the
 * Xero-tenant-id header - a request without the tenant header fails
 * regardless of how valid the token is (confirmed in Xero's docs). */
export async function xeroGet<T>(path: string, query?: Record<string, string>): Promise<T> {
  const { accessToken, tenantId } = await getValidXeroAccessToken();
  const qs = query ? `?${new URLSearchParams(query).toString()}` : "";
  const url = `${XERO_API_BASE_URL}${path}${qs}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-tenant-id": tenantId,
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
    throw new XeroApiError(`Xero API request failed: ${response.status} ${response.statusText}`, response.status, body);
  }

  return (await response.json()) as T;
}
