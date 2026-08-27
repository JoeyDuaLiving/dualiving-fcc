import "server-only";
import { getBuildxactConfig } from "./config";
import { getAccessToken } from "./auth";

// ---------------------------------------------------------------------------
// Low-level HTTP client for the Buildxact API.
//
// Confirmed: 100 requests / 30 seconds, 429 on breach. This retries a 429
// once using the Retry-After header (falling back to a fixed backoff) rather
// than failing the whole sync run on a transient rate-limit hit.
//
// Confirmed: the API uses the OData protocol, so list endpoints accept
// standard $filter / $select / $expand / $top / $skip query parameters.
// ---------------------------------------------------------------------------

export class BuildxactApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "BuildxactApiError";
  }
}

export interface ODataQuery {
  filter?: string;
  select?: string[];
  expand?: string[];
  top?: number;
  skip?: number;
}

function buildQueryString(query?: ODataQuery): string {
  if (!query) return "";
  const params = new URLSearchParams();
  if (query.filter) params.set("$filter", query.filter);
  if (query.select?.length) params.set("$select", query.select.join(","));
  if (query.expand?.length) params.set("$expand", query.expand.join(","));
  if (query.top !== undefined) params.set("$top", String(query.top));
  if (query.skip !== undefined) params.set("$skip", String(query.skip));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function requestOnce(path: string, query: ODataQuery | undefined, attempt: number): Promise<Response> {
  const config = getBuildxactConfig();
  const token = await getAccessToken();
  const url = `${config.apiBaseUrl}${path}${buildQueryString(query)}`;

  const response = await fetch(url, {
    headers: {
      "Ocp-Apim-Subscription-Key": config.subscriptionKey,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    // Never cache authenticated financial data at the fetch layer.
    cache: "no-store",
  });

  if (response.status === 429 && attempt === 0) {
    const retryAfterSeconds = Number(response.headers.get("Retry-After")) || 5;
    await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1000));
    return requestOnce(path, query, attempt + 1);
  }

  return response;
}

export async function buildxactGet<T>(path: string, query?: ODataQuery): Promise<T> {
  const response = await requestOnce(path, query, 0);

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text().catch(() => undefined);
    }
    throw new BuildxactApiError(`Buildxact API request failed: ${response.status} ${response.statusText}`, response.status, body);
  }

  return (await response.json()) as T;
}
