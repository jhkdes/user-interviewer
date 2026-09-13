# Participant tracking webhook

How a third-party tool can correlate its own participant records with
interview completions in this system.

## 1. Tag the interview link

Append a `tracking_id` query param to the interview link you share with a
participant:

```
https://<host>/interview/<linkToken>?tracking_id=<your-id>
```

`<your-id>` is opaque to this system — any string your tool uses to
identify that participant. It's stored on the interview record once the
participant starts, and echoed back in the webhook call below. Omit the
param and that interview simply won't trigger a webhook call.

## 2. Register your endpoint

There is one webhook URL for the whole deployment (not per-study), set by
the developer via the `PARTICIPANT_COMPLETION_WEBHOOK_URL` environment
variable. Ask them to point it at your endpoint.

## 3. What you receive

When a tagged interview completes, we send:

```
POST <your-endpoint>
Content-Type: application/json

{
  "participantTrackingId": "<your-id>",
  "interviewId": "527d63ba-67ea-4585-a6a6-60eaab13eb4f",
  "studyId": "b1e2c3d4-...",
  "status": "completed",
  "completedAt": "2026-09-08T05:07:58.000Z"
}
```

| Field                   | Type   | Notes                                                               |
| ----------------------- | ------ | ------------------------------------------------------------------- |
| `participantTrackingId` | string | The `tracking_id` you supplied on the link.                         |
| `interviewId`           | string | This system's internal interview id.                                |
| `studyId`               | string | This system's internal study id.                                    |
| `status`                | string | Always `"completed"` today — the only event this webhook fires for. |
| `completedAt`           | string | ISO 8601 UTC timestamp of completion.                               |

Respond with any `2xx` status to acknowledge receipt.

## 4. Delivery behavior

- **At most one call per completed interview.** Untagged interviews never
  trigger a call.
- **Retries:** up to 3 attempts with linear backoff (network errors and
  `5xx` responses are retried; a `4xx` response is treated as
  non-retryable and not retried).
- **Best-effort, not guaranteed:** if all retries fail, the call is
  dropped — the interview's completion status in this system is
  unaffected either way. There's currently no replay/backfill mechanism,
  so a persistently unreachable or slow endpoint will lose events. Ensure
  your endpoint responds quickly and reliably.
- **No signature/auth on the payload** — treat the URL itself as the
  shared secret; don't accept this payload from any other source.
