# CV accuracy re-measure after the accounting skills (A1, 2026-10-22)

Run: `node scripts/eval-cv.mjs` (model `Xenova/bge-m3` from the local `models/` folder). Raw numbers: `cv_eval.csv` in this folder.
Test set: `testing/cv_test_set/` (made-up CVs drafted by Claude, awaiting team review). New: cv11 (tune, Diploma in Accounting) and cv12 (holdout, Bachelor of Accounting), written with their answers before any run.

## Rule (spec `docs/superpowers/specs/2026-10-22-stage2-cv-reading-design.md` §4.4)
Lowest cutoff whose tuning-set combined precision is ≥ 0.90; best recall across modes; tie → `label`. The holdout set is never used for tuning.

| Mode | Lowest cutoff with tuning combined P ≥ 0.90 | Tuning combined P / R |
|---|---|---|
| `label` | 0.72 | 0.96 / 0.81 |
| `label+keywords` | 0.75 | 0.96 / 0.81 |

Same recall → tie → **`label`, cutoff 0.72 (unchanged)**. `server/cvMatch.js` is not changed.

## Held-out results, before and after
| Method | 22 Oct, before A1 (cv03, cv06, cv08, cv10) P / R | After A1 (+ cv12) P / R | tp / fp / fn after |
|---|---|---|---|
| Keyword | 0.80 / 0.57 | 0.85 / 0.55 | 11 / 2 / 9 |
| AI | 1.00 / 0.07 | 1.00 / 0.05 | 1 / 0 / 19 |
| Keyword + AI | 0.82 / 0.64 | 0.86 / 0.60 | 12 / 2 / 8 |

The 4 old held-out CVs give the same counts as before; the change comes only from cv12. Still **below the 0.90 precision target**: both wrong skills are old keyword trap hits (cv06 "cooking blog", cv08 "solar-powered garden lights").

## The AI on the finance CVs
At 0.72 the AI finds **no skill** on cv11 or cv12, so finance skills are found by keywords only (cv11: 5 of 6, cv12: 3 of 6).
Best AI scores (label mode, best line per skill), checked by hand:

| CV | Skill | Score | Best line | Check |
|---|---|---|---|---|
| cv11 | Project coordination | 0.7131 | "PROJECTS" (a heading) | wrong |
| cv11 | Bookkeeping and reconciliation | 0.6916 | "Prepared the monthly bank reconciliations…" | right skill, right line |
| cv11 | Tax compliance | 0.6159 | annual tax return to LHDN line | right skill, right line |
| cv11 | Accounting software (ERP) | 0.5917 | tax return line | right skill, wrong line |
| cv12 | Project coordination | 0.7131 | "PROJECTS" (a heading) | wrong |
| cv12 | Teamwork | 0.6281 | "INTERNSHIP" (a heading) | right skill, wrong line |
| cv12 | Financial reporting | 0.6125 | BM teamwork line | right skill, wrong line |
| cv12 | Budgeting and costing | 0.5996 | cafe budget line | right skill, right line |
| cv12 | Auditing and internal control | 0.5953 | audit working papers line | right skill, right line |

- **Headings:** "PROJECTS" scores 0.7131 for Project coordination on both CVs, only 0.01 under the cutoff.
- **Bahasa Malaysia-only lines are missed:** cv11 Payroll ("Mengira gaji bulanan dan caruman majikan…", below 0.59) and cv12 Financial reporting ("…penyata kewangan tahunan…") and Teamwork ("Bekerja dalam pasukan…") are found by neither keywords nor the AI.
- Keyword traps held: "SQL Account" did not count as SQL and databases; "audition", "audited a course", "sugar tax" and "road tax" found nothing.
- 2 finance CVs (12 skills) is a small test; treat the numbers as rough.
