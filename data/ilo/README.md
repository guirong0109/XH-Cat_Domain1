# ILO 2025 GenAI exposure scores

Source: ILO Working Paper 140 (May 2025), "Generative AI and Jobs: A Refined Global Index of Occupational Exposure". Table A1.

Official pages (downloaded 2026-10-21):
- Publication page: https://www.ilo.org/node/706766
- PDF: https://www.ilo.org/sites/default/files/2025-05/WP140_web.pdf (saved as `WP140_web.pdf`)
- Read online (HTML): https://webapps.ilo.org/static/english/intserv/working-papers/wp140/index.html (saved as `wp140_index.html`)

Licence: CC BY 4.0, (c) ILO 2025. Credit the ILO and say if changes were made.
Attribution line as printed in the paper: "(c) International Labour Organization 2025" (Creative Commons Attribution 4.0 International, CC BY 4.0).

What we use: Table A1, columns Exposure, 4-digit code, Occupation Name, Mean, SD, unchanged. The only change is that the label "Minimal" (if present) is written "Minimal Exposure".
The scores are global (ISCO-08, 4-digit), not Malaysia-specific.

Rebuild: `python pipeline/import_ilo.py data/ilo/wp140_index.html data/ilo/ilo_2025_scores.json`
