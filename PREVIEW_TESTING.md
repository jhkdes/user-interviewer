# Preview voice-provider testing setup

How Vapi and ElevenLabs are wired up for testing in Vercel Preview, and how
to keep using it without re-touching either provider's dashboard.

## Why this exists

Vapi and ElevenLabs each need a URL to call back into for live-turn
generation (`/api/vapi/chat/completions`, `/api/elevenlabs/custom-llm`) and
for post-call webhooks. Every Preview deployment gets a brand-new, unique
URL, so testing against "whatever I just pushed" used to mean manually
re-pointing both providers' dashboards every time — easy to forget, and for
a while (2026-09-02) both providers were accidentally left pointing at a
stale Preview URL, meaning **production** traffic was silently being routed
there. This setup exists to make that class of mistake structurally
impossible.

## The setup

- **A dedicated, permanent `preview` branch.** Not a feature branch — a
  standing branch that only exists to carry whatever you're currently
  testing.
- **Vercel's own git-branch alias**, `https://user-interviewer-git-preview-df-dc33.vercel.app`,
  which Vercel automatically repoints to the latest **Ready** deployment of
  the `preview` branch on every push. No manual aliasing, no scripts.
- **Dedicated Vapi and ElevenLabs preview assistants/agents** — genuinely
  separate from production, not shared:
  - Vapi assistant `b6feebef-d8df-4fd1-8b59-fa2d34633278` ("User Interviewer
    (Preview)") — `model.url` / `server.url` both point at the alias above.
  - ElevenLabs agent `agent_5901m1hpkbznfs78h9k1v2c7984c`
    ("user-interviewer-preview") — `custom_llm.url` points at the alias
    above; its post-call webhook is a separate workspace webhook entry
    (`b7da478d4ca64ff1919b771008794f34`, name "Preview (git-branch alias)")
    also pointed at the alias, with its own `ELEVENLABS_WEBHOOK_SECRET`
    stored in Vercel's **Preview** environment.

  Production keeps its own separate assistant/agent (`08bcdcd5-...` /
  `agent_4001m1616...`), permanently pointed at `user-interviewer.vercel.app`.
  The two should never need to cross paths again.

- `NEXT_PUBLIC_VAPI_ASSISTANT_ID` and `NEXT_PUBLIC_ELEVENLABS_AGENT_ID` are
  set differently per Vercel environment (Preview vs Production) — this is
  what actually selects which assistant/agent a given deployment's browser
  client talks to. `DEBUG_VOICE_SESSION=true` is also set on Preview only,
  for verbose request/response logging (see `src/lib/debug.ts`).

## Testing a change

```bash
git checkout preview
git merge <your-feature-branch>   # or rebase, whichever fits
git push origin preview
```

That's it. Vercel builds it, the git-branch alias updates automatically,
and both providers are already pointed at that exact alias — no dashboard
visits, no CLI aliasing.

To confirm you're testing the right thing before a long test, check:

```bash
npx vercel inspect https://user-interviewer-git-preview-df-dc33.vercel.app
```

The `created` timestamp there should match your latest push.

## Env vars matter for build time, not just deploy time

`NEXT_PUBLIC_*` values are inlined into the client bundle at **build** time.
If you change one in Vercel (e.g. swapping which agent ID Preview uses),
existing deployments won't pick it up — you need a fresh build:

```bash
npx vercel redeploy <latest-preview-deployment-url> --target preview
```

Server-only secrets (`ELEVENLABS_WEBHOOK_SECRET`, etc.) behave the same way
in practice — treat any env var change as needing a redeploy.

## If something needs rebuilding from scratch

- **ElevenLabs webhook URLs are immutable once created.** You can't edit an
  existing webhook's URL (`PATCH` only allows `name`/`is_disabled`/
  `retry_enabled`/`events`) — you have to create a new one
  (`POST /v1/workspace/webhooks`, requires the `webhooks_write` API key
  scope) and reassign the agent's `platform_settings.workspace_overrides.webhooks.post_call_webhook_id`
  to the new `webhook_id`. Disable (don't delete) the old one so there's a
  trail.
- **Vapi's Custom LLM URL and Server URL are two separate fields** — a
  common half-fix is updating one and not the other. Both live in the
  assistant's config (`model.url` for the LLM, `server.url` for webhooks).
- If a fresh git push to `preview` doesn't produce a new
  `user-interviewer-git-preview-*` alias update (e.g. because the pushed
  commit is byte-identical to one already built under another branch),
  push an empty commit (`git commit --allow-empty`) to force a distinct
  build.
- Both provider configs can be inspected read-only at any time:
  ```bash
  curl -s "https://api.vapi.ai/assistant/b6feebef-d8df-4fd1-8b59-fa2d34633278" \
    -H "Authorization: Bearer $VAPI_API_KEY" | jq '{model, server}'

  curl -s "https://api.elevenlabs.io/v1/convai/agents/agent_5901m1hpkbznfs78h9k1v2c7984c" \
    -H "xi-api-key: $ELEVENLABS_API_KEY" | jq '.conversation_config.agent.prompt.custom_llm, .platform_settings.workspace_overrides.webhooks'
  ```
