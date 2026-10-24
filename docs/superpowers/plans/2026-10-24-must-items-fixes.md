# Plan: close the weak must-have items (24 Oct 2026)

DRAFT. Nothing here is built. Wait for the user's approval, one item at a time. Deadline: 25 Oct 8:00 am MYT (unconfirmed). Source of the gaps: `Domain 1.md` vs the "Future-Ready Workforce System Design" PDF vs the app.
No new dependencies. No invented roles, skills, hours or numbers. Mockup first for any UI change.

## Order (most marks per hour first)

| # | Item | Why it matters (brief) | Effort | Needs |
|---|---|---|---|---|
| 1 | Commit the OpenAlex snapshot | Must 2: updatable trend source with date. `data/research.json` is real (OpenAlex, fetched 2026-10-23 09:33 UTC) but untracked, so Replit shows an empty card. | 15 min | Check it has all 38 skills and no HTTP 429 gaps, then commit. |
| 2 | Make the placeholder AI labels honest or real | Must 2 and 3: trend layer feeds matching. All 20 roles show "Sample". | Option A 30 min; option B about 2 h plus RunPod cost | User choice (below). |
| 3 | Skill type per skill (AI-exposed / human-led / new AI skill) | Brief core: rising and declining skills. Today no skill shows as declining. | 2-3 h | Rule below; user approval. |
| 4 | Hours for the 13 accounting skills | Must 4: estimated time. They show "Hours not estimated". | 1 h | Team or user must approve the numbers; I will not invent them. |
| 5 | SDG note for explored roles | Must 5: tag each role. 1,746 explored roles have none. | 30 min (note) | Honest "not tagged yet" line. |
| 6 | Link an explored role to Study | Must 4. Not built. | 3-4 h | Skip unless time is left. |

## Item 2: choose

- **A (recommended for the time left):** keep placeholders, but say it on the Matches screen and in the proposal ("AI-exposure labels are sample estimates; ILO 2025 gives the official second opinion"). The ILO view already exists per role. Costs nothing, nothing is claimed that is false.
- **B:** run the P4 RunPod labelling job (about USD 5, needs the user's yes and a Pod price quote first), rebuild data, re-check the demo numbers (`docs/demo-script.md`). Riskier before 8 am: it changes every score.

## Item 3: proposed rule (from the PDF, using data we already have)

Type comes from the ILO 2025 exposure of the roles that use the skill (`src/lib/skillTrends.js` already groups skills this way):
- High exposure group -> "AI-exposed: learn to do it with AI".
- Low exposure group -> "Human-led: keep building it".
- "New AI skill": only skills the team already tagged as AI skills (no auto-detection).
Shown as a badge and one advice line on the pathway step. It never changes the score; the card says so. Tests: pure helper in `src/lib/` like the others. Cut-offs must come from the ILO groups already in use, not new numbers.

## Edge cases to list before building

- A skill used by roles in both groups (show the mixed case, do not force one type).
- A skill used by no scored role (no type; show nothing).
- Explored roles (not scored) must not get a type.
- Stale `research.json` (show its date; do not hide it).

## Tests

Pure helpers get Vitest tests; `npm test` and the pipeline tests run before any push. Check the screen at 360 px and in the real browser (`npm start`, port 3000).

## Outside the app (not code)

Proposal: `docs/proposal-draft.md` and `.docx` done; the teammate adds team names, the official format and length limit, and the language-model provider wording. Billing screenshot, Replit check, public repo on submission day.

## Do not do

Reddit/Bluesky/GDELT/paid domain-rating sources, a contact email in the User-Agent, FastAPI/Chroma/Ollama (rules in `CLAUDE.md`).
