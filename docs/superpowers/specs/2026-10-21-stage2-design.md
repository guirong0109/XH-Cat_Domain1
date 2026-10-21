# FutureReady MY — Stage 2 design

Date: 2026-10-21. Status: mockup approved by the user; this spec is waiting for review.
Mockup: https://claude.ai/artifact/6tVVn6bMvjRhW3irFeBG99 (private canvas, 6 screens).
Builds on: `2026-10-20-futureready-mvp-design.md` (the approved MVP spec). Every rule there still holds.

## 1. Goal and scope

The user chose **option C**: build the two strongest Stage 2 items for real before the 25 Oct 2026 8 am deadline, and show the rest as clearly labelled previews **inside the app**.

| # | Item | What we do |
|---|---|---|
| 1 | ILO GenAI exposure index | **Build.** Show it as a second opinion per role. It does **not** change the score. |
| 6 | Auto re-plan after Refresh | **Build.** After new trend data arrives, show which of the user's roles moved. |
| 2 | CV upload + AI skill extraction | **Preview screen only.** Nothing is uploaded or read. |
| 4 | Bahasa Malaysia / Chinese UI | **Preview screen only.** |
| 5 | Other users (career switcher, counsellor, HR team view) | **Preview screen only.** |
| 3 | Job-posting counts | **Not built, not previewed.** There is no free, allowed Malaysian job-ad source. The Home preview section says so in one line. |

Out of scope: any change to the scoring formula, the factors (Moderate 0.6, Fast 1.0) or the five existing screens' behaviour, apart from the additions below.

## 2. Honesty rules for Stage 2

- The ILO score is shown with its source, year and the ISCO-08 code it was read from.
- The MASCO → ISCO-08 match is **our team's mapping**, not an official table. The UI says so wherever an ILO value shows. (No DOSM MASCO 2020 ↔ ISCO-08 correspondence table was found. MASCO 2020 has codes that ISCO-08 lacks, e.g. 2524, 2541, 2543, and some shared numbers mean different jobs, e.g. MASCO 2423 is Digital Learning, ISCO 2423 is Personnel and careers professionals.)
- The ILO index is global, not Malaysia-specific. The UI says so.
- Preview screens carry an orange banner: "Stage 2 preview, not working yet." Example outputs carry an "Example" badge. Disabled controls say "(disabled in preview)".
- Draft translations are marked as drafts. The example HR team is marked as made-up.

## 3. Item 1 — ILO second opinion

### Data
- **Source (approved by the user on 2026-10-21):** ILO Working Paper 140 (May 2025), "Generative AI and Jobs: A Refined Global Index of Occupational Exposure", (c) ILO 2025, CC BY 4.0. It is the latest ILO index; ILO briefs from 2026 still cite it. Only official ILO pages are used: https://www.ilo.org/node/706766, the PDF on ilo.org and the "Read online" HTML on webapps.ilo.org. No GitHub or third-party copies.
- **Table A1** ("ISCO-08 occupations by exposure gradient") lists all 427 ISCO-08 4-digit occupations with the ILO exposure category (Gradient 1–4, Minimal Exposure, Not Exposed), the mean task score and the SD.
- The PDF and the HTML page are kept unchanged in `data/ilo/` (the user asked to keep the PDF in the repo). A stdlib script extracts Table A1 into `data/ilo/ilo_2025_scores.json` and checks it: 427 unique codes, and each category against the Table 5 rules.
- The ILO built the index with AI-assisted scoring plus a worker survey and expert review; the README says so.

### Mapping
- New team file `data/team/isco_map.json`: `{ "<MASCO code>": { "isco": "<4 digits>", "note": "<why>" } }` for all 15 roles.
- Claude drafts the mapping from the eMASCO role description and the ISCO-08 unit titles. The teammate reviews it. A role with no sensible ISCO match is left out of the file and shows "No ILO match".

### Pipeline (`pipeline/build_data.py`, stdlib only)
- Reads `data/team/isco_map.json` and the ILO file (both optional; missing → no `ilo` field, with a warning).
- Adds to each role in `data/roles.json`:
  `"ilo": { "isco": "2511", "iscoTitle": "Systems Analysts", "mean": 0.49, "sd": 0.05, "category": "Gradient 2", "source": "ILO WP140 (2025), Table A1", "url": "...", "fetchedAt": "..." }`
- Fails loudly if the mapped ISCO code is not in the ILO file.
- New unit tests in `pipeline/tests/`: mapping present, mapping missing, unknown ISCO code, file missing.

### UI
- Pure helper in `src/lib/roleView.js`: `iloView(role)` → `{ badge, scoreText, iscoText, sourceText }` or `null` when the role has no `ilo`. Tested.
- `RoleCard.jsx`: a small indigo badge in the title row (`ILO 2025: <category>`).
- The "Why this score?" panel gets a second box, **"ILO second opinion (not in the score)"**, next to "Our task labels (used in the score)". Text as in the mockup: category, mean and SD, ISCO code and title, "our team's mapping, not an official table", "global index, not Malaysia-specific", source line.
- One line under both boxes: "Two views can disagree. Both are estimates. You decide."
- Roles without `ilo`: no badge; the box says "No ILO match for this role."

## 4. Item 6 — Auto re-plan after Refresh

- New pure module `src/lib/replan.js`: `rankChanges(before, after)` takes two ranked lists (role ids in order) and returns `{ up: [{id, from, to}], down: [...], unchanged: boolean }`. Tested.
- `App.jsx` `refreshTrends`: only when the result status is `updated` **and** the profile has enough skills, rank the roles with the old trends and with the new trends (same profile, same scenario, same `rankRoles`) and store the `rankChanges` result.
- New component `src/components/ReplanNotice.jsx`, shown on the Radar screen under the Refresh card:
  - Roles moved: a teal box "New data changed your results", up to 3 moved roles (largest moves first), each with old → new rank and the group's demand change (old → new, from `trends.groups`), the open pathway line ("Steps unchanged, your ticked steps are kept"), buttons "See updated roles" (goes to Roles) and "Dismiss", and the OpenDOSM source and date.
  - Nothing moved: one line, "Data updated to <year>. Your top roles keep the same order."
  - Status `unchanged` or `failed`: no notice; the existing messages stay.
- The notice clears when dismissed, when the profile changes or when the scenario changes.
- Pathway progress (`doneSkills`) is never reset by a refresh (already true today).

## 5. Previews (items 2, 4, 5)

### Navigation
- `src/lib/navigation.js`: add `preview-cv`, `preview-lang`, `preview-users` to `SCREENS` (they do not need skills). Deep links `#preview-cv` etc. work. Tests updated.
- On preview screens the header shows a "Back to home" button instead of the step nav.

### Home
- New section at the bottom of `Home.jsx`: "Coming in Stage 2" with the orange "PREVIEW · NOT WORKING YET" tag, three cards linking to the previews, and the job-posting line.

### Shared
- `src/components/PreviewBanner.jsx`: the orange banner, `role="note"`.

### `src/screens/PreviewCv.jsx`
- Step 1: disabled upload box and "How it would work" list (RunPod model, picks only from our skill list, user confirms, CV deleted, nothing stored).
- Step 2: "Example output" with three example skills, each showing the made-up CV line it came from. Skill labels are taken from `data.skills.labels`, so they are real labels. Disabled "Use these skills" button.

### `src/screens/PreviewLang.jsx`
- An EN / BM / 中文 switch that changes **only the preview card** (local state), showing the Home hero in that language (draft translations, marked as drafts).
- A table of where role text would come from: EN and BM from eMASCO (BM from the official Malay pages), Chinese machine-translated and marked so.
- Sets `lang` attributes (`ms`, `zh`) on the translated blocks. Chinese uses the system font (no new font).

### `src/screens/PreviewUsers.jsx`
- A user-type picker (Student, Career switcher, Counsellor, HR team); only HR team shows content, the others show "Preview only".
- HR team grid for target role Data Analyst (2524-02): rows are three made-up staff ("Staff A/B/C") with fixed example skill lists; cells come from the real `skillStatus()` with the real role skills and `similar` map, so the grid follows the real rules. "Biggest team gap" line computed from the grid. Pure helper `teamGrid(role, staff, similar)` in `src/lib/previewView.js`, tested.
- Badge "Example team", note "Real use would need consent and no names stored."

## 6. Docs
- README: data-sources row for the ILO file; AI-disclosure line for the ILO index and the mapping; "Stage 2" section saying which items are built and which are previews; demo tip line for the re-plan notice (only if a real refresh can show it; otherwise say it appears when OpenDOSM publishes new data).
- HANDOVER update.

## 7. Testing
- Vitest: `iloView`, `rankChanges` (moves, no moves, new role ids, empty lists), `teamGrid`, navigation of the preview screens.
- Pipeline unittest: the ILO merge cases above.
- Manual on localhost: role card badge and panel for a mapped and an unmapped role; Refresh (both outcomes); three preview screens at 360 px width; keyboard focus order; `prefers-reduced-motion`.
- `npm test`, pipeline tests and `npm run build` pass before every push.

## 8. Risks
| Risk | Plan |
|---|---|
| ILO file can't be downloaded or is not 4-digit | Item 1 stops at that point; previews and item 6 still ship. Tell the user. |
| A role has no good ISCO match | Leave it unmapped; it shows "No ILO match". |
| Judges read previews as working features | Orange banner on every preview, disabled controls, "Example" badges. |
| Refresh rarely changes data (OpenDOSM updates yearly) | The re-plan notice is tested with unit tests; the README says when it appears. |
| Time (deadline 25 Oct 8 am) | Order: item 1 → item 6 → previews. Each part is committed separately and can ship alone. |

## 9. Dependencies
None new. Python stays stdlib only.
