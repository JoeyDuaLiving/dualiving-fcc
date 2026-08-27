import { NextResponse, type NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Shared-password gate for the whole site. Vercel's own Password Protection
// needs a Pro plan; this account is on Hobby, so this is a free equivalent
// for a 2-person audience (Joey + Michele) - plain HTTP Basic Auth checked
// against two env vars, using the browser's built-in login dialog.
//
// If SITE_AUTH_USER/SITE_AUTH_PASSWORD aren't set (e.g. local dev), the gate
// is skipped entirely - only enforced once those are configured in Vercel.
// ---------------------------------------------------------------------------

export function proxy(request: NextRequest) {
  // Cron-triggered requests carry their own bearer-token auth (see
  // src/app/api/cron/sync-all/route.ts), not this site's Basic Auth - Vercel
  // Cron doesn't send the latter.
  if (request.nextUrl.pathname.startsWith("/api/cron/")) return NextResponse.next();

  const user = process.env.SITE_AUTH_USER;
  const password = process.env.SITE_AUTH_PASSWORD;
  if (!user || !password) return NextResponse.next();

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
    const separatorIndex = decoded.indexOf(":");
    const suppliedUser = decoded.slice(0, separatorIndex);
    const suppliedPassword = decoded.slice(separatorIndex + 1);
    if (suppliedUser === user && suppliedPassword === password) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Dualiving Financial Command Centre"' },
  });
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
