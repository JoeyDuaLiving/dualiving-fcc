import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/integrations/xero/auth";
import { isXeroConfigured } from "@/integrations/xero/config";

const STATE_COOKIE = "xero_oauth_state";

export async function GET() {
  if (!isXeroConfigured()) {
    return NextResponse.json(
      { error: "Xero is not configured. Set XERO_CLIENT_ID, XERO_CLIENT_SECRET and XERO_REDIRECT_URI." },
      { status: 500 }
    );
  }

  // CSRF protection: a random value we can only have set ourselves, checked
  // against what Xero echoes back to the callback.
  const state = randomUUID();
  const response = NextResponse.redirect(buildAuthorizeUrl(state));
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // the auth code itself expires in 5 minutes - this just needs to outlive that
    path: "/",
  });
  return response;
}
