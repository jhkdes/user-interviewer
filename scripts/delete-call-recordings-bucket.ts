/**
 * Deletes the now-unused `call-recordings` Storage bucket (see
 * supabase/migrations/0013_drop_call_recordings_bucket.sql). Supabase blocks
 * direct SQL deletes against storage.objects/storage.buckets
 * ("Direct deletion from storage tables is not allowed. Use the Storage API
 * instead.") — this does the same removal through the Storage API instead.
 *
 * Run with:
 *   npm run delete:call-recordings-bucket
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (already in
 * .env.local, loaded automatically via --env-file).
 */
import { createServerSupabaseClient } from "../src/lib/supabase/client";

const BUCKET = "call-recordings";

async function main() {
  const client = createServerSupabaseClient();

  const { data: files, error: listError } = await client.storage.from(BUCKET).list();
  if (listError) {
    console.error(`Failed to list objects in ${BUCKET}: ${listError.message}`);
    process.exit(1);
  }

  if (files && files.length > 0) {
    const { error: removeError } = await client.storage
      .from(BUCKET)
      .remove(files.map((f) => f.name));
    if (removeError) {
      console.error(`Failed to empty ${BUCKET}: ${removeError.message}`);
      process.exit(1);
    }
    console.log(`Removed ${files.length} object(s) from ${BUCKET}.`);
  }

  const { error: deleteError } = await client.storage.deleteBucket(BUCKET);
  if (deleteError) {
    console.error(`Failed to delete bucket ${BUCKET}: ${deleteError.message}`);
    process.exit(1);
  }

  console.log(`Deleted bucket: ${BUCKET}`);
}

main().catch((err) => {
  console.error("Script failed to run:\n", err);
  process.exit(1);
});
