// One-off check: does the ONNX bge-m3 give the same skill-pair results as the RunPod run?
// Run: node scripts/onnx-check.mjs
// Optional: ONNX_LOCAL_MODELS=<folder holding Xenova/bge-m3/...> loads files from disk instead of the hub.
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { env } from '@huggingface/transformers'
import { createEmbedder } from '../server/embed.js'

if (process.env.ONNX_LOCAL_MODELS) {
  env.localModelPath = process.env.ONNX_LOCAL_MODELS
  env.allowRemoteModels = false
}

const COLUMN = 'onnx_bge_m3'
const PAIRS = 'testing/skill_pair_test_set.csv'
const DETAILS = 'testing/results/onnx_details.csv'
const SUMMARY = 'testing/results/onnx_check.csv'

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (c !== '\r') cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  const [header, ...body] = rows
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.replace(/^﻿/, ''), r[i]])))
}

const quote = (v) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v)
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0)

const pairs = parseCsv(readFileSync(PAIRS, 'utf8'))
const embedder = createEmbedder()
const started = Date.now()
await embedder.warmUp()
console.log(`Model loaded in ${((Date.now() - started) / 1000).toFixed(1)} s`)
const a = await embedder.embed(pairs.map((p) => p.skill_a))
const b = await embedder.embed(pairs.map((p) => p.skill_b))
const scores = pairs.map((_, i) => dot(a[i], b[i])) // vectors are normalised, so dot = cosine

const lines = [['id', 'skill_a', 'skill_b', 'expected', COLUMN].join(',')]
pairs.forEach((p, i) => {
  lines.push([p.id, p.skill_a, p.skill_b, p.expected, scores[i].toFixed(4)].map(quote).join(','))
})
writeFileSync(DETAILS, lines.join('\n') + '\n')

const python = process.platform === 'win32' ? 'python' : 'python3'
execFileSync(python, ['pipeline/summarise_scores.py', DETAILS, COLUMN, SUMMARY], { stdio: 'inherit' })
const [result] = parseCsv(readFileSync(SUMMARY, 'utf8'))

const checks = [
  ['spearman', Number(result.spearman), 0.5377, 0.02],
  ['order_errors', Number(result.order_errors), 71, 3],
  ['bm_pair_score', Number(result.bm_pair_score), 0.7583, 0.03]
]
let pass = true
for (const [name, got, want, tolerance] of checks) {
  const ok = Math.abs(got - want) <= tolerance + 1e-9
  if (!ok) pass = false
  console.log(`${name}: ${got} (target ${want} +/- ${tolerance}) ${ok ? 'ok' : 'OUT'}`)
}
console.log(pass ? 'PASS' : 'FAIL')
process.exitCode = pass ? 0 : 1
