/**
 * Fills in how past ElevenLabs calls ended (interviews.end_cause and
 * end_detail, migration 0023) by reading each conversation's record from
 * ElevenLabs. Interviews that already have an end cause are left alone. Run
 * without --apply first to see what it would record:
 *
 *   npx tsx --env-file=.env.local scripts/backfill-call-end.ts
 *   npx tsx --env-file=.env.local scripts/backfill-call-end.ts --apply
 */
import { createServerSupabaseClient } from "../src/lib/supabase/client";
import { classifyElevenLabsEnd, type ElevenLabsEndFields } from "../src/voice-session/call-end";

async function main() {
  const apply = process.argv.includes("--apply");
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

  const client = createServerSupabaseClient();
  const { data, error } = await client
    .from("interviews")
    .select("id, first_name, created_at, elevenlabs_conversation_id")
    .eq("voice_provider", "elevenlabs")
    .is("end_cause", null)
    .not("elevenlabs_conversation_id", "is", null)
    .order("created_at", { ascending: true });

  if (error) {
    if (/end_cause/.test(error.message)) {
      console.error("The end_cause column does not exist yet. Apply migration 0023 first.");
      process.exit(1);
    }
    throw new Error(error.message);
  }

  let recorded = 0;
  const counts = { finished: 0, interrupted: 0, unknown: 0 };
  for (const interview of data ?? []) {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${interview.elevenlabs_conversation_id}`,
      { headers: { "xi-api-key": apiKey } },
    );
    if (!res.ok) {
      console.log(
        `${interview.id.slice(0, 8)} ${interview.first_name}: ElevenLabs answered ${res.status}, skipped`,
      );
      counts.unknown++;
      continue;
    }
    const { endCause, endDetail } = classifyElevenLabsEnd(
      (await res.json()) as ElevenLabsEndFields,
    );
    if (!endCause) {
      counts.unknown++;
      continue;
    }
    counts[endCause]++;
    console.log(
      `${interview.id.slice(0, 8)} ${interview.created_at.slice(0, 16)} ${interview.first_name}: ${endCause}` +
        (endCause === "interrupted"
          ? ` (${endDetail?.errorType ?? endDetail?.terminationReason ?? "no detail"})`
          : ""),
    );
    if (apply) {
      const { error: updateError } = await client
        .from("interviews")
        .update({ end_cause: endCause, end_detail: endDetail })
        .eq("id", interview.id);
      if (updateError) throw new Error(updateError.message);
      recorded++;
    }
  }

  console.log(
    `\n${data?.length ?? 0} interview(s) checked: ${counts.finished} finished, ${counts.interrupted} interrupted, ${counts.unknown} unknown.` +
      (apply
        ? ` Recorded ${recorded}.`
        : " Dry run: nothing was changed. Add --apply to record them."),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
