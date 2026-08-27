import { parseWebhookEnvelope, verifyWebhookSignature, SIGNATURE_HEADER } from "@/integrations/buildxact/webhooks";

export async function POST(request: Request) {
  const rawBody = await request.text();

  let verified: boolean;
  try {
    verified = verifyWebhookSignature(rawBody, request.headers.get(SIGNATURE_HEADER));
  } catch (err) {
    // BUILDXACT_WEBHOOK_SECRET not configured - fail closed, not open.
    return Response.json({ error: err instanceof Error ? err.message : "Webhook not configured" }, { status: 500 });
  }

  if (!verified) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const envelope = parseWebhookEnvelope(rawBody);

  // TODO(Phase 2): persist to a sync_events/sync_errors table once the
  // database exists. For now this just acknowledges receipt so Buildxact's
  // webhook delivery doesn't back off - wire up real handling per event type
  // (EstimateAccepted -> create/update job mapping, LeadCreated/Updated ->
  // reconcile against GHL) once that table exists.
  console.info("[buildxact webhook]", envelope.eventType, envelope.eventId);

  return Response.json({ received: true });
}
