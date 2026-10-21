# Simple steps redesign: design spec

Date: 2026-10-21. Status: **approved mockup, spec awaiting user review**. Build starts only when the user says where to begin.
Mockup (clickable, private): https://claude.ai/artifact/W4cS4XXjtqw3ymRdnWZu3v

## 1. Goal

Make the journey a short, guided flow of 5 steps that any student or worker can finish in a few minutes:

1. **About you**: student / fresh graduate, or working; then the current major (student) or current sector (working).
2. **Your skills**: upload a CV (PDF) or "I don't have a CV". Skills found in the CV come with a guessed level that the user checks and changes. With no CV, the user picks skills and sets levels.
3. **Your goal**: upgrade in my field, move to a new role (then pick the sectors you want), or not sure yet.
4. **Matches**: ranked roles, each with links to its sources.
5. **What to study**: the missing or weak skills for the chosen role, with hours, SDGs and links to official course portals.

Success: a judge can go from Home to a study plan in under 2 minutes with a sample student or their own CV, and every number on screen still shows its source and date.

## 2. Decisions the user made (2026-10-21)

| Topic | Decision |
|---|---|
| CV reading | PDF read **in the browser** with `pdfjs-dist` (new dependency, approved). The CV never leaves the device and is never saved. |
| Skill level | Basic / Good / Strong **changes the fit score** (formula change, approved). |
| Goal | Changes the **order** of roles only, not the score. |
| Major / sector | Step 1 asks the student's major or the worker's sector. "Move to a new role" asks the target sectors in step 3. Order only, not the score. |
| Layout | Left panel kept (steps, profile summary, data line, Stage 2 links); ☰ menu on phones as today. |

## 3. Screens and navigation

| Step | Route | Replaces | Unlock rule |
|---|---|---|---|
| Home | `#` | Home (unchanged, "Start" goes to step 1) | always |
| 1 About you | `#about` | part of Profile | always |
| 2 Your skills | `#skills` | Profile skills, PreviewCv | `who` and `field` chosen |
| 3 Your goal | `#goal` | Profile interests/SDGs | at least 3 skills |
| 4 Matches | `#matches` | Radar + Roles | goal chosen (and at least 1 target sector when the goal is "move") |
| 5 What to study | `#study` | Pathway | same as 4 |

- Old hashes redirect: `#profile` → `#about`, `#radar` and `#roles` → `#matches`, `#pathway` → `#study`, `#preview-cv` → `#skills`.
- `navigation.js` `resolveScreen` gets the new screens and rules; a locked step falls back to the first step that is not complete. `journey.js` gets the new 5 steps with a sub-line each (as in the mockup) and new hints.
- Loading a sample student (buttons on step 1) fills every step, so all 5 steps unlock at once (demo path).
- Left panel "Your profile" box: who, major/sector (and "→ wants …" for move), skill count, goal. The "Start from your CV" Stage 2 link is removed (it is now real). "BM · 中文" and "More users" previews stay.
- Back / Next bar under each step (existing `StepBar`). Next is disabled with a hint until the step is complete.

## 4. Profile data

```js
profile = {
  who: 'student' | 'working' | null,
  field: string | null,          // a major or a work sector id from data/team/fields.json
  skills: string[],              // skill labels, as today
  levels: { [label]: 'basic' | 'good' | 'strong' },
  goal: 'upgrade' | 'move' | 'unsure' | null,
  targetSectors: string[],       // role groups, only used when goal is 'move'
  sdgs: number[], learn: string[], sampleId: string | null,
}
```

- **Removed from the flow:** `interests` (replaced by field and target sectors) and `experience` (replaced by `who`). The "starting point" advice on step 5 uses `who`: student → the internship advice, working → the HRD Corp claimable advice. `potential.js` is updated for this; its tests change with it.
- **Kept, optional:** SDGs and "skills you want to learn" sit in a closed "More about you (optional)" box on step 3. They work as today.
- Samples (`data/team/samples.json`) get `who`, `field`, `levels`, `goal` (and `targetSectors` where needed). `build_data.py` validates them, like it validates experience today. The values are a **team draft**.

## 5. Majors, sectors and role groups (`data/team/fields.json`, team draft)

The 15 roles already have a group in `role.interest`: Working with data, Business, Building software, Helping people, Clean energy, Design and media. These six groups are the **target sectors** in step 3.

`fields.json` lists the step 1 choices and links each to role groups:

```json
{
  "_note": "Team draft by Claude, awaiting teammate review. Links a major or work sector to the role groups in data/team/role_skills.json.",
  "majors": [{ "id": "it", "label": "IT and computing", "groups": ["Building software", "Working with data"] }],
  "sectors": [{ "id": "energy", "label": "Energy and utilities", "groups": ["Clean energy"] }]
}
```

- Majors: IT and computing, Data science and statistics, Business and accounting, Electrical and electronic engineering, Design and media, Education, Health sciences, Other.
- Work sectors: IT and software, Data and analytics, Business and finance, Energy and utilities, Design, media and marketing, Education and training, Healthcare, Other.
- "Other" links to no group. `build_data.py` checks that every id is unique and every group exists. The README and the app call this mapping a draft until the teammate reviews it.

## 6. Step 2: CV reading (`src/lib/cvSkills.js`, pure and tested)

Flow: the user picks or drops a PDF → the browser extracts its text with `pdfjs-dist` (loaded only when needed, via dynamic `import()`, with its worker) → `extractSkills(text, skillLabels, keywords)` returns the skills found → the user checks each level and can remove or add skills.

- **Keywords** come from a new `keywords` list per skill in `data/team/skill_labels.json` (team draft), e.g. `"SQL and databases": ["sql", "mysql", "postgresql", "database"]`. Matching is case-insensitive and on whole words. Only the 25 existing eMASCO skill labels can be found; nothing new is invented.
- **Evidence:** each found skill shows the CV line that matched (cut to about 80 characters), so the user sees why.
- **Level guess**, from words on the same line:
  - Strong: "advanced", "expert", "proficient", "lead"/"led", or 3+ years.
  - Basic: "basic", "beginner", "familiar", "learning", "introductory".
  - Otherwise Good.
  - Shown as "Level is our guess, please check". The user can change it with the 3-way switch.
- **No CV:** the same skill list with levels, empty at the start; the user adds skills from the eMASCO list (default level Good).
- **Privacy:** the file and its text stay in browser memory only. No upload, no `localStorage`, no logging. Replacing or removing the CV clears them. The page says so above the upload box.
- **Errors (each with a clear message and the "pick skills instead" route):** not a PDF; over 5 MB; password-protected; no text layer (scanned image); no known skill found; the PDF library fails to load.

## 7. Scoring change (`src/lib/scoring.js`)

Only the credit for a skill the user **has** changes. Everything else in the approved formula stays.

```
credit(have)    = LEVEL_CREDIT[level]     # basic 0.5, good 0.75, strong 1.0
credit(similar) = 0.5                     # unchanged
credit(gap)     = 0                       # unchanged
fit = sum(credit) / number of role skills × 100
```

- `LEVEL_CREDIT` is exported next to `WEIGHTS` and `SCENARIO_FACTOR`; the UI imports it.
- A skill with no level counts as **strong (1.0)**, so old callers and tests keep today's results.
- A Basic skill earns the same as a related ("similar") skill. This is intended: both mean "some ground to build on".
- `buildPathway`: a skill the user has at **Basic** becomes a "Level up" step with half the hours (like "similar"). Good and Strong skills are not in the pathway.
- "Why this score?" shows the level of each skill it counted. The README formula section and the spec note are updated.

## 8. Goal and sector ordering (`src/lib/goalView.js`, pure and tested)

`orderForGoal(ranked, profile, fields)` returns the same scored roles in a new order. Scores never change.

- **upgrade:** roles whose group is linked to the user's major or sector come first, then the rest; each part keeps the score order.
- **move:** roles in the chosen target sectors come first, then the rest.
- **unsure**, or "Other" with no linked group: plain score order.
- Each role card shows why it is placed there ("In your sector", "In a sector you want"). The screen says "This changes the order only, not the score."
- If no role is in the linked groups, show the plain ranking with a note that says so.

## 9. Step 4: Matches

- The ranked role cards from today's Roles screen, in the goal order, with the Moderate / Fast AI toggle.
- Each card has a **Sources** line with links:
  - eMASCO role page (`role.source.url`, snapshot date),
  - OpenDOSM job trend for the role's group (`data/trends.json` source URL, years),
  - ILO WP140 (2025) page.
  Links open in a new tab with `rel="noopener noreferrer"`.
- The old Radar content moves below the roles as "Trends behind your matches": radar chart for the selected role, Skills in demand, AI research momentum, youth unemployment card, Refresh data button and re-plan notice. Nothing in these cards changes.
- Picking a role ("Plan my study for this role") opens step 5 for that role. The top role is the default.

## 10. Step 5: What to study

- Today's Pathway screen, with:
  - "Level up" steps for Basic skills (section 7);
  - portal order by `who`: working → HRD Corp claimable courses first, then e-Latih; student → the skill's own portal (e-Latih or MyTVET) first, then claimable;
  - the starting-point advice by `who` (section 4).
- Courses are links to the approved portals only. The app has no course-name database; named courses would need the team to collect real ones from those portals (not in this spec).

## 11. Rules that still hold

- No invented roles, skills, courses or numbers. Example values in the mockup are not used in the app.
- Every number shows its source and date. AI labels stay "estimates"; "Sample" badges stay until RunPod.
- Team drafts (fields map, keywords, sample values) are labelled drafts.
- The app supports the decision; it does not decide.
- UI: touch targets ≥ 44px, 360px width, `prefers-reduced-motion`, teal `#0F766E`, orange `#C2410C`, Plus Jakarta Sans.
- New dependency: `pdfjs-dist` only. Add it to the approved list in `CLAUDE.md`.

## 12. Build parts (the user picks where to begin)

Each part ends with tests passing and can be reviewed on its own.

| Part | What | Depends on |
|---|---|---|
| P-A | Level-aware scoring (`LEVEL_CREDIT`, `buildPathway` Level up) + README formula | none |
| P-B | `fields.json`, sample updates, `build_data.py` checks | none |
| P-C | `goalView.js` ordering | P-B |
| P-D | `cvSkills.js` extraction + keywords in `skill_labels.json` | none |
| P-E | Steps 1–3 screens, new routes, left panel, redirects. Carried from P-A review: "Why this score?" lists each counted skill with its level (today it shows only the credit legend); skill chips show a visible level mark; RoleCard level text moves into a tested helper in `roleView.js`. | P-A, P-B |
| P-F | PDF upload in step 2 with `pdfjs-dist` | P-D, P-E |
| P-G | Steps 4–5 (sources line, trends section, portal order, advice) | P-C, P-E |
| P-H | Clean-up: remove old Profile/Radar/PreviewCv screens, docs (README, HANDOVER, CLAUDE.md) | all |

Risk: the deadline is 25 Oct, 8 am. If time runs short, P-F (real PDF upload) can wait while steps 1–5 work with "I don't have a CV" and the sample students.

## 13. Testing

- **Unit (Vitest):**
  - `scoring`: level credits; a missing level = strong; Basic = similar; Level up steps and hours.
  - `cvSkills`: whole-word matching ("sql" yes, "nosql" no); case; evidence line cut; each level cue; years rule; no skills found; empty text.
  - `goalView`: upgrade/move/unsure order; ties keep score order; "Other"; no role in the groups.
  - `navigation` / `journey`: unlock rules; old-hash redirects; sample unlocks all steps.
  - `potential`: advice by `who`.
- **Pipeline (unittest):** fields ids unique and groups known; samples carry valid who/field/levels/goal/targetSectors; keywords non-empty and lower-case.
- **Fairness test** (existing): still passes; `who`, major and sector never change a score.
- **Manual:** Aina, Ravi and Mei Ling on laptop and phone (360px); a real text PDF, a scanned PDF, a password PDF, a non-PDF; keyboard only through all 5 steps.
