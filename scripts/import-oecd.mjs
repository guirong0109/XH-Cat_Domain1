// Import OECD AI Capability Gap by major occupational group (Table 6.3) from the saved OECD paper.
// Usage: node scripts/import-oecd.mjs [pdf] [out]
// Source: OECD (2026), The OECD AI Exposure Measure, OECD AI Papers No. 59 (revised July 2026).
import fs from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseTable63 } from './lib/oecdTable.js';

const pdfPath = process.argv[2] || 'data/oecd/oecd_ai_exposure_measure_2026.pdf';
const outPath = process.argv[3] || 'data/oecd/oecd_2026_group_gaps.json';

const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(pdfPath)), useSystemFonts: true }).promise;
let text = null;
for (let n = 1; n <= doc.numPages; n++) {
  const page = await doc.getPage(n);
  const content = await page.getTextContent();
  const pageText = content.items.map((item) => item.str).join(' ');
  if (pageText.includes('Table 6.3.') && pageText.includes('Major Group Code')) { text = pageText; break; }
}
if (!text) throw new Error('Table 6.3 not found in the PDF');

const table = parseTable63(text);
const result = {
  source: 'OECD (2026), The OECD AI Exposure Measure: Mapping the OECD AI Capability Indicators to Occupations, OECD Artificial Intelligence Papers No. 59, Table 6.3, p. 29 (published 26 May 2026, revised July 2026), CC BY 4.0',
  url: 'https://www.oecd.org/en/publications/the-oecd-ai-exposure-measure_f3da0f0a-en.html',
  licence: 'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Credit the OECD and say if changes were made.',
  fetchedAt: new Date().toISOString().slice(0, 10),
  note: 'Gap = distance between what an occupation demands and what current AI can do. Lower = closer to AI = more exposed. Values are averages for US SOC major groups (O*NET), not Malaysia-specific and not per occupation.',
  domains: table.domains,
  average: table.average,
  groups: table.groups,
};
fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
console.log(`Wrote ${outPath}: ${Object.keys(result.groups).length} groups`);
