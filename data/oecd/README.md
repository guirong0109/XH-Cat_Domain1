# OECD AI Capability Gap by occupation group

Source: OECD (2026), "The OECD AI Exposure Measure: Mapping the OECD AI Capability Indicators to Occupations", OECD Artificial Intelligence Papers No. 59. Published 26 May 2026, revised July 2026.
- Publication page (checked in a browser on 24 Oct 2026): https://www.oecd.org/en/publications/the-oecd-ai-exposure-measure_f3da0f0a-en.html
- PDF saved here as `oecd_ai_exposure_measure_2026.pdf` (the file the user downloaded from the OECD).
- Licence: CC BY 4.0. Credit the OECD and say if changes were made.

What we use: Table 6.3 (printed page 29): the gap for each of nine capability domains and the overall index, for 22 US SOC major groups, plus the all-group average per domain. Values are unchanged.
Limits: US occupations (O*NET), group averages (not per occupation), not Malaysia-specific. A low gap means current AI is close to what the work demands (more exposed).
Our own step: `data/team/oecd_map.json` places each of our 20 roles in a SOC group. It is a team draft, not an official table.
The OECD site blocks automatic link checkers (HTTP 403), so the link is not in the app's Refresh references check; it opens in a normal browser.

Rebuild: `node scripts/import-oecd.mjs` then `python pipeline/build_data.py`.
