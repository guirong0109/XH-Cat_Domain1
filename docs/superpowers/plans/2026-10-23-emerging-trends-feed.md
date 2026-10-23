# Plan: "Emerging this week" feed (draft, not approved)

Date: 2026-10-23. Status: **plan only. Wait for the user's approval before each phase.**
Suggested branch: `claude/emerging-trends-feed` (cut from `claude/stage2-cv-all-fields`).

## 1. Goal
eMASCO is a static snapshot. Add a small feed that shows what is new in AI and work skills, with a **real source link and date** for every item. It must not change any score.

## 2. What the user decided in the planning chat
- No GitHub Actions (workers are unreliable for the user).
- Not dependent on the user's PC being on; no scheduled Claude task on the PC.
- No expensive API. A cheap or free model is fine.
- Not live search per visitor. One shared update, then everybody reads the saved file.
- Rough cost target: US$0 to about US$1 a month.

## 3. Rules that must hold (from CLAUDE.md)
- Never invent. Every item = a real headline/title from a fetched source, with its **URL and "checked on" date**.
- Sources must be official or open. **Ask the user to approve the source list first** (see §4).
- AI output is labelled "AI-written estimate". The feed is "Not part of the score".
- Skill tags must exist in our skill list. Anything else shows as "emerging, not in eMASCO". Never write to `roles.json`, skills or labels.
- No new dependency (use plain `fetch`). The API key comes from an env var, never committed, never logged. CV text is not involved.
- Keep the last good file if a run fails (atomic write, single in-flight, like `server/research.js`).
- Do not put model or provider names in code or commit messages. The provider is set by env vars.
- Preview/pending items must not look like final data.

## 4. Decisions needed from the user (ask before phase 1)
1. **Source list.** Candidates, to be checked read-only for a feed/API that allows reading: OpenAlex (already used), OpenDOSM (already used), ILO news/publications, MDEC, HRD Corp, MOHR announcements. No scraping of pages that forbid it. No job-ad sites.
2. **Provider.** Free tier first (user's likely choice). Pluggable via `EMERGING_API_URL`, `EMERGING_API_KEY`, `EMERGING_MODEL`. The user creates the key.
3. **Schedule.** Weekly is enough (about 7 times cheaper than daily). Trigger = free external pinger (for example cron-job.org) calling the endpoint, plus a manual "Refresh" button. The user sets up the pinger; Claude never signs up for them.
4. **Number of fields.** Roughly how many fields (needed only for the prompt size; cost barely changes).
5. **Review.** Who reviews items before they show as final? Default: items show with a "Pending review" tag until the team confirms.

### Decisions made by the user (2026-10-23)
1. **Sources:** OpenAlex (confidence High); MIT News AI topic, MIT Technology Review, Free Malaysia Today, Malay Mail Money (RSS, confidence Medium, plain keyword filter). ILO held back. No scraping, no search API. Confidence is set by fixed rules per source tier, never by the AI. Publisher terms of use still to be read by the team before Phase 4.
2. **Provider:** free-tier model as main (env vars `EMERGING_API_*`), a second provider as backup (`EMERGING_BACKUP_*`), used only when the main one fails (timeout, HTTP error, bad JSON). No provider names in code. Backup price and terms to be rechecked before its key is made.
3. **Schedule:** weekly by default. `EMERGING_INTERVAL=weekly|daily` env var; a too-early call returns the saved file. Refresh needs `EMERGING_ADMIN_TOKEN`. An admin page to set the interval is a later phase, only if the user asks.
4. **Fields:** the 6 role groups in `data/fields.json` plus "General".
5. **Review:** the admin reviews (link opens, summary true, tags fit, relevant). Items show "Pending review" until marked reviewed; refresh never changes a reviewed item. How the admin marks an item (edit file now, buttons on the later admin page) is open.

## 5. Design: collect once, tag many
1. `POST /api/refresh-emerging` fetches the approved sources once into one shared pool of items `{title, url, source, publishedAt}`.
2. Drop items already in `data/emerging.json` (dedupe by URL).
3. Send only the **new** items, in **one** call, with the list of field names and skill names. Ask for tags only: `{id, fields: [], skills: [], summary}`. Summary must be built from the fetched title/snippet; no outside knowledge.
4. Validate the reply: every id exists, every field/skill is in our lists (else mark as "not in eMASCO"), summary length limit. Reject the whole run on bad JSON, and keep the old file.
5. Write `data/emerging.json` atomically. If the model is unavailable, optional fallback: keyword tagging only (`cvSkills.js` style), no summary.
6. `GET /api/data` includes `emerging`. The UI shows a card, "Emerging this week".

### Data format (draft)
```json
{
  "checkedOn": "2026-10-24",
  "items": [
    {
      "id": "…",
      "title": "original headline",
      "url": "https://…",
      "source": "ILO",
      "publishedAt": "2026-10-20",
      "fields": ["IT"],
      "skills": [{"name": "…", "inEmasco": true}],
      "summary": "AI-written estimate…",
      "review": "pending"
    }
  ]
}
```

## 6. Phases (approval needed for each)
- **Phase 0 (read-only):** check each candidate source for a feed/API, terms of use and rate limits. Report to the user. No code.
- **Phase 1 (mockup, no code):** mockup of the "Emerging this week" card (teal/orange, 360px, touch targets ≥ 44px, source link and "checked on" date on every item, "AI estimate" and "Not part of the score" labels, empty and error states). User approves.
- **Phase 2 (server, TDD):**
  - `server/emerging.js`: fetch sources, dedupe, call the model, validate, atomic write, single in-flight.
  - `server/app.js`: `POST /api/refresh-emerging`, add `emerging` to `GET /api/data`.
  - Tests with a fake fetch and a fake model reply (no real network or key in tests).
- **Phase 3 (UI):** pure helper `src/lib/emergingView.js` (+ tests), component `EmergingFeed`, placement on Matches or Skills (decide in the mockup). Uses `referenceView.js` for the "checked on" labels.
- **Phase 4 (run for real):** user adds the key, runs one manual refresh, checks every link, team reviews, then the user sets up the pinger. Record the first run's output in the repo.
- **Docs:** update HANDOVER.md, task.md, README demo tip, `docs/demo-script.md`.

## 7. Edge cases to cover
- Source down, timeout, HTTP 429 or non-JSON reply: keep the old file, show the old "checked on" date.
- Same story from two sources: dedupe by URL, and by normalized title.
- Model returns an unknown skill/field, an id that does not exist, or invalid JSON: reject or mark "not in eMASCO"; never save as eMASCO data.
- Model adds facts that are not in the fetched text: the summary is length-limited and labelled an estimate; the reviewer checks it. A source link is always shown.
- Two refreshes at once: the second one returns the first one's result.
- No API key set: endpoint returns a clear message; the app hides the card or shows the keyword-only version.
- Very old items: drop items older than a set number of days.
- Empty feed: the UI shows "No new items" with the last checked date.
- Prompt injection inside a headline: treat headlines as data only; the model output is validated against our lists, and no tool use.
- API key never appears in logs, errors, or `GET /api/data`.

## 8. Test cases
- Unit: dedupe, validator (good and bad replies), atomic write keeps the old file on failure, single in-flight, date/age filter.
- Server: endpoint with a fake model; `GET /api/data` includes `emerging`; missing key.
- UI helper: grouping by field, "not in eMASCO" label, review tag, stale-date label.
- Manual: 360px layout, reduced motion, every link opens, labels visible.
- Run `npm test` and the pipeline tests before every push.

## 9. Cost note
About 8,000 tokens in and 2,000 out per run. Weekly runs on a free or cheap tier cost about US$0 to US$0.15 a month. Use one batched call, not one call per field, so the cost stays almost flat as fields grow. Turn "thinking" off, and set a spending limit in the provider dashboard. Prices must be re-checked on the provider's official page before the key is created.

## 10. Out of scope
Live search per visitor, job-ad data, new dependencies, changing scoring or roles, Malay crawl, RunPod.

## 11. Notes for the new session
- Read `HANDOVER.md` §0000 first. The English eMASCO crawl may still be running on the user's PC; do not stop it, and keep port 3000 for the user.
- `CLAUDE.md`, `HANDOVER.md` and `task.md` had uncommitted edits at the start of this session; check `git status` before branching.
- Follow the user's habits: plain English, short answers, mockup before UI, list edge cases and tests after code, subagent-driven build with a review after each task.
