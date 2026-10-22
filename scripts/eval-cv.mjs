// CV skill-finding accuracy and the AI cutoff (spec section 4).
// Run: node scripts/eval-cv.mjs [--cutoffs 0.40:0.80:0.01]
// Uses the made-up CVs in testing/cv_test_set/ and writes testing/results/cv_eval.csv.
// Model: the repo's models/ folder (or MODELS_DIR) when present, so nothing is downloaded.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SET_DIR = path.join(ROOT, 'testing', 'cv_test_set')
const OUTPUT = path.join(ROOT, 'testing', 'results', 'cv_eval.csv')
const MODES = ['label', 'label+keywords']
const TARGET_PRECISION = 0.9

// Pure: compare found skill labels with the expected ones.
export function scoreCv(found, expected) {
  const want = new Set(expected)
  const got = new Set(found)
  let tp = 0
  for (const label of got) if (want.has(label)) tp++
  return { tp, fp: got.size - tp, fn: want.size - tp }
}

function summarise(counts) {
  const total = counts.reduce((sum, c) => ({ tp: sum.tp + c.tp, fp: sum.fp + c.fp, fn: sum.fn + c.fn }), { tp: 0, fp: 0, fn: 0 })
  const found = total.tp + total.fp
  return {
    ...total,
    precision: found ? total.tp / found : NaN,
    recall: total.tp + total.fn ? total.tp / (total.tp + total.fn) : NaN
  }
}

function parseCutoffs(argv) {
  const i = argv.indexOf('--cutoffs')
  const spec = i >= 0 ? argv[i + 1] : '0.40:0.80:0.01'
  const [from, to, step] = spec.split(':').map(Number)
  if (![from, to, step].every(Number.isFinite) || step <= 0 || to < from) throw new Error(`Bad --cutoffs: ${spec}`)
  const list = []
  for (let k = 0; from + k * step <= to + 1e-9; k++) list.push(Math.round((from + k * step) * 10000) / 10000)
  return list
}

const fmt = (x) => (Number.isFinite(x) ? x.toFixed(4) : '')

async function main() {
  const { createEmbedder } = await import('../server/embed.js')
  const { matchSkills, splitCvLines } = await import('../server/cvMatch.js')
  const { loadSkillVectors } = await import('../server/skillVectors.js')
  const { extractSkills, mergeMatches } = await import('../src/lib/cvSkills.js')

  const cutoffs = parseCutoffs(process.argv)
  const skills = JSON.parse(readFileSync(path.join(ROOT, 'data', 'skills.json'), 'utf8')).labels
  const appLabels = new Set(skills.map((s) => s.label))
  const answers = JSON.parse(readFileSync(path.join(SET_DIR, 'answers.json'), 'utf8'))

  // Step 1 check: every answer skill is one of the app's skill labels (data/skills.json).
  for (const [id, answer] of Object.entries(answers)) {
    for (const label of answer.skills) {
      if (!appLabels.has(label)) throw new Error(`${id}: "${label}" is not in data/skills.json`)
    }
    if (!['tune', 'holdout'].includes(answer.set)) throw new Error(`${id}: bad set ${answer.set}`)
  }

  const cvs = Object.entries(answers).map(([id, answer]) => {
    const text = readFileSync(path.join(SET_DIR, `${id}.txt`), 'utf8')
    return { id, ...answer, text, lines: splitCvLines(text), keyword: extractSkills(text, skills) }
  })

  const modelsDir = process.env.MODELS_DIR || path.join(ROOT, 'models')
  if (!existsSync(path.join(modelsDir, 'Xenova', 'bge-m3', 'onnx', 'model.onnx'))) {
    throw new Error(`Model not found in ${modelsDir}. Set MODELS_DIR.`)
  }
  const embedder = createEmbedder({ modelsDir })
  const started = Date.now()
  await embedder.warmUp()
  console.log(`Model ${embedder.modelId} loaded in ${((Date.now() - started) / 1000).toFixed(1)} s`)

  for (const cv of cvs) cv.lineVectors = await embedder.embed(cv.lines)

  // All AI scores per mode (cutoff -1 keeps every skill's best line), filtered per cutoff below.
  const allAi = {}
  for (const mode of MODES) {
    const { vectorSets } = await loadSkillVectors({
      skills,
      embedder,
      cachePath: path.join(ROOT, 'data', 'cache', `eval_skill_vectors_${mode.replace('+', '_')}.json`),
      mode
    })
    allAi[mode] = Object.fromEntries(cvs.map((cv) => [cv.id, matchSkills(cv.lines, cv.lineVectors, skills, vectorSets, -1)]))
  }

  const results = (mode, cutoff, set) => {
    const chosen = cvs.filter((cv) => cv.set === set)
    const perCv = chosen.map((cv) => {
      const ai = allAi[mode][cv.id].filter((m) => m.score >= cutoff)
      const combined = mergeMatches(cv.keyword, ai)
      return {
        id: cv.id,
        ai,
        keyword: scoreCv(cv.keyword.map((m) => m.label), cv.skills),
        aiScore: scoreCv(ai.map((m) => m.label), cv.skills),
        combined: scoreCv(combined.map((m) => m.label), cv.skills)
      }
    })
    return {
      perCv,
      keyword: summarise(perCv.map((r) => r.keyword)),
      ai: summarise(perCv.map((r) => r.aiScore)),
      combined: summarise(perCv.map((r) => r.combined))
    }
  }

  const date = new Date().toISOString().slice(0, 10)
  const rows = [['date', 'model', 'mode', 'set', 'method', 'cutoff', 'precision', 'recall', 'tp', 'fp', 'fn']]
  const row = (mode, set, method, cutoff, s) =>
    rows.push([date, embedder.modelId, mode, set, method, cutoff === '' ? '' : cutoff.toFixed(2), fmt(s.precision), fmt(s.recall), s.tp, s.fp, s.fn])

  const setIds = (set) => cvs.filter((cv) => cv.set === set).map((cv) => cv.id).join(', ')
  console.log(`\nTuning set (${setIds('tune')})`)
  const best = []
  for (const mode of MODES) {
    console.log(`\nmode=${mode}`)
    console.log('cutoff  ai_P    ai_R    comb_P  comb_R  (tp/fp/fn combined)')
    let keywordLogged = false
    let pick = null
    for (const cutoff of cutoffs) {
      const r = results(mode, cutoff, 'tune')
      if (!keywordLogged) {
        row(mode, 'tune', 'keyword', '', r.keyword)
        console.log(`keyword: P=${fmt(r.keyword.precision)} R=${fmt(r.keyword.recall)} (${r.keyword.tp}/${r.keyword.fp}/${r.keyword.fn})`)
        keywordLogged = true
      }
      row(mode, 'tune', 'ai', cutoff, r.ai)
      row(mode, 'tune', 'combined', cutoff, r.combined)
      console.log(`${cutoff.toFixed(2)}    ${fmt(r.ai.precision)}  ${fmt(r.ai.recall)}  ${fmt(r.combined.precision)}  ${fmt(r.combined.recall)}  (${r.combined.tp}/${r.combined.fp}/${r.combined.fn})`)
      if (!pick && r.combined.precision >= TARGET_PRECISION) pick = { mode, cutoff, ...r.combined }
      best.push({ mode, cutoff, ...r.combined })
    }
    console.log(pick ? `lowest cutoff with combined precision >= ${TARGET_PRECISION}: ${pick.cutoff.toFixed(2)} (recall ${fmt(pick.recall)})` : `no cutoff reaches ${TARGET_PRECISION}`)
    if (pick) best.push({ ...pick, picked: true })
  }

  // Rule: lowest cutoff with tuning combined precision >= 0.90, best recall across modes, tie -> 'label'.
  const picks = best.filter((b) => b.picked)
  let chosen
  let reached = true
  if (picks.length) {
    chosen = picks.reduce((a, b) => (b.recall > a.recall ? b : a))
  } else {
    // Fallback: highest precision; then higher recall; then 'label'; then lower cutoff.
    reached = false
    chosen = best.reduce((a, b) => {
      if (b.precision !== a.precision) return b.precision > a.precision ? b : a
      if (b.recall !== a.recall) return b.recall > a.recall ? b : a
      return a
    })
  }
  console.log(`\nCHOSEN: SKILL_TEXT_MODE='${chosen.mode}' CUTOFF=${chosen.cutoff.toFixed(2)}` +
    (reached ? '' : ` (FLAG: no cutoff reached precision ${TARGET_PRECISION}; highest-precision cutoff kept)`))

  const h = results(chosen.mode, chosen.cutoff, 'holdout')
  row(chosen.mode, 'holdout', 'keyword', '', h.keyword)
  row(chosen.mode, 'holdout', 'ai', chosen.cutoff, h.ai)
  row(chosen.mode, 'holdout', 'combined', chosen.cutoff, h.combined)
  console.log(`\nHeld-out set (${setIds('holdout')}), chosen mode and cutoff`)
  for (const method of ['keyword', 'ai', 'combined']) {
    const s = h[method]
    console.log(`${method.padEnd(8)} P=${fmt(s.precision)} R=${fmt(s.recall)} tp=${s.tp} fp=${s.fp} fn=${s.fn}`)
  }
  console.log('\nPer held-out CV (tp/fp/fn) and AI evidence lines')
  for (const r of h.perCv) {
    const expected = answers[r.id].skills
    console.log(`${r.id}: keyword ${r.keyword.tp}/${r.keyword.fp}/${r.keyword.fn}  ai ${r.aiScore.tp}/${r.aiScore.fp}/${r.aiScore.fn}  combined ${r.combined.tp}/${r.combined.fp}/${r.combined.fn}`)
    for (const m of r.ai) console.log(`   ${expected.includes(m.label) ? 'right' : 'WRONG'} ${m.score.toFixed(4)} ${m.label} <- "${m.evidence}"`)
  }
  console.log('\nPer tuning CV at the chosen cutoff (combined tp/fp/fn)')
  for (const r of results(chosen.mode, chosen.cutoff, 'tune').perCv) {
    console.log(`${r.id}: keyword ${r.keyword.tp}/${r.keyword.fp}/${r.keyword.fn}  ai ${r.aiScore.tp}/${r.aiScore.fp}/${r.aiScore.fn}  combined ${r.combined.tp}/${r.combined.fp}/${r.combined.fn}`)
    const expected = answers[r.id].skills
    for (const m of r.ai) console.log(`   ${expected.includes(m.label) ? 'right' : 'WRONG'} ${m.score.toFixed(4)} ${m.label} <- "${m.evidence}"`)
  }

  writeFileSync(OUTPUT, rows.map((r) => r.join(',')).join('\n') + '\n')
  console.log(`\nWrote ${path.relative(ROOT, OUTPUT)}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
