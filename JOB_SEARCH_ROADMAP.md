# Job Search Study: Roadmap

Tracks the work to run the "How Job Seekers Get Interviews" study: a 15-minute AI-run interview, followed by a personalized report card that shows where a job seeker stands on generating interviews and what to try next.

Last updated: 2026-10-05. Status key: `[x]` done, `[ ]` to do, `[~]` in progress or partly done.

## Documents

| File                                                                 | What it is                                                                       | Status                                      |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------- |
| [JOB_SEARCH_SCORING_MODEL.md](JOB_SEARCH_SCORING_MODEL.md)           | 4 dimensions, 13 behaviors, rubrics, evidence rules, bands, 10-question screener | v0.1 draft, weights and cutoffs provisional |
| [JOB_SEARCH_INTERVIEWER_PROMPT.md](JOB_SEARCH_INTERVIEWER_PROMPT.md) | Custom interviewer prompt plus team notes                                        | v0.2 draft, untested                        |
| Sample report (outside the repo)                                     | Target format for the participant report                                         | Reference                                   |

## Decisions made

| Decision                    | Choice                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Report architecture         | Separate **post-interview pipeline** (transcript, evidence ledger, code-computed scores, narrative). The interviewer does not generate the report                                                                                                                                                                                                                                                                           |
| Where it lives              | Same repo, separate module, run as a background job                                                                                                                                                                                                                                                                                                                                                                         |
| Report output               | Templated: tables and scores rendered from data, LLM writes narrative and picks experiments                                                                                                                                                                                                                                                                                                                                 |
| Review before release       | Researcher reviews, edits narrative, regenerates, approves. Scores stay code-computed                                                                                                                                                                                                                                                                                                                                       |
| Participant access          | Unguessable tokenized link on a hosted web page, emailed on release                                                                                                                                                                                                                                                                                                                                                         |
| Benchmarking in v1          | Bands only (Strong / Developing / Opportunity). No percentiles. Store every evidence ledger so cohort distributions can be added later                                                                                                                                                                                                                                                                                      |
| Extraction method           | **Behavior-level.** The LLM picks the 0-4 anchor for each behavior directly, and records the sub-signals it saw as evidence notes (with strength and quotes), not as scored codes. Code then applies the evidence caps and everything after. A sub-signal-level hybrid (LLM codes sub-signals, code maps them to a second score and compares) was considered and set aside as too complex for v1; it can be revisited in M6 |
| Study type                  | Reuse existing study types plus configuration (custom prompt, screener, rubric config), not a new study type                                                                                                                                                                                                                                                                                                                |
| Dimensions                  | 9 collapsed into 4 (Focus, Pitch, Reach, Learn), 13 behaviors                                                                                                                                                                                                                                                                                                                                                               |
| AI use                      | Folded into Pitch (P3 and P4). Not scored for amount                                                                                                                                                                                                                                                                                                                                                                        |
| Search Intentionality Index | Dropped                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Screener                    | 12 questions. Energy, pressure and application pace are not collected anywhere (dropped after simulation showed the extra-time questions were rarely reached)                                                                                                                                                                                                                                                               |

## Open decisions

- [ ] **Eligibility:** which `search_status` answers qualify for the interview (casual browsers, not currently searching), or whether the interviewer adapts for them.
- [ ] **Elapsed time:** add `elapsedMinutes` to the interviewer's prompt context, or keep the question-count pacing.
- [ ] **Calibration:** weights, band cutoffs (70 and 45), and evidence caps are guesses. Calibrate against real transcripts.
- [ ] **Models:** which model for extraction versus narrative (cost, consistency, latency).
- [ ] **Consent and intro copy:** update to say participants will get a report by email after review, and how their transcript is used.
- [ ] **Retention and privacy:** how long transcripts and reports are kept, who can see them, what the model provider retains.
- [ ] **Delivery timing:** target turnaround after the interview (hours or days) while review is manual.

## Milestones

### M0. Foundations (done)

- [x] Review the codebase: interviewer agent, summary and study-report services, screener format, termination rules.
- [x] Choose the architecture (see decisions above).
- [x] Simplify the scoring model to 4 dimensions and 12 behaviors, with rubrics.
- [x] Define the pre-interview screener (10 questions, ids, options).
- [x] Draft the interviewer prompt.

### M1. Validate the interview

Goal: confirm the interview gets enough evidence in about 15 minutes before building anything downstream.

- [~] Create the study: custom prompt, screener, study description (noun phrase), consent and intro copy. _Test study created and read back (see round 3). Consent and intro copy are not written._
- [x] Confirm the screener supports everything needed: multi-select, "Other," stable ids, answers passed to the prompt. _Confirmed in code and by simulation. The dashboard wizard assigns random UUIDs, so the study must be created by script. Screener answers reach the interviewer keyed by id (see findings)._
- [x] Build a simulation harness: an AI participant plays a persona against the interviewer and saves transcripts. _`npm run simulate:job-search`._
- [x] Personas: selective networker, high-volume auto-apply user, no interviews yet, passive employed searcher, AI non-user, terse participant. _First run of all six done._
- [x] Measure per run: the six priority items covered, duration near 15 minutes, no screener question re-asked, no scoring aloud or advice, report priority question reached before the close. _Deterministic checks plus an LLM coverage judge._
- [ ] Tune the prompt and the question budget. _Findings from the first round are below; no prompt changes made yet._
- [ ] Run 3 to 5 real pilot interviews (internal or friendly participants). Review transcripts by hand.

**First simulation round (2026-10-05, six personas):**

- Held up: every interview ended with a statement, asked the report-priority question before closing, had no coaching or scoring language, never re-asked a screener question, and stayed within 15 minutes. The interviewer used the screener answers (keyed by question id) correctly.
- 26 of 36 priority items covered, 10 partial, none missing. Partials were mostly "is that application typical and how long did it take" and "where time goes."
- Problem: four of six interviews ended at 7 to 11 minutes with items still partial. The model ended on its own judgment with budget left.
- Problem: 3 to 12 evaluative acknowledgments per interview ("that makes sense", "that's a clear reason to...", "that's understandable"), despite the prompt asking for neutral ones.
- Not exercised: the 12-minute time check ran in only one interview, so the decline path and extension path are untested. Simulated participants are also more concise than real ones.
- Proposed prompt changes: ask any missing priority item before the report-priority question; ask "is that typical, and how long did it take" right after the walkthrough; list banned acknowledgment phrases with neutral examples.

**Second simulation round (prompt v0.3, seven personas including a talkative one):**

- The three prompt changes were applied. Evaluative acknowledgments dropped from about 10 per interview to about 3. "Typical and time" is now covered in every run. Priority items covered rose from 26 of 36 to 34 of 42.
- The time check ran in two interviews. The extension path works. The decline path also works mechanically (Riley closes immediately), but a participant who declines at the 12-minute check never reaches the report-priority question and may miss sources and "what was different." A talkative participant used about 12 minutes on 8 interviewer turns.
- The report-priority check had a false negative when the interviewer paraphrased the question; fixed in the check.
- Open: ask the report-priority question earlier (for example right after the walkthrough) so a time-pressed participant still answers it; and make sure sources and effort come before relationships and learning. The question-count budget (12 to 15) also behaves like a cap with terse participants and should be reworded as guidance.

**Third simulation round (prompt v0.4: report priority asked early, sources and effort before application details, question count as a guide):**

- 37 of 42 priority items covered, 5 partial, none missing (rounds 1 and 2: 72% and 81% covered; now 88%). Evaluative acknowledgments averaged 3.7 per interview. No coaching language, no re-asked screener questions, and every interview closed with a statement.
- The report-priority question was asked and answered in all seven interviews, at about the tenth turn in six of them (turn 14 for the terse persona), including the talkative persona who declined at the 12-minute check.
- Remaining partials: the "role they passed on" item (3 interviews), and sources for the talkative persona who left at the time check.
- Study created in the shared database for testing: `[TEST] How Job Seekers Get Interviews`, id `b14fa8b3-197d-4240-91e0-571cba52489e`. A second test study was created with ElevenLabs as the voice provider (the provider is fixed at creation): `[TEST] How Job Seekers Get Interviews (ElevenLabs)`, id `7347716e-ef18-419f-8416-d5f40887636d`. Delete both from the dashboard when testing is done. Because preview and production share one database, the link works for anyone who has it, so share it only with pilot participants.

**First real pilot interview (ElevenLabs, prompt v0.4, 2026-10-06):**

- 19.9 minutes. The 12-minute check fired at 12:05, the participant agreed to continue, and the interview closed 7.5 minutes later. The report-priority question was asked at turn 12 and answered. No coaching language, no re-asked screener questions.
- Signals: strong on target, AI use (including uses beyond writing), channels, effort shifts, what was different, and the report priority. Partial on match rate, sources and effort split, go/no-go, positioning evidence, relationships, tracking, and feedback.
- Gaps traced to interviewer behavior: a screener conflict was never resolved (31 to 50 applications versus "not very active"); numeric answers accepted without numbers; positioning and AI questions asked about the referral role instead of the typical application; optional extra-time questions skipped even though the participant agreed to continue.
- Prompt updated to v0.5 to address these (see the notes in the prompt file). The two test studies still hold the v0.4 text; a study's custom prompt can only be changed with a script.
- The transcript and a draft hand coding are saved in `private-fixtures/job-search/` (git-ignored; real participant content). The hand coding is a draft and needs researcher review before it is used as ground truth.

**Fourth simulation round (prompt v0.5, eight personas):**

- 41 of 48 priority items covered, 7 partial, none missing. Report priority asked and answered in every interview (turn 10 to 14). No coaching language, no re-asked screener questions, about 4 evaluative acknowledgments per interview.
- The new rules work: Riley asks for a rough number when an answer has none, asks whether the section 4 opportunity is included in the counts, ties positioning and AI questions to the section 3 application, asks about tracking, and (tested with a persona who states the conflict) asks a neutral question when an answer conflicts with the screener.
- Not working as intended: the "required" extra-time questions (energy, pressure, pace). After a participant agrees to continue, the remaining required items use up the extra time, so these are usually not reached; two of the five extended simulations got none of them, and the real interview got none either. Interview length also grows to 17 to 23 minutes when a participant extends. Decision: dropped. The questions were removed from the prompt, and the report's context section is built only from what is collected.

**Exit:** most priority items covered in most pilot transcripts, within the time cap.

### M2. Rubric config and evidence extraction

Goal: turn a transcript into a structured evidence ledger, checked by hand against pilot transcripts.

Code lives in `src/job-search-study/` (rubric, ledger, extraction). Run it with `npm run extract:job-search -- --input=<fixture.json> --runs=3`.

- [x] Define the rubric config schema (versioned): dimensions, behaviors, weights, tiers, anchors, sub-signals (as a checklist of what to look for), N/A rules, band cutoffs. _`rubric/rubric.json` and `rubric/rubric.ts`, validated on load._
- [x] Turn the scoring model into the rubric config file, with validation. _A test checks that weights, tiers and all anchors match `JOB_SEARCH_SCORING_MODEL.md`; it already caught one wording difference._
- [x] Define the evidence ledger schema: per behavior, evidence strength, **LLM-picked anchor score (0-4)**, the sub-signals observed (free-text notes with quotes), confidence notes, trajectory notes. Also the numeric facts the report tables need (match percentage, source counts, effort split). _`ledger/types.ts`. The model's output uses a null-free wire format (`ledger/schema.ts`, `ledger/wire.ts`) because the API limits nullable fields._
- [x] Define the comparison schema: typical versus successful application fields, source counts, effort split, report priority, context. _Part of the ledger._
- [x] Write the extraction prompt (uses transcript plus screener answers) and wire it to the model. _`extraction/prompt.ts` is generated from the rubric. Uses a forced tool call, because strict structured outputs rejected the schema as too large._
- [x] Verify quotes: every quote in the ledger must appear in the transcript. _`ledger/quotes.ts`; tolerates filler, stutters, word fragments and run-together words. Unverifiable quotes are dropped, and a rated behavior left with none fails validation and triggers a retry._
- [~] Run extraction on pilot transcripts, then compare with a researcher's hand coding. _Run on the real interview; a researcher has not yet coded scores, so there is nothing to compare against beyond the draft evidence strengths._
- [~] Use `private-fixtures/job-search/real-interview-001.json` as the first extraction test case. A researcher must review and correct `real-interview-001.handcoding.md` (a draft by Claude) before it counts as ground truth. Also test that quote verification tolerates speech-to-text filler and errors. _Extraction runs on it; quote verification handles the transcript's artifacts. Researcher review still pending._
- [x] Test consistency: run each transcript two or three times, flag behaviors that disagree. _`ledger/aggregate.ts` (lower median, spread, status disagreement, fact differences)._
- [~] Measure how often repeated runs differ by 1 point and by 2 or more points per behavior. Review the large gaps to decide whether the anchors or the extraction prompt need fixing. _On the real interview, five runs in two sessions: no behavior differed by 2 or more within a session, 1-point differences appeared in 4 to 5 behaviors, and a few scores moved by 1 between sessions. Needs more interviews._
- [ ] Run extraction on the simulated transcripts and compare with the interviewer's coverage judgments.
- [ ] Decide extraction model and sampling settings; measure cost and time per interview (about 55 seconds per run so far).

**First extraction results (real interview, 2026-10-06):**

- Works end to end: three runs of about 55 seconds each, all valid on the first attempt. It also found both screener conflicts without being told (application volume, and auto-apply listed in the screener but dropped in the interview), the report priority at the right turn, source counts, and qualitative effort split.
- Run-to-run agreement is good (largest spread 1 point) but there is 1-point drift between sessions on some behaviors (P4, L3, F2).
- Rubric issue found: caps by evidence basis misfired for F1, because a participant's own statement of their target is the evidence, not an example. The meaning of "concrete" evidence now includes a direct first-hand statement of the thing itself (rubric and scoring model updated); evaluative self-claims still do not count.
- Possible over-scoring to watch: F3 ("Decides before applying") was scored 3 in every run on the strength of a general criterion (passes on industries without experience) plus reasoning for one role; the anchor asks for a concrete example of passing. Needs a researcher's view.
- Quote problems found and handled: word fragments ("s-") and words run together by speech-to-text ("forfinancial"). Remaining dropped quotes are the model reordering or rewording what the participant said, which the verifier correctly rejects.

**Scoring built and reviewed on the real interview (2026-10-06):**

- The scoring module (`scoring/score.ts`: evidence caps, rated rules, renormalization, bands, strength and improvement picks) and a review renderer (`review/render-review.ts`) are built and tested. `npm run rescore:job-search` re-scores a saved extraction without calling the model.
- Reviewer feedback on the real interview: agreed with the score for every behavior except F2; Pitch is Opportunity (confirmed). So P1 = 1, F3 = 3, P3 = 1, P2 = 1, P4 = 3 stand for this interview.
- F2 decision: a qualitative answer ("most of them") is accepted as evidence, so F2 is not capped for estimates or general descriptions (a bare self-rating still caps at 2). Implemented as a per-behavior cap override in the rubric (`evidenceCapOverrides`), so the global caps still apply to every other behavior. Rubric bumped to 0.2.0. Result for the interview: Focus 92.5 (Strong), Pitch 35 (Opportunity), Reach 62.5 (Developing), Learn 75 (Strong).
- Extractor fixes made along the way: it no longer infers gender (uses "the participant"), no longer copies screener answers into volunteered context, and bracketed clarifications in quotes are accepted.

**Exit:** hand coding and extraction agree closely enough on the pilot set, and disagreements are understood.

### M3. Scoring and report generation

Goal: ledger in, finished draft report out.

Code lives in `src/job-search-study/report/` and `scoring/`. Generate a report from a saved extraction with `npm run report:job-search -- --aggregate=<file.aggregate.json> --input=<fixture.json>`.

- [x] Scoring module in code: evidence caps, low-confidence flag when repeated runs differ by 2 or more points, Insufficient versus N/A versus zero, renormalization, "rated" rules, bands, strengths and improvements. Unit tests for each rule, using golden ledgers. _`scoring/score.ts`; the low-confidence flag comes from `ledger/aggregate.ts`. Also flags a dimension whose score is within 5 points of a band cutoff._
- [x] Surface low-confidence behaviors in the review page, with the quotes and the run-by-run scores next to each. _The review document (`review/render-review.ts`) shows run-by-run scores, quotes, and low-confidence and near-cutoff flags. The researcher review page itself is M4._
- [x] Analysis step: typical versus successful table, channel table (effort versus interviews), mismatch flags. _`report/analysis.ts`. Mismatch flags only when effort was given as percentages._
- [~] Experiment library, mapped to behaviors (and to the participant's report priority). _`report/experiments.json` holds a drafted library (one per behavior, 12 in all); selection in `report/experiments.ts` is deterministic and unit tested. The library content is a first draft and needs a researcher's review._
- [x] Narrative stage: LLM writes the summary and per-dimension text from the ledger and scores, with a rule against inventing numbers or facts. _`report/narrative.ts`. The writer sees only a data pack with bands and labels (no numeric scores) and one retry feeds back rule violations._
- [x] Report template: renders tables and bands from data. Matches the sample report's structure with 4 dimensions. _`report/render-html.ts` produces one self-contained HTML page (light and dark mode, print styles, no scripts, no indexing)._
- [~] Groundedness check on the narrative (claims traceable to the ledger). _Deterministic checks are done: no number that is not in the data, no scores or percentiles, no gendered pronouns or "the participant", no "you should", and length limits, applied to the prose and to table and context text built by code. A check that each claim is supported by the ledger (for example by a second model reading the report) is not built._
- [x] Context section built only from collected data, omitted fields are left out, not guessed. _Screener answers (marked self-reported) plus anything volunteered in the interview; items that merely restate a screener answer are dropped._

**First report generated (real interview, 2026-10-06):** Focus Strong, Pitch Opportunity, Reach Developing, Learn Developing (near a band cutoff). The narrative needed no retries and no rule violations. Experiments picked: ask for advice first (Reach, matches the stated priority), lead with two reasons (Pitch), run one two-week experiment (Learn).

**Stability findings (20 saved extraction runs on the one real interview):**

- The model does not accept a temperature setting, so variance cannot be tuned that way.
- Stable: P1, P2, R1, R2, L1 (the same score in 19 or 20 of 20 runs). Moderately stable: F1, F2, F3, L2. Noisy: P4 and L3 (about 60/40 between 2 and 3), and P3 (1, 2, or no evidence).
- The most common score matches the score the reviewer accepted for 11 of 12 behaviors; P3 was the exception, which led to a rubric clarification (credit only review the participant described; rubric 0.2.1).
- One-point differences can move a band when a dimension sits near a cutoff (Learn flipped between Strong and Developing). The near-cutoff flag exists so a reviewer sees this. More runs help only a little.

**Reviewer feedback on the first report page (2026-10-06):**

- Tone is appropriate.
- The "typical application versus one that worked" section is weak on its own: it compares a participant with themselves, and a useful version needs a baseline built from many interviews. Open: replace it in the participant report (see open decisions) and keep the underlying data for the cohort baseline.
- The "What to measure" funnel resonates. The next question to answer is how candidates source job openings and find them in a timely way for their target industry, title, experience, location, and compensation level. This is a new area for the interview, the screener, the rubric, and the report (see open decisions).

**Open decisions from this feedback:**

- [x] What replaces the comparison section for participants. _Decision (2026-10-06): "Your starting line" (the participant's own baseline numbers to re-measure in a month, built by code from the screener and interview, no rates computed from coarse ranges) plus "One pattern worth testing" (one hypothesis from the opportunity that led somewhere, written by the model, which may point to which part of their background drew the conversation). The typical-versus-successful table is no longer shown to participants; it stays in the ledger, in the researcher's review, and in the saved report data for the cohort baseline. Built and generating on the real interview._
- [x] Which comparison and funnel metrics to start storing now so a cohort baseline exists later. _The ledger already stores them per interview: typical and successful application fields (including, new, how old the posting was when they applied), source counts, effort split, applications and conversations buckets, and report priority._
- [x] Where sourcing and timeliness fit in the rubric. _Decision (2026-10-06): merge "Stays on target" and "Decides before applying" into one behavior, F2 "Chooses roles on purpose" (job seekers could not tell them apart), and add F3 "Finds the right openings early" as the third Focus behavior. Focus weights: F1 25, F2 45 (must-have), F3 30. Rubric 0.3.0; saved extractions made under 0.2.1 are refused by the scripts until re-run._
- [x] How to collect sourcing and timeliness within 15 minutes. _Decision (2026-10-06): no new screener question (participants cannot reliably say how soon after posting they usually apply). Instead, the screener's `channels_used` question is split into general job boards, niche or industry sources, company career pages, and "job alerts or saved searches" (the screener stays at 10 questions), and the interview's walkthrough asks how they found the role and how old the posting was. Interviewer prompt v0.7, rubric 0.3.1. In simulation the probe is asked reliably after tightening the wording so a missing posting age is asked even when "how they found it" was answered. Before this, F3 was scored from passing remarks (F3 = 1 on the real interview, which moved Focus from Strong to Developing); that extraction predates this change and must be re-run._

**Report changes after feedback (2026-10-06):** the comparison section was replaced by "Your starting line" and "One pattern worth testing". The pattern section was then **removed** after review because it did not give meaningful advice. The starting line stays, and the typical-versus-successful data is still kept in the ledger and the researcher review for the cohort baseline. Page order is now: profile, what we heard, starting line, where interviews come from, findings by area, context, experiments, what to measure, bottom line. Technical note from building the pattern: keep the writer's tool output flat at the top level, because a nested object made the model write XML-like markup into one string field.

**Exit:** a draft report from a pilot transcript that a researcher would be comfortable sending after light edits. _First draft produced; needs the researcher's read._

### M4. Storage, trigger, review, and release (built; awaiting a live run)

Goal: runs automatically and ships safely.

- [x] Database migration `0021_add_job_search_reports.sql`: `studies.report_pipeline` plus table `job_search_reports` (extraction runs, aggregate, scoring, pack, comparison, generated and edited report, violations, status, rubric version, access token, release and email timestamps). Applied.
- [x] Trigger: a worker "sweep" finds completed interviews in studies with `reportPipeline: "job-search"`, queues one report each (idempotent), skips too-short interviews (under 6 participant turns) with the reason, claims one report at a time, and recovers abandoned ones after 10 minutes. No webhook changes.
- [x] Statuses: pending, generating, draft, released, withdrawn, failed, skipped. Extraction runs are saved as they finish, so a retry only pays for missing ones.
- [x] Review page in the dashboard (study page lists reports; each has a review page): preview of exactly what the participant sees, rule violations, evidence and quotes behind each rating with per-run votes and flags, researcher-only typical-versus-successful comparison, wording edits, experiment picker (up to 3), regenerate text, re-run from scratch.
- [x] Release: private link `/report/<token>` (32 random bytes), emailed to the participant; blocked while rule violations remain unless the reviewer acknowledges them; an email failure leaves the report released and can be resent.
- [x] Hosted page: self-contained HTML, `noindex`, `Cache-Control: private, no-store`, 404 unless released.
- [x] Withdraw: the token is cleared and the link stops working; a withdrawn report can be released again with a new link.
- [x] Failure handling: failed reports show the reason on the study page and can be re-run. Alerts are not built (the study page is the monitor).
- [x] Entry points: cron route `/api/internal/job-search-reports/sweep` (bearer `CRON_SECRET`), "Process now" button on the study page, `npm run process:job-search-reports`.

**Exit:** an interview completed end to end becomes a released report with no manual database work. To verify: apply the migration, create a study with the current prompt and screener, complete a real interview, run the sweep, review, release to yourself.

Decided 2026-10-06: the generic summary email is skipped for report-pipeline studies; the worker starts as soon as an interview completes (the voice webhooks call the sweep route, which needs `CRON_SECRET` and `APP_BASE_URL` set; the scheduled sweep and "Process now" are the backstop); reports are kept indefinitely for now.

Test study created: "[TEST] How Job Seekers Get Interviews" (ElevenLabs, prompt v0.7, 10-question screener (before search_support and career_pivot), id 2cd85660-f8fa-47fb-b7ce-325c7945547d). Migration 0021 is applied.

Still open: who calls the sweep on a schedule (no `vercel.json`; a sweep needs up to 300 seconds, check the plan limit).

### M5. Cohort launch

- [ ] Finalize recruitment, eligibility, and consent text.
- [ ] Privacy and retention policy decided and applied.
- [ ] Launch with a small first cohort (about 20 to 50) with researcher review on every report.
- [ ] Collect participant reactions to the report (clear, useful, anything wrong).
- [ ] Track: interview completion rate, coverage, extraction disagreements, review edit rate.

### M6. Calibrate and extend

- [ ] Recalibrate weights, cutoffs, and evidence caps from the cohort.
- [ ] Revisit the rubric anchors where reviewers disagreed with the pipeline.
- [ ] Compare bands against interview-generation outcomes (within-person patterns first).
- [ ] Peer benchmarks beyond bands once the cohort is large enough.
- [ ] Optional: live coverage tracker in the interviewer (option D).
- [ ] Optional: 30-day follow-up on the report's experiments and a second benchmark.
- [ ] Less manual review as pipeline quality is proven.

## Pipeline: what is code and what is an LLM

| Stage                         | Type                     | Notes                                                                                                                                                                                                                                                                                            |
| ----------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Trigger and input assembly | Code                     | Completion trigger, idempotency, status states, redaction, screener answers by id, short-interview checks, version stamps                                                                                                                                                                        |
| 2. Evidence extraction        | **LLM**, checked by code | LLM picks a 0-4 anchor per behavior and records the evidence (quotes, observed sub-signals, numeric facts). Code validates the schema, verifies every quote appears in the transcript, checks must-have behaviors are present, reconciles counts with the screener, and aggregates repeated runs |
| 3. Scoring                    | Code                     | Applies evidence caps, N/A and Insufficient rules, renormalization, rated rules, bands, strengths and improvements, and flags behaviors where repeated runs disagree                                                                                                                             |
| 4. Analysis                   | Code                     | Typical-versus-successful diff, effort share versus interviews by channel, mismatch flags, funnel metrics, conditional context section                                                                                                                                                           |
| 5. Experiment selection       | Code                     | Rule-based pick of 2 to 3 library entries from the lowest behaviors, mismatch flags, and the participant's report priority. The library is human-written                                                                                                                                         |
| 6. Narrative                  | **LLM**, guarded by code | Writes "what we heard" and per-dimension text from the ledger. Code checks that every number appears in the data and blocks scores and percentiles                                                                                                                                               |
| 7. Rendering, review, release | Code                     | Template, pre-written text per behavior and label, tokens, email, revocation                                                                                                                                                                                                                     |

The extractor's anchor choice is the one scoring judgment made by an LLM. Everything after it is code, so the scoring is reproducible and testable from a saved ledger.

## Suggested order of work

1. M1 (validate the interview), since everything downstream depends on the transcripts it produces. The simulation harness also gives test input for M2.
2. M2 and M3 can start on simulated and pilot transcripts while M1 tuning continues.
3. M4 once the report content is stable enough to store.
4. M5 after a researcher is comfortable with draft quality.

## Risks to watch

| Risk                                                   | Mitigation                                                                                                                                                                                |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15 minutes is too short to cover the 13 behaviors      | Evidence tiers, "not enough evidence" bands, screener offload, question budget tuned in M1                                                                                                |
| Scores come out inconsistent between runs              | Code-computed scores, repeated extraction, quote verification, researcher review                                                                                                          |
| The LLM's anchor choice is a single unchecked judgment | Quote verification, repeated runs with a disagreement flag, evidence caps in code, researcher review of flagged behaviors. Revisit a sub-signal-level check in M6 if disagreement is high |
| LLM invents facts or numbers in the report             | Templated tables, narrative limited to ledger content, groundedness check                                                                                                                 |
| Participants over-read the bands                       | Wording that frames bands as behaviors, not worth; show strengths and improvements first                                                                                                  |
| Small cohort makes bands unstable                      | Bands only, clear caveats, recalibrate in M6                                                                                                                                              |
| Sensitive data (employment, finances)                  | Retention policy, restricted access, tokenized links, provider data terms                                                                                                                 |

## Change log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-05 | Roadmap created. Scoring model v0.1 and interviewer prompt v0.2 drafted.                                                                                                                                                                                                                                                                                                     |
| 2026-10-05 | Added the hybrid extraction decision (sub-signal codes plus anchor, compared), the code-versus-LLM breakdown, related M2 and M3 tasks, and risks.                                                                                                                                                                                                                            |
| 2026-10-05 | Switched to behavior-level extraction (LLM picks the 0-4 anchor directly); hybrid dropped as too complex for v1 and noted as a possible M6 revisit. Updated the decision, M2 and M3 tasks, pipeline table, and risks.                                                                                                                                                        |
| 2026-10-06 | M4 built: storage, worker sweep, review actions, release and withdraw, dashboard review page, public report page. Migration 0021 pending.                                                                                                                                                                                                                                    |
| 2026-10-08 | Added R3 "Makes you easy to find" to Reach (profile and visibility so recruiters can find the participant). Reach weights are now R1 30, R2 45, R3 25. Rubric 0.4.0; one new interview question in section 7, one new experiment. Existing extractions predate R3 and need re-running.                                                                                       |
| 2026-10-08 | Added two screener questions, `search_support` (no support, paid coach, outplacement, free program) and `career_pivot`, for research segmentation by interview rate. Provider names given in the interview are recorded as `supportProviders` in the ledger. Neither is scored or shown in the participant report. Existing studies need their questions and prompt updated. |
