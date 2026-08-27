import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getConnections, saveConnection } from "@/integrations/xero/auth";

const STATE_COOKIE = "xero_oauth_state";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const settingsUrl = new URL("/settings", request.url);

  if (error) {
    settingsUrl.searchParams.set("xero_error", `Xero denied the request: ${error}`);
    return NextResponse.redirect(settingsUrl);
  }

  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  if (!code || !state || !expectedState || state !== expectedState) {
    settingsUrl.searchParams.set("xero_error", "Invalid OAuth state - please try connecting again.");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const connections = await getConnections(tokens.access_token);

    if (connections.length === 0) {
      settingsUrl.searchParams.set("xero_error", "No Xero organisation was authorized - select one during the Xero consent screen.");
      return NextResponse.redirect(settingsUrl);
    }

    for (const connection of connections) {
      await saveConnection(connection, tokens);
    }

    settingsUrl.searchParams.set("xero_connected", connections.map((c) => c.tenantName ?? c.tenantId).join(", "));
    const response = NextResponse.redirect(settingsUrl);
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch (err) {
    settingsUrl.searchParams.set("xero_error", err instanceof Error ? err.message : "Unknown error connecting to Xero.");
    return NextResponse.redirect(settingsUrl);
  }
}
