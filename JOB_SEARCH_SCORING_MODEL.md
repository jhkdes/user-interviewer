# Job Search Scoring Model (v0.1, draft)

Replaces the earlier 9-dimension / 46-component model with **4 dimensions and 13 behaviors**, sized for a 15-minute interview and for a participant who has to read and act on the result.

Everything marked **provisional** (weights, band cutoffs, evidence caps) should be recalibrated once real transcripts exist.

---

## 1. Purpose and principles

- The first job of the report is to help a job seeker see **what they are doing right and what to improve**. Benchmarking against other participants comes second and is shown as bands only in v1.
- The model scores **observable behaviors**, not the participant's value as a candidate.
- Score **typical, current behavior**. Behavior on the opportunity that produced an interview is captured separately (section 8) and used for comparison, not for the behavior score.
- Prefer concrete examples over self-ratings. Never infer absence from lack of mention.
- Candidate-role fit, context, and market conditions are **not** scored (section 9).
- Do not reward or penalize the amount of AI use or the volume of applications. Score whether judgment is retained and effort is chosen.

---

## 2. Structure

| Dimension | Question the job seeker is answering                  | Behaviors                                                                                                            |
| --------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Focus** | Am I finding and going after the right jobs?          | F1 Has a defined target, F2 Chooses roles on purpose, F3 Finds the right openings early                              |
| **Pitch** | Do my applications make the case for interviewing me? | P1 Makes the case for you, P2 Matches effort to the opportunity, P3 Reviews what goes out, P4 Uses AI where it helps |
| **Reach** | Am I getting in front of people, not just job boards? | R1 Uses more than cold applications, R2 Builds and uses relationships, R3 Makes you easy to find                     |
| **Learn** | Am I adjusting based on what is working?              | L1 Reads the results, L2 Shifts effort to what works, L3 Experiments and uses feedback                               |

The funnel the report uses ("qualified opportunities, applications and outreach, human responses, interviews") maps onto Focus, Pitch, Reach, and Learn.

### Weights within each dimension (provisional)

| Dimension | Behavior                             | Weight | Evidence tier               |
| --------- | ------------------------------------ | -----: | --------------------------- |
| Focus     | F1 Has a defined target              |    25% | Standard                    |
| Focus     | F2 Chooses roles on purpose          |    45% | **Must-have**               |
| Focus     | F3 Finds the right openings early    |    30% | Standard                    |
| Pitch     | P1 Makes the case for you            |    40% | **Must-have**               |
| Pitch     | P2 Matches effort to the opportunity |    20% | Standard                    |
| Pitch     | P3 Reviews what goes out             |    20% | Standard                    |
| Pitch     | P4 Uses AI where it helps            |    20% | Standard (N/A if no AI use) |
| Reach     | R1 Uses more than cold applications  |    30% | **Must-have**               |
| Reach     | R2 Builds and uses relationships     |    45% | Standard                    |
| Reach     | R3 Makes you easy to find            |    25% | Standard                    |
| Learn     | L1 Reads the results                 |    30% | **Must-have**               |
| Learn     | L2 Shifts effort to what works       |    40% | Standard                    |
| Learn     | L3 Experiments and uses feedback     |    30% | Opportunistic               |

**Evidence tiers** drive the interviewer's time use:

- **Must-have:** probe until there is concrete evidence.
- **Standard:** one question plus at most one probe.
- **Opportunistic:** score only if it surfaces naturally.

---

## 3. Evidence and scoring method

### 3.1 Evidence strength (coded per behavior, plus per sub-signal when useful)

| Strength | Meaning                                                                                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strong   | A concrete recent example, specific numbers, or the participant's direct first-hand statement of the thing itself (for example, the target they describe) |
| Partial  | An estimated pattern, or a general description of usual behavior                                                                                          |
| None     | Not discussed (**not** the same as "does not do this")                                                                                                    |
| N/A      | The behavior does not apply to this participant                                                                                                           |

Evidence hierarchy, strongest first: concrete recent behavior, a specific example, an estimated pattern, a general description, a self-rating.

### 3.2 Behavior score (0-4)

Assign the 0-4 score using the anchors in section 4. The listed sub-signals are the evidence the extractor must look for. They are recorded individually but do not need to be averaged.

Generic meaning of the scale, for cases an anchor does not cover:

| Score | Meaning                                               |
| ----: | ----------------------------------------------------- |
|     0 | Behavior absent, or evidence of the opposite behavior |
|     1 | Rare or weak evidence                                 |
|     2 | Inconsistent or moderate evidence                     |
|     3 | Usually demonstrated                                  |
|     4 | Systematic and specific                               |

**Evidence caps (provisional):**

| Best evidence available                                                                         | Maximum score |
| ----------------------------------------------------------------------------------------------- | ------------: |
| Self-rating or vague general claim                                                              |             2 |
| Estimated pattern or general description of usual behavior                                      |             3 |
| Concrete recent example, specific numbers, or a direct first-hand statement of the thing itself |             4 |

### 3.3 Handling missing evidence

- **Insufficient evidence:** the behavior was not discussed or only vaguely. It is excluded from the dimension calculation. It is never scored as 0.
- **Does not do it:** the participant was asked and says or shows they do not do it. Score it 0 or 1 using the anchors.
- **N/A:** only where stated in the behavior's section (P4 for non-users of AI, the career-transition signal in P1 when no transition exists).
- The extractor must record which of these three applies for every behavior, with a supporting quote.

### 3.4 Conflicting evidence

- A concrete example overrides a general claim ("I'm very selective" versus a walkthrough showing no screening).
- Score **current** behavior. Record earlier behavior as a trajectory note, for example "was selective at month 1, now automated."
- Record **contradictions and uncertainty** as a confidence note on the behavior.

### 3.5 Dimension score and band

Behaviors rated Insufficient or N/A drop out and the remaining weights are renormalized:

`Dimension score (0-100) = Σ (behavior score / 4 × weight) / Σ (weights of rated behaviors) × 100`

A dimension is **rated** only if:

1. the rated behaviors carry at least **50%** of the dimension's weight, and
2. every **must-have** behavior in the dimension is rated.

Otherwise the report says "Not enough evidence from this interview to rate this area."

**Bands (provisional):**

| Band            | Dimension score |
| --------------- | --------------- |
| **Strong**      | 70-100          |
| **Developing**  | 45-69           |
| **Opportunity** | 0-44            |

**Behavior-level labels** shown under each dimension:

| Label              | Behavior score        |
| ------------------ | --------------------- |
| Doing well         | 3-4                   |
| Developing         | 2                     |
| Opportunity        | 0-1                   |
| Not enough to tell | Insufficient evidence |

Numeric scores are kept internally (for research and recalibration) and are **not** shown to participants.

---

## 4. Behavior rubrics

### FOCUS: Am I finding and going after the right jobs?

#### F1. Has a defined target

**Looks for (sub-signals):** target role/function, level/scope, industry/domain, company profile, location/work setting, compensation requirements, desired work or problem characteristics. Code each as _specific_, _deliberately flexible_, _undecided_, or _not discussed_.

| Score | Anchor                                                                                                                                                    |
| ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     0 | Cannot describe a target beyond "something in my field" or "anything"; no stated criteria                                                                 |
|     1 | Names a broad function or title only; most other criteria are undecided and have not been thought through                                                 |
|     2 | Specific on two or three dimensions (usually role plus one or two others); the rest undecided without having been considered                              |
|     3 | Specific or deliberately flexible on most dimensions (about five of seven), including role and level; can say what matters most                           |
|     4 | Specific or deliberately flexible on all or nearly all dimensions, with reasoned priorities (must-haves versus nice-to-haves, trade-offs they would make) |

**Notes:**

- Deliberate flexibility scores the same as specificity. A narrower target is not better.
- Ask "is that open on purpose, or not decided yet?" before coding something as undecided.
- Compensation is often not volunteered. Code it _not discussed_, not undecided, and do not let it alone lower the score.

#### F2. Chooses roles on purpose

Combines two ideas job seekers rarely separate: **staying on target** (do the jobs you apply to match what you said you want) and **deciding before applying** (do you size up a role before spending effort on it).

**Looks for:** match rate across roughly the last 20 applications; adherence to stated must-haves; whether deviations are deliberate or drift, and whether the target loosened under pressure; reads and understands the role's requirements; assesses candidate-role fit (strengths and gaps); asks whether they actually want the role and looks at the company; willingness to pass on roles (go/no-go).

| Score | Anchor                                                                                                                                                                                                                                                                                                        |
| ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     0 | Applies on title, keywords, or availability; reads little of the posting; under about 20% of recent applications match the stated target and no boundaries are kept; cannot recall passing on any role                                                                                                        |
|     1 | Notices broad overlap with little explicit evaluation; about 20-39% match, or mostly drift because criteria were dropped under urgency or discouragement; passes only on obvious mismatches (location, pay)                                                                                                   |
|     2 | Checks major requirements and sometimes fit, but inconsistently weighs gaps, desirability, or the company; about 40-59% match, with some exceptions deliberate and some drift; can give an occasional example of passing                                                                                      |
|     3 | Usually identifies relevant strengths and meaningful gaps and considers whether they want the role and something about the company; about 60-79% match with must-haves kept and exceptions mostly deliberate; gives a concrete example of passing and why                                                     |
|     4 | Systematic: explicit criteria for fit, competitiveness, and desirability; researches the company or team and uses that to decide whether and how much to invest; 80% or more match (or a lower rate fully explained by deliberate, bounded experiments) with must-haves kept under pressure; passes regularly |

**Notes:**

- Judge both halves together. If one half is strong and the other weak, score between them, closer to the weaker.
- Adjustment: a low match rate made up of deliberate experiments can be raised one point; a high match rate with must-haves quietly dropped can be lowered one point.
- A qualitative answer ("most of them", "nearly all") is accepted as evidence. Do not lower the score because no number was given; estimate the band from what the participant describes, and the evidence cap does not apply to estimates or general descriptions for this behavior (a bare self-rating still caps at 2).
- This scores the **decision process**, not whether the participant is objectively a fit. A well-qualified person who applies indiscriminately scores low. A person who correctly judges a role a stretch and passes scores high.
- Do not treat broad applying as wrong. A deliberate, stated low-effort approach that still screens for must-haves can score 2.
- Urgency, fatigue, and search duration are context, not penalties. Only whether the broadening was planned counts.
- Strongest diagnostic for the decision half: "Tell me about a recent job that looked interesting but you decided not to apply for."

#### F3. Finds the right openings early

**Looks for:** the sources used to find openings (job boards, company career pages, alerts or saved searches, recruiters, network, communities, newsletters); whether those sources suit the target (industry, title, location, level, pay); use of alerts, saved searches, or a list of target companies to see new roles quickly; how old a posting usually is when they apply; knowing which sources surface roles that fit.

| Score | Anchor                                                                                                                                                                                                                                                                      |
| ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     0 | Finds roles only by occasionally scrolling a feed or job board with no search set up; no sense of how old postings are when they apply                                                                                                                                      |
|     1 | Mostly generic job-board browsing with little targeting of sources; applies to whatever surfaces, often weeks after it was posted; no alerts                                                                                                                                |
|     2 | Uses one or two sources with some saved searches or alerts; occasionally notices how old a posting is; coverage of target companies or niche sources is partial                                                                                                             |
|     3 | Uses several sources suited to their target (niche boards, company career pages, recruiters, network) with alerts or saved searches; usually applies within the first days, or can say how old postings are; knows which sources surface fitting roles                      |
|     4 | A deliberate sourcing routine: sources chosen for their target (industry, title, location, level, pay), a list of target companies they follow, alerts tuned to the target, early applications to priority roles, and a regular look at which sources produce fitting roles |

**Notes:**

- Do not penalize applying later to a role if the participant waited on purpose.
- Posting age is the participant's estimate; an estimate supports an estimated-pattern basis at most.
- A screener checklist of sources is a self-report and cannot support a score above 2 on its own.
- If this was not discussed and the screener did not cover it, mark it insufficient evidence.
- **Where the evidence comes from:** the screener's `channels_used` answer (which sources, and whether they use alerts or saved searches) and, for timeliness, the interview. The walkthrough asks how they found the role and how old the posting was when they applied. Participants cannot reliably answer a screener question about how soon they usually apply, so posting age is collected only in the interview.

### PITCH: Do my applications make the case for interviewing me?

#### P1. Makes the case for you

**Looks for:** can name two or three reasons they should be interviewed ("why me"); selects relevant experience; clear narrative; evidence and measurable outcomes; tailors emphasis to the role; explains any career transition (**N/A** if there is no transition, never scored as absent).

| Score | Anchor                                                                                                                                                                             |
| ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     0 | Sends the same generic materials everywhere; cannot say why they should be interviewed                                                                                             |
|     1 | States a general strength ("lots of experience") that the materials do not show; tailoring limited to keywords or title swaps                                                      |
|     2 | States one or two reasons; some tailoring (reordered bullets, new summary); evidence is mostly responsibilities rather than results                                                |
|     3 | States two or three role-specific reasons, makes them visible near the top of the resume or application, and supports them with concrete accomplishments                           |
|     4 | Reasons specific to the role and visible on the first screen; each backed by quantified or concrete outcomes; irrelevant material cut; any transition or gap addressed proactively |

**Notes:** this is about how clearly the case is made, not whether the participant is qualified.

#### P2. Matches effort to the opportunity

**Looks for:** more care on strong-fit or high-interest roles and less on marginal ones; time spent per application; drift toward automated or high-volume submission; how this changed over the search.

| Score | Anchor                                                                                                                                 |
| ----: | -------------------------------------------------------------------------------------------------------------------------------------- |
|     0 | The same minimal effort for every application, or near-automatic submission with no tailoring at all                                   |
|     1 | Mostly uniform and fast; extra effort only by accident                                                                                 |
|     2 | Some variation: extra care for roles they like, but inconsistent; volume pressure has reduced care on many applications                |
|     3 | Usually deliberate: clearly invests more in strong-fit roles and less in marginal ones, can describe the difference; autopilot limited |
|     4 | Explicit effort tiers or rules, consistently applied and maintained over the search despite volume or fatigue                          |

**Notes:**

- A fast application is not automatically low intentionality.
- Volume is context, not a score. Only whether effort level is **chosen** counts.

#### P3. Reviews what goes out

**Looks for:** reads the final resume or application end-to-end; owns the positioning decisions (what to claim, how to frame it); checks edits and AI output; verifies facts (nothing added or exaggerated).

| Score | Anchor                                                                                                                                                                                    |
| ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     0 | Submits without re-reading, or submits tool or AI output unchanged                                                                                                                        |
|     1 | Skims or spot-checks; assumes the tool or AI got the facts right                                                                                                                          |
|     2 | Reads most of it and fixes obvious errors but has no systematic fact check; positioning partly delegated                                                                                  |
|     3 | Usually reads end-to-end, decides the positioning themselves, and checks changes for accuracy                                                                                             |
|     4 | Always reviews the final version and has a specific verification habit (for example, checks every claim and number against the source resume); can describe catching and fixing something |

**Notes:**

- For non-AI users, score the review of their own edits. Only the AI-specific parts become N/A.
- Credit only review the participant described. Do not assume they read or check what they send because they did not say otherwise. If the only evidence is an automated tool whose output they never checked, score 0 or 1.

#### P4. Uses AI where it helps

**Looks for:** which tasks are delegated (drafting, tailoring, formatting); whether AI is also used to improve judgment (company and role research, fit assessment, interview prep, outreach drafts); uses beyond writing; where human decisions remain; use of auto-apply tools.

**N/A** if the participant does not use AI. Do not score as 0.

| Score | Anchor                                                                                                                                                                             |
| ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     0 | AI replaces their judgment on what to apply to or what to claim (for example auto-apply tools or unreviewed full applications) with no human decision point                        |
|     1 | Uses AI as a generic generator with little thought about which tasks it suits; delegates indiscriminately                                                                          |
|     2 | Uses AI sensibly for drafting or tailoring but is unsure where it helps and where it does not; retention of judgment inconsistent                                                  |
|     3 | Delegates well-suited tasks (drafting, tailoring, formatting) and clearly keeps the decisions                                                                                      |
|     4 | Deliberate division of labor: can state what AI does and what they decide; also uses AI to improve judgment (research, fit, positioning, prep) with explicit human decision points |

**Notes:**

- Do not reward breadth of use for its own sake. Score 4 needs retained judgment, not just many uses.
- Uses beyond writing are recorded as descriptive data (the report can list them) even when not scored.
- The screener checklist of AI uses guides probing but is self-report, so it cannot support a score above 2 by itself.

### REACH: Am I getting in front of people, not just job boards?

#### R1. Uses more than cold applications

**Looks for:** channels in use (cold applications, referrals, recruiters, former colleagues, direct outreach to hiring managers or employees, communities or events, content or research); proactive direct outreach; referral requests; whether the channel mix is chosen deliberately.

| Score | Anchor                                                                                                                                                 |
| ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
|     0 | Exclusively cold applications through job boards or portals; no other path tried                                                                       |
|     1 | Almost entirely cold applications; other paths are incidental (a recruiter happened to reach out)                                                      |
|     2 | Deliberately uses one additional channel (for example, sometimes asks for a referral) but not routinely                                                |
|     3 | Regularly uses two or more non-cold channels, including at least one proactive path (direct outreach or a referral request)                            |
|     4 | Chooses the channel per opportunity (for example, seeks a referral or direct contact for priority roles) and routinely uses several proactive channels |

**Notes:**

- The goal is not maximum diversity. Someone whose recruiter pipeline works and who uses few other channels can reasonably score 3.
- Capture counts and sources of recruiter conversations and interviews, which also feed L1 and L2.

#### R2. Builds and uses relationships

**Looks for:** activating the existing network; creating new relationships; quality and personalization of outreach (what they asked for, why the person should engage); offering value or context before asking; follow-up and staying in touch.

If the participant does not do relationship work, score 0 or 1. Only "not discussed" is Insufficient.

| Score | Anchor                                                                                                                                                                                  |
| ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     0 | No relationship-based efforts, or only mass, generic asks                                                                                                                               |
|     1 | Occasional generic asks ("can you refer me?", "let me know if you hear anything") to existing contacts; no follow-up                                                                    |
|     2 | Contacts some existing relationships with specific asks; little personalization; follow-up inconsistent; new relationships rare                                                         |
|     3 | Personalized, specific outreach to existing contacts and some new ones; a clear reason for them to engage; follows up at least once                                                     |
|     4 | Systematic: regularly activates the existing network and builds new relationships; offers value or context before asking; follows up and maintains contact beyond the first interaction |

**Notes:** score from one concrete recent example whenever possible ("what did you actually say or ask for? what happened next?").

#### R3. Makes you easy to find

**Looks for:** an online professional profile (such as LinkedIn) that is current and written for the target roles (headline, summary, skills, openness to recruiters); work samples, writing, or other visible activity aimed at the people who hire for those roles; checking how the profile appears to recruiters; noticing and acting on inbound contact.

| Score | Anchor                                                                                                                                                                                                                            |
| ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     0 | No online professional presence, or one untouched for a long time; nothing a recruiter could find                                                                                                                                 |
|     1 | A profile exists but is outdated or generic, and not written for the target roles                                                                                                                                                 |
|     2 | Profile recently updated and roughly matches the target; no further effort to be found                                                                                                                                            |
|     3 | Profile current and written for the target (headline, summary, skills) and set up so recruiters can reach them, plus at least one more visible signal (work samples, writing, posts, or a portfolio)                              |
|     4 | Deliberately visible: profile tuned to what recruiters search for and checked against how it appears; regular visible activity aimed at the people who hire for the target roles; notices inbound contact and adjusts based on it |

**Notes:**

- Score what they did to be found, not how many recruiters have reached out; the market drives that volume.
- Someone searching quietly while employed may limit visible activity on purpose. Score the profile itself, do not count missing posts against them, and record the reason in the confidence note.
- Capture inbound recruiter contacts and their sources; they are also counted for R1, L1, and L2.

### LEARN: Am I adjusting based on what is working?

#### L1. Reads the results

**Looks for:** tracks outcomes (applications, responses, conversations, interviews), ideally by source; recognizes patterns, including what differs between applications that went somewhere and those that did not; can say how they know what is working.

| Score | Anchor                                                                                                                                                                 |
| ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     0 | Does not track and has no sense of which approaches produce responses ("I just keep applying")                                                                         |
|     1 | Vague impressions without numbers ("networking seems better")                                                                                                          |
|     2 | Rough counts from memory; can name which source seems to work but has not compared it with their typical effort or approach                                            |
|     3 | Keeps a record or recalls accurately; states which sources produce interviews with approximate counts; notices differences between successful and typical applications |
|     4 | Tracks outcomes by source or approach, compares effort with results, and states specific patterns with evidence                                                        |

**Notes:** being able to answer the interview-source question with counts is itself evidence. A tracker is not required.

#### L2. Shifts effort to what works

**Looks for:** whether where effort goes matches where interviews come from; strategy changes made after seeing results.

Compare the effort split by channel with interviews by channel. A large mismatch with no change caps the score at 2.

| Score | Anchor                                                                                                                           |
| ----: | -------------------------------------------------------------------------------------------------------------------------------- |
|     0 | Effort unchanged or moving away from what works; continues the same approach despite no results; cannot say where effort goes    |
|     1 | Knows what works but effort is still mostly elsewhere; no change made                                                            |
|     2 | Some shift, small or recent (for example, a few referral asks started), but most effort remains in the lowest-yield channel      |
|     3 | A meaningful share of effort has shifted toward higher-yield approaches; can describe the change and its rough result            |
|     4 | Effort allocation clearly follows results and is adjusted regularly; the current effort split matches where interviews come from |

**Notes:** if the participant has had **no responses at all**, score on whether they changed their approach in response to the silence (resume, targeting, channel, volume), not on a missing result pattern.

#### L3. Experiments and uses feedback

**Looks for:** deliberate experiments (a change made on purpose, then checked); incorporating feedback from recruiters, interviewers, coaches, or peers; learning visible in how the search changed over time.

Opportunistic: if it does not surface, mark Insufficient.

| Score | Anchor                                                                                                                                                                     |
| ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     0 | No changes made and no feedback sought or used, or feedback is dismissed                                                                                                   |
|     1 | Changes are reactive or random (switching resume formats) with no check on whether they worked                                                                             |
|     2 | Has made changes from feedback or a hunch, with an informal check of the result                                                                                            |
|     3 | Describes a specific, deliberate change (new resume version, new channel, narrowed target) and what happened; has used outside feedback at least once                      |
|     4 | Runs deliberate experiments with a stated hypothesis and a check (for example, a batch of outreach messages with a new approach), and routinely seeks and acts on feedback |

---

## 5. Interview coverage map

| Behavior | Main questions (see interviewer prompt)                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| F1       | Target question                                                                                                    |
| F2       | Last-20 match rate, boundaries, change over time; walkthrough ("why did you decide to apply"); "job you passed on" |
| F3       | Screener `channels_used` (sources, alerts); walkthrough ("how did you find it, and how old was the posting")       |
| P1       | Walkthrough, positioning question, successful application                                                          |
| P2       | Walkthrough, successful-versus-typical comparison, change over time                                                |
| P3       | Walkthrough, AI review probes                                                                                      |
| P4       | AI role question, "where else do you use AI"                                                                       |
| R1       | Successful application, interview sources                                                                          |
| R2       | Relationship example                                                                                               |
| R3       | Profile question ("if a recruiter looked you up today, what would they find?")                                     |
| L1       | Interview sources and effort, change question                                                                      |
| L2       | Interview sources and effort, change question                                                                      |
| L3       | Change-strategy question                                                                                           |

Because one walkthrough covers F2 and P1-P4, the recent-application walkthrough is the highest-value segment of the interview.

---

## 6. Pre-interview screener (structured)

The screener replaces interview time for context and structured facts, and steers the interviewer's probing. All questions are optional. Answers are **self-report**, so they cannot support a behavior score above 2 by themselves. The interviewer is told what the participant answered and does not re-ask it.

Questions use the repo's screener format: `id`, `label`, `type` (single or multi), `options`, `allowOther`. **Ids are stable.** The pipeline reads answers by id, so rewording a label must not change its id.

Order is deliberate: easy factual questions first.

### Group A: Situation (context, not scored)

**S1. `search_status`**

- Label: What is your current job search status?
- Type: single-select. Allow "Other": no.
- Options:
  - Actively searching for a new job
  - Casually looking or open to opportunities
  - Not currently searching but planning to soon
  - Recently stopped searching (accepted an offer)
  - Recently stopped searching (paused for another reason)
- Feeds: eligibility and context. See open item on eligibility in section 11.

**S2. `time_since_full_time`**

- Label: How long has it been since your last full-time role?
- Type: single-select. Allow "Other": no.
- Options:
  - I am currently employed full-time
  - Less than 3 months
  - 3 to 6 months
  - 6 to 12 months
  - More than 12 months
  - I have not had a full-time role
- Feeds: context (employment gap).

**S3. `search_duration`**

- Label: How long have you been actively searching for your next job?
- Type: single-select. Allow "Other": no.
- Options:
  - Less than 2 weeks
  - 2 weeks to 1 month
  - 1 to 3 months
  - 3 to 6 months
  - 6 to 12 months
  - More than 12 months
- Feeds: context (search duration, trajectory).

### Group B: Target (segmentation and probing hints)

**S4. `target_function`**

- Label: What type of role or function are you mainly targeting?
- Type: **multi-select**. Allow "Other": yes.
- Options:
  - Product or program management
  - Software or hardware engineering
  - Data or analytics
  - Design or user research
  - Marketing or communications
  - Sales or business development
  - Customer success or support
  - Operations or supply chain
  - Finance or accounting
  - People, HR, or recruiting
  - Legal, risk, or compliance
  - Education or training
  - Healthcare or clinical
  - General management or leadership
- Feeds: peer segmentation; cross-check against the target the participant describes in the interview.

**S5. `current_level`**

- Label: Which best describes your most recent or current level?
- Type: single-select. Allow "Other": no.
- Options:
  - Entry-level or early career
  - Mid-level individual contributor
  - Senior individual contributor
  - Manager
  - Director
  - Executive or C-level
- Feeds: peer segmentation; context.

**S6. `target_level_vs_recent`**

- Label: Compared with your most recent role, the level you are targeting is:
- Type: single-select. Allow "Other": no.
- Options:
  - Higher
  - About the same
  - Lower
  - A mix of levels
  - Not sure yet
- Feeds: context (career-level trajectory). A "mix" or "lower" answer prompts the interviewer to ask what is driving it.

### Group C: Search activity (context and probing hints)

**S7. `applications_30d`**

- Label: Roughly how many job applications have you submitted in the past month?
- Type: single-select. Allow "Other": no.
- Options:
  - 0 to 5
  - 6 to 15
  - 16 to 30
  - 31 to 50
  - More than 50
- Feeds: context (application volume). Never scored.

**S8. `conversations_total`**

- Label: Since you started searching, roughly how many recruiter conversations or interviews have you had?
- Type: single-select. Allow "Other": no.
- Options:
  - None yet
  - 1 to 2
  - 3 to 5
  - 6 to 10
  - More than 10
- Feeds: outcome context; the interviewer uses it to decide between the interview-producing opportunity and the furthest-progress opportunity. Also a cross-check on interview-source counts.

**S9. `channels_used`**

- Label: Which of these have you used to find opportunities? Select all that apply.
- Type: **multi-select**. Allow "Other": yes.
- Options:
  - General job boards (such as LinkedIn or Indeed)
  - Niche or industry job boards, newsletters, or listings
  - Company career pages
  - Job alerts or saved searches
  - Referrals from people I know
  - Reaching out to hiring managers or employees I do not know
  - Recruiters who contacted me
  - Recruiters I sought out or work with
  - Former colleagues or my professional network
  - Communities, events, or online groups
  - Posting or sharing content
- Feeds: R1 (channel mix) and F3 (sources and alerts) as probing hints. The first four options are where openings are found and are the cold application paths; the rest are the non-cold paths the rubric looks for. The first option used to be a single "job boards or company career sites" checkbox; it was split so F3 can tell general boards, niche sources, career pages, and alerts apart.

### Group D: AI (feeds P4 as a probing hint)

**S10. `ai_uses`**

- Label: Where have you used AI in your job search? Select all that apply.
- Type: **multi-select**. Allow "Other": yes.
- Options:
  - Tailoring my resume
  - Writing cover letters
  - Researching companies or roles
  - Deciding whether I am a good fit for a role
  - Preparing for interviews
  - Writing outreach messages
  - Finding jobs to apply to
  - Applying to jobs automatically
  - I have not used AI in my search
- Feeds: P4. The interviewer probes beyond the selected uses and asks about anything not selected that the participant mentions. "Applying to jobs automatically" prompts a follow-up on where the human decision point is. Selecting "I have not used AI" sets P4 to a likely N/A, to be confirmed in the interview.

### Group E: Support and career change (research segmentation, never scored)

These two questions are collected to compare interview rates by whether a participant has job-search support and whether they are changing careers. They are never scored and are not shown to the participant in the report.

**S11. `search_support`**

- Label: Are you getting any support with your job search? Select all that apply.
- Type: **multi-select**. Allow "Other": yes.
- Options:
  - No support
  - A paid career coach
  - Outplacement support paid for by a former employer
  - A free program (for example, a workforce, alumni, or community program)
- Feeds: research segmentation. If outplacement or a free program is selected, the interviewer **must** ask which provider or program it is (in the People section, and again in the gap-fill step if missed); a paid coach is asked about once as well. The participant may decline. The answer is recorded in the ledger as `supportProviders`, and the simulation harness flags interviews where the required question was never asked. "No support" excludes the other options.

**S12. `career_pivot`**

- Label: Is the role or industry you are targeting different from your previous one?
- Type: single-select. Allow "Other": no.
- Options:
  - No, a similar role in the same industry
  - Yes, a different role in the same industry
  - Yes, a similar role in a different industry
  - Yes, a different role in a different industry
  - Not sure
- Feeds: research segmentation (any "Yes" counts as a pivot, and the options say whether the role, the industry, or both changed). A pivot also prompts the interviewer to ask how they explain the change to employers (see the positioning question).

### Screener answers and the pipeline

| Answer                                                                                    | Effect                                                                                                                        |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `ai_uses` is "I have not used AI"                                                         | P4 is a candidate for N/A; interviewer confirms. P3 is scored on the participant's own edits                                  |
| `conversations_total` is "None yet"                                                       | Interviewer asks about the furthest-progress opportunity instead of an interview-producing one; L2 uses the no-responses rule |
| `channels_used` has only job-board or career-page options                                 | Interviewer still asks about the interview sources; R1 is scored from the interview, not this list                            |
| `channels_used` has no "Job alerts or saved searches" and no niche or career-page options | Does not by itself lower F3. The interviewer asks how they found the role from the walkthrough and how old the posting was    |
| `target_level_vs_recent` is "A mix" or "Lower"                                            | Interviewer asks what is driving it                                                                                           |
| `search_duration`, `time_since_full_time`, `target_level_vs_recent`                       | Context for the report's "what is affecting your search" section only                                                         |
| `search_support` has any support selected                                                 | Interviewer asks once who it is with, if they are comfortable saying; recorded as `supportProviders`                          |
| `career_pivot` is any "Yes"                                                               | Interviewer asks how they explain the change to employers (P1 positioning). Segmentation only, never scored                   |
| Any answer conflicts with the interview                                                   | The interview answer (the concrete example) wins; the conflict is noted                                                       |

### Not in the screener (asked in the interview or dropped)

These were considered and removed from the screener: employment status, target industries, work settings, application pace change, other tools (tracker, coach, and so on), search energy, and time or financial pressure.

**Decision:** search energy, time or financial pressure, and application pace are **not collected** by either the screener or the interviewer. They were first planned as extra-time interview questions, but simulation and a real interview showed they were rarely reached, so they were dropped. Industry and work setting come from the interview's target question and are not asked separately.

Consequences: these are context variables, never scored. The report's "what is affecting your search" section is built only from what is collected (search duration, time since the last full-time role, level trajectory, and anything the participant volunteers). It does not state or imply a conclusion about energy, urgency, or pace, and the sample report's urgency-to-automation loop is not reproduced unless the participant volunteered the supporting facts.

### Trimming order

If the screener is still too long, cut `target_function` first, then `search_status` (if eligibility is handled at recruitment). Keep the rest: they replace interview time or drive probing.

---

## 7. Participant-facing report structure

Per dimension: a **band** (or "Not enough evidence"), one thing they are doing well (highest-scoring behavior of 3 or more), and one thing to improve (lowest-scoring behavior of 2 or less). Behaviors are shown with their labels from section 3.5. No numeric scores and no percentiles in v1.

---

## 8. Within-person comparison (reported, not scored)

The typical-versus-successful comparison is the report's centerpiece. Capture the same fields for **a typical recent application** and for **the opportunity that produced a recruiter conversation or interview** (or the furthest-progress opportunity if none has).

| Field                         | Notes                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Source or channel             | Cold application, referral, recruiter, former colleague, direct outreach, community or event, content or research, other |
| Fit strength                  | The participant's description of how well it matched                                                                     |
| Time invested                 | Rough minutes                                                                                                            |
| Role and company research     | What they did before applying                                                                                            |
| Positioning effort            | Whether the resume or story was customized                                                                               |
| Human contact                 | Whether anyone knew them before or shortly after applying                                                                |
| AI use                        | What AI did and what they decided                                                                                        |
| Follow-up after submitting    | What they did next                                                                                                       |
| Participant's own explanation | What they think was different, quoted or faithfully summarized                                                           |

Also capture:

- Interview sources: approximate counts by source.
- Effort split: approximate share of time by channel.
- Whether the "typical" application the participant described is actually typical for them.
- If the most recent application is the one that produced the conversation, use a recent one that did not as the typical baseline.

---

## 9. Not scored: context and fit

These explain behavior and must never raise or lower a score:

- Search duration, time since last employment
- Financial or time urgency, search energy and motivation
- Previous level versus target level, career change, down-leveling
- Geography and work-setting constraints, market demand
- Application volume
- Candidate-role fit: relevant functional or industry experience, seniority alignment, required skills or credentials, comparable accomplishments

---

## 10. Crosswalk from the earlier model

| Earlier dimension           | Now                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| Target Clarity              | F1                                                                                                 |
| Target Adherence            | F2 (merged with Opportunity Qualification)                                                         |
| Opportunity Qualification   | F2 (including "understands the role before applying" from Application Intentionality)              |
| (no counterpart)            | F3 Finds the right openings early, new in this version                                             |
| Application Intentionality  | P1 ("why me"), P2 (effort, autopilot), P3 (final review)                                           |
| Story-to-Role Alignment     | P1                                                                                                 |
| Human-Directed AI Use       | P3 (human ownership, reviewing and verifying AI output), P4 (delegation, research and preparation) |
| Channel Strategy            | R1 (diversity, direct outreach, referrals); L1 (measurement); L2 (effort follows results)          |
| Relationship Activation     | R2                                                                                                 |
| (no counterpart)            | R3 Makes you easy to find, new in this version                                                     |
| Learning and Adaptation     | L1 (tracking, patterns), L2 (strategy adjustment), L3 (experimentation, feedback)                  |
| Search Intentionality Index | Dropped                                                                                            |

The earlier component-level signals (46 in total) remain as the **sub-signals** the extractor records under each behavior, so finer-grained analysis against interview outcomes stays possible later.

---

## 11. Open items

- Calibrate weights, band cutoffs, and evidence caps against real transcripts.
- Decide how a missing rated behavior inside a rated dimension is explained to participants.
- Build an experiment library mapped to behaviors for the report's "what to try next" section.
- Decide screener eligibility: which `search_status` answers qualify for the interview ("casually looking" and "not currently searching" participants may lack material for the application walkthrough), or whether the interviewer adapts for them.
- Benchmarking beyond bands (peer percentiles) once the cohort is large enough.
