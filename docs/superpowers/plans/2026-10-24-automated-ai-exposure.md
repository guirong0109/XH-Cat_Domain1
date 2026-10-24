# Plan: automated, role-specific AI-exposure (24 Oct 2026)

DRAFT. Nothing here is built. Wait for the user's approval before building.
Rules from the user (24 Oct): (1) no hard-coded exposure, it follows live signals; (2) use the Semantic Scholar, Hugging Face Hub, Anthropic Economic Index and arXiv APIs; (3) exposure is specific to each role and to the AI skills that role needs, so two roles must not give the same output; (4) an admin backend monitors every source (fetch failures, server down) and prepares fallbacks.
Brief: "Hard-coded lists alone do not count"; "keeps learning as the technology moves"; output "visibly changes when the trend data changes"; every recommendation cites a source; do not invent statistics.

## What I checked today (read-only, from the user's PC, 24 Oct 2026)

| Source | Result | Use |
|---|---|---|
| Anthropic Economic Index (Hugging Face dataset, licence MIT on the dataset card) | Works through Node `fetch`. `labor_market_impacts/job_exposure.csv`: 757 US occupations (SOC code, title, observed_exposure). `task_penetration.csv`: about 18,000 O*NET task texts with a penetration value. New releases appear as new folders (latest `release_2026_06_26`), so a tree listing detects updates. | The measured per-occupation and per-task AI use. Core of rule 3. |
| Hugging Face Hub API | `/api/daily_papers` and `/api/models?sort=trendingScore` answer without a key (Node). | "AI is advancing here" signal: trending model tags and paper titles per skill topic. |
| Semantic Scholar | `/paper/search` returned 429 (shared pool); `/paper/search/bulk` answered with a `total` count. | Paper counts per skill term (backup for OpenAlex). Use the bulk endpoint, retry on 429 and 500. |
| arXiv API | Simple query answers (`totalResults`). Earlier phrase plus date-range queries gave HTTP 500. | Paper counts and new-paper titles; test date ranges, else count by submittedDate sort. |
| curl vs Node | curl failed on some Hugging Face URLs on this PC; Node `fetch` works. | All fetchers in Node. |

## Design

1. **Source layer** `server/sources/`: one small module per source (`anthropicIndex.js`, `huggingface.js`, `semanticScholar.js`, `arxiv.js`; OpenAlex stays). Each: 8 s timeout, 2 retries with back-off, polite delay, User-Agent without email, atomic write, single in-flight, keeps the last good data, never overwrites with a failed fetch. A registry file lists every source with its URL, purpose, fallback and limits.
2. **Exposure engine** (no hand-written labels):
   - Match each eMASCO task to the closest O*NET task text with the local bge-m3 (CPU). The match cut-off is measured on a small judged sample, not guessed.
   - Role exposure = penetration of its matched tasks (plus the occupation-level observed_exposure as a cross-check). The role's top exposed tasks become "use AI for this"; tasks with no or low penetration become "keep human".
   - Skill exposure = the penetration of the tasks nearest to each skill. "AI skill this role needs" = the role's skills whose tasks are AI-used, plus the trending AI topics (Hugging Face, Semantic Scholar, arXiv) that match those skills.
   - Because it is computed from each role's own tasks, roles differ. A test fails if two roles in the 20 give identical exposure output.
3. **Live trend layer**: weekly paper counts per skill from Semantic Scholar and arXiv (OpenAlex too) and Hugging Face trending feed the "rising or declining" view, with source and date. Whether it also moves the score (Fast vs Moderate AI) needs the user's approval, because the scoring spec is fixed.
4. **Admin monitor** (extends `/admin`, local only): a Sources panel per source with status ok / degraded / down, last success, last attempt, HTTP status, latency, consecutive failures, rate-limit hits, data age, and a one-click test. A run log entry for every fetch. Fallback rules: OpenAlex and Semantic Scholar back each other up; the app keeps the last good data and shows an "older data" badge with its date; the admin sees the failure. Checks only report; they never change saved data.
5. **Schedule**: add the new fetchers to the existing weekly refresh (`scripts/refresh-data.mjs`, GitHub Actions). The matching step needs the model, so it runs on the PC (admin button or command), not on the runner; the weekly job fetches and flags "new Anthropic release, re-match needed".
6. **What stays hand-made, marked as such**: the placeholder task labels stay only as a fallback with the "Sample" badge until the engine replaces them. OECD and ILO stay as labelled reference views.

## Honest limits to disclose in the app and proposal

- The Anthropic data measures observed use of one assistant (Claude), mostly by US users, on US O*NET tasks. It is not a Malaysian or all-AI measure. The maker of this tool also made the dataset, so the app says so.
- eMASCO to O*NET matching is an AI estimate; its quality is measured on a judged sample and reported, not assumed.
- It shows where AI is used today, not a forecast.

## Order of work (about 8-10 h)

| # | Step | Needs |
|---|---|---|
| 1 | Source layer, registry, fetchers, tests (4 sources) | none |
| 2 | Admin Sources panel and failure/fallback handling | none |
| 3 | Embed O*NET tasks and eMASCO tasks locally; match; measure quality | local model, about 30 min CPU |
| 4 | Exposure engine, per-role and per-skill output, uniqueness test | step 3 |
| 5 | Role card and Explore card show it with source and date | mockup first |
| 6 | Weekly job wiring; docs; demo-script numbers re-check | none |

## Decisions needed

1. Approve this plan.
2. Should live paper and trend signals also change the score under Fast AI? (Needs a spec change.)
3. Matching on the user's PC (no RunPod). RunPod stays optional.
4. Deadline: 8 am 25 Oct or Sunday 11:59 PM (decides how much of steps 5-6 fits).

## Do not do

Hard-coded exposure numbers; unofficial data copies; a contact email in requests; Reddit/GDELT/paid sources; new npm or pip dependencies.
