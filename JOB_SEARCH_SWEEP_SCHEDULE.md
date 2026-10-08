# Scheduling the job-search report sweep on Vercel

The sweep turns completed job-search interviews into draft reports. Normally the
interview-completion webhook starts it immediately. A schedule is the safety net
for the cases where that trigger is dropped, or a report is left stuck in
"generating". It is optional for a small pilot: "Process now" on the study page
does the same thing by hand.

What the schedule calls: `GET /api/internal/job-search-reports/sweep`. Each call
queues any completed interviews that lack a report and works on **one** report
(about 3 to 4 minutes). It is protected by `Authorization: Bearer <CRON_SECRET>`.
Vercel Cron sends that header automatically when a `CRON_SECRET` environment
variable exists.

## Before you start: check your plan

|                     | Hobby                                       | Pro                       |
| ------------------- | ------------------------------------------- | ------------------------- |
| Cron frequency      | Once per day at most                        | As often as every minute  |
| Function time limit | Lower; check whether 300 seconds is allowed | Up to 300 seconds or more |

A sweep needs up to 300 seconds (`maxDuration` in the route). If your plan caps
functions below that, the sweep is cut off mid-report, the report stays
"generating", and a later sweep picks it up after 10 minutes. On Hobby, a daily
schedule is a poor fit for this and "Process now" is the better backstop. Check
your limits in the Vercel dashboard under Settings, Functions, and in Vercel's
current Cron Jobs and Functions documentation, since plan limits change.

Cron jobs run **only on the production deployment**, never on preview
deployments. On preview, rely on the completion trigger and "Process now".

## Steps

1. **Set `CRON_SECRET`.** In Vercel: your project, Settings, Environment
   Variables. Add `CRON_SECRET` with a long random value (for example the output
   of `openssl rand -hex 32`) for the Production environment, and for Preview
   too, because the completion trigger uses it as well. Do not reuse
   `EXTERNAL_API_KEY`.

2. **Confirm `APP_BASE_URL`** is set for Production (and Preview) to your site's
   public address, for example `https://yourapp.com`, with no path.

3. **Add `vercel.json`** at the repository root. If one already exists, add the
   `crons` entry to it.

   ```json
   {
     "crons": [
       {
         "path": "/api/internal/job-search-reports/sweep",
         "schedule": "*/10 * * * *"
       }
     ]
   }
   ```

   The schedule is standard cron syntax in UTC. `*/10 * * * *` means every 10
   minutes. On Hobby use a daily schedule such as `0 14 * * *`. Because each
   sweep handles one report, a short interval clears a backlog faster; an
   interval shorter than a sweep (about 4 minutes) is wasteful but harmless,
   since a report that is already being worked on is not picked up twice.

4. **Deploy to production.** Merge to `main` (or promote a deployment). Vercel
   reads `vercel.json` on each production deploy and registers the job.

5. **Verify it is registered.** Vercel dashboard, your project, Settings, Cron
   Jobs. The path and schedule should be listed, with a Run button.

6. **Run it once by hand.** Click Run next to the job. Then open Logs for the
   project and look for a line like
   `Job-search report sweep: enqueued 0, skipped 0, processed nothing`.
   A `401` means `CRON_SECRET` is missing or differs between what Vercel sends
   and what the route reads; a `500` with "Sweep not configured" means
   `CRON_SECRET` is not set for Production.

7. **Test with a real report.** Complete an interview in a job-search study,
   then check the study page. It should show a draft within a few minutes. If you
   want to prove the schedule specifically, temporarily unset `APP_BASE_URL`
   (so the completion trigger does nothing), complete an interview, and confirm
   the report appears after the next scheduled run. Restore `APP_BASE_URL`
   afterwards.

## Manual run without Vercel

From a terminal with `.env.local` filled in:

```
npm run process:job-search-reports
```

This runs sweeps back to back until nothing is left to do (`--once` for a single
pass). It works against whichever database `SUPABASE_URL` points to, and needs
`ANTHROPIC_API_KEY`.

Or call the deployed route yourself:

```
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://yourapp.com/api/internal/job-search-reports/sweep
```

## What the schedule does not do

- It does not retry **failed** reports. A reviewer re-runs those from the review
  page ("Re-run from scratch").
- It does not release anything. A draft always waits for a reviewer.
