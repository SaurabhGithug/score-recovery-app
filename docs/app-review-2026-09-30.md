# App review: 30 September 2026

This review was run by Claude Code. Three independent reviewers read the code:

- ChatGPT's server-side changes;
- the UI: navigation, links and repeated content;
- which backend features have no screen.

A separate agent then tried to disprove each finding. None was disproved outright. Findings marked "partly" include the corrected statement. The completeness critic found C-01 to C-08: C-01 and C-05 were checked by Claude Code, and the rest by a separate agent.

This is a code review. It is not a claim that every screen was checked in a browser: signing in with a test account was blocked, so the changed review components were rendered from test data on a temporary local page instead.

## Fixed in this pass (Claude Code, bank screens only)

- **R2-01 / R3-14:** the paper review page showed the score, marking scheme, total time, marks lost and a section table twice. It now has one score card and one section table (Correct, Wrong, Unattempted, Accuracy, Lost, Left, Score).
- **R2-02:** paper cards no longer repeat the date, shift or paper when the title already states them.
- **R2-03:** sources and "not scored" were listed twice. A new shared component, `KeyProvenance`, lists each source once:
  - on a disputed key, each source is shown with its answer;
  - on a no-key question, an AI answer is never shown on its own.
  - An unavailable question no longer says "SSC's own key" while no option is marked.
  - Review badges are now translated labels instead of the raw values ("unscored").
- **C-01:** image-led questions were shown twice, as the image and again as text. On 187 questions that text was garbled.
  - Garbled or incomplete text is hidden.
  - OCR text sits in a collapsed "Machine-read text (may contain errors)" section.
  - Clean PDF text sits in a collapsed "Show the question as text" section.
  - Option buttons show text only when it is clean PDF text.
  - The same rules apply to `optionRef`.
- **R2-07 (part):** the duplicate question counter on mobile is gone. The "Not scored" badge is hidden once the answer has been checked.
- **Files:**
  - `src/components/bank/{KeyProvenance.tsx (new), BankRunner.tsx, ReviewQuestion.tsx, ScoreBreakdown.tsx, optionOrder.ts}`
  - `src/app/papers/page.tsx`
  - `src/app/papers/attempts/[attemptId]/page.tsx`

**For ChatGPT:** these are the same files you edited on 30 September. Re-read them before editing; your image-load gating is unchanged.

## ChatGPT: open findings

### R1-01 · high · A deleted or hidden question in an active learning session locks the learner out of /learn, with no way to recover in the UI

- **Where:** src/lib/server/learning/service.ts:99-102, src/lib/server/learning/service.ts:110, src/lib/server/learning/service.ts:120-121, src/app/learn/page.tsx:46, src/app/learn/page.tsx:60-62, src/app/learn/page.tsx:87, src/lib/server/bank/import-pyp.ts:860
- **Verdict:** confirmed
- **Evidence:** activeItem() throws `HttpError(404,"Question is no longer available to this account.")` when `BankRepository.getQuestionFor(snapshot.q.id,userId)` is null (line 102). sessionView() always calls activeItem() for an open session (line 110). startSession() returns `sessionView(userId,String(active.id))` whenever an uncompleted session exists (lines 120-121), so both GET ?session= (resume, page.tsx:46) and POST start throw 404. overview() still reports activeSessionId, so the only call-to-action is "Continue practice" (page.tsx:60). The focus/mode picker is hidden while a session is active (page.tsx:62: `!data.activeSessionId&&<details>`). "Finish early" exists only inside <Runner> (page.tsx:87), which never mounts. learning_items has no FK to bank_questions. The importers delete rows: `BankRepository.deleteQuestionsNotIn(...)` at import-pyp.ts:860 and import-testbook.ts:157.
- **Impact:** After a re-import removes one question that sits in a learner's open session, /learn is dead for that learner: every Continue or Start attempt fails, and only hand-editing the database clears it.
- **Suggested fix:** Make sessionView and startSession tolerate a missing or ineligible item: void it (for example learning_items.voided_at plus a reason, and no event), move the cursor, or auto-complete the session. Also let finish be reachable without sessionView, for example a "Discard session" button on the overview whenever activeSessionId is set, with finish returning the overview rather than calling sessionView.

### R1-K1 · high · Known issue 1, refined: the "source" action shows the source solution before the learner answers; it is latent today and the tests expect it

- **Where:** src/lib/server/learning/service.ts:197-206, scripts/test-learning.mjs:60, src/lib/server/repositories/bank-repo.ts:719-724
- **Verdict:** confirmed
- **Evidence:** Confirmed. sourceLesson() never checks item.checked_at, stores the lesson, and sessionView returns it before commit. The limitation text says so explicitly ("Opening this solution before answering counts as assistance"), and test-learning.mjs:60 calls sourceLesson on an unchecked item as intended behaviour. Refinements: (a) on the DB copy, 0 of 7,200 questions have a source_solution, so no key has actually leaked yet. (b) If a learner opens the solution and then uses "Finish early" without checking, no learning_event is written, so the bank's priorExposure (questionsSeenInLearning reads only learning_events) misses that exposure.
- **Impact:** As soon as any source solution is imported, the key-bearing text reaches the learner before commit.
- **Suggested fix:** Require checked_at in sourceLesson, update test-learning.mjs:60 to expect a 409, and record a learning_exposures or event row with an 'assist_viewed' flag whenever help is opened, so the bank's prior-exposure check sees it.

### R2-09 · high · 'My progress' in the main menu shows none of the Learn or Tests progress

- **Where:** src/components/SiteHeader.tsx:13, src/app/dashboard/page.tsx:6,28-31,69-74, src/lib/storage.ts:128-141
- **Verdict:** confirmed
- **Evidence:** The PRIMARY item 'My progress' points to /dashboard. The dashboard only calls listAttempts/listReports/getLedger from @/lib/storage (localStorage). Those are written by /exam, library practice and repair, never by /learn (server learning_events) or /papers (server bank_attempts). Its own copy (74) admits: 'These are short practice-test results saved on this device, not all your mock tests'. /learn has a separate 'Practice results' tab (LearningProgress), and /papers has 'My past tests'.
- **Impact:** A learner who does all their work in Learn and Tests opens 'My progress' and sees 'No results saved here yet'. Progress is split across three stores with no summary, which undermines the product goal of showing score improvement.
- **Suggested fix:** Rebuild /dashboard on server data: the /api/learn overview (due reviews, per-section accuracy) and bank attempts (latest paper scores, trend). Link each card to its detail (/learn progress tab, /papers/attempts/[id]). Move the device-local legacy results into a collapsed 'Older results on this device' block, or retire them.

### R2-14 · high · /recovery-lab shows one person's Made Easy results and answer-bearing questions to any visitor or account

- **Where:** src/app/recovery-lab/page.tsx:1-13,26,83,166,196, src/lib/madeeasy.ts:1, src/lib/madeeasy-import.json
- **Verdict:** confirmed
- **Evidence:** The page is a 'use client' component that imports MADE_EASY_IMPORT and MADE_EASY_QUESTIONS from madeeasy.ts, which imports madeeasy-import.json (135 KB). Each attentionQuestion includes question, options, correctOption, explanation, selectedOption, timeSeconds and marksAwarded. The page never calls useUser, and there is no src/middleware.ts or proxy.ts, so no sign-in gate applies. It renders 'My 4 saved test results' with the imported score (196). Drill progress is stored under the un-namespaced localStorage key 'score-recovery.madeeasy-lab.v2' (26,83,166).
- **Impact:** Any account, even signed-out, sees the owner's 'My' results. The publisher's questions and answer keys ship in a public JS chunk, contrary to 'the bank must never be exposed publicly' and per-user history. How serious this is depends on whether the app is reachable beyond localhost; that is not confirmed.
- **Suggested fix:** Move the Made Easy import into the server bank as the owner's private kind 'mock' paper (owner_user_id), serve it through the authenticated bank API, and retire /recovery-lab. At minimum, gate the page on sign-in and owner, load the JSON server-side, and namespace the progress key by user.

### C-04 · high · /dashboard/topics reads a device-wide 'default' store: /exam topic data is shared across accounts, library practice never shows, and an empty store shows 3 non-Civil topics

- **Where:** src/app/dashboard/page.tsx:86-89, src/app/dashboard/topics/page.tsx:16-19, src/lib/storage/platform-store.ts:20-23,52-56,83-96, src/lib/storage.ts:28-40, src/app/exam/page.tsx:85-91, src/app/library/[id]/practice/page.tsx:266-270, src/app/recovery-lab/page.tsx:26,83,166
- **Verdict:** confirmed
- **Corrected claim:** Accurate. Scope caveat: the leak is between accounts on the same browser profile (localStorage), and the data is low-sensitivity mastery stats. Root cause is that nothing ever writes 'src.active_user.v2', so getActiveUserId() is constant 'default'. The three placeholder topics are two Quant Aptitude concepts and one electrical (Ohm's law), all non-Civil, shown as 'Unassessed'.
- **Evidence:** getActiveUserId() reads localStorage 'src.active_user.v2'. Nothing in src/, public/ or scripts/ ever writes that key (grep finds only this one read), so it always returns 'default'. The topics page calls `PlatformStore.getActiveStudentProfile()`, then `listStudentConceptStates(profile.studentId)`, which reads 'src.student.concept_states.v2.default'. /exam records concept states with `studentId: studentProfile.studentId` (= 'default'). Library practice records them with `studentId: currentUser.id`, which the topics page never reads. With no states, the fallback returns 'concept-percentage-base', 'concept-profit-loss-cp-sp' and 'concept-ohms-law' (platform-store.ts:91-95). The dashboard shows the 'View all topics →' link based on the per-user, per-goal getLedger(uid, cid) list (86-89), so the link opens a different dataset. Made Easy drill progress is also stored under one global key, 'score-recovery.madeeasy-lab.v2'. This shares its root cause with R2-10 but affects different pages and has a different effect.
- **Impact:** On a shared device (the DB has Saurabh, Rahul and Reema accounts), one account sees another's /exam topic accuracy and speed under 'Your topics'. A learner who practised in the library sees Percentage, Profit & Loss and Ohm's law instead of their own topics. The dashboard's 'Topics to practise' and the page it links to disagree. This breaks the rule that every per-user read and write is scoped to the session user.
- **Suggested fix:** Pass currentUser.id explicitly in every PlatformStore and storage call, and make getActiveUserId fail closed instead of returning 'default'. Scope the recovery-lab progress key by user and remove the placeholder concepts. Longer term, retire the PlatformStore screens.

### R1-02 · medium · contentVersion covers all metadata and the full key, and a mismatch blocks both check and skip, so the only way out is ending the whole session

- **Where:** src/lib/server/learning/service.ts:23, src/lib/server/learning/service.ts:157-160, src/lib/server/learning/service.ts:179, src/lib/server/learning/tutor.ts:25, scripts/repair-crop-hashes.mjs:25, scripts/test-learning.mjs:76-79
- **Verdict:** confirmed
- **Evidence:** `contentVersion = hash([q.stem,q.options,q.metadata,q.sourceSolution,key])` includes every metadata field and the whole ResolvedKey (basis/dissent/observedAt). checkItem throws 409 "Source evidence changed. Finish this session and start a fresh one" on any difference (line 160). Skip goes through the same checkItem (page.tsx:110 sends action "check" with answer:null). advance() requires checked_at (line 179). Unrelated metadata writes change the version, e.g. repair-crop-hashes adding clean_sha256 (line 25), importer warnings/translations, or a corroborating AI blind solve that moves single_source to ai_checked. The test suite asserts the 409 but no recovery path (test-learning.mjs:76-79). sessionView also keeps rendering the stale snapshot.q.
- **Impact:** A learner answers, the check is refused, the answer is lost, and the remaining queue is thrown away via "Finish early". Harmless metadata maintenance can trigger this for everyone mid-session.
- **Suggested fix:** Version only what scoring and presentation depend on: contentFingerprint(q) (bank/content-fp.ts), key.status, key.answer, dissent count, and the clean_crop/clean_sha256 pair. On a mismatch, void the item with a visible reason and allow advance, instead of forcing finish.

### R1-03 · medium · Learning history scored against a superseded key, or for a now-ineligible question, still drives status, due counts and the next review date

- **Where:** src/lib/learning/policy.ts:25-50, src/lib/server/learning/service.ts:78-84, src/lib/server/learning/service.ts:168, src/app/learn/page.tsx:68-69
- **Verdict:** confirmed
- **Evidence:** summarize() uses every event and computes `due` from the latest event per fingerprint (policy.ts:48). No event is ever checked against the current key or eligibility. content_version is written (service.ts:168) but never read back. overview() calls summarize(events) and takes nextDueAt from all latest events (lines 78-84). plan() only schedules eligible candidates. On the DB copy, 188 eligible questions are single_source (publisher_key). A later SSC response-sheet import that disagrees makes them official-with-dissent, which is excluded (eligibility line 35), but their old correct/incorrect events keep counting.
- **Impact:** Group status ("Consistent so far" / "Needs practice") can rest on answers marked against a wrong key. The Today tab can say "N reviews due" and show a "Next scheduled review" date while also saying "No new questions or reviews are ready".
- **Suggested fix:** Store key.answer and contentFingerprint on each event. At summarize time, split events into current and superseded (fingerprint or answer no longer matches, or the question is now ineligible). Exclude superseded ones from status and due counts and show a short note that they were re-scored or withdrawn.

### R1-05 · medium · The /learn runner ignores the question DTO's image-led contract: OCR text shown as primary, A–D labels, no gating on image load

- **Where:** src/app/learn/page.tsx:113-117, src/components/bank/BankRunner.tsx:199, src/components/bank/BankRunner.tsx:332, src/components/bank/BankRunner.tsx:456-457, src/components/bank/optionOrder.ts:76-78
- **Verdict:** confirmed
- **Evidence:** page.tsx always renders `q.stem` as the h2 heading and options as text labelled `o.id` in q.options order. It never reads q.textQuality, q.unavailable or q.translations, and answering is never blocked if the clean image fails (the <img> is simply omitted when imageUrl is null). The bank runner treats hasFigure or non-text_layer/bilingual_en questions as image-led: it blocks answering until the image loads ("The source image is unavailable. Do not guess") and labels options 1–4 to match the printed crop. On the DB copy, 580 learning-eligible questions are image-led (figure or OCR text).
- **Impact:** A learner can answer, and be scored on, misread OCR text or a figure question whose image did not load. DECISION-002's addendum explicitly says OCR text alone does not qualify. The A–D labels also do not match the 1–4 printed on the crop.
- **Suggested fix:** Reuse imageLed() and optionLabel() from components/bank/optionOrder.ts in QuestionActivity. Put the image first for image-led items, disable Check until the image has loaded, honour `unavailable`, and offer the Hindi translation as BankRunner does.

### R1-06 · medium · The "See solution" and "Find study help with AI" buttons fail on every question in the current bank

- **Where:** src/app/learn/page.tsx:118, src/app/learn/page.tsx:123, src/lib/server/learning/service.ts:201-202, src/lib/server/learning/tutor.ts:26-30
- **Verdict:** partly
- **Corrected claim:** 'See solution' and 'Find study help with AI' always fail today: 0 source solutions, and no verified concept links to the one verified note. Neither failure marks the item assisted. The separate 'Open study material' action marks assisted and opens the syllabus library, which mostly contains official syllabus wording only.
- **Evidence:** On the DB copy, 0 of 7,200 bank_questions have a non-empty source_solution, so sourceLesson always returns 422 "This source has no substantive explanation". The tutor only uses theory_notes joined through `question_concepts ... review_status='verified'`. The only verified note is the seeded stress-strain sentence, and all 49 question links to its node are needs_review, so every tutor call returns 422 "There is no substantive source solution or reviewed linked theory yet". Both buttons are rendered unconditionally (non-check modes), and LearningSessionView has no availability flag.
- **Impact:** Every question offers two help actions that always error. Learners learn to ignore the help controls, and the "study" action marks items as assisted even though no material existed.
- **Suggested fix:** Add server-computed `help: {source: boolean, tutor: boolean}` to LearningSessionView (substantiveSolution(q) != null; there is at least one verified note linked through a verified concept). Hide or disable the buttons with a reason when false. Surface the AI explanations the bank already produces for committed questions (bank/explain.ts via explanationFor) instead of a separate tutor path.

### R1-K2 · medium · Known issue 2 confirmed: tutor and generation check the cap and then bill; the generator also overshoots its per-run budget

- **Where:** src/lib/server/learning/tutor.ts:42, src/lib/server/learning/tutor.ts:50, src/lib/server/jobs/generation-queue.ts:51-52, src/lib/server/jobs/generation-queue.ts:89, src/lib/server/jobs/generation-queue.ts:95-96, src/lib/server/generation/question-generator.ts:180
- **Verdict:** confirmed
- **Evidence:** The tutor reads `SpendRepository.totalSince(...) >= maxUsdPerDay`, then later calls `SpendRepository.add`. The generation queue snapshots `budgetUsd = min(maxUsdPerRun, dailyRemainingUsd())` at start and adds spend after each call, and the generator stops only after `summary.costUsd >= deps.budgetUsd`, so it overshoots by up to one call. Neither path uses SpendRepository.reserve/settle, which bank/explain.ts:180 already uses.
- **Impact:** Concurrent tutor calls, a generation run and an explain batch can together exceed the daily cap.
- **Suggested fix:** Route every paid call through reserve(worst-case) and settle(actual).

### R2-04 · medium · /learn can show the same source solution twice; 'Find study help with AI' pays to return it again

- **Where:** src/app/learn/page.tsx:118,121,123,125, src/lib/server/learning/service.ts:112,197-205, src/lib/server/learning/tutor.ts:26-30,52
- **Verdict:** confirmed
- **Evidence:** 'See solution · counts as help' (118) stores lesson = substantiveSolution(q) (service.ts:202-204), and sessionView keeps returning item.lesson after the check (service.ts ~112). After 'Check answer', feedback.sourceSolution is the same substantiveSolution text, shown as 'Source explanation' (121), while the lesson aside (125) still shows it as 'Source worked solution'. The tutor's candidate passages are verified theory_notes plus 'portal-solution' (tutor.ts:26-29). The DB has exactly 1 verified theory note, so the model can almost always only select the portal solution, and the note body is that text plus 'Source: …' (52). That text is already in the box at line 121.
- **Impact:** Learners see the same solution twice on the feedback screen. The AI button spends budget (a paid call, with the already-known check-then-bill race) to produce text that is already on screen; otherwise it returns a 422 error.
- **Suggested fix:** Clear or hide the lesson aside once feedback shows the same sourceSolution (compare kind==='source'). Offer 'Find study help with AI' only when at least one verified theory note is linked to the question (have the server return a `tutorAvailable` flag). When the portal solution would be the only passage, skip the model call.

### R2-06 · medium · Two 'past tests' hubs that link to each other in a loop; dashboard card has two past-tests entries with different data

- **Where:** src/app/dashboard/page.tsx:66-91,68,75-84,102, src/app/papers/page.tsx:140,147
- **Verdict:** partly
- **Corrected claim:** Dashboard 'Past practice results' card has a link to /papers?view=past (always) plus a 'View past tests' disclosure (only when legacy local results exist) that shows a different data set; /papers?view=past links back to the dashboard card via 'Short practice tests ->'. The /papers link at :102 is hidden in a collapsed disclosure.
- **Evidence:** On one dashboard card, 'Past practice results' has a link 'See my past tests and solutions →' to /papers?view=past (68) and, below it, a disclosure 'View past tests' (76) listing localStorage attempts linked to /results (77-83). The same screen's 'Exam details & settings' also has 'Previous papers & mock tests →' to /papers (102). /papers?view=past ('My past tests', 140) in turn links 'Short practice tests →' back to /dashboard#recorded-progress (147).
- **Impact:** The learner sees two 'past tests' controls side by side that open different data sets, and following them bounces between two pages that each hold half of the history.
- **Suggested fix:** Make /papers?view=past the only past-results hub and list the legacy local results there in a clearly labelled 'Older short practice tests' group. On the dashboard, keep one link. Remove the 'View past tests' disclosure and the duplicate /papers link.

### R2-13 · medium · Import and Testbook links land on the wrong or an empty Tests tab; catalogue counts contradict the bank

- **Where:** src/app/recovery-lab/testbook/import/page.tsx:142-143, src/lib/server/bank/import-testbook.ts:126, src/app/papers/page.tsx:25, src/app/recovery-lab/testbook/page.tsx:4, src/app/recovery-lab/testbook/catalogue/page.tsx:27,71, src/app/recovery-lab/page.tsx:190, src/lib/testbook-catalogue.ts:47-51
- **Verdict:** confirmed
- **Evidence:** Testbook imports are stored as kind 'mock' (import-testbook.ts:126), but 'View imported papers' goes to /papers, which defaults to kind 'pyp' (papers/page.tsx:25). The catalogue's '← Back to learning bank' (71) and recovery-lab's 'Testbook questions' (190) go to /recovery-lab/testbook, which redirects to /papers?kind=mock. bank_papers currently has 0 rows with kind='mock' (only 35 P1 and 2 P2 PYPs), so that tab shows 'No imported tests match this view'. Meanwhile the catalogue shows a hard-coded 'Questions saved' of 620 (200+200+200+20 from testbook-catalogue.ts:47-51). The import page's only way out is 'Back to learning' (142), even when the learner came from Tests.
- **Impact:** After importing, learners do not see their tests. A page that says 620 questions are saved links to an empty list. Link labels ('learning bank', 'Testbook questions') do not match where they lead.
- **Suggested fix:** Link to /papers?kind=mock after import. Relabel the catalogue link '← Tests: Mock tests' and derive its counts from the server bank for the current user, or say explicitly that the numbers are a browser capture that has not been synced. Replace 'Back to learning' with a back link to wherever the learner came from, or to Tests.

### R2-15 · medium · Legacy /exam is an SSC CGL diagnostic presented as SSC JE Civil, with two different marking schemes on one screen

- **Where:** src/app/exam/page.tsx:139-143,159,185, src/lib/exam.ts:9-13,15-20,46-51, src/app/results/[attemptId]/page.tsx:27,59-65, src/app/repair/[attemptId]/page.tsx:89, src/components/SiteFooter.tsx:20
- **Verdict:** confirmed
- **Evidence:** The intro shows 'Target: SSC Junior Engineer & SA 2026 (Civil)' (139-143) and 'Official 2026 Cycle Active … Paper-I … (+1 / −0.25)' (159), yet the marking tile hard-codes '+2 / −0.5' (185). The questions are quant, reasoning, English and GK (exam.ts:15-20) with negativeMarks 0.5, the blueprint id is 'ssc-cgl-diagnostic', and CONTENT_VERSION.examPatternVersion is 'SSC-CGL-Tier1-2025', which the footer shows on every page (SiteFooter:20). /exam is reached from results ('Start a new practice test', 27) and repair ('Take another mock', 89). Results claims 'Approximately X are recoverable within two weeks' (59-65).
- **Impact:** A Civil learner is given a non-JE question set under a JE banner, with contradictory marking shown on one screen and an unsupported 'recoverable in two weeks' prediction. This contradicts the /learn principle that the app makes no score predictions.
- **Suggested fix:** Remove the /exam links from results and repair, and point them to /papers. Hide /exam (or relabel it 'Generic aptitude diagnostic (not SSC JE)' and delete the JE banner and notice text). Drop the 'recoverable within two weeks' sentence. Set the footer's pattern version from the bank or the syllabus cycle.

### R2-16 · medium · Dashboard 'Syllabus' shows a paraphrased syllabus labelled 'Official'

- **Where:** src/components/ExamResourcesModal.tsx:125-190, src/app/dashboard/page.tsx:97-101
- **Verdict:** confirmed
- **Evidence:** The modal header reads 'Official Indicative Syllabus (Notice Para 14.1 - 14.3.7)' (125), followed by hand-written summaries such as '3. Surveying: Chain, compass, leveling, contouring, theodolite, total station, curves.' DECISION-003 requires the 2026 notice verbatim, with official and editorial nodes kept distinct; the /syllabus page implements that from syllabus_nodes.
- **Impact:** Learners get an app-made paraphrase presented as the official syllabus, in the same app that elsewhere promises to mark every editorial item.
- **Suggested fix:** Replace the modal's syllabus tab with a link to /syllabus, or render SyllabusTree from /api/syllabus/tree. If a summary is kept, label it 'App summary (editorial)' and cite the notice pages.

### R3-11 · medium · Exam/branch chosen in onboarding is stored but bank and /learn ignore it and always serve SSC JE Civil

- **Where:** src/lib/server/learning/service.ts:47; src/app/api/bank/papers/route.ts:6-20; src/app/learn/page.tsx:51; src/app/page.tsx:10; src/lib/server/repositories/preparation-context-repo.ts:133
- **Verdict:** partly
- **Corrected claim:** Chosen exam/branch is stored but bank and /learn ignore it and only serve SSC JE Civil, and the dashboard shows the chosen goal name while /learn and Home always say SSC JE Civil. It is an inconsistency, not silent, since Learn labels its content. deleteContext is unreachable (no DELETE route).
- **Evidence:** preparation_contexts in the DB: ssc-je/civil 8, ssc-je/electrical 3, gate/mechanical 3, ssc-cgl 4, other 3 (21 total). grep for contextId/activeContext in src/app/api/bank, src/lib/server/bank, src/lib/server/learning, src/app/papers and src/app/learn finds nothing; learning hard-filters exam==='SSC_JE' && branch==='CIVIL'. 'SSC JE · Civil Engineering' is hard-coded in learn/page.tsx:51 and page.tsx:10. PreparationContextRepository.deleteContext exists (line 133) with no DELETE route or UI.
- **Impact:** A learner who sets up SSC CGL, GATE or JE Electrical is silently given Civil PYQs and cannot delete the goal. The multi-exam onboarding and ExamFamilySelector promise something the content layer does not deliver.
- **Suggested fix:** Either restrict onboarding and the home 'Other preparation goals' to SSC JE Civil, or show an explicit 'no content for this goal yet' state. Add DELETE /api/contexts/[id] or remove the unused repository method.

### C-06 · medium · The home 'Other preparation goals' panel shows the marking scheme and tools twice, and its branch picker saves to a local store that only the legacy /exam label reads

- **Where:** src/app/page.tsx:18, src/components/ExamFamilySelector.tsx:31-42,61,121-137,149-165,168-184, src/app/exam/page.tsx:134-141, src/lib/storage/platform-store.ts:52-80
- **Verdict:** confirmed
- **Corrected claim:** Accurate. Severity split: the duplicate scheme/tools text is low polish. The branch picker being effectively inert (only relabels the legacy /exam badge, while the question set stays the same) is the medium part.
- **Evidence:** The highlights bar (121-137) shows 'Paper-I (Qualifying) … (+1 / −0.25)', 'Paper-II (Rank Deciding) … (+3 / −1.0)' and 'Tools in the test … Sci-Calc + IS 456 Data'. The green box directly below (168-184) repeats 'Paper-I is qualifying (+1 / −0.25, 200 Qs / 120 min) … Paper-II … (+3 / −1.0 …) … calculator and IS 456 / Steam Tables'. The heading says 'Choose your exam and branch' (61), but handleSelectExam (31) is never called (ESLint no-unused-vars) and only SSC JE is shown. The branch buttons call PlatformStore.setActiveStudentProfile, which writes localStorage under 'default'. Only the selector itself and the /exam intro badge ('Target: … (Mechanical)', 134-141) read it. The onboarding branch saves to the server's preparation_contexts instead, and /learn and /papers ignore both.
- **Impact:** The same facts appear twice in one card. Choosing 'Mechanical' looks like it changes the target, but nothing in Learn or Tests changes. This is a third, disconnected place that stores exam and branch.
- **Suggested fix:** Remove the panel or reduce it to one link to the official notice. If branch choice matters, save it through the server goal and remove the PlatformStore profile.

### R1-07 · low · The AI tutor charges again on every retry when the model returns insufficient_evidence or conflict, and there is no per-user limit

- **Where:** src/lib/server/learning/tutor.ts:32, src/lib/server/learning/tutor.ts:37-56
- **Verdict:** confirmed
- **Evidence:** SpendRepository.add() runs (line 50) before selectPassages() (line 51), which throws 422 for any status other than "supported". The learning_ai_notes insert (line 53) only happens on success, so there is no negative cache. The flights map is cleared in finally (line 55). The LLM-error path (lines 46-48) also records spend and caches nothing. The cacheKey includes userId (line 32), so identical extractive guides are paid for once per user. The only limit is the global daily cap, checked without a reservation (known issue 2). This is separate from that race.
- **Impact:** Each click on "Find study help with AI" for a question the model judges unsupported is a new paid call, repeatable without limit by one learner up to the global daily budget. It is latent today only because no question currently has sources (R1-06).
- **Suggested fix:** Use SpendRepository.reserve/settle as bank/explain.ts does. Cache failure outcomes (insufficient_evidence/conflict) per cacheKey with a TTL. Drop userId from the cache key, since the output is extractive, shared content. Add a per-user daily request cap. Record a "conflict" verdict as a review signal rather than discarding it.

### R1-09 · low · Legacy passwordless accounts are stranded: the register error promises an admin recovery that does not exist

- **Where:** src/lib/server/repositories/user-repo.ts:40, src/lib/server/repositories/user-repo.ts:61, src/lib/server/db.ts:49, scripts/test-context-scenarios.mjs:18
- **Verdict:** partly
- **Corrected claim:** Legacy passwordless accounts, including 'saurabh' with 1 document and 2 imported questions, cannot be recovered through any tool. Duplicate passwordless fixture rows from test-context-scenarios.mjs block registration of those names but do not create login ambiguity.
- **Evidence:** register() throws "Ownership must be recovered by the local administrator", but no script or route sets password_hash, and authenticate() refuses a null password_hash. On the DB copy, 13 of 16 users are passwordless. The legacy `saurabh` row owns 1 study document and 2 imported questions. normalized_name has only a non-unique index (db.ts:49). There are 3 rows each for "saurabh sharma" and "rahul verma" (test_user_* fixtures written to the real DB by scripts/test-context-scenarios.mjs, which opens data/score_recovery.db directly).
- **Impact:** The user's early data cannot be reached from any account. Leftover fixture rows are ambiguous for authenticate(), which picks one with LIMIT 1.
- **Suggested fix:** Add scripts/claim-legacy-user.mjs, run locally with explicit confirmation and a backup, that sets a password on or re-parents one named legacy id. Delete test fixtures from the real DB after a backup and add a UNIQUE index on normalized_name. Point every test script at a temp SCORE_RECOVERY_DATA_DIR.

### R1-10 · low · repair-crop-hashes.mjs checks less than the importer does: it accepts ocr_chars=0 and does not tie a crop to the row's content

- **Where:** scripts/repair-crop-hashes.mjs:8-9, scripts/repair-crop-hashes.mjs:22-25, scripts/repair-crop-hashes.mjs:41, src/lib/server/bank/import-pyp.ts:483-488
- **Verdict:** confirmed
- **Evidence:** The script accepts `typeof proof.ocr_chars === "number"`, which includes 0. The importer requires `ocr_chars > 0` and comments that an empty OCR read means the key-label check was skipped. The current manifest has 2 entries with status ok and ocr_chars 0. The script backfills clean_sha256 from whatever crop now sits at visual_path, without re-import or checking the row's stem/options (crop-verify.ts warns that positions shift). The DB path honours SCORE_RECOVERY_DATA_DIR but the manifest and crop roots are cwd-relative. It prints a hard-coded `answersAndAttemptsChanged: 0`. On the plus side, it never touches original_crop_ok or original_sha256, verifies both file hashes, and uses optimistic `WHERE metadata = ?` updates with a backup. I cross-checked the 100 rows in output/crop-hashes-backup-1790706524417.json: the manifest's detected tick matched the stored ssc_response_sheet key 100/100, so the run that was applied looks consistent. docs/reported-controls-fixes.md says it checked "the existing verifier's OCR check", but the code only checks the type.
- **Impact:** A future run could mark as verified a key-free crop that never passed the OCR label check, or bind a shifted crop to the wrong question. The learner would then see it before answering.
- **Suggested fix:** Export and reuse import-pyp's verifiedCleanCrop() instead of duplicating it. Add the tick-vs-evidence cross-check (manifest `key` mapped to an option id must equal the SSC evidence answer) as a hard requirement. Resolve all roots from one base directory.

### R1-11 · low · GET /api/learn writes shared syllabus content with a self-asserted "verified" status on every request

- **Where:** src/app/api/learn/route.ts:14, src/lib/server/learning/starter-content.ts:13-22, src/lib/server/learning/tutor.ts:26
- **Verdict:** confirmed
- **Evidence:** Every GET (overview, ?session, ?syllabus, ?node) calls seedLearningReferences(). On first run it inserts a theory note with verificationStatus "verified" and three formulas marked "verified", with an editorial uses_formula link. The "checked against OpenStax" claim is a code comment by the coding agent, with no reviewer or verified_by record. This is the only verified theory note in the DB, and the tutor trusts any `t.verification_status='verified'` note as teaching evidence.
- **Impact:** The provenance of "verified" content becomes "an agent said so", which weakens the official-vs-editorial rules in DECISION-003. A read endpoint also has write side effects and runs 5 extra queries per request.
- **Suggested fix:** Move the seed into scripts/ (idempotent, run explicitly). Insert as unverified until a human confirms, and record verified_by and verified_at. Keep GET handlers read-only.

### R1-12 · low · Learning tables and profile/password columns are missing from migrations/, and learning FKs would block user deletion

- **Where:** src/lib/server/learning/schema.ts:6, src/lib/server/learning/schema.ts:19, src/lib/server/learning/schema.ts:29, src/lib/server/db.ts:25, src/lib/server/db.ts:353-360, scripts/test-context-scenarios.mjs:324
- **Verdict:** confirmed
- **Evidence:** migrations/0001–0007 contain no learning_* tables, exam_profiles.gender or users.password_hash (grep returns nothing). They exist only as inline DDL. learning_sessions, learning_events and learning_exposures reference users(id) without ON DELETE, while foreign_keys=ON (db.ts:25). Other per-user tables use ON DELETE CASCADE. test-context-scenarios.mjs:324 runs `DELETE FROM users` on the real DB.
- **Impact:** The documented schema no longer matches the real one. Any user deletion (tests or a future account-removal flow) fails with an FK error once that user has learning rows.
- **Suggested fix:** Add migrations/0008_learning.sql mirroring migrateLearning, plus the gender and password_hash ALTERs. Decide the cascade policy explicitly: CASCADE for learning rows, and keep llm_spend FK-free as it is today.

### R1-13 · low · Onboarding saves target departments the learner never chose and ignores save failures; stored profile fields other than category are unused

- **Where:** src/components/OnboardingModal.tsx:129-139, src/app/api/contexts/[id]/profile/route.ts:44, src/app/api/contexts/[id]/target/route.ts:26-27
- **Verdict:** confirmed
- **Evidence:** OnboardingModal POSTs `targetPosts: ["CPWD", "MES", "CWC"]` unconditionally and never checks res.ok. The profile route replaces a missing category with "UR" (`body.category || "UR"`), and the repo always overwrites category. The target calculation reads only `profile?.category`. target_posts, pwbd and ex-serviceman are stored but used by nothing (grep for target_posts finds only the repo, the route and the two modals).
- **Impact:** The profile modal opens with three departments pre-ticked that the learner never chose. A validation failure during onboarding is silent. Collected eligibility data has no effect on targets.
- **Suggested fix:** Send `targetPosts: []` (or the learner's selection) from onboarding and surface errors. Make category required on POST, or keep the existing value. Either use the posts/PwBD/ESM fields in target and cutoff selection or stop collecting them.

### R1-K3 · low · Known issue 3, refined: the current sw.js does not intercept scripts or APIs, so the ERR_FAILED most likely came from an earlier registered worker; there is no kill switch

- **Where:** public/sw.js:2, public/sw.js:20-28, src/components/InstallAppButton.tsx:8-9
- **Verdict:** confirmed
- **Evidence:** The fetch handler returns early for non-GET, cross-origin and /api/ requests. It calls respondWith only for navigations (network first, offline.html on failure) and for three public assets fetched without a query string. Script requests are never intercepted, so this file cannot by itself cause script net::ERR_FAILED. CACHE_NAME "v2" implies an earlier version existed; that is an inference, since there is no git history. The worker never caches authenticated HTML, /api/bank/assets or learning responses, so requirement (g) passes. It is registered on every secure origin, including localhost dev servers, and there is no unregister path.
- **Impact:** A bad worker version can keep breaking a browser profile until someone unregisters it by hand.
- **Suggested fix:** Register only when NODE_ENV==='production' and the origin is not localhost. Ship a kill-switch sw.js (install → self.registration.unregister() and clear caches) that you can deploy when needed. Document the manual unregister steps.

### R2-05 · low · Progress card shows two identical accuracy rows until a question is repeated

- **Where:** src/components/LearningProgress.tsx:40-41,62
- **Verdict:** confirmed
- **Evidence:** Line 40 renders 'New questions answered without help' = accuracy(newCorrect,newAttempts). Line 41 renders 'All answers without help' = accuracy(correct,independent). Line 62 itself says new-question results are part of 'All answers without help'. Until a learner answers a question for a second time, independent === newAttempts and correct === newCorrect.
- **Impact:** For a new learner every section card shows the same '50% correct · 1/2' twice with different labels, which looks like two different metrics.
- **Suggested fix:** Render the 'All answers without help' row only when g.independent > g.newAttempts, or show one row with a sub-note such as 'includes N repeats'.

### R2-08 · low · Smaller same-screen duplicate controls (recovery-lab, library document, onboarding)

- **Where:** src/app/recovery-lab/page.tsx:189,374,385, src/app/library/[id]/page.tsx:218-233, src/components/GeneratePracticePanel.tsx:303-319, src/components/OnboardingModal.tsx:195-203,216
- **Verdict:** confirmed
- **Evidence:** /recovery-lab bank mode: 'Start practice →' (189) and 'Drill this filtered set' (385) both call openDrill() on the same drillPool. In drill mode 'Back to questions' (189) and '← Back to questions' (374) are both visible. /library/[id]: 'Start Practice (N)' and 'Review (N)' (218-233) and, in the GeneratePracticePanel on the same page after a run, 'Start practice' and 'Review flagged (N)' (303-319) point to the same /practice and /review routes. Onboarding step 'track': the ✕ 'Close setup' (195-203) and '← Back to app' (216) both call dismiss().
- **Impact:** Redundant buttons with different wording make the learner wonder whether they do different things.
- **Suggested fix:** Recovery-lab: keep 'Drill this filtered set' (it states the scope) and the aside 'Back to questions'. Library: keep the document-level links and show only run counts in the panel. Onboarding: keep ✕ and drop '← Back to app'.

### R2-21 · low · No calculator in untimed practice, although the docs say it is in the Menu

- **Where:** src/components/bank/BankRunner.tsx:358,628, src/components/SiteHeader.tsx:47-63, src/components/FloatingCalculator.tsx, docs/ui-simplification.md:5-6
- **Verdict:** confirmed
- **Evidence:** docs/ui-simplification.md:6 says 'The calculator remains available on demand from Menu'. The drawer (SiteHeader:47-63) has no calculator, and FloatingCalculator is imported nowhere. BankRunner shows the calculator only `!isPractice` (358,628), and /learn has none. The SSC exam provides an on-screen scientific calculator (NoticeHighlights:22).
- **Impact:** Learners practise Civil numericals without the tool they will have in the exam, and the ChatGPT write-up describes a feature that is not there.
- **Suggested fix:** Show the ScientificCalculatorWidget toggle in BankRunner practice mode and in the /learn question view. Either restore a Menu entry or correct the doc.

### R3-09 · low · Learning signals are collected but never analysed or shown (confidence, cause, group status, inventory)

- **Where:** src/app/learn/page.tsx:118,120; src/lib/learning/policy.ts:77; src/components/LearningProgress.tsx; src/lib/server/learning/service.ts:89
- **Verdict:** confirmed
- **Corrected claim:** Accurate as a product gap; both inputs are optional, and status is used by the planner (policy.ts:68) though not displayed. It is an enhancement opportunity, so low.
- **Evidence:** The 'How sure are you?' select stores learning_events.confidence, but policy.ts has no reference to confidence and LearningProgress.tsx does not display it. 'Why was this hard?' stores cause; its only use is policy.ts:77 (activity label 'Remember and use' when cause === 'formula'); no per-cause breakdown is shown and Recent answers omits it. overview() returns inventory.{papers,questions,heldOut,explanations,fineMappings} and policy.{version,note}; the UI reads only inventory.eligible/reserved as booleans and never policy. LearningGroup.status is used only in the focus dropdown, not on the progress cards. learning_events currently has 0 rows.
- **Impact:** The learner is asked two extra questions per item and gets nothing back. The most useful analyses for raising an SSC JE score (confident-but-wrong, dominant mistake cause, 'guessing costs marks here' from the negative-marking break-even already computed in ScoreBreakdown.tsx:19) are absent from /learn.
- **Suggested fix:** Add to LearningProgress: top mistake causes, count of 'Sure but wrong', per-group status badge, and reuse the break-even rule to advise attempt or skip. Otherwise remove the optional inputs.

### R3-12 · low · About 2,000 lines of unreferenced UI, orphan pages and a second adaptive engine

- **Where:** src/components/{AdaptivePolicyCard,DashboardHero,TodaysFocus,ScoreTrend,PatternInsightCard,RecurringWeaknessesSummary,QuestionStrategyCard,WhyTargetModal,FloatingCalculator,LegacyTestbookLab}.tsx; src/lib/storage/platform-store.ts:133; src/lib/domain/learning-policy.ts; src/lib/isro-jpa/importer.ts; src/lib/isro-jpa/run-import.ts
- **Verdict:** confirmed
- **Corrected claim:** Accurate; additionally the docs claim of an on-demand calculator in Menu is not reflected in SiteHeader.tsx.
- **Evidence:** Import-graph grep finds zero importers for those 10 components: 121+339+152+125+92+145+159+242+177 = 1,552 lines, plus LegacyTestbookLab 513 lines (docs/navigation-and-source-review.md says 'retained, not routed'). /dashboard/weaknesses is linked only from the orphan RecurringWeaknessesSummary, so it is unreachable; /dashboard/topics is reachable only when the legacy localStorage ledger has open entries (dashboard/page.tsx:79-85). PlatformStore.getAdaptiveRecommendations (platform-store.ts:133) has no caller; its only consumer would be the orphan AdaptivePolicyCard, so src/lib/domain/learning-policy.ts is a second engine next to the live src/lib/learning/policy.ts. isro-jpa importer.ts and run-import.ts are imported by nothing, have no package.json script and perform no DB write.
- **Impact:** Maintenance and confusion cost: the two agents cannot tell which adaptive logic is live, and dead components still hard-code cutoff numbers (WhyTargetModal).
- **Suggested fix:** Delete or move to an archive folder the orphan components and the domain adaptive engine, or wire them deliberately. Add an unused-export check (knip or ts-prune) to lint.

### C-07 · low · /learn Study material shows two links to /library on one screen, promising topic material that uploads never create

- **Where:** src/app/learn/page.tsx:71,143, src/lib/server/jobs/processing-queue.ts:65-110, src/lib/server/learning/starter-content.ts:14-22, scripts/seed-syllabus.mjs:46, src/lib/server/repositories/syllabus-repo.ts:590-600
- **Verdict:** confirmed
- **Corrected claim:** Accurate with one qualifier: the two /library links coexist only after selecting a topic that has no formulas or theory notes (in practice nearly all of the 215 nodes), not on the tab's initial view. Uploaded documents do appear in /library but are never attached to syllabus topics.
- **Evidence:** Line 71 'My study documents →' and line 143 'You can add your study notes in My documents.' plus 'Add study material →' both link to /library. They appear together when a leaf topic has no material, which is almost every topic (the DB has 2 theory notes and 3 formulas). Uploads go through processing-queue into QuestionRepository as practice questions. theory_notes and formulas are written only by starter-content.ts and scripts/seed-syllabus.mjs, and no code links study_documents to syllabus nodes. This extends R3-06, which noted there is no way to add material but not the misleading prompt to do so.
- **Impact:** A learner uploads notes expecting them to appear under that topic; they never do, and the same destination is offered twice with different labels.
- **Suggested fix:** Keep one link and describe it truthfully, e.g. 'Upload notes to generate practice questions'. Alternatively, build document-to-node linking with the same verification labels as theory notes.

## Shared (both touched these files): open findings

### R2-10 · high · /results and /repair cannot find signed-in users' reports, so 'View result' and post-test redirects land on 'not found'

- **Where:** src/app/results/[attemptId]/page.tsx:16,23-31, src/app/repair/[attemptId]/page.tsx:25,144,153, src/lib/storage.ts:28-40,190-208, src/app/dashboard/page.tsx:28-31,81, src/app/exam/page.tsx:79-80,112, src/app/library/[id]/practice/page.tsx:258-259,288
- **Verdict:** confirmed
- **Evidence:** Reports are saved under the server user id (saveReport(report, currentUser.id, activeContext.id): exam 80, library practice 259) and listed by the dashboard the same way (dashboard 30). /results and /repair call getReport(params.attemptId) with no userId. That falls back to getActiveUserId(), which reads localStorage 'src.active_user.v2'; grep shows nothing in src writes that key any more, so it returns 'default'. The fallback scan only checks keys starting with `src.reports.v2.default`. Repair also calls getLedger()/saveLedger(updated) with no user (144,153). The /dashboard/topics page likewise reads PlatformStore under 'default' and seeds non-Civil concepts (percentage, profit-loss, Ohm's law) when empty (platform-store.ts:83-97).
- **Impact:** Inferred from code, with one exception: an account whose id happens to equal a stale 'src.active_user.v2' value on an old browser would still work. Otherwise the dashboard's own 'View result →' link, the /exam finish redirect and library-practice finish all show 'We couldn't find that attempt on this device', and the repair drill never opens. Repair and topic data land in a device-wide 'default' bucket shared by every account, against the per-user rule.
- **Suggested fix:** Pass currentUser.id and activeContext.id into getReport, getLedger and saveLedger on /results and /repair, and into PlatformStore on /exam and /dashboard/topics. Remove the silent 'default' fallback for signed-in sessions. Remove the fabricated baseline concepts from listStudentConceptStates.

### R1-04 · medium · Learning eligibility re-implements the bank's presentable and crop-verification rules and differs from them

- **Where:** src/lib/server/learning/service.ts:34-44, src/lib/server/bank/presentable.ts:17-28, src/lib/server/bank/crop-verify.ts:56-62
- **Verdict:** confirmed
- **Evidence:** eligibility() accepts a figure/OCR question when `q.metadata.clean_crop===q.visualPath` and the file exists (lines 40-41). It never checks clean_sha256, whereas cleanCropVerified() requires the on-disk sha256 to match. For non-visual rows it accepts any text_quality except garbled/ocr (e.g. missing or "incomplete"), whereas presentable() needs text_layer/bilingual_en and exactly 4 non-empty options. In the other direction, I ran the rules on a copy of the DB: 1,931 ("text") + 187 ("garbled") questions that the bank scores and can present through a verified clean crop are held out of /learn. That is 2,118 of 7,200. 4,509 are learning-eligible. Today 0 rows fall into the too-permissive gap. Before the 29-Sep hash repair, 100 P2-2024-11-06 rows had clean_crop set but no clean_sha256, so they were in it.
- **Impact:** (a) A regenerated crop can pass eligibility while toQuestionForAttempt returns imageUrl null, so a figure question is scored without its figure. (b) About 29% of the bank is invisible to the learning loop without the learner being told why.
- **Suggested fix:** Build eligibility on the bank's own predicates: `isScored && !dissent.length && presentable(q) && (!imageLed(q) || cleanCropVerified(q))`. Export one learnReady() from bank/presentable.ts (Claude-owned) so the two cannot drift. Include image-only-option questions once /learn renders image-led questions (R1-05).

### R1-08 · medium · Anyone who can reach the server can register, and login is not throttled, so hosting the PWA would make the private bank public

- **Where:** src/app/api/auth/register/route.ts:7-17, src/lib/server/repositories/user-repo.ts:24-54, src/app/api/auth/login/route.ts:6-18, src/lib/server/password.ts:4, src/lib/server/password.ts:28, src/lib/server/repositories/bank-repo.ts:326-328
- **Verdict:** partly
- **Corrected claim:** Registration is open and login is unthrottled; register itself reveals which names exist; sync scrypt can stall the event loop. The docs warn that access controls are needed before hosting, but no gate exists in code, so any reachable deployment would expose the shared bank to anyone who registers.
- **Evidence:** register() accepts any new name with an 8+ character password. There is no invite, allowlist or env gate. listPapers() returns every shared paper (`owner_user_id = ''`) to any authenticated user. login has no attempt counter or delay. verifyPassword uses synchronous scryptSync (N=16384), which blocks the event loop on each attempt against an existing name. Unknown names return immediately, which leaks via timing which names exist. ChatGPT's own docs/learning-implementation.md:75 lists login rate limits as not done, and docs/mobile-pwa.md tells the user to host behind HTTPS for phone use.
- **Impact:** Following the PWA hosting instructions as written makes the whole personal-use bank readable by anyone who registers. That breaks the rule that the bank must never be public. Login can also be brute-forced and used to stall the server.
- **Suggested fix:** Before any non-localhost deployment: set REGISTRATION_MODE=closed|invite (with invite codes stored hashed), throttle per IP and per name (for example a login_attempts table with exponential backoff), switch to async crypto.scrypt, and run a dummy scrypt for unknown names. Treat this as a deployment gate in the PWA docs.

### R2-11 · medium · /syllabus is linked from nowhere; syllabus is implemented three times

- **Where:** src/components/SiteHeader.tsx:10-14, src/app/syllabus/page.tsx, src/app/learn/page.tsx:52,71,129-150, src/app/dashboard/page.tsx:97-101, src/components/ExamResourcesModal.tsx:122-125, docs/ui-simplification.md:5
- **Verdict:** confirmed
- **Evidence:** grep finds no href, router.push or redirect to '/syllabus' in src or public. PRIMARY lists only /learn, /papers and /dashboard, while docs/ui-simplification.md:5 says 'Main navigation: Learn, Papers, Syllabus'. Meanwhile /learn has its own SyllabusLibrary (a 'Study material' tab), which calls /api/learn?syllabus=1 and ?node= (the same SyllabusRepository as /api/syllabus/*) and renders formulas and notes but not PYP counts by paper and year, split and parent-link notes, or the scheme of examination. The dashboard 'Syllabus' button opens a third, hand-written syllabus (ExamResourcesModal:122 onwards).
- **Impact:** The Claude-built syllabus page (verbatim official text, editorial marking, PYP counts per node, 2025/2026 cycles) cannot be reached by a learner. Three syllabus views with different content and different truth guarantees compete.
- **Suggested fix:** Choose one syllabus experience. Either add 'Syllabus' to PRIMARY, or make the /learn 'Study material' tab render the /syllabus components (SyllabusTree plus NodeDetail, with the formula block added). Point the dashboard 'Syllabus' button at /syllabus and delete the ExamResourcesModal syllabus tab.

### R2-12 · medium · No links from a question to its topic, or from a topic to practice

- **Where:** src/components/bank/ReviewQuestion.tsx:70, src/app/papers/attempts/[attemptId]/page.tsx:72, src/components/syllabus/NodeDetail.tsx:102-125, src/app/learn/page.tsx:1-10,119,143, src/lib/server/learning/service.ts:60-72
- **Verdict:** confirmed
- **Evidence:** The backend has 4,700 verified question_concepts rows, and learning groups are keyed `${paper}:${nodeId}` (service.ts:72). However BankReviewQuestion and BankQuestionForAttempt carry only `section` (ReviewQuestion shows `{question.section} · Q{n}`, 70). The review page's only onward link is '← All tests' (72). NodeDetail shows 'Previous-year questions linked: N' with no action (102-125). /learn imports no useSearchParams, so no page can deep-link to a topic or group. Learn feedback says 'Review the relevant concept…' (service.ts:114) with no link, and 'Open study material' opens the whole tree unfocused.
- **Impact:** After a wrong answer the learner cannot jump to that topic's notes or practise similar questions. From the syllabus they cannot practise a topic. The core 'find the weak topic, fix it, practise it' loop is not connected.
- **Suggested fix:** Return the primary verified node {id,name} per question in check/review payloads and show it as a chip linking to /syllabus?node=…. Make /learn accept ?group=P2:<nodeId> (and ?tab=progress) to start or pre-select practice. Add a 'Practise these questions' button in NodeDetail and a 'Practise my wrong topics' action on the paper review.

### R2-17 · medium · Backend features with no UI; AI buttons ignore AI availability; dead components and an orphan route

- **Where:** src/components/bank/api.ts:118, src/app/api/bank/ai-status/route.ts, src/app/api/bank/papers/[id]/explain/route.ts:12-31, src/app/api/testbook/explain/route.ts:49, src/app/api/cutoffs/route.ts:4, src/components/RecurringWeaknessesSummary.tsx:118, src/app/dashboard/weaknesses/page.tsx
- **Verdict:** confirmed
- **Evidence:** getAiStatus() is defined (api.ts:118) but has no caller, so 'Explain with AI' (BankRunner:750), 'Get an AI explanation' (ReviewQuestion:192) and 'Find study help with AI' (learn:123) always show and fail only after the click. POST /api/bank/papers/[id]/explain starts a server-wide paid run with only requireUser (14,30) and has no UI; if registration is open, any account can start it (inferred). /api/testbook/explain is called only by LegacyTestbookLab, which is not routed. /api/cutoffs is unauthenticated and unused (the dashboard deliberately hides targets). Ten components are imported nowhere: AdaptivePolicyCard, DashboardHero, FloatingCalculator, LegacyTestbookLab, PatternInsightCard, QuestionStrategyCard, RecurringWeaknessesSummary, ScoreTrend, TodaysFocus and WhyTargetModal. /dashboard/weaknesses is linked only from the unused RecurringWeaknessesSummary.
- **Impact:** Learners click AI buttons that cannot work on this server. Paid backend capability exists without an owner-facing control or an admin gate. Dead code keeps stale links (to /exam) and conflicting copy in the repo, which misleads both agents.
- **Suggested fix:** Fetch ai-status once per page and hide or disable the AI buttons with the returned reason. Restrict the bulk explain route to an admin or owner, or give it an owner-only control on the paper card. Delete /api/testbook/explain, LegacyTestbookLab and the nine other unused components, plus /dashboard/weaknesses (or link it). Add a knip or unused-exports check to CI.

### R2-18 · medium · Full papers have no pause, show a misleading header label, and cannot be resumed from the test list

- **Where:** src/components/EndTestDialog.tsx:26-30, src/components/SiteHeader.tsx:78-81, src/components/bank/BankRunner.tsx:71, src/app/papers/page.tsx:276,331-341, src/lib/server/bank/attempts.ts:70-98
- **Verdict:** confirmed
- **Evidence:** BankRunner declares attempt mode 'exam' (71), so the header hides the Menu and shows 'One question at a time' (SiteHeader:81), even for a 200-question timed paper with a palette. EndTestDialog offers only 'End & return to menu', 'End & view results' and 'Continue test'; there is no save-and-exit. PaperCard shows only the last submitted attempt (276), and every 'Full paper', 'Section-wise' or 'Practice' click creates a new attempt (startAttempt → createAttempt, 70-98). Unfinished attempts appear only under 'My past tests' → 'Unfinished tests'.
- **Impact:** A learner who needs to stop an untimed 200-question practice paper must either submit it or use the logo as an escape hatch. When they come back through 'Find a test' they silently start a fresh attempt and leave orphaned unfinished ones. Those also count as exposure for /learn scheduling (service.ts:55).
- **Suggested fix:** Add 'Save & leave' to EndTestDialog for untimed and practice modes (responses already autosave). Show 'Continue (Q n/200)' on the PaperCard when an unsubmitted attempt exists, or reuse it in startAttempt. Change the exam-mode header text to 'Test in progress'.

### R2-19 · medium · Hindi mode shows English on the same screens

- **Where:** src/app/learn/page.tsx:1-151, src/app/papers/page.tsx:143-160, src/components/bank/BankRunner.tsx:399,446,448,457,468,715, src/components/bank/ReviewQuestion.tsx:72,203, src/components/UserProfileModal.tsx:40-71, src/components/OnboardingModal.tsx:183-190, src/app/layout.tsx:53, src/app/dashboard/topics/page.tsx:41
- **Verdict:** confirmed
- **Evidence:** /learn (the manifest start_url) never calls useLang, so it is entirely English while the header drawer beside it switches to Hindi (SiteHeader:44-61). In /papers past view the h1 'टेस्ट' and tabs are Hindi but lines 143-160 are English literals. BankRunner has English-only 'Questions · …' (399), 'Enlarge question' (446), 'Close image' (448), the image-loading notices (457) and 'Read the numbered options…' (468). ReviewQuestion shows the raw enum `{question.outcome}` (72) next to filters labelled 'Not scored' or 'स्कोर नहीं'. The sign-in and onboarding modals are English-only. Some translations mean something else: 'Not quite' → 'बिल्कुल नहीं' ('not at all', BankRunner:715), 'Check a disputed answer →' → 'इस प्रश्न को हल करें' (ReviewQuestion:203), 'Back to my progress' → 'डैशबोर्ड पर वापस जाएँ' (topics:41). <html lang> is fixed to 'en' (layout:53).
- **Impact:** Hindi-medium learners get mixed-language screens, and the main learning screen (/learn) is not bilingual at all.
- **Suggested fix:** Move /learn, LearningProgress, the modals and the remaining BankRunner and past-view strings to t(). Map outcome enums to translated labels. Fix the three mistranslations. Set document.documentElement.lang from LanguageProvider. Add a lint rule for raw JSX text in learner routes.

### R3-01 · medium · "My progress" shows only browser-local legacy data; none of the server-side progress reaches it

- **Where:** src/app/dashboard/page.tsx:6,25-30; src/lib/storage.ts:1; src/app/exam/page.tsx:79-81; src/app/library/[id]/practice/page.tsx:258-260
- **Verdict:** confirmed
- **Corrected claim:** Accurate as stated; downgrade to medium because the page discloses that it shows only device-local practice results and links to /papers?view=past and /learn where the server-side progress lives.
- **Evidence:** dashboard/page.tsx imports getLedger/listAttempts/listReports from '@/lib/storage' (a 'use client' module reading window.localStorage) and the file contains no fetch. The only writers of those stores are the legacy /exam diagnostic (generic SSC-CGL-style content, exam.ts:11 examPatternVersion 'SSC-CGL-Tier1-2025') and library practice on uploaded documents. Server data is never read here: bank_attempts has 8 rows and BankAttemptStub.score/maxScore/priorExposure come back from /api/bank/papers, and /api/learn returns groups/due/retention, but neither is used. The page's own copy says results are 'saved on this device, not all your mock tests' (dashboard/page.tsx:71).
- **Impact:** The nav item 'My progress' (SiteHeader.tsx:13) opens a page that says 'No results saved here yet' for a learner who has done papers or learn sessions. Real progress is scattered over four places: /dashboard, /papers?view=past, /learn Practice results, /recovery-lab. 'Completed' and 'Last score' mix generic /exam and uploaded-document runs with nothing from the SSC JE bank. This is the main missing 'analyse the learner and raise the score' surface.
- **Suggested fix:** Make the dashboard server-backed: call /api/learn (overview) and /api/bank/papers (attempts) and show score trend across submitted bank attempts, per-part accuracy, reviews due, negative marks lost and priorExposure-flagged attempts. Retire the localStorage ledger, or label it clearly as a legacy diagnostic.

### R3-02 · medium · /learn never uses the bank's explanation pipeline, and bank commitment ignores /learn answers

- **Where:** src/lib/server/learning/service.ts:112-113,198-206; src/lib/server/learning/tutor.ts:26-30; src/lib/server/bank/commitment.ts:13-24; src/lib/server/bank/explain.ts:582; src/app/learn/page.tsx:121,123
- **Verdict:** confirmed
- **Corrected claim:** Accurate; only the file path is src/lib/server/bank/content-fp.ts (not src/lib/bank). Severity medium: /learn scoring works, the gap is missing explanations and a button that dead-ends with a clear 422 message. Note bank_explanations is 0 mainly because no AI key is configured, so wiring alone would not yet produce content.
- **Evidence:** LearningFeedback carries only sourceSolution and a fixed explanationNotice (service.ts:112-113); nothing under src/lib/server/learning or src/app/learn references explainForLearner, BankRepository.getExplanation or BankExplanation. learnerCommitted (commitment.ts:17) checks only bank attempts (checked or submitted), so a /learn answer cannot unlock POST /api/bank/questions/[id]/explain (403) or dispute resolution. The separate tutor (tutor.ts:26) joins theory_notes to question_concepts with review_status='verified' on both sides. In the DB that join returns 0 rows (verified tags exist only on part nodes; the one verified note sits on a topic node), and source_solution is empty for 7,200/7,200 questions, so tutor.ts:30 throws HTTP 422 for every question. Learn also computes its own fingerprint (service.ts:22) distinct from bank/content-fp.ts contentFingerprint.
- **Impact:** After every /learn answer the learner reads 'No full explanation is available...' (service.ts:113), and the button 'Find study help with AI' (learn/page.tsx:123) always dead-ends. bank_explanations is 0 rows, so the product goal of explaining every wrong option has produced nothing reachable on the main learning screen, even though the blind-solve-gated pipeline and the ExplanationBlock component (ReviewQuestion.tsx:249) exist.
- **Suggested fix:** Attach a fresh bank explanation (explanationFor(BankRepository.getExplanation(q.id), key)) to /learn feedback after check and render ExplanationBlock. Make learnerCommitted also accept a checked learning item for that question's contentFingerprint. Drop the tutor path, which also has the known spend race, and point the 'explain' button at /api/bank/questions/[id]/explain, whose spend is reserved atomically. Then run the paper batch (scripts/explain-bank.mjs) once a key is configured.

### R3-04 · medium · 17,428 syllabus tags exist but only 4,700 coarse ones are usable; no reviewer path, no topic focus, no tag shown on questions

- **Where:** src/lib/server/learning/service.ts:60,72,89; src/lib/server/repositories/syllabus-repo.ts:462-541,804-812; src/lib/bank/api-types.ts (no concept field); src/app/api/learn/route.ts
- **Verdict:** partly
- **Corrected claim:** Real capability gap: only 4,700 coarse verified part tags feed /learn (5 focus areas, one of them 'Unlabelled section'); 10,228 chapter/subject/topic tags are ai_suggested/needs_review with no verify/reject path and no UI (no topic filter, no tag on questions). Correction: /learn's Study material view does show questionCounts.total; only the by-year/by-origin breakdown is /syllabus-only. Severity medium: no wrong truth is shown, but topic-level weakness analysis is impossible.
- **Evidence:** question_concepts: part/source/verified 4,700; part/editorial/needs_review 2,500; chapter/subject/topic ai_suggested/needs_review 10,228 rows over 3,684 questions. Learn's mapping query takes only review_status='verified' (service.ts:60), so groups are paper x part: 5 focus areas in total, and 2,500 P1 questions fall to the raw section string 'Unlabelled section' (service.ts:72 name = m ? m.name : q.section; DB grouping gives P1|Unlabelled section|2500). 'fineMappings' is computed (service.ts:89) but no UI reads it. No bank/paper/review type carries a concept or topic; /papers has no topic filter; the dashboard does not use tags. The only writers of question_concepts are importQuestionConcepts / tagPaperLevel via scripts/import-question-concepts.mjs and seed-syllabus.mjs; there is no route or page to verify or reject a tag. Syllabus counts (questionCounts) appear only on the unlinked /syllabus page.
- **Impact:** The learner cannot see, filter or practise by topic, and weak topics can never be identified: 'Practice results' can only say Civil vs GA vs Reasoning. The tags that would drive score improvement (topic level) are invisible, and nothing lets the owner promote them.
- **Suggested fix:** Add a small tag-review queue (question text, suggested node, accept/reject writing review_status='verified'; accepted tags update learn groups automatically). Spot-check and promote the 2,500 editorial part tags so 'Unlabelled section' disappears. Add a 'Practise this topic' action on the syllabus node that starts /learn with that node as group, and show the primary topic on review questions.

### R3-05 · medium · /syllabus page and /api/syllabus/* are orphaned; /learn has a second, thinner syllabus browser; a third hard-coded copy contradicts part naming

- **Where:** src/components/SiteHeader.tsx:10-14; docs/ui-simplification.md:5; src/app/learn/page.tsx:129-151; src/app/api/learn/route.ts:16-21; src/components/ExamResourcesModal.tsx:132,145,158; src/components/syllabus/NoticeHighlights.tsx
- **Verdict:** confirmed
- **Corrected claim:** Accurate. Add: NoticeHighlights' hard-coded text is guarded by a notice-hash check, so the fix is 'drive from exam_scheme_rows' rather than 'it is unchecked'.
- **Evidence:** No href/push/redirect anywhere targets '/syllabus' (grep over src, public, scripts). SiteHeader PRIMARY lists only Learn, Tests, My progress, while docs/ui-simplification.md:5 states 'Main navigation: Learn, Papers, Syllabus'. /syllabus (page + SyllabusTree + NodeDetail + Badges, about 560 lines) is the only caller of /api/syllabus/tree and /api/syllabus/nodes/[id]. /learn re-implements the browser in SyllabusLibrary (learn/page.tsx:129) over /api/learn?syllabus=1 and ?node=, and drops workedExamples, questionCounts.byPaperYear/byOrigin, exam scheme and review badges that NodeDetail renders. ExamResourcesModal's syllabus tab is a third hard-coded copy labelling GI&R 'Part A', GA 'Part B', Civil 'Part C', while exam_scheme_rows/bank/learn use the notice's naming ('Part-A General Engineering (Civil & Structural)'). NoticeHighlights hard-codes the notice summary although 4 exam_scheme_rows with citations sit in the DB.
- **Impact:** The learner sees two syllabus UIs with different capabilities and one page that cannot be reached; the same fact (which part is 'Part A') differs across screens.
- **Suggested fix:** Pick one syllabus surface. Preferably reuse NodeDetail inside the /learn Study material tab (or add 'Syllabus' to the header) and delete the duplicate; drive NoticeHighlights and ExamResourcesModal from exam_scheme_rows instead of hard-coded text.

### R3-07 · medium · No way to report a wrong key, garbled question or bad explanation on the bank or /learn screens; feedback backend cannot accept bank questions

- **Where:** src/app/api/feedback/route.ts:47; src/lib/server/repositories/feedback-repo.ts:22-58; src/components/FeedbackButton.tsx:45; src/components/ReportIssueButton.tsx:45; src/app/library/[id]/practice/page.tsx:327,455
- **Verdict:** confirmed
- **Corrected claim:** Accurate; the endpoint rejects bank question ids, but a generic message without questionId would still save. No triage UI exists.
- **Evidence:** Report/feedback controls are mounted only in library practice (FeedbackButton) and the legacy runners SscExamRunner.tsx:381 and ExamRunner.tsx:236 (ReportIssueButton). grep for report/feedback/flag in components/bank/*.tsx and app/learn/page.tsx finds none. /api/feedback validates questionId via QuestionRepository.findById (imported_questions), so a bank_questions id would return 404. FeedbackRepository exposes only create(); no route or page reads product_feedback (0 rows).
- **Impact:** For 7,200 bank questions (324 with no key, 2,500 unlabelled, some garbled) the learner has no way to tell the owner that an item is wrong, and even a wired button would fail. Learner reports are the only human signal the truth model can use besides its own dispute flow.
- **Suggested fix:** Accept bankQuestionId + content fingerprint in /api/feedback, add 'Report this question' to ReviewQuestion, BankRunner check result and /learn feedback, and add an owner-only triage list.

### R3-10 · medium · Paper attempts and the learning loop are disconnected: no 'practise my mistakes' path from a mock to /learn

- **Where:** src/lib/server/learning/service.ts:52-59,72; src/app/papers/attempts/[attemptId]/page.tsx; src/app/dashboard/page.tsx
- **Verdict:** confirmed
- **Corrected claim:** Accurate: no path from a mock's wrong/unattempted answers into the spaced-review queue and no link from the attempt review to /learn (a mock only marks questions 'exposed'). Design gap rather than defect.
- **Evidence:** inventory() reads bank attempts only to mark questions 'exposed' (service.ts:55-57), which affects the held-out check set. It creates no learning_events and no review dates for wrong or unattempted answers, so plan() (policy.ts:56-) never prioritises them. grep for '/learn' under src/app/papers returns no link; the review page and ScoreBreakdown end at question cards. /learn links back to papers only through a no-questions message.
- **Impact:** After a full mock with 30 wrong answers the learner sees the result and must start an unrelated 'Start learning' session; the app never turns the mock's mistakes into a spaced-review queue, the core loop for score recovery.
- **Suggested fix:** On submit (or on demand) enqueue wrong and unattempted scored questions as due items in the learning schedule (marked as repeated, not as a fresh independent check), and add a 'Practise these mistakes' button to the attempt review that opens /learn with that queue.

### R3-17 · medium · Third-party Made Easy answers and explanations are shipped in a public client bundle, outside the bank's auth and personal-use protections

- **Where:** src/app/recovery-lab/page.tsx:1-14; src/lib/madeeasy.ts:1-27; src/lib/madeeasy-import.json (118 correctOption entries, explanation field); src/lib/exam.ts:1-20
- **Verdict:** partly
- **Corrected claim:** Third-party Made Easy answers and explanations are bundled into the client JS of /recovery-lab with no server-side gate, which matters if the app is ever hosted beyond localhost. Correction: this is a review of the user's own past attempts and a different provider from the bank's Testbook mocks, so it does not breach the commit-before-key rule, and it is a latent (hosting-dependent) rather than current exposure.
- **Evidence:** recovery-lab/page.tsx is a 'use client' page importing lib/madeeasy.ts, which imports the whole 4,112-line JSON including correctOption and explanation per question. There is no middleware.ts or proxy.ts (find over the repo excluding node_modules), so page chunks are served without login. The legacy /exam bundle likewise includes correctOptionId for its own generic question set (content/*.ts). The papers page links to it as 'Made Easy: 4 saved tests' (papers/page.tsx:147). The same mock content already has a protected route through the bank (Testbook import, papers?kind=mock).
- **Impact:** If the app is ever reachable beyond the owner, this content is downloadable without an account, contradicting 'the bank must never be exposed publicly'; it also duplicates the bank's mock path with weaker rules (keys visible before the learner answers in bank mode).
- **Suggested fix:** Move the Made Easy data behind an authenticated API (or into the bank as owner-scoped papers) and remove the JSON from the client bundle; keep the recovery-lab UI as a view of that API.

### C-02 · medium · The exam's 'Useful Data' (IS 456 / steam tables) is only in the legacy /exam runner; the real /papers tests and /learn don't have it, though the home page says tests do

- **Where:** src/components/UsefulDataModal.tsx, src/components/SscExamRunner.tsx:7,280-282,493, src/components/bank/BankRunner.tsx:19,358,628, src/components/ExamFamilySelector.tsx:135-136,179, src/app/exam/page.tsx:159, src/lib/ssc-je/config.ts:30-31, src/components/syllabus/NoticeHighlights.tsx:22
- **Verdict:** confirmed
- **Corrected claim:** Accurate as stated. Refinement: the on-screen calculator IS present in /papers mock mode (BankRunner.tsx:358, 628), hidden only in practice mode. The missing piece is the IS 456 / Steam Tables 'Useful Data' modal, which exists only in the legacy /exam diagnostic. The home claim sits inside the collapsed 'Other preparation goals' details (page.tsx:18).
- **Evidence:** UsefulDataModal is imported only by SscExamRunner (7, 493), the runner for the legacy /exam diagnostic (which is SSC CGL content, per R2-15). BankRunner imports only ScientificCalculatorWidget (19) and shows only a 'Calculator' button (358, 628). learn/page.tsx has neither tool. The app's own config says 'IS 456:2000 Code of Practice and Steam Tables available on console under "Useful Data"' (config.ts:31). The home panel says 'Tools in the test … Sci-Calc + IS 456 Data' and 'On-screen scientific calculator and IS 456 / Steam Tables are provided directly inside the test runner console' (ExamFamilySelector.tsx:136,179). The checked notice summary says 'reference tables where required' (NoticeHighlights.tsx:22).
- **Impact:** Full Paper-II Civil papers in /papers can't be practised the way the exam runs them: learners can't look up IS 456 values, and the home page promises a tool the real test doesn't have. The only runner that has it serves the wrong exam content.
- **Suggested fix:** Extract one shared ExamTools component (calculator + Useful Data). Mount it in BankRunner for full and section modes (optionally practice too) and for numerical questions in /learn. Until then, correct the home-page copy.

### C-03 · medium · 'Change goal' always creates a new goal, there is no way to switch back, and Library and My progress silently hide everything saved under other goals

- **Where:** src/app/dashboard/page.tsx:26-31,106, src/components/OnboardingModal.tsx:91,118-126, src/lib/user-context.tsx:168-195, src/app/api/contexts/route.ts:63, src/lib/server/repositories/preparation-context-repo.ts:48, src/app/library/page.tsx:47-50,437-443, src/lib/server/repositories/document-repo.ts:100-106, src/lib/storage.ts:128-141
- **Verdict:** confirmed
- **Corrected claim:** 'Change goal' (dashboard) and the Library 'Target ▾' chip always create and activate a new preparation context, even when the same exam and branch are chosen again. There is no general UI to list or switch back to earlier goals. switchContext is reachable only through the Library branch-mismatch banner, which is an edge case. My progress and Library then show only data for the new goal. Library says 'No materials uploaded yet', and the dashboard shows only a generic 'for your account and study goal' empty state. The old attempts, reports, ledger and documents are still stored but cannot be reached.
- **Evidence:** Dashboard 'Change goal' (106) opens OnboardingModal, which only ever calls createContext (91, 118). It never lists or reuses existing goals. POST /api/contexts defaults `setAsActive: setAsActive ?? true` (route.ts:63), and the repo sets every other goal inactive (repo:48). switchContext/allContexts are used only in the branch-mismatch banners on library/page.tsx:437-443 and library/[id]/page.tsx:166-172. /library fetches `/api/documents?contextId=<active>` (47-50), and the repo filters `WHERE user_id = ? AND preparation_context_id = ?`, which excludes documents with NULL or another goal. The dashboard reads `listAttempts(uid, cid)`, which keeps only `a.contextId === cid`. /learn and /papers ignore goals completely. DB (read-only): all 3 study_documents have preparation_context_id NULL. Account 'Claude Generation Test' (usr_182dc89e25104214) has 1 active goal, so its only document never appears in its own /library.
- **Impact:** After one tap of 'Change goal', a learner's uploaded documents and saved practice results disappear and nothing in the app brings them back. Goal scoping also differs by section: Library and My progress use it, Learn and Tests do not.
- **Suggested fix:** For this single-exam app, drop goal scoping from library and progress: show everything, tagged with its goal. Otherwise add a visible goal switcher (Menu or dashboard), let 'Change goal' pick or edit an existing goal, and show items with no goal under every goal.

### C-08 · medium · 'Continue test' on a timed attempt whose time has run out submits it immediately

- **Where:** src/app/papers/page.tsx:158-160, src/components/bank/BankRunner.tsx:276-296, src/lib/bank/api-types.ts:21-30, src/lib/server/bank/attempts.ts:175
- **Verdict:** partly
- **Corrected claim:** On /papers?view=past, a timed (full or section) bank attempt whose time has run out is still listed under 'Unfinished tests' with a 'Continue test →' link (src/app/papers/page.tsx:57, 158-161). Opening it mounts BankRunner with timeLeft=0, and after about 1s it auto-submits and redirects to the result with no explanation (BankRunner.tsx:277-297). Submitting is the intended server policy: autosave is refused past the deadline, and submit scores only the answers autosaved in time. So no answers are lost and the score is correct. The defect is the label and the missing 'time is up' notice. It does not affect the /exam 'Continue test', which instead restarts the full timer.
- **Evidence:** The 'My past tests' view lists every attempt with `!attempt.submittedAt` under 'Unfinished tests', each with a 'Continue test →' link (158-160). BankAttemptStub has no durationSeconds or expiry, so the list can't tell that a full or section attempt has expired. When the attempt opens, BankRunner sets timeLeft to `Math.max(0, attempt.durationSeconds - elapsedAlready)`. At 0, the interval's `prev <= 1` branch calls doSubmit() within about a second and routes to the review. The server already rejects autosave past the deadline with 409 'Time is up for this attempt'.
- **Impact:** A learner who left a full paper yesterday taps 'Continue test' and lands on a submitted result with no warning. The attempt is finalised using only what was autosaved.
- **Suggested fix:** Add durationSeconds or expiresAt to BankAttemptStub. Show expired attempts as 'Time over — submit to see result' with an explicit confirm instead of 'Continue test'.

### R1-K4 · low · Known issue 4, refined: two scripts call the removed findOrCreateByName, and the isolation test would write fixtures to the real DB

- **Where:** scripts/test-data-isolation-v2.mjs:17-18, scripts/test-scenarios.mjs:19-27
- **Verdict:** partly
- **Corrected claim:** Three scripts call the removed UserRepository.findOrCreateByName: test-data-isolation-v2.mjs, test-scenarios.mjs and test-question-generation.mjs:389-390. The first two would write fixtures to the real DB once fixed.
- **Evidence:** Both scripts call UserRepository.findOrCreateByName, which no longer exists in user-repo.ts. test-data-isolation-v2.mjs does not set SCORE_RECOVERY_DATA_DIR, so once fixed it would use data/score_recovery.db (getDatabase's default). test-learning.mjs and test-profile-controls.mjs correctly use mkdtemp.
- **Impact:** The isolation regression suite is not running. Fixing it naively would write fixture users into the learner's database, as test-context-scenarios already has (R1-09).
- **Suggested fix:** Port both scripts to register() on a temp SCORE_RECOVERY_DATA_DIR and add them to one test runner.

### R2-07 · low · Several end/submit controls in the test runners, plus a question counter shown twice on mobile

- **Where:** src/components/bank/BankRunner.tsx:350,359,399,561,577,620, src/components/SscExamRunner.tsx:262,486
- **Verdict:** confirmed
- **Evidence:** BankRunner: 'End test' in the top bar (359), 'Submit now' under the desktop palette (577), and 'Submit' replacing Next on the last question (561, mobile 620). All three open the same EndTestDialog, so on desktop at the last question all three are visible. 'Q{index+1}/{n}' in the top bar (350) is repeated by the mobile palette summary 'Questions · {index+1} / {n}' (399, lg:hidden). SscExamRunner has 'End test' (262, finalizes via EndTestDialog) and 'Submit Test' (486, opens ReviewSummaryScreen first), i.e. two different submit flows on one screen.
- **Impact:** Three differently labelled buttons do the same thing. In the legacy runner the two buttons behave differently, so which one the learner presses changes whether they see the summary screen.
- **Suggested fix:** Keep the top-bar 'End test' as the single finalize control and change the last-question button to 'Review & end' pointing to the same dialog. Drop 'Submit now'. In SscExamRunner route 'End test' through the summary screen as well. Remove the top-bar counter on mobile, since the palette summary already shows it.
- **Status:** The duplicate question counter on mobile is fixed. The three submit buttons remain.

### R2-20 · low · The same sections go by different names across screens

- **Where:** src/components/SiteHeader.tsx:12-13, src/app/page.tsx:15, src/app/papers/[id]/attempt/[attemptId]/page.tsx:53, src/app/papers/attempts/[attemptId]/page.tsx:58,72, src/app/dashboard/page.tsx:63,102, src/app/repair/[attemptId]/page.tsx:61, src/app/learn/page.tsx:52,60,63,71,139,143, src/components/LearningProgress.tsx:53-54, src/app/library/page.tsx:161
- **Verdict:** confirmed
- **Evidence:** Tests or papers: the nav and h1 say 'Tests', but home says 'Browse papers', the attempt error says 'Back to papers', review Hindi uses 'सभी पेपर' for 'All tests', the dashboard says 'Previous papers & mock tests', and the URL is /papers. Progress or dashboard: the nav says 'My progress', but repair says 'Go to dashboard'. Library: 'My study documents →' (learn:71), 'Add study material →' (learn:143) and 'My documents' (learn:143 text) all go to /library, whose h1 is 'My Library'. The tab label 'Study material' (52) is used for the syllabus, whose own h2 is 'Syllabus & study material' (139). The same group picker is 'Focus area' with 'Start learning →' on Today (60,63) but 'Choose a section' with 'Start practice →' on Practice results (LearningProgress:53-54). The same group is labelled 'P2 · X · status' in one and 'Paper 2 · X' in the other.
- **Impact:** Learners cannot tell whether 'Tests', 'papers' and 'mock tests', or 'study material' and 'documents', are the same place, which makes navigation feel scattered.
- **Suggested fix:** Settle on one name per section (e.g. Tests, My progress, Syllabus, My notes) and put the labels in a shared nav-labels constant used by the header, the pages and back links. Use learningSectionLabel() in both group pickers.

### R3-06 · low · Study-material capability is built for 165 topics but filled for one, with a one-sentence 'verified' extract and no way to add more

- **Where:** src/lib/server/learning/starter-content.ts:5-23; src/lib/server/repositories/syllabus-repo.ts:590,606; src/app/learn/page.tsx:143; src/app/api/learn/route.ts:14
- **Verdict:** partly
- **Corrected claim:** Study material exists for 1 of 165 topics (2 notes, 3 formulas, 0 worked examples) with no authoring path except formulas import; 49 (not 98) questions carry ai_suggested tags to that topic. Downgraded to low: it is a content gap with an honest empty state, and the repo deliberately avoids fabricating material.
- **Evidence:** DB: syllabus_nodes 215 (165 topics), theory_notes 2, formulas 3, worked_examples 0, syllabus_relations 3, all attached to 'simple-stress-and-strain-relationships'. The only verified theory note has body 'Therefore, strain is a dimensionless number.' (starter-content.ts:14) sourced from an OpenStax physics section. addTheoryNote and addWorkedExample have no callers outside starter-content.ts and tests; scripts/seed-syllabus.mjs imports formulas only. All other topics render 'Syllabus reference only... Add study material' (learn/page.tsx:143). 98 questions carry AI-suggested tags to that one topic (join theory_notes to question_concepts). GET /api/learn calls seedLearningReferences() on every request (route.ts:14), a DB write in a read route.
- **Impact:** 'Study material' is empty for 164 of 165 topics and the worked-example UI can never show anything. The one learner-visible 'verified' note is too thin to teach.
- **Suggested fix:** Add an authoring path (JSON import script like --formulas, for theory notes and worked examples with source locators). Verify the 98 stress/strain question tags so the tutor has something to select. Move the seeding out of the GET handler.

## Claude Code: open findings

### R3-03 · medium · AI status endpoint and paper-level explain batch have no UI; AI buttons appear although AI is not configured

- **Where:** src/components/bank/api.ts:118-120; src/app/api/bank/ai-status/route.ts:6; src/app/api/bank/papers/[id]/explain/route.ts:12-31; src/components/bank/ReviewQuestion.tsx:184-195; src/components/bank/BankRunner.tsx:694-700
- **Verdict:** confirmed
- **Corrected claim:** Accurate. Nuance: the batch-start permission is documented behavior of a shared-bank design, so the 'any signed-in account' point is a design risk in multi-user use, not a bug.
- **Evidence:** getAiStatus() is exported and never called. ReviewQuestion shows 'Get an AI explanation' for every scored question without an explanation (ReviewQuestion.tsx:184-192) and BankRunner has the same in practice mode. DEEPSEEK_API_KEY is empty in .env.local (0 non-empty matches), llm_spend has 0 rows, bank_explanations has 0 rows. The batch route POST /api/bank/papers/[id]/explain is called only by scripts; it needs only requireUser, so any signed-in account could start a server-wide paid run (24h cap applies).
- **Impact:** On this install every click on 'Get an AI explanation' ends in a 503 message after the click; the learner is offered something that cannot work. Disputes (which resolve.ts/ReviewQuestion.tsx:199 wire up) only arise from AI blind-solve dissent: the evidence table has no conflicting rows (0 questions with >1 distinct answer), so the dispute-resolution UI is dormant until the batch runs.
- **Suggested fix:** Call getAiStatus once (or inline the flag in the review payload) and hide or replace the AI button with 'not available on this server'. Decide who may start the batch: gate it behind an owner check or move it CLI-only, and show its progress somewhere (papers page) if it stays.

### R3-15 · low · Raw section labels leak to the learner: 8 spellings of 3 sections, an OCR typo, 'Unlabelled section'; topic columns are dead

- **Where:** src/lib/server/bank/import-pyp.ts:39,526-527; src/lib/server/learning/service.ts:72; bank_questions.topic / topic_evidence
- **Verdict:** partly
- **Corrected claim:** 9 raw spellings of 3 sections plus 'Unlabelled section' (2,500 questions) and one OCR typo ('Structura!'); bank views/review show them raw, while the /learn Practice-results screen partly normalises the Civil name.
- **Evidence:** bank_questions.section values include 'General Engineering', 'General Engineering Civil and Structural', 'General Engineering Civil and Structura!' (paper sscje-civil-p1-2020-10-30-1500), 'Part A General Engineering Civil & Structural', 'Unlabelled section' (2,500 questions across the 2018 papers and two 2020 papers). These strings are shown in the test section picker, review headers (ReviewQuestion.tsx: section · Qn) and /learn groups. bank_questions.topic is NULL and topic_evidence='pending' for 7,200/7,200 rows, superseded by question_concepts.
- **Impact:** Learners see inconsistent or broken section names, and per-section analytics (ScoreBreakdown) cannot compare the same section across papers.
- **Suggested fix:** Add a display-name map keyed by the verified part node and show it instead of the raw string. Drop or repurpose the pending topic columns.

### C-05 · low · A practice 'Check' returns the original SSC answer-sheet image, but the runner never shows it

- **Where:** src/lib/server/bank/attempts.ts:276, src/lib/bank/api-types.ts:247-248, src/components/bank/BankRunner.tsx:134,409-453,686-757
- **Verdict:** confirmed (checked by Claude Code)
- **Evidence:** check() returns `imageUrl: imageUrlFor(question, true)`: once the learner has committed and original_crop_ok is set, this is the original crop showing SSC's tick marks. The type documents it as 'The original crop, now that the question is committed'. BankRunner only renders `q.imageUrl` from the paper detail loaded before the answer, which is the clean crop, and CheckedResultPanel (686-757) never reads `result.imageUrl`. A grep finds no consumer anywhere in the front end.
- **Impact:** In untimed practice, after checking an answer, the learner can't see the printed SSC evidence behind the key. They see it only after submitting the whole attempt and opening the review. A built backend feature is invisible.
- **Suggested fix:** In CheckedResultPanel, when result.imageUrl differs from q.imageUrl, add a 'View SSC answer sheet' toggle that shows the original crop. The asset route already sends Cache-Control: no-store for originals.

## Unowned or legacy code: open findings

### R3-08 · medium · Target-score and cutoff backend is fully built and unwired; its cutoff seed is not traceable to documents

- **Where:** src/app/api/contexts/[id]/target/route.ts:9-63; src/app/api/cutoffs/route.ts:4; src/lib/server/repositories/historical-cutoff-repo.ts:54-127; src/components/WhyTargetModal.tsx:43-46; src/app/dashboard/page.tsx:107
- **Verdict:** confirmed
- **Corrected claim:** Accurate; title string is 'Staff Selection Commission Official Result Writeup (Paper-I)'. Risk is latent (unwired, and /api/cutoffs serves the unsourced 'verified' rows to unauthenticated callers).
- **Evidence:** No caller for /api/contexts/[id]/target or /api/cutoffs. The target GET upserts target_scores (3 rows) as a side effect, and /api/cutoffs performs no auth check. DashboardHero, WhyTargetModal, QuestionStrategyCard, ScoreTrend and TodaysFocus have zero importers. ensureSeeded writes 36 hand-typed cutoff rows with official_source_url = 'https://ssc.gov.in' (the site root), title 'Staff Selection Commission Official Result Writeup', verified=1. UR equals OBC in 2024 (122.93) and 2025 (127.23) for Civil and for Electrical, and Mechanical UR equals Electrical UR in every year. The dashboard states the target is 'hidden until we correct the cutoff figures' (dashboard/page.tsx:107), while WhyTargetModal.tsx:43-46 hard-codes 127.23 and 122.93 in prose.
- **Impact:** Keeping this unwired is currently right. The risk is re-wiring it: verified=1 plus a source title claiming 'Official' would present unsourced numbers as official. The collected candidate profile (7 exam_profiles: category, DOB, PwBD, target posts) currently changes nothing the learner can see. Inference: the equal UR/OBC values may be genuine or copied; nothing in the repo proves either.
- **Suggested fix:** Store per-row document URL + page + hash and set verified from that; keep the routes unwired until then. Once sourced, surface 'marks needed per part' on the dashboard from exam_scheme_rows and real bank attempts instead of a single hard-coded number.

### R3-13 · low · Leftover endpoints and repository methods with no consumer

- **Where:** src/app/api/users/route.ts:4-13; src/app/api/documents/[id]/status/route.ts:6; src/app/api/testbook/explain/route.ts:49; src/lib/server/repositories/user-repo.ts:78; src/lib/server/auth.ts:22; src/lib/server/bank/assets.ts:82; src/lib/server/repositories/question-repo.ts:139; src/lib/storage.ts:275
- **Verdict:** confirmed
- **Corrected claim:** Accurate; 'attack surface' is small because the routes are authenticated.
- **Evidence:** No caller for GET /api/users (superseded by /api/auth/me; POST returns 410), GET /api/documents/[id]/status (the library polls the list route), or POST /api/testbook/explain (only the unreferenced LegacyTestbookLab). An unused-export scan of src/lib finds no references to UserRepository.listAll, requireCurrentUser, cleanCropRegistered, QuestionRepository.listReadyForPractice, storage.resetAllData, disputeCountForQuestion, exam.retestQuestionFor and conceptRetestQuestions.
- **Impact:** Extra attack surface (/api/testbook/explain can trigger paid explanation calls) and drift; a user-data reset has no UI.
- **Suggested fix:** Remove unused routes and methods, or wire the ones that matter (a 'reset my data' control).

### R3-16 · low · Document-library path sends every answer key to the client and keeps results in localStorage (separate from the bank)

- **Where:** src/app/api/documents/[id]/route.ts:23-31; src/app/library/[id]/practice/page.tsx:44-47,150,258-260; src/app/library/[id]/page.tsx:64
- **Verdict:** confirmed
- **Corrected claim:** Accurate; owner-scoped uploads, so a design choice to document rather than a breach.
- **Evidence:** GET /api/documents/[id] returns all imported questions unfiltered (repository rows include correct_answer, explanation). The practice page scores in the browser from q.correct_answer, then saves attempt, report and ledger to localStorage. The library pages also send a stale 'x-user-id' header that the server ignores (auth is by session cookie).
- **Impact:** For the user's own uploads this is a design choice, but it is the opposite of the bank rule (no key before commitment) and its results feed the dashboard 'Completed' and 'Last score' figures (R3-01). Uploaded and AI-generated questions never reach /learn or /papers.
- **Suggested fix:** Decide explicitly whether library practice is exempt. If it is not, serve keys only via a check endpoint like the bank does. Remove the stale header.

## Improvements suggested by the reviewers

- **One shared question-readiness predicate owned by the bank:** Learning eligibility (service.ts:34-44), presentable.ts, cleanCropVerified and the /learn runner each encode presentation rules differently (R1-04, R1-05). 2,118 presentable questions are excluded from /learn, and the image-led contract is ignored there.
  - How: Export learnReady(q,key) and imageLed(q) from src/lib/server/bank/presentable.ts (Claude-owned). The learning loop consumes them. Add a unit test asserting learnReady implies presentable && isScored.
- **Item-level void state instead of session-level dead ends:** R1-01 and R1-02 both come from having no per-item escape when evidence or content changes.
  - How: Add learning_items.voided_at and void_reason. sessionView and checkItem void the item instead of throwing, advance skips voided items, and the overview offers "Discard session" whenever activeSessionId is set.
- **Server-computed capability flags in the session DTO:** The UI shows actions the server can never fulfil (R1-06): 0 source solutions and 0 verified tutor sources today.
  - How: Add help {source, tutor, study} and imageLed to LearningSessionView, and render controls only from these flags so backend readiness and the UI stay linked.
- **Re-score learning history when keys change:** Events keep correctness from superseded keys (R1-03). 188 eligible questions depend on a single publisher key and could flip when SSC response sheets are imported.
  - How: Store key_answer and content_fp on learning_events. At read time, mark events whose fp/answer no longer match the current resolved key as superseded, exclude them from status and due counts, and show "N earlier answers were re-marked after a key correction".
- **Put every paid model call behind reserve/settle, per-user caps and shared extractive caches:** The tutor and generator use check-then-bill (K2), and the tutor re-bills on failures (R1-07). bank/explain.ts already has the correct pattern.
  - How: Extract a paidCall(userId, model, worstCaseUsd, fn) helper around SpendRepository.reserve/settle. Add a per-user daily cap. Cache tutor results and negative outcomes by content version only, not userId.
- **Deployment gate for auth and CSRF:** Open registration plus an unthrottled synchronous-scrypt login exposes the bank if hosted (R1-08). Only /api/learn checks Origin. The profile/register/login/logout POSTs rely only on SameSite=Lax.
  - How: Add a sameOriginOrThrow(req) helper applied to all mutating routes, a REGISTRATION_MODE env gate, a login_attempts throttle, and async scrypt. List these as preconditions in docs/mobile-pwa.md.
- **Cache the learning inventory per bank version:** Every overview GET re-parses and re-hashes all 7,200 questions, resolves all keys, runs existsSync on crops, runs plan() per group (each calling summarize over all events), and runs the seeder. sessionView loads all events to find one.
  - How: Memoize inventory keyed by (userId, max bank_questions rowid/updated marker, evidence count, attempts count). Compute practiceReadyGroupIds in one pass. Query the single event by id in sessionView.
- **Provenance fields for verified teaching content:** The only verified theory note and formulas were marked verified by agent code (R1-11), and the tutor trusts that flag as evidence.
  - How: Add verified_by and verified_at to theory_notes and formulas. Have the tutor require a human verifier, and seed only through reviewed scripts.
- **One progress model instead of three stores:** /dashboard reads localStorage, /learn reads learning_events and /papers reads bank_attempts (R2-09), so no screen answers 'am I improving?', which is the stated product goal.
  - How: Add GET /api/progress to aggregate the learning overview (due, per-section independent accuracy, retention) and bank attempts (score trend per paper type, marks lost to wrong answers). Render it on /dashboard and link each tile to its detail. Freeze the legacy localStorage results as read-only 'Older results on this device'.
- **Close the weak-topic → study → practise loop:** The 4,700 verified question_concepts rows and the `${paper}:${nodeId}` learning groups already exist server-side, but no screen uses them per question (R2-12).
  - How: Include {nodeId,nodeName} in check and review payloads. Add ?group= and ?tab= support to /learn and ?node= to /syllabus. On the paper review, add 'Practise my wrong topics', which starts a /learn session filtered to those groups.
- **A single <KeyProvenance> component for every surface that shows answers:** BankRunner, ReviewQuestion and /learn each render key status, basis and dissent differently, and the disputed case lists sources twice (R2-03).
  - How: One component takes BankKeyView plus unavailable and outcome, prints one status line, and shows dissent only when it differs from basis, with each source's chosen option. Unit-test it against resolveAnswerKey fixtures (official, corroborated, disputed human-vs-human, human-vs-AI, dropped, no_key).
- **Put Syllabus in the main navigation and keep one implementation:** /syllabus is orphaned while /learn and the dashboard modal carry weaker copies (R2-11, R2-16).
  - How: PRIMARY becomes Learn · Tests · Syllabus · My progress (four fit in the drawer). Have /learn's 'Study material' tab embed SyllabusTree and NodeDetail, with the formula rendering moved into NodeDetail. Delete SyllabusLibrary and the ExamResourcesModal syllabus tab.
- **Retire or quarantine the legacy flows:** /exam, /results, /repair, /recovery-lab, /dashboard/topics, the onboarding multi-exam flow and ExamFamilySelector contradict the SSC JE Civil bank flow, are partly broken (R2-10, R2-15), and bundle private data (R2-14).
  - How: Migrate Made Easy into the bank as the owner's private mock paper, remove every link to /exam, and delete the unused components. Keep a single 'Legacy' disclosure under My progress until the data is migrated, then delete the routes.
- **Gate AI buttons on availability and on having a real source:** The AI buttons appear even when AI is not configured, and the /learn tutor can only echo the portal solution (R2-04, R2-17).
  - How: Call /api/bank/ai-status once in a context provider. Have the learn session view return tutorAvailable when at least one verified theory note is linked. Hide or disable the buttons with the server's reason, which also removes paid calls that produce nothing new.
- **Automated navigation and duplication checks:** Orphans (/syllabus, /dashboard/weaknesses), wrong query params (the import link) and stale docs (the 'Syllabus' and calculator claims) went unnoticed because nothing checks the link graph.
  - How: Add a script that enumerates src/app/**/page.tsx, greps href, router.push and redirect targets, and fails CI on unreachable routes or unknown query keys. Add knip to catch unused components. Add a Playwright smoke test per primary route that asserts no heading text repeats within <main>.
- **A bilingual lint gate for learner routes:** /learn and several bank strings bypass t(), producing mixed-language screens (R2-19).
  - How: Enable an eslint rule such as react/jsx-no-literals scoped to src/app/{learn,papers,syllabus,dashboard} and src/components/bank. Keep a small allow-list (units, option letters). Set <html lang> from LanguageProvider.
- **One server-backed progress view:** Progress is split across localStorage (/dashboard), bank attempts (/papers?view=past), learning events (/learn) and static Made Easy data; the nav item 'My progress' shows none of the server data (R3-01).
  - How: Add one read endpoint (or compose /api/learn + /api/bank/papers) and render score trend per submitted bank attempt, per-part accuracy, reviews due and repeat-attempt flags on /dashboard; retire or clearly label the localStorage ledger.
- **Tag-review queue and topic-level focus:** The learner-facing groups are 5 coarse buckets because only 4,700 part-level tags are verified; 10,228 topic/chapter/subject suggestions and 2,500 editorial part tags sit unreviewed with no UI (R3-04).
  - How: Build a small owner-only page (question, suggested node, accept/reject) that flips question_concepts.review_status; spot-check the 2,500 'Unlabelled section' papers first; add 'Practise this topic' from the syllabus node into /learn.
- **One explanation pipeline and one notion of 'committed':** Bank explanations are gated by a blind solve and bank commitment; /learn has a separate, always-failing tutor and a different content fingerprint (R3-02).
  - How: Expose BankRepository.getExplanation + explainForLearner in /learn feedback, make commitment.ts count checked learning items, retire tutor.ts (which also carries the spend race), then run the paper batch once a key is configured.
- **Close the mistake loop from mocks into spaced review:** A full mock's wrong and unattempted answers never become review items; the loop that raises scores is broken at its first step (R3-10).
  - How: On submit or on a 'Practise my mistakes' click, enqueue wrong/unattempted scored questions into the learning schedule and link the attempt review to /learn with that queue.
- **Question-level problem reporting with an owner triage list:** With 324 unkeyed, 2,500 unlabelled and some garbled questions, learner reports are the only human check, and today they cannot be submitted on bank or learn screens (R3-07).
  - How: Extend /api/feedback with bankQuestionId + content fingerprint; add the button to ReviewQuestion, BankRunner check result and /learn feedback; add an owner-only list that can also flip a question to unscored.
- **Turn the recorded confidence and cause into insight:** Both are asked on every /learn item and unused; the negative-marking break-even logic already exists in ScoreBreakdown (R3-09).
  - How: Show 'Sure but wrong', top mistake causes and per-group status on Practice results, and advise attempt-vs-skip per part using the break-even rule.
- **Consolidate syllabus and exam-scheme facts on the DB:** The same syllabus/scheme exists as DB rows, a hard-coded modal, an in-memory 'brain' and hard-coded notice text, with conflicting Part A/B/C naming (R3-05).
  - How: Render NodeDetail inside /learn, delete SyllabusLibrary and the ExamResourcesModal syllabus tab, and feed NoticeHighlights from exam_scheme_rows plus the notice hash.
- **Evidence ledger for cutoffs before any target UI:** 36 seeded cutoffs are marked verified with only the SSC home page as source; the target feature is built but correctly hidden (R3-08).
  - How: Add document URL, page and hash per row and derive verified from them; then show 'marks needed per part' on the dashboard from exam_scheme_rows and real attempts.
- **Put a real quality gate on the repo:** `eslint src` reports 12 errors (e.g. i18n.tsx:19, dashboard/topics/page.tsx:19, library/page.tsx:69, ExamRunner.tsx:85). package.json has no `test` script, and none of the ~20 scripts/test-*.mjs suites is wired in. ChatGPT's docs report 'targeted lint' only. That is how a broken isolation test (known #4) and test data in the live DB went unnoticed. tsc passes.
  - How: Add `npm test` that runs the isolated suites and refuses to start unless SCORE_RECOVERY_DATA_DIR points somewhere other than data/, and change test-context-scenarios.mjs:18 to use it. Make lint green or scope it explicitly, and run both before either agent reports work as done.
- **One shared question-presentation component:** BankRunner, ReviewQuestion and the /learn runner each render a question differently: C-01 (duplicate and garbled text) and R1-05 (/learn ignores the image-led rule).
  - How: Extract a <QuestionView> that owns imageLed(), the image-load gating, printed-number labels and hiding text by quality, and use it in all three places.
- **Single source for exam facts:** Notice dates, scheme, marking and tools are hand-written in ExamFamilySelector, SscJeNotificationExplorer (1,360 lines), ExamResourcesModal, NoticeHighlights and ssc-je/config.ts. Only NoticeHighlights is tied to the checked notice's SHA-256, and C-02 shows the copies already promise tools the runner lacks.
  - How: Render all of these from the verified syllabus-source-ssc-je-2026.json scheme and notice records, and delete the duplicated prose.
- **Decide the goal model once:** Learn and Tests ignore goals, while Library and My progress filter by them without saying so (C-03). The exam and branch are stored in three places (C-06, R3-11).
  - How: For an SSC JE Civil-only product, drop per-goal filtering and keep a single server profile. If several goals are really needed, add a visible switcher and make every section respect the active goal.
- **Retire or migrate the localStorage-era screens:** /exam, /results, /repair, /dashboard/topics, /dashboard/weaknesses, the recovery-lab drill and PlatformStore account for R2-09, R2-10, R2-15 and C-04. Every one of them depends on the always-'default' getActiveUserId.
  - How: Move anything worth keeping into server tables keyed by user_id, then remove these routes or put them behind one 'Legacy' link. Build 'My progress' from learning_events plus bank_attempts.
- **A test that every route and response field has a front-end consumer:** Backend work keeps landing without a UI: ai-status, paper-level explain, target/cutoffs (R3), the check result's imageUrl (C-05), the exam-profile-changed event with no listener, and claimedLegacyProfile, which is always false.
  - How: Add a small script that lists the app/api routes and selected DTO fields, greps src/app and src/components for callers, and fails CI on a new unused endpoint unless it is allow-listed with a reason.
- **Exam-tools parity in every runner:** Real papers need the calculator and IS 456 lookups, but BankRunner has only the calculator in timed modes and /learn has neither (C-02, R2-21).
  - How: Mount a shared ExamTools component in BankRunner (all modes) and in /learn for questions tagged numerical. Keep it hidden in 'Test without help' mode if that mode is meant to simulate exam conditions exactly.
- **Tidy the live DB's accounts (with the user's approval, after a backup):** The DB has 10 test accounts from earlier runs (test_user_*, *_1789921403616, '* Candidate'). The owner's own 'saurabh' account has no password and holds a study document it can no longer reach (R1-09).
  - How: Write an admin script with a dry-run default. It should back up data/score_recovery.db, list the test accounts and their rows, remove them only after explicit confirmation, and let the owner set a password on their own legacy account after verifying ownership locally.

## Route to caller table (wiring reviewer)

Read-only pass over all 34 API route handlers, every front-end fetch site, src/lib/server/**, the DB (copied to scratchpad, counts only) and the component import graph. No front-end call targets a missing endpoint and no dead links were found; the gaps run the other way. The backend has an evidence-gated bank, syllabus tags, explanation pipeline, target/cutoff code and a learning loop. The screens the learner actually uses reach only part of it: the "My progress" page reads only browser localStorage, /learn never uses the bank explanation pipeline, and 12,728 of the 17,428 syllabus tags are hidden with no way to review them. DB state: bank_questions 7200, bank_attempts 8, learning_events/items/sessions 0, bank_explanations 0, llm_spend 0, source_solution non-empty 0, worked_examples 0, theory_notes 2, formulas 3, DEEPSEEK_API_KEY not set in .env.local, so the AI paths have never run here. Refinement of known item (1): the /learn "source" action is latent on current data because 0 of 7,200 questions carry a source_solution; it goes live once Testbook imports with solutions land, and service.ts:198-206 serves the solution before the answer, marking it "assisted", which conflicts with the DECISION-002 rule.

ROUTE -> CALLER TABLE (file:line of fetch or wrapper)
auth/login POST: user-context.tsx:125 | auth/logout POST: user-context.tsx:148 | auth/me GET: user-context.tsx:99 | auth/register POST: user-context.tsx:136
bank/ai-status GET: NONE (wrapper components/bank/api.ts:118 has zero callers)
bank/assets/[...path] GET: only via <img src=imageUrl> (BankRunner.tsx:444, ReviewQuestion.tsx, learn/page.tsx:116)
bank/attempts POST: papers/page.tsx:85,115 | bank/attempts/[id] GET: papers/[id]/attempt/[attemptId]/page.tsx:26; PUT: BankRunner.tsx:170
bank/attempts/[id]/check POST: BankRunner.tsx:231,250 | .../review GET: papers/attempts/[attemptId]/page.tsx:24 | .../submit POST: BankRunner.tsx:267
bank/import/testbook POST: recovery-lab/testbook/import/page.tsx:32,90 (+ dead LegacyTestbookLab.tsx:226)
bank/papers GET: papers/page.tsx:42 | bank/papers/[id] GET: papers/page.tsx:104 and attempt page:26
bank/papers/[id]/explain POST+GET: NONE (only scripts/explain-bank.mjs and scripts/test-bank-explain.mjs)
bank/questions/[id]/explain POST: BankRunner.tsx:698, ReviewQuestion.tsx:43 | bank/questions/[id]/resolve POST: ReviewQuestion.tsx:56
contexts GET+POST: user-context.tsx:81,181 | contexts/[id]/active POST: user-context.tsx:159
contexts/[id]/profile GET: ExamProfileModal.tsx:48; POST: ExamProfileModal.tsx:84, OnboardingModal.tsx:129
contexts/[id]/target GET: NONE | cutoffs GET: NONE | users GET: NONE (POST returns 410)
documents GET+POST: library/page.tsx:51,105 | documents/[id] GET: library/[id]/page.tsx:63, review/page.tsx:62, practice/page.tsx:112; DELETE: library/page.tsx:144
documents/[id]/status GET: NONE (library polls the list route instead, library/page.tsx:78-82)
documents/[id]/generate GET+POST: GeneratePracticePanel.tsx:72,118 | documents/[id]/crop/[cropName] GET: <img> library/[id]/review/page.tsx:233, practice/page.tsx:499
feedback POST: FeedbackButton.tsx:45, ReportIssueButton.tsx:45
learn GET+POST: learn/page.tsx:19,103 (all actions start/save/check/next/cause/source/tutor/study/finish and GET ?session/?node/?syllabus are called)
questions/[id]/review PATCH: library/[id]/review/page.tsx:105
syllabus/tree GET: syllabus/api.ts:29 -> /syllabus page (no inbound link anywhere) | syllabus/nodes/[id] GET: syllabus/api.ts:33 -> NodeDetail.tsx:22 (same page)
testbook/explain POST: only LegacyTestbookLab.tsx:218, a component nothing imports, so effectively NONE.
