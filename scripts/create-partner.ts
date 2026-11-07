/**
 * Registers an API client (a "partner") for the partner API, lists partners, or
 * revokes one. Keys are created here, not through an endpoint
 * (partner-api-phase1/UI-PARTNER-API-SPEC.md, section 2).
 *
 * The API key and webhook secret are printed ONCE, when the partner is created.
 * Only a hash of the key is stored, so a lost key cannot be recovered: revoke
 * the partner and create a new one.
 *
 * Run with:
 *   npm run create:partner -- --name=pfa-preview --webhook-url=https://pfa-preview.example.com/hooks/ui
 *   npm run create:partner -- --list
 *   npm run create:partner -- --set-webhook=pfa-preview --webhook-url=https://pfa-preview.example.com/hooks/ui
 *   npm run create:partner -- --rotate-webhook-secret=pfa-preview
 *   npm run create:partner -- --revoke=pfa-preview
 *
 * --set-webhook points an existing partner's webhook at an address (https only).
 * It keeps the partner's signing secret, so nothing changes on the receiver's
 * side except where the events go.
 *
 * --rotate-webhook-secret replaces the signing secret and prints the new one
 * once. Events are signed with the new secret from that moment, so the receiver
 * should accept both secrets until it has switched (events that fail in the
 * meantime are retried for 24 hours).
 *
 * UI's Preview and Production deployments share one database, so register two
 * partners for PFA (pfa-preview and pfa-production), each with its own key.
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (already in .env.local,
 * loaded automatically via --env-file). Migration 0028 must be applied first.
 */
import { generateApiKey, generateWebhookSecret, hashApiKey } from "../src/partner-api/api-key";
import {
  InvalidWebhookUrlError,
  PartnerNotFoundError,
  rotateWebhookSecret,
  setPartnerWebhook,
} from "../src/partner-api/set-webhook";
import { getPartnerRepository } from "../src/repositories/get-partner-repository";

const USAGE =
  "Usage: npm run create:partner -- --name=<name> [--webhook-url=<https url>]\n" +
  "       npm run create:partner -- --list\n" +
  "       npm run create:partner -- --set-webhook=<name> --webhook-url=<https url>\n" +
  "       npm run create:partner -- --rotate-webhook-secret=<name>\n" +
  "       npm run create:partner -- --revoke=<name>";

function parseArgs(): Record<string, string> {
  return Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, "").split("=");
      return [key, rest.join("=")];
    }),
  );
}

async function main() {
  const args = parseArgs();
  const partners = getPartnerRepository();

  if ("list" in args) {
    const all = await partners.list();
    if (all.length === 0) console.log("No partners yet.");
    for (const p of all) {
      console.log(
        `${p.name}  (id: ${p.id})  created ${p.createdAt.toISOString()}  ${
          p.revokedAt ? `REVOKED ${p.revokedAt.toISOString()}` : "active"
        }  webhook: ${p.webhookUrl ?? "none"}`,
      );
    }
    return;
  }

  if ("set-webhook" in args) {
    if (!args["set-webhook"] || !args["webhook-url"]) {
      console.error("--set-webhook needs a partner name and --webhook-url.\n" + USAGE);
      process.exit(1);
    }
    try {
      const { partner, newSecret } = await setPartnerWebhook(
        partners,
        args["set-webhook"],
        args["webhook-url"],
      );
      console.log(`Webhook for ${partner.name} is now ${partner.webhookUrl}`);
      if (newSecret) {
        console.log("");
        console.log("This partner had no webhook secret, so one was created. Shown only once:");
        console.log(`  Webhook secret:  ${newSecret}`);
      } else {
        console.log("The signing secret is unchanged.");
      }
    } catch (error) {
      if (error instanceof InvalidWebhookUrlError || error instanceof PartnerNotFoundError) {
        console.error(error.message);
        process.exit(1);
      }
      throw error;
    }
    return;
  }

  if ("rotate-webhook-secret" in args) {
    if (!args["rotate-webhook-secret"]) {
      console.error("--rotate-webhook-secret needs a partner name.\n" + USAGE);
      process.exit(1);
    }
    try {
      const { partner, newSecret } = await rotateWebhookSecret(
        partners,
        args["rotate-webhook-secret"],
      );
      console.log(`New webhook secret for ${partner.name}. Shown only once:`);
      console.log(`  Webhook secret:  ${newSecret}`);
      console.log("");
      console.log("Events are signed with it from now on. Have the receiver accept both the");
      console.log("old and new secret until it has switched; failed events retry for 24 hours.");
    } catch (error) {
      if (error instanceof InvalidWebhookUrlError || error instanceof PartnerNotFoundError) {
        console.error(error.message);
        process.exit(1);
      }
      throw error;
    }
    return;
  }

  if (args.revoke) {
    const partner = await partners.getByName(args.revoke);
    if (!partner) {
      console.error(`No partner named "${args.revoke}".`);
      process.exit(1);
    }
    const revoked = await partners.revoke(partner.id);
    console.log(
      `Revoked ${revoked.name} at ${revoked.revokedAt?.toISOString()}. Its key no longer works; studies it created are kept.`,
    );
    return;
  }

  if (!args.name) {
    console.error(USAGE);
    process.exit(1);
  }
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(args.name)) {
    console.error("Name must be 2-63 characters: lower-case letters, digits and hyphens.");
    process.exit(1);
  }
  if (args["webhook-url"] && !/^https:\/\//.test(args["webhook-url"])) {
    console.error("The webhook URL must start with https://");
    process.exit(1);
  }
  if (await partners.getByName(args.name)) {
    console.error(`A partner named "${args.name}" already exists.`);
    process.exit(1);
  }

  const key = generateApiKey();
  const webhookSecret = generateWebhookSecret();
  const partner = await partners.create({
    name: args.name,
    keyHash: hashApiKey(key),
    webhookUrl: args["webhook-url"] || undefined,
    webhookSecret,
  });

  console.log(`Partner created: ${partner.name} (id: ${partner.id})`);
  console.log("");
  console.log("Copy these now. They are shown only once.");
  console.log(`  API key:         ${key}`);
  console.log(`  Webhook secret:  ${webhookSecret}`);
  console.log(`  Webhook URL:     ${partner.webhookUrl ?? "(not set)"}`);
}

main().catch((err) => {
  console.error("Script failed to run:\n", err);
  process.exit(1);
});
