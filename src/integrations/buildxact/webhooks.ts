import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getBuildxactConfig } from "./config";
import type { BuildxactWebhookEnvelope } from "./types";

// ---------------------------------------------------------------------------
// UNVERIFIED: the public docs confirm webhook events exist (EstimateAccepted,
// LeadCreated, LeadUpdated) but not the exact signing scheme. This implements
// the common "HMAC-SHA256 of the raw body, hex-encoded, in a signature
// header" pattern as a placeholder - confirm the real header name and
// encoding from the webhook registration screen in your account before
// trusting this in production, and swap it out if Buildxact's scheme differs.
// ---------------------------------------------------------------------------

const SIGNATURE_HEADER = "x-buildxact-signature"; // UNVERIFIED header name

export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const config = getBuildxactConfig();
  if (!config.webhookSecret) {
    throw new Error("BUILDXACT_WEBHOOK_SECRET is not set - refusing to accept unverified webhook payloads.");
  }
  if (!signatureHeader) return false;

  const expected = createHmac("sha256", config.webhookSecret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signatureHeader, "utf8");

  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

export { SIGNATURE_HEADER };

export function parseWebhookEnvelope(rawBody: string): BuildxactWebhookEnvelope {
  return JSON.parse(rawBody) as BuildxactWebhookEnvelope;
}
