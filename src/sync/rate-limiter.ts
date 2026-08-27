import "server-only";

// ---------------------------------------------------------------------------
// Sliding-window rate limiter for the Buildxact API's confirmed limit of
// 100 requests / 30 seconds. Kept deliberately under that (80/30s) so a
// concurrent request from a live page view doesn't push a bulk sync over
// the edge into 429s.
// ---------------------------------------------------------------------------

const WINDOW_MS = 30_000;
const MAX_PER_WINDOW = 80;

const requestTimestamps: number[] = [];

export async function rateLimit(): Promise<void> {
  const now = Date.now();
  while (requestTimestamps.length > 0 && now - requestTimestamps[0] > WINDOW_MS) {
    requestTimestamps.shift();
  }

  if (requestTimestamps.length >= MAX_PER_WINDOW) {
    const waitMs = WINDOW_MS - (now - requestTimestamps[0]) + 50;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return rateLimit();
  }

  requestTimestamps.push(Date.now());
}

/** Same sliding-window approach, parameterised for other APIs' own limits. */
export function createRateLimiter(windowMs: number, maxPerWindow: number) {
  const timestamps: number[] = [];

  async function limit(): Promise<void> {
    const now = Date.now();
    while (timestamps.length > 0 && now - timestamps[0] > windowMs) {
      timestamps.shift();
    }

    if (timestamps.length >= maxPerWindow) {
      const waitMs = windowMs - (now - timestamps[0]) + 50;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return limit();
    }

    timestamps.push(Date.now());
  }

  return limit;
}

// GHL's confirmed limit is 100 requests / 10 seconds burst - kept well under
// that (60/10s) so a concurrent live page view doesn't push a bulk sync over.
export const rateLimitGhl = createRateLimiter(10_000, 60);
