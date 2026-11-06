import { NextResponse } from "next/server";
import { hasValidBearerToken } from "@/lib/bearer-auth";
import { getPartnerWebhookDeps, runPartnerWebhookSweep } from "@/partner-webhooks";

export const dynamic = "force-dynamic";
/** Each delivery may wait up to ten seconds for a partner's answer; the sweep stops well before this. */
export const maxDuration = 60;

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Never run unauthenticated just because the secret was forgotten.
    console.error("Missing required environment variable: CRON_SECRET");
    return NextResponse.json({ error: "Sweep not configured" }, { status: 500 });
  }
  if (!hasValidBearerToken(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runPartnerWebhookSweep(getPartnerWebhookDeps());
    console.log(
      `Partner webhook sweep: checked ${result.checked}, delivered ${result.delivered}, ` +
        `retrying ${result.retried}, waiting for a recording ${result.waiting}, ` +
        `gave up ${result.failed}, deferred ${result.deferred}`,
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error("Partner webhook sweep failed:", error);
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}

/**
 * Sends the partner webhooks that are due: first attempts the completion hook
 * could not make (a recording not ready, a partner briefly down) and retries.
 * Run about every five minutes by a scheduler. Protected by a shared secret
 * sent as `Authorization: Bearer <CRON_SECRET>`, like the other sweeps. Safe to
 * run repeatedly: a delivery is taken before it is sent.
 */
export const GET = handle;
export const POST = handle;
