import "server-only";

/** Vercel signs its own cron requests with `Authorization: Bearer $CRON_SECRET`
 * once that env var is set - this is what stops the /api/cron/* routes being
 * triggered by anyone who finds the URL. Those routes are also carved out of
 * the site's Basic Auth gate in src/proxy.ts, since Vercel Cron doesn't send
 * Basic Auth. */
export function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
