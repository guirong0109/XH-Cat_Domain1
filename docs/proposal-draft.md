# FutureReady MY: proposal draft (Aiversecity Domain 1)

DRAFT for the teammate to edit. Written 24 Oct 2026 from `Domain 1.md`, the "Future-Ready Workforce System Design" PDF and the repo docs.
Marks: **BUILT** = works in the app today. **PLANNED** = in the design PDF only, not built. Do not present PLANNED items as working.
Still needed from the team: team names, the official submission format and length limit (not in `Domain 1.md`), and the deadline check.

---

## 1. Problem (who and when)

Malaysian diploma and foundation students pick a course and a first job without knowing which skills AI is changing. 56% of Malaysian professionals use AI at work but only 26% have formal training (Hays Asia Salary Guide 2025, quoted in the brief). More than 600,000 workers need reskilling within 3 to 5 years (MOSTI, quoted in the brief).
**Primary user:** a diploma or foundation student in the last year, choosing where to go next.
**Next users (PLANNED):** working adults at risk, HR teams, TVET and university career centres.
**Moment of need:** "I have skills today. Which future roles fit me, and what do I learn first?"

## 2. Approach (the chain in the brief)

Track AI and job signals → score how AI changes skills and roles → match the person to roles → ordered reskilling plan → SDG link for each role and skill.
Rules: numbers come from formulas on open data, never from an AI model; the app supports the student's decision and never makes it; every fact shows its source and date.
**Not "upload a CV and ask a chatbot":** the score is a fixed formula, the trend data refreshes, and a language model never produces a score.

## 3. The six must-have features: how each is delivered

| # | Feature | BUILT | PLANNED (design PDF) |
|---|---|---|---|
| 1 | Skills profile intake | 5-step journey: About you, Your skills (PDF CV read in the browser, or pick skills; Basic / Good / Strong), Your goal. CV matching by keyword plus bge-m3 meaning match; the student confirms every AI suggestion. Made-up sample students only. | Tasks per job with how often, AI tools used, "how do you do this today" (by hand / template / AI) |
| 2 | AI-trend signal layer (updatable, source and date) | OpenDOSM job growth (live refresh); ILO 2025 AI-exposure view; OpenAlex AI-research counts per skill (snapshot of 23 Oct 2026, 38 skills, committed); "Emerging this week" feed (OpenAlex plus public RSS, reviewed by an admin). Each shows source and date. | Weekly scheduled collection; spike detection (this week vs last 8 weeks, 2 or more independent sources); source credibility = tier x recency x agreement; capability scores 0 to 1 for 6 to 8 AI abilities |
| 3 | Future-role matching, explainable | 20 scored roles from eMASCO (MASCO 2020). Score = 0.6 fit + 0.4 outlook + SDG bonus, with "Why this score?" and a skills-gap list. "Explore all roles" covers 1,766 eMASCO roles (similarity estimate, "AI risk: not scored", "SDG: not tagged yet"). | Weight per skill = importance x AI adjustment; "ready to apply" line at 70%; one AI-readiness number |
| 4 | Personalised reskilling pathway | Ordered steps with estimated hours; each skill points to a real course page on HRD Corp e-Latih or MyTVET (title, price and length copied from the page; skills with no course show the portal link); progress ticks. | To-do list that updates the match and readiness; videos and courses with checked dates |
| 5 | SDG mapping | Every role and skill has at least one SDG tag (team draft); pathway shows which SDGs each step supports; chosen SDGs add up to +10 to the score. | Reasons on hover; SDG view for a team or region |
| 6 | Handling uncertainty | Moderate (factor 0.6) vs Fast (1.0) AI disruption changes outlook and rank; match ranges; every prediction called an estimate. | Scenario changes the AI adjustment on each skill weight and the skill type |

## 4. Rising and declining skills (the brief's core promise)

BUILT: "Skills in demand" groups each skill by the ILO exposure of the roles that use it, with OpenDOSM job growth. With today's data no skill falls in a shrinking group, and the app says so instead of inventing a decline.
BUILT (24 Oct): the "Your skills vs AI today" panel on the Study step. For each skill of the chosen role it shows a type (**AI-exposed**, **Mixed**, **Human-led** or **Not rated**) from the ILO 2025 exposure of our roles that use the skill, the student's status (Missing, Build up, On track), OpenAlex paper counts for the skill, a source link and official course links. It is not part of the score. Honest limit: with our 20 roles, 33 of 38 skills fall in "AI-exposed", so the type separates skills only weakly (4 are human-led, 1 mixed).
BUILT (24 Oct): a "Use AI in your job" card for the chosen role. It shows the ILO rating of the role's closest occupation and real AI courses on e-Latih: general ones for any job, and ones tied to the role's own skills (for a Data Analyst: ChatGPT for data processing, machine learning basics). The portals have no course on "AI in big data", so the closest real ones are listed and the card says so. The course-to-skill matching is a team draft.
PLANNED: a "new AI skill" type, "how do you do this today" (by hand / with templates / with AI), and capability scores from research volume, real-usage data and expert indices.
Honest limit: the AI-exposure labels on the 20 roles are placeholders ("Sample" badge) until the labelling run is done.

## 5. Hardest risk and fallback

**Hardest risk:** reliable, updatable Malaysian job-market data (no free, allowed live job-ad source).
**Fallback (BUILT):** dated official OpenDOSM releases; a refresh that keeps the last good file and shows "last updated"; ILO and OpenAlex as free global signals.
Other risks from the PDF, with fallbacks:

| Risk | Fallback |
|---|---|
| The model invents facts or links | PLANNED: cite-or-drop, ID check, quote check; links come only from our own data. BUILT: course links go only to the three official portals; roles, tasks and skills come only from eMASCO. |
| Hype or rumours drive results | News and feeds are information only and never change a score ("Not part of the score"). PLANNED: tiers and the 2-source rule. |
| Embedding matches are wrong | BUILT: model chosen on 30 labelled skill pairs; the student confirms every AI match; accuracy shown honestly (held-out CV precision 0.86, recall 0.60). |
| API limits or outages | BUILT: last saved data with a date; OpenAlex 429 handled. |
| Unfair advice | BUILT: no age, gender or background used; a fairness test in the repo; made-up data in the demo. |

## 6. Rules and AI disclosure (from the brief, section 6)

- Data: public, open or made-up only. No real CVs: the demo uses sample students and made-up CVs.
- Language model use (must be disclosed): bge-m3 embeds CV lines and skills (CV text is not stored or logged); a language model tags and summarises the Emerging feed (labelled "AI estimate", pending human review). Name the provider in the final text. **Team: confirm the wording.**
- Human-centred: the student decides; hints only suggest.
- Out of scope respected: no course content, no payments, no recruitment integration.

## 7. Evidence for feasibility (tests already done)

- 30-pair skill test on RunPod: 5 embedding models compared; bge-m3 chosen because it reads Bahasa Malaysia ("perakaunan" vs "accounting" 0.758).
- Sample students run end to end; ranking changes with scenario and SDG choice.
- 653 app tests and 197 data-pipeline tests pass (re-run before submission).
- Live trend refresh with source and date on screen.
- PLANNED validation from the PDF: domain-rating test on about 15 labelled sources (not done; only needed if that source check is built).

## 8. Expected outcome (what the user walks away with)

In a few minutes a student goes from profile to ranked future roles, a skills-gap list and an ordered pathway with hours and official course links, sees how AI exposure and job growth move the ranking, and sees how each role and skill connects to the SDGs.
Output visibly changes when trend data changes: Refresh data re-ranks roles and shows a re-plan notice.

## 8b. How the data stays current

- **Built:** each data source shows when it was last updated in a "Data freshness" list on the Matches page; data past its limit is still shown with its date and marked.
- **Built:** a course check script opens every saved course page (2 seconds apart) and records whether it is unchanged, changed or gone. A gone course is hidden and the portal link shows instead; a changed page is flagged. It never edits any team file.
- **Built:** the OpenDOSM, OpenAlex and portal-link refreshes (Refresh data button).
- **Human step, on purpose:** adding or changing a course, role or skill is approved by a person.
- **Built (24 Oct):** a weekly GitHub Actions job (Mondays 02:00 UTC) runs the trend, research, reference-link and course-page refreshes and saves any changed data files to the repo, so Replit gets them when it redeploys. It never changes team-written files and skips the Emerging feed (needs a model key). It is on `main` and ran once by hand on 24 Oct. Honest limit found in that run: GitHub's servers could read OpenDOSM and MyTVET but not OpenAlex, eMASCO or e-Latih (they refuse or limit those servers), so those refreshes keep the last good file and also run from the team's PC with `node scripts/refresh-data.mjs`. The freshness list shows the real age of each source either way.
- **Planned:** re-running the saved course searches to suggest new courses for a person to approve.
- **Limit:** a weekly check means "continuously" in a weekly sense. OpenAlex can refuse requests (HTTP 429) on some days; the app then keeps the last file and shows its date.

## 9. Not built yet (say this plainly)

- Employer / HR heatmap and BM / Chinese interface: preview screens only.
- Skill badges; low-bandwidth mode.
- Real AI-exposure labels for the 20 roles (RunPod labelling job on hold).
- Everything marked PLANNED above.

## 10. Left out of the PDF on purpose

Reddit, Bluesky, Hacker News, GDELT and paid domain-rating sources (not official or open); a contact email in the bot's User-Agent (the team's email is never sent anywhere); new dependencies such as FastAPI, Chroma and Ollama (no approval; the app uses Express, JSON files and bge-m3).
