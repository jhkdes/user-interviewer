# External API

Read-only endpoints for tools outside this app (a script, a spreadsheet, a
third-party dashboard). They are separate from the PM dashboard's own routes
under `/api/studies`, which need a logged-in PM session and can't be called by
a tool.

## Authentication

Every endpoint under `/api/external` expects a shared secret:

```
Authorization: Bearer <EXTERNAL_API_KEY>
```

`EXTERNAL_API_KEY` is an environment variable on the deployment (any long
random string). Share it only with the tools that need it.

- A missing or wrong key gets `401`, whether or not the study exists, so a
  caller without the key can't find out which study ids are real.
- While `EXTERNAL_API_KEY` is **not set** on the deployment, every external
  endpoint answers `500` instead of serving. It never falls back to open
  access.
- There is one key for all external endpoints and no per-study scoping: a
  caller with the key can read any study.
- There is no rate limiting. Don't poll more often than you need to.

To enable it, set `EXTERNAL_API_KEY` in the Vercel environment you want
(Production, Preview, or both) and redeploy, since environment variables only
apply to new builds.

## Completed interviews in a study

```
GET /api/external/studies/{studyId}/completed-interviews/count
```

`{studyId}` is the study's id (the UUID in the dashboard URL
`/dashboard/studies/{studyId}`), **not** the link token participants use.

```bash
curl -s https://user-interviewer.vercel.app/api/external/studies/<studyId>/completed-interviews/count \
  -H "Authorization: Bearer $EXTERNAL_API_KEY"
```

```json
{ "studyId": "5b0e3f0a-3c1d-4d6e-9d52-0f6f7a4c9b98", "completedInterviews": 12 }
```

### What counts

An interview counts when it is **completed** and its transcript has **at least
one turn**. That includes typed and voice interviews alike. It does not count:

- interviews that haven't finished (pending or in progress) or have expired
- completed interviews with no transcript, such as a typed interview that
  timed out before anything was said

The number is read fresh on every call (`Cache-Control: no-store`).

### Responses

| Status | Meaning                                                                          |
| ------ | -------------------------------------------------------------------------------- |
| `200`  | `{ "studyId": "...", "completedInterviews": <number> }`. The count can be `0`.   |
| `401`  | Missing or wrong key. Carries `WWW-Authenticate: Bearer`.                        |
| `404`  | No study with that id. Anything that isn't a well-formed id gets the same `404`. |
| `500`  | `EXTERNAL_API_KEY` isn't configured on the deployment, or the count failed.      |
