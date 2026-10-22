# CV test set (draft, awaiting team review)

Twelve **made-up** CVs and the skills each one really shows. Used by `scripts/eval-cv.mjs`
to measure how well the app finds skills in a CV and to set the AI cutoff.

- **Drafted by Claude on 2026-10-22 (cv11-cv12 added the same day for the accounting skills). Awaiting team review.** Please check each answer.
- All people, names, places of study and work are invented. **No real CVs** are used
  (the hackathon brief forbids them). Any likeness to a real person is by chance.
- `cv01`-`cv03` are the three demo students in `data/samples.json` (Aina, Ravi, Mei Ling);
  their answers are the same skills as the sample profiles.
- `answers.json`: for each CV, its set (`tune` or `holdout`), the person, and the skills a
  careful human would say the CV shows. Skills come only from the skill labels in
  `data/skills.json` (the 25 original skills, plus the 13 accounting skills for cv11-cv12).
- The CVs and answers were written **before** any model was run and were not changed after.

## Sets
- Tuning (used to choose the cutoff): cv01, cv02, cv04, cv05, cv07, cv09, cv11.
- Held-out (only for the final numbers, never for tuning): cv03, cv06, cv08, cv10, cv12.

## Fields
| CV | Person | Field | Set |
|---|---|---|---|
| cv01 | Aina | Diploma IT | tune |
| cv02 | Ravi | Diploma E&E | tune |
| cv03 | Mei Ling | Diploma Business | holdout |
| cv04 | Wan Nurul Izzati | Diploma Multimedia Design | tune |
| cv05 | Muhammad Faiz | Diploma Computer Science | tune |
| cv06 | Siti Hajar | Diploma Health Information Management | holdout |
| cv07 | Lim Wei Jie | Diploma Renewable Energy Technology | tune |
| cv08 | Nurul Ain | Diploma Marketing | holdout |
| cv09 | Kavitha | Diploma Computer Networking | tune |
| cv10 | Ahmad Hafiz | Diploma Business Administration | holdout |
| cv11 | Nur Syafiqah | Diploma in Accounting | tune |
| cv12 | Chong Pei Shan | Bachelor of Accounting (Hons) | holdout |

## Bahasa Malaysia lines (18)
cv01 (2), cv02 (2), cv03 (2), cv04 (1), cv05 (1), cv06 (1), cv07 (1), cv08 (1), cv09 (2), cv10 (1), cv11 (2), cv12 (2).

## Trap lines (18) — they show **no** skill (or not the one they seem to)
| CV | Line | Trap for |
|---|---|---|
| cv03 | Dressing a shop window for the Chinese New Year sale | Graphic design |
| cv04 | Wan Nurul Izzati binti Wan Ahmad (name) | Networking ("WAN") |
| cv04 | I excel at teamwork and enjoy group projects | Spreadsheets (Excel); Teamwork is counted |
| cv05 | Attended a career networking night organised by the faculty | Networking basics |
| cv05 | Energetic and positive person who likes to learn | Energy auditing |
| cv06 | Enjoy reading a cooking blog in my free time | Content writing |
| cv07 | Member of the Python reptile club at college | Python programming |
| cv07 | Repairing fishing nets with my father on weekends | Networking basics |
| cv08 | Sold solar-powered garden lights at a weekend night market | Solar PV basics |
| cv08 | Made wired flower arrangements for friends' weddings | Electrical wiring |
| cv09 | Part-time security guard at a shopping mall on weekends | Network security |
| cv10 | Dean's List award for academic excellence | Spreadsheets (Excel) |
| cv10 | Referee: Encik Wan Azman, lecturer | Networking ("WAN") |
| cv11 | Recorded daily sales and purchase invoices in SQL Account | SQL and databases (it is accounting software; Accounting software (ERP) is counted) |
| cv11 | Passed the audition for the college choir | Auditing and internal control |
| cv11 | Wrote a general studies essay on the sugar tax on soft drinks | Tax compliance / Tax planning |
| cv12 | Renewed the road tax and insurance for the family car every year | Tax compliance |
| cv12 | Audited a free online photography course in my spare time | Auditing and internal control |

Note: a diploma name alone (e.g. "Diploma in Computer Networking") is not counted as a skill;
every answer skill is shown by at least one work or study line.

PDFs exist for cv01-cv10 only (`pdf/`); cv11-cv12 are text only (the eval reads the `.txt` files).
