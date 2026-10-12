# Scheduling the job-search report sweep

The sweep turns completed job-search interviews into draft reports. Normally the
interview-completion webhook starts it immediately. A schedule is the safety net
for the cases where that trigger is dropped, or a report is left stuck in
"generating". It is optional for a small pilot: "Process now" on the study page
does the same thing by hand.

There are two ways to run the schedule. **Option A: Vercel Cron** (below) is the
simplest, but the free Hobby plan only allows once a day. **Option B: GitHub
Actions** is free and can run every 5 to 15 minutes. Use one or the other, not
both.

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
functions below that, the sweep is cut off mid-report and the report stays
"generating". The worker treats a report that has not been touched for 10
minutes as abandoned, and **whichever sweep runs next** picks it up: the
schedule, "Process now", or the sweep that starts when another interview
completes. So with a daily schedule a cut-off report can wait up to a day, and
"Process now" is the quicker backstop. Check your limits in the Vercel dashboard
under Settings, Functions, and in Vercel's current Cron Jobs and Functions
documentation, since plan limits change.

Cron jobs run **only on the production deployment**, never on preview
deployments. On preview, rely on the completion trigger and "Process now".

## Option A: Vercel Cron

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

## Option B: GitHub Actions (free, more frequent)

Use this when you want the sweep to run more often than once a day without
paying for Vercel Pro. A scheduled GitHub workflow calls the same sweep URL.
Skip `vercel.json` if you use this, so the sweep is not scheduled twice.

1. **Set `CRON_SECRET`** in Vercel, as in Option A step 1, for Production.

2. **Add two repository secrets.** In GitHub: the repository, Settings, Secrets
   and variables, Actions, New repository secret.

   - `SWEEP_URL`: your production sweep address, for example
     `https://yourapp.com/api/internal/job-search-reports/sweep`
   - `CRON_SECRET`: the same value you set in Vercel

3. **Add the workflow** as `.github/workflows/job-search-sweep.yml`:

   ```yaml
   name: Job-search report sweep

   on:
     schedule:
       - cron: "*/15 * * * *"
     workflow_dispatch:

   jobs:
     sweep:
       runs-on: ubuntu-latest
       timeout-minutes: 7
       steps:
         - name: Call the sweep
           env:
             SWEEP_URL: ${{ secrets.SWEEP_URL }}
             CRON_SECRET: ${{ secrets.CRON_SECRET }}
           run: |
             curl --fail-with-body --silent --show-error --max-time 330 -X POST \
               -H "Authorization: Bearer $CRON_SECRET" "$SWEEP_URL"
   ```

   The schedule is standard cron syntax in UTC: `*/15 * * * *` is every 15
   minutes, and GitHub does not run schedules more often than every 5 minutes.
   `--max-time 330` lets one call wait for a full report (a few minutes) before
   giving up. When nothing is waiting the call returns in about a second, so it
   uses almost no Actions minutes.

4. **Merge it to `main`.** GitHub only runs scheduled workflows from the
   repository's default branch, so a workflow that exists only on `preview`
   never fires on its schedule.

5. **Run it once by hand.** In GitHub: Actions, "Job-search report sweep", Run
   workflow. A green run with output like
   `{"enqueued":0,"skipped":0,"processed":null}` means it works. A `401` means
   `CRON_SECRET` differs between GitHub and Vercel; a `500` with "Sweep not
   configured" means `CRON_SECRET` is not set for Production in Vercel.

Things to know:

- GitHub can delay scheduled runs by several minutes when it is busy, and it
  pauses scheduled workflows in a repository with no activity for 60 days. Open
  the Actions tab and re-enable the workflow if that happens.
- A failed run is emailed to whoever last edited the workflow, which doubles as
  an alert that the sweep is failing.
- The sweep still handles one report per call, so with a 15-minute schedule a
  backlog of several reports clears over several runs. "Process now" on the study
  page clears it immediately.

## Manual run without a schedule

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
- It releases a report only when it is **clean**: no rule violations in the text and
  no low-confidence ratings. A clean report is emailed to the participant straight
  away, with no reviewer. Anything else stays a draft for a reviewer. Set
  `AUTO_RELEASE_REPORTS=false` in Vercel to turn automatic release off so every
  report waits for review.
