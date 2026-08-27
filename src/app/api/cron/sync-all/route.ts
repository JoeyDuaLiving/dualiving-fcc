import { syncBuildxact } from "@/sync/buildxact";
import { syncXero } from "@/sync/xero";
import { syncGhl } from "@/sync/ghl";

// ---------------------------------------------------------------------------
// Single combined cron entry point, not three separate ones - simpler to
// keep everything on one schedule (see vercel.json) and run sequentially
// here, rather than juggling three.
//
// A full Buildxact sync needs hundreds of API calls (100+ jobs, each with
// follow-up calls for POs/invoices) against Buildxact's own rate limit -
// confirmed live to exceed the Vercel Hobby plan's 60s function ceiling even
// on its own (FUNCTION_INVOCATION_TIMEOUT), which is why this project is on
// Pro (300s ceiling, comfortably covers it).
//
// Vercel signs its own cron requests with `Authorization: Bearer
// $CRON_SECRET` (that env var, once set, is what tells Vercel to do this) -
// checked below so this endpoint can't be triggered by anyone who finds the
// URL. It's also carved out of the site's Basic Auth gate in
// src/proxy.ts, since Vercel Cron doesn't send Basic Auth.
//
// Each integration's own failure is caught independently so one down
// integration doesn't stop the other two from syncing.
// ---------------------------------------------------------------------------

export const maxDuration = 300; // Pro plan ceiling

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  try {
    results.buildxact = await syncBuildxact();
  } catch (err) {
    results.buildxact = { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }

  try {
    results.xero = await syncXero();
  } catch (err) {
    results.xero = { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }

  try {
    results.ghl = await syncGhl();
  } catch (err) {
    results.ghl = { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }

  return Response.json(results);
}
