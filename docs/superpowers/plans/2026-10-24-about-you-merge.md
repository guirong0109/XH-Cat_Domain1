# Plan: merge "Your skills" into "About you" (24 Oct 2026)

Approved by the user on 24 Oct 2026 (chat): (1) merge Skills into About you, 4 steps; (2) a level first guess from the CV with a visible reason; (3) pre-tick the common skills of the student's major at Basic, counted from the 20 scored roles.
No new dependencies. No scoring change (level credits stay Basic 0.5, Good 0.75, Strong 1.0).

## New journey

Home → **1 About you** → 2 Your goal → 3 Matches → 4 What to study.

About you shows one part after another on the same screen:
1. Who are you? (student / working), as today.
2. Your major or sector, as today.
3. "Do you have a CV?" with two big buttons: **Upload my CV** / **No CV, I'll pick**.
4. Path A (CV): **Check what we found in your CV** (review card), then "Add more skills" (picker, folded).
   Path B (no CV): **Pick your skills**, with the major's common skills pre-ticked at Basic.
5. Continue → Your goal. About you is complete when who + field + at least 3 skills are set.

A sample student or a profile that already has skills opens straight at part 4 (picker and levels).

## Tasks

### Task 1: navigation (pure, tested)
- `src/lib/navigation.js`: `STEP_SCREENS = ['about', 'goal', 'matches', 'study']`; `stepComplete('about')` also needs `skills.length >= MIN_SKILLS`; `firstIncompleteStep` checks the first 2 steps; `OLD_ROUTES` gains `skills: 'about'` and `preview-cv` → `about`, so old links and `#skills` still work.
- `src/lib/journey.js`: drop the `skills` step; About you sub-text "Who you are, your major, your skills"; hint for about.
- `src/components/TipBanner.jsx`: drop `skills` from `TIP_ORDER`.
- Update `tests/navigation.test.js`, `tests/journey.test.js`.

### Task 2: common skills of a field (pure, tested)
- New `src/lib/fieldSkills.js`: `commonSkills(field, roles, max = 5)` → `[{ label, count, total }]`.
  Roles of the field = roles whose `interest` is in `field.groups` (same rule as `goalView.js`).
  Keep skills used by at least 2 roles (or all skills when the field has only 1 role), most used first, ties by name, at most 5.
  "Other" or a field with 0 roles → `[]` (nothing pre-ticked; the screen says so).
- Tests: IT → Problem solving 5/7, SQL and databases 3/7, Python programming 3/7 …; Education (1 role) → its 4 skills; Other → [].

### Task 3: level first guess with a reason (pure, tested)
- `src/lib/cvSkills.js`: `guessLevel(lines)` takes all CV lines that matched the skill and returns `{ level, reason }`:
  - Strong: a line says advanced / expert / proficient / led, or 2+ years; or the skill is in **2 or more** project/job lines.
  - Good: the skill is in **1** project/job line (built, developed, designed, created, implemented, project, intern, internship, worked, managed, final-year).
  - Basic: only in a skills list or says basic / beginner / learning.
  - Note: today 3+ years → Strong and a plain line → Good; this changes to 2+ years and plain line → Basic (approved rule).
- `extractSkills` collects **every** matching line (today only the first) and keeps the first as evidence.
- AI matches: the server gives one best line, so the guess uses that one line.
- `levelReason(reason)` → short text, e.g. "Good: used in a project or job line".
- Update `tests/cvSkills.test.js`.

### Task 4: the About you screen
- `src/screens/About.jsx` gets parts 3 and 4. The CV and picker code moves out of `Skills.jsx` into `src/components/CvReview.jsx` (upload, review card, AI checks, hints) and `src/components/SkillPicker.jsx` (common skills block + all skills + levels). No logic change beyond Tasks 2–3.
- Review card per skill: name, source badge (keyword / AI estimate), the CV line, level switch pre-set to the guess, the reason line, Remove. AI matches keep Add / Not mine.
- "Lines we read but did not match" (folded, up to 5 lines that were not evidence for any skill). CV text stays in screen memory only; never saved or sent again.
- Pre-tick: when the student taps "No CV" and has no skills yet, the common skills are added at Basic, with the line "Common in IT roles in this app: used by 5 of 7 roles (eMASCO skills)". Changing the major later does not re-tick.
- `src/App.jsx`: remove the `skills` screen branch; pass the skill handlers to About.
- Delete `src/screens/Skills.jsx` once nothing imports it.
- Check at 360 px, 44 px targets, keyboard focus, reduced motion.

### Task 5: docs
- `docs/demo-script.md` (one step fewer), `HANDOVER.md` newest section, `CLAUDE.md` screen list.

## Edge cases to test
- `#skills` or `#preview-cv` link → opens About you.
- Deep link `#goal` with fewer than 3 skills → back to About you.
- Sample student → About you shows their skills; nothing pre-ticked over them.
- Major "Other" → no pre-tick, message shown, picker works.
- Tap "No CV" twice, or go back and forth → skills are not added twice.
- Change major after pre-tick → ticks stay as they are.
- CV with a skill in a list only → Basic; in one project line → Good; in two project lines or "2 years" → Strong; "basic Python" → Basic.
- CV then "Change" → old CV skills removed (as today).
- CV with no matches → message, unread lines, "Pick my skills" opens Path B.
- AI service off (Replit) → keyword results only, fallback message.
- 360 px width; keyboard-only use.

## Run
`npm test` after each task; build and click through on a test port (not 3000).
