# P-A Level-aware Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A skill the user has counts by its level (Basic 0.5, Good 0.75, Strong 1.0) in the fit score, and Basic skills become "Level up" steps in the pathway.

**Architecture:** One new pure helper `skillCredit` in `src/lib/scoring.js` gives the credit for one role skill; `scoreRole` and the radar use it. `buildPathway` adds a `levelup` status. View helpers and the README explain the new credit. No UI for choosing levels yet (that is P-E); with no `profile.levels`, every result stays exactly as today.

**Tech Stack:** JavaScript (ES modules), Vitest, React 19 (one component text change).

**Spec:** `docs/superpowers/specs/2026-10-21-simple-steps-design.md` (section 7; P-A in section 12).

## Global Constraints

- All scoring maths lives in `src/lib/scoring.js`; the UI imports it and never re-implements it.
- `LEVEL_CREDIT = { basic: 0.5, good: 0.75, strong: 1 }`. Similar stays 0.5, gap stays 0. Weights (0.6 / 0.4), scenario factors (Moderate 0.6, Fast 1.0) and the SDG bonus are unchanged.
- A skill with no level, or with a level not in `LEVEL_CREDIT`, counts as strong (1.0).
- No new dependencies. No refactors outside these files. No model names in code or commits.
- Simple English in all user-facing text.
- Run `npm test` and `python -m unittest discover pipeline/tests` before any push (Windows: `python`).

## Review Focus

1. Profiles with no `levels` key (samples, old state): scores, ranking and pathway must equal today's exactly. → Task 1 test `no levels keeps today's scores`.
2. A level value that is unknown (`'expert'`, `''`, `null`): counts as strong, never `NaN`. → Task 1 test `unknown level counts as strong`.
3. A `levels` entry for a skill the user did not pick: ignored (the skill is still a gap or similar). → Task 1 test `level for an unpicked skill is ignored`.
4. Progress ticks on a Level up step: work like other steps (by label). → Task 1 test `levelup step keeps label for progress`.
5. Fairness: levels only come from the user's own skill answers; the existing fairness test must still pass unchanged.

---

### Task 1: Level credit in scoring and pathway

**Files:**
- Modify: `src/lib/scoring.js`
- Modify: `tests/scoring.test.js`
- Modify: `README.md` (section "Scoring formula")
- Modify: `CLAUDE.md` (rule line on the scoring formula)

**Interfaces:**
- Produces:
  - `export const LEVEL_CREDIT = { basic: 0.5, good: 0.75, strong: 1 }`
  - `export function skillLevel(label, profile) -> 'basic' | 'good' | 'strong'`: `profile.levels?.[label]` when it is a key of `LEVEL_CREDIT`, else `'strong'`.
  - `export function skillCredit(label, profile, similar) -> number`: `have` → `LEVEL_CREDIT[skillLevel(label, profile)]`, `similar` → 0.5, `gap` → 0 (status from the existing `skillStatus(label, profile.skills, similar)`).
  - `scoreRole` returns the same fields as today; `earned` is now the sum of `skillCredit`.
  - `buildPathway` items: `status` is `'gap' | 'similar' | 'levelup'`. A `have` skill at level `basic` gives a `levelup` item with `hours: Math.round(baseHours / 2)`; other `have` skills are left out as today.

- [ ] **Step 1: Write the failing tests** in `tests/scoring.test.js` (import `LEVEL_CREDIT`, `skillLevel`, `skillCredit`)

```js
describe('level credit', () => {
  it('exports the level credits', () => {
    expect(LEVEL_CREDIT).toEqual({ basic: 0.5, good: 0.75, strong: 1 });
  });
  it('no levels keeps today\'s scores', () => {
    const p = { skills: ['a1', 'a2'], sdgs: [] };
    expect(scoreRole(roleA, p, ctx, 'moderate').earned).toBe(2);
    expect(scoreRole(roleA, { ...p, levels: {} }, ctx, 'moderate').fit).toBe(50);
  });
  it('counts each level', () => {
    const p = { skills: ['a1', 'a2', 'a3'], levels: { a1: 'basic', a2: 'good', a3: 'strong' }, sdgs: [] };
    const s = scoreRole(roleA, p, ctx, 'moderate');
    expect(s.earned).toBe(2.25);
    expect(s.fit).toBeCloseTo(56.25);
  });
  it('unknown level counts as strong', () => {
    for (const level of ['expert', '', null, undefined]) {
      const p = { skills: ['a1'], levels: { a1: level }, sdgs: [] };
      expect(skillLevel('a1', p)).toBe('strong');
      expect(skillCredit('a1', p, {})).toBe(1);
    }
  });
  it('level for an unpicked skill is ignored', () => {
    const p = { skills: [], levels: { a1: 'basic' }, sdgs: [] };
    expect(skillCredit('a1', p, {})).toBe(0);
    expect(skillCredit('a1', p, { a1: ['x'] })).toBe(0);
    expect(skillCredit('a1', { ...p, skills: ['x'] }, { a1: ['x'] })).toBe(0.5);
  });
  it('basic equals a similar skill', () => {
    const p = { skills: ['a1', 'x'], levels: { a1: 'basic' }, sdgs: [] };
    expect(skillCredit('a1', p, { a2: ['x'] })).toBe(skillCredit('a2', p, { a2: ['x'] }));
  });
});
```

In `describe('buildPathway')` add (reuse its `role`, `c`, `skillLabels`; add `{ label: 'Have it', hours: 15, portal: 'elatih' }` to a local copy of `skillLabels`):

```js
it('basic skill becomes a levelup step with half hours', () => {
  const labels = [...skillLabels, { label: 'Have it', hours: 15, portal: 'elatih' }];
  const p = { skills: ['Have it', 'Other'], levels: { 'Have it': 'basic' }, sdgs: [] };
  const step = buildPathway(role, p, c, 'moderate', labels).find((s) => s.label === 'Have it');
  expect(step).toEqual({ label: 'Have it', status: 'levelup', hours: 8, importance: 0.8, rising: false, portal: 'elatih' });
});
it('good and strong skills are not steps', () => {
  for (const level of ['good', 'strong']) {
    const p = { skills: ['Have it', 'Other'], levels: { 'Have it': level }, sdgs: [] };
    expect(buildPathway(role, p, c, 'moderate', skillLabels).some((s) => s.label === 'Have it')).toBe(false);
  }
});
it('levelup step keeps label for progress', () => {
  const p = { skills: role.skills.map((s) => s.label), levels: { 'Gap low': 'basic' }, sdgs: [] };
  expect(buildPathway(role, p, c, 'moderate', skillLabels).map((s) => s.label)).toEqual(['Gap low']);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/scoring.test.js`
Expected: FAIL (`LEVEL_CREDIT` / `skillLevel` / `skillCredit` not exported; `levelup` missing).

- [ ] **Step 3: Implement in `src/lib/scoring.js`**

Add `LEVEL_CREDIT`, `skillLevel`, `skillCredit` (signatures above). In `scoreRole` replace the local `credit` table with `skillCredit(s.label, profile, ctx.similar)`. In `buildPathway` compute the status; for `have`, return `null` unless `skillLevel(...) === 'basic'`, in which case use status `'levelup'` and half hours (same rounding as similar).

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all pass (old tests unchanged, including `fairness`).

- [ ] **Step 5: Update the docs**

- `README.md`, formula block: replace the `fit` line with
  `fit        = sum(credit) / number of role skills * 100      (have: Strong 1, Good 0.75, Basic 0.5; similar = 0.5; gap = 0)`
  and add one line under the block: `A skill with no level set counts as Strong. Basic skills you have appear in the pathway as shorter "Level up" steps.`
- `CLAUDE.md`, the rule "Scoring formula and factors (Moderate 0.6, Fast 1.0) are fixed…": add `and level credits (Basic 0.5, Good 0.75, Strong 1.0, approved 2026-10-21)` before "are fixed".

- [ ] **Step 6: Commit**

```bash
git add src/lib/scoring.js tests/scoring.test.js README.md CLAUDE.md
git commit -m "feat: skill level counts in the fit score"
```

---

### Task 2: Show levels in the explanations and radar

**Files:**
- Modify: `src/lib/roleView.js` (`scoreBreakdown` fit detail)
- Modify: `src/lib/pathwayView.js` (`whyText`)
- Modify: `src/lib/radar.js` (`roleRadarValues`)
- Modify: `src/components/RoleCard.jsx` (screen-reader status text)
- Modify: `tests/roleView.test.js`, `tests/pathwayView.test.js`, `tests/radar.test.js`

**Interfaces:**
- Consumes: `LEVEL_CREDIT`, `skillLevel(label, profile)`, `skillCredit(label, profile, similar)` from Task 1; pathway status `'levelup'`.
- Produces: no new exports. `roleRadarValues(role, profile, similar, scenario)` keeps its signature.

- [ ] **Step 1: Write the failing tests**

`tests/roleView.test.js`, change the existing expectation at the `parts[0].detail` line to:

```js
expect(parts[0].detail).toBe('1.5 of 4 skills (your level counts: Strong 1, Good 0.75, Basic 0.5; similar skills count half).');
```

`tests/pathwayView.test.js`, add:

```js
it('explains a levelup step', () => {
  expect(whyText({ status: 'levelup', rising: false })).toBe(
    'You have this skill at Basic level, so this step is shorter. Core to the role today.',
  );
});
```

`tests/radar.test.js`, add (build a role with skills `x` and `y`, profile `{ skills: ['x', 'y'], levels: { x: 'basic' } }`):

```js
it('you values follow the skill level', () => {
  const values = roleRadarValues(role, profile, {}, 'moderate');
  expect(values.you).toEqual([0.5, 1]);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/roleView.test.js tests/pathwayView.test.js tests/radar.test.js`
Expected: FAIL on the three new or changed expectations.

- [ ] **Step 3: Implement**

- `scoreBreakdown`: the fit `detail` text becomes exactly `` `${formatNumber(score.earned)} of ${role.skills.length} skills (your level counts: Strong 1, Good 0.75, Basic 0.5; similar skills count half).` `` Build the level numbers from `LEVEL_CREDIT` with `String(...)`, not `formatNumber` (which rounds 0.75 to 0.8).
- `whyText`: lead for `levelup` is `'You have this skill at Basic level, so this step is shorter. '`; others unchanged.
- `roleRadarValues`: `you` uses `skillCredit(...)` for have and similar; a gap keeps `YOU_LEVEL.gap` (0.06) so the shape stays visible. Keep `YOU_LEVEL` exported unchanged.
- `RoleCard.jsx`: for a `have` skill the screen-reader text becomes `you have it, ${level} level` with `level` from `skillLevel` shown as `Basic` / `Good` / `Strong`, only when `profile.levels` has an entry for that skill; otherwise `you have it` as today.

- [ ] **Step 4: Run all tests and the build**

Run: `npm test` then `npm run build`
Expected: all tests pass; build writes `dist/` with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/roleView.js src/lib/pathwayView.js src/lib/radar.js src/components/RoleCard.jsx tests/roleView.test.js tests/pathwayView.test.js tests/radar.test.js
git commit -m "feat: show skill levels in score, pathway and radar"
```

---

## After both tasks

- Run `python -m unittest discover pipeline/tests` (expect 67 OK; pipeline is unchanged).
- Check the app on http://localhost:3000 after `npm run build` (front-end only, no server restart needed): sample students show the same scores as before, because samples have no levels yet (they get levels in P-B).
