# FutureReady MY: three-minute demo script

Stage 2 branch has 20 roles; numbers below are from main.

Numbers re-checked on 24 Oct 2026 with `src/lib` (`rankRoles` + `orderForGoal`) and `data/*.json`, after observed AI use (Anthropic Economic Index) started to count in the outlook for the roles it could measure (14 of 20; the rest keep their placeholder labels). Plan: `docs/superpowers/plans/2026-10-24-fast-ai-score-change.md`.
Job trend data: OpenDOSM, fetched 20 Oct 2026 (latest year 2025). If you press Refresh data before the demo, re-check the numbers.

Pending (say so if asked):
- **Task labels**: 6 of the 20 scored roles (Data Analyst, Digital Learning Specialist, Website Developer, UX Designer, Digital Content Writer, Tax Consultant) have too few tasks matched to measured AI use and still use placeholder labels ("Sample labels" badge); the other 14 use observed AI use for the tasks that matched and labels for the rest. The AI-use match was judged by Claude on 80 pairs (97% same or related) and awaits teammate review.
- **Replit URL**: deploy check not done yet. Demo on localhost until then.
- **Explore all roles**: its skill search works anywhere; uploading a CV there needs the local AI model, so on Replit use the skill search. Its roles come from eMASCO (read 23 Oct 2026) and are **not scored for AI risk**; the numbers below were checked on 23 Oct on localhost.

## 0:00 to 0:20 · Home
- Open the app. Say: "FutureReady MY helps diploma and foundation students see which jobs are changing with AI, and what to learn next."
- Press the start button.

## 0:20 to 0:40 · About
- Pick **Student**, major **IT**. (Same as the Aina sample.)

## 0:40 to 1:00 · Skills
- Show the CV upload. Say: "The PDF is read in your browser. Its text goes to our own server for an AI check, and it is not saved or logged."
- Or press **I don't have a CV** and pick skills: Python programming (Good), SQL and databases (Strong), Spreadsheets (Good), Communication (Good).
- Point at a level switch: "Your level counts in the fit score."

## 1:00 to 1:15 · Goal
- Pick **Upgrade in my field**. (Later we show **Move to a new role**.)

## 1:15 to 2:00 · Matches
- Goal order for Aina (Moderate): **Data Analyst 76**, Healthcare Analyst 62, Database Assistant 61. (Healthcare Analyst rose from 57 after the 22 Oct similar-skill update: SQL now gives half credit for Healthcare data and records.)
- Point at the teal box: "Her highest score is **Business Intelligence Analyst (79)**, but it is not linked to her major, so it is rank 8. The goal changes the order, never the score." Press **Show it**.
- Point at the **Sources** line on a card (eMASCO page, OpenDOSM, ILO).
- Open **Why this score?**: skill fit per skill, outlook, SDG bonus, each with source and date.
- Switch **Moderate → Fast**: Data Analyst goes 76 → 73; Business Intelligence Analyst 79 → 76. "Fast AI adoption counts automation more." In **Why this score?** show the new line: the share of the role's tasks that use observed AI use, and which tasks AI is already used for.
- Scroll to **Trends behind your matches**: radar, job market chart, AI exposure. Press **Refresh data** to show the live OpenDOSM fetch.
- Show **Move**: sample Mei Ling (Diploma Business, wants "Working with data"). Goal order (Moderate): Healthcare Analyst 62, Database Assistant 58, Data Analyst 56. Her top score, Business Intelligence Analyst 73, is rank 4 because it is not in the sectors she picked.

## 2:00 to 2:30 · Explore all roles
- At the bottom of Matches press **Explore all roles**. Say: "Our 20 roles are scored. eMASCO, the official Malaysian occupation list, has about 1,800 roles from every field. Here we only show similarity, never an AI-risk score."
- In **Search skills** type "bank reconciliation", pick the first result, then "payroll" and "invoice", so 3 skills are picked.
- Point at the level switch (**Up to diploma** is the default): "Roles that need a degree are hidden, so a diploma student sees realistic roles first." The note says how many were hidden (5 with these skills).
- Show the cards: Billing Clerk 0.64, Finance Clerk 0.63, Accounting Technician 0.63. Open **Why this role** and **Skills I may be missing**; press **View on eMASCO** on one card.
- Press **Include degree roles**: Accountant appears, with its civil-service grades merged into one card.
- Say: "The bar is an AI similarity estimate, not a percentage. It shows the source and date."
- Optional if time: **Use my CV** with a made-up CV (not a real one). This needs the local model.

## 2:30 to 2:50 · What to study
- Open What to study for one role. Course links go only to HRD Corp e-Latih, HRD Corp claimable courses and MyTVET.
- Show the **SDG panel**: which UN goals the role and skills link to.

## 2:50 to 3:00 · Close

**Say this:** "We are honest about our limits. Scores are estimates. Every number shows its source and date. Some role labels still say 'Sample'; the rest use observed AI use from the Anthropic Economic Index, which measures one assistant and mostly US users. Roles in Explore are not scored for AI risk at all. Our team's mappings are drafts until a teammate reviews them. Your PDF is read in your browser; its text goes to our own server for an AI check and is not saved or logged. The app supports your decision; it does not make it."

Backup: Ravi (Diploma E&E, upgrade, Moderate): Solar Cell Technician 87, Energy Audit Technician 70, Renewable Energy Engineer 66. His top score is already first, so no teal box.
