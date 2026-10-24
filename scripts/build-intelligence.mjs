// Builds the occupation intelligence store data/intel/ from the saved source files (no model, no network).
// Run: node scripts/build-intelligence.mjs [--input data] [--out data/intel] [--mode live|replay|test] [--label "text"]
// A record whose inputs did not change keeps its version; a changed one gets the next version.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runIntelligenceBuild } from './lib/intelligenceRun.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MODES = ['live', 'replay', 'test']

function argument(name, fallback) {
  const position = process.argv.indexOf(`--${name}`)
  return position > 0 && process.argv[position + 1] ? process.argv[position + 1] : fallback
}

const mode = argument('mode', 'live')
if (!MODES.includes(mode)) {
  console.error(`--mode must be one of ${MODES.join(', ')}`)
  process.exit(1)
}
const inputDir = path.resolve(ROOT, argument('input', 'data'))
const outDir = path.resolve(ROOT, argument('out', path.join('data', 'intel')))
const { run } = await runIntelligenceBuild({ inputDir, outDir, mode, label: argument('label', '') })
const { counts } = run
console.log(`Run ${run.runId}: ${counts.processed} processed, ${counts.new} new, ${counts.updated} updated, ${counts.unchanged} unchanged, ${counts.gone} not in the latest source`)
console.log('Fields:', JSON.stringify(run.fieldCounts))
console.log('Confidence:', JSON.stringify(run.confidenceCounts), ' Outlook:', JSON.stringify(run.outlookCounts))
