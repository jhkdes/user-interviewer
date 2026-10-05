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

## Showing the count on a public website

**Don't call the endpoint above from a web page.** It needs `EXTERNAL_API_KEY`,
and a key in a page's JavaScript is visible to every visitor. That key reads
every study, so treat it as server-side only.

For a page like the discoverFirst.co site, use the public endpoint instead. It
needs no key because it exposes only one number for one study:

```
GET /api/public/completed-interviews-count
```

```js
const res = await fetch(
  "https://user-interviewer.vercel.app/api/public/completed-interviews-count",
);
const { completedInterviews } = await res.json();
```

```json
{ "completedInterviews": 12 }
```

That is the whole response: no study id, no other fields.

### What keeps it safe

- **One study, chosen by the server.** `PUBLIC_COUNT_STUDY_ID` sets which study
  it counts. The request can't name a study, so the endpoint can't be used to read
  any other, and the id is never sent back.
- **Cached.** Browsers and the CDN reuse an answer for 60 seconds, and the
  server keeps its own 60-second copy, so page views don't each query the
  database, even if someone adds random query strings to bypass the CDN.
- **CORS.** Only pages served from the listed origins can read the response in
  a browser. The default is `https://discoverfirst.co`; set
  `PUBLIC_COUNT_ALLOWED_ORIGINS` (comma-separated, exact origins, replaces the
  default) to add others, such as `https://www.discoverfirst.co`. This stops other
  websites from embedding the number. It is not secrecy: anyone can still call
  the URL directly, so only put data here that you are happy to make public.
- **Counts the same things** as the endpoint above: completed interviews that
  have a transcript.

### Setting it up

1. Set `PUBLIC_COUNT_STUDY_ID` to the study's id (the UUID in
   `/dashboard/studies/{studyId}`) in the Vercel environment you want. Optionally
   set `PUBLIC_COUNT_ALLOWED_ORIGINS`.
2. Redeploy, since environment variables only apply to new builds.
3. Point the page at the URL above.

The endpoint answers `503` with `{ "error": "Unavailable" }`, uncached, when
`PUBLIC_COUNT_STUDY_ID` is unset or matches no study, or if the lookup fails.
The page should treat any non-200 as "no number to show" and fall back to its
default message.
