// One run of the occupation intelligence pipeline: saved source files -> field enrichment -> versioned records.
// Reads (under inputDir): emasco/occupations.json, emasco/vectors/, team/field_concepts.json, and, if present,
// exposure.json (observed AI use) and trends.json (OpenDOSM). Writes data/intel/ style files under outDir.
// No model and no network: field vectors are averages of saved skill vectors (server/fieldClassifier.js).
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadPackedIndex } from '../../server/emascoMatch.js'
import { createBm25Ranker } from '../../server/hybridSearch.js'
import { HIGH_FROM, MAX_RELATED, RELATED_WITHIN, SEEDS_PER_WORD, UNCLEAR_BELOW, buildFieldVectors, classify, fieldScores } from '../../server/fieldClassifier.js'
import { METHOD_VERSION, buildRecord, hashOf, mergeRecords, readStore, writeStore } from '../../server/intelligence.js'

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'))
const readOptionalJson = (file) => readJson(file).catch((error) => (error.code === 'ENOENT' ? null : Promise.reject(error)))
const fileHash = async (file) => createHash('sha256').update(await readFile(file)).digest('hex').slice(0, 16)
const optionalFileHash = (file) => fileHash(file).catch((error) => (error.code === 'ENOENT' ? null : Promise.reject(error)))

export const ASSUMPTIONS = [
  'Field definitions and the major/sector-to-field links are a team draft (data/team/field_concepts.json).',
  'Field vectors are averages of the saved bge-m3 vectors of eMASCO skills found by a word search for each field.',
  'Confidence cut-offs (gap between the two best fields) are not tuned on labelled data.',
  'Scenario factors Moderate 0.6 and Rapid 1.0 come from the approved scoring spec.',
  'Demand = 50 + 2 x growth of wage recipients 2020-2025 per job group (existing rule in server/opendosm.js).',
  'For roles outside our 20, the share of matched tasks with observed AI use stands for the whole role.',
  'For our 20 scored roles, unmatched tasks use our placeholder task labels (Sample), exactly as in the app score.',
  'A skill "carries over" only at a skill-to-skill similarity of 0.85 or more (judged on 35 examples, not tuned).'
]
export const UNAVAILABLE = [
  'Demand for each single occupation (OpenDOSM publishes job groups only).',
  'Skill importance from the source (eMASCO lists skills without importance).',
  'Emerging skills for each occupation (no per-occupation source yet).'
]

export async function runIntelligenceBuild({ inputDir, outDir, mode = 'live', label = '', now = new Date() }) {
  const startedAt = now.toISOString()
  // UTC time to the millisecond, so two runs in the same second still get different ids.
  const runId = `${startedAt.replace(/[-:.]/g, '').slice(0, 18)}Z-${mode}`
  const files = {
    occupations: path.join(inputDir, 'emasco', 'occupations.json'),
    vectorsMeta: path.join(inputDir, 'emasco', 'vectors', 'meta.json'),
    concepts: path.join(inputDir, 'team', 'field_concepts.json'),
    exposure: path.join(inputDir, 'exposure.json'),
    trends: path.join(inputDir, 'trends.json'),
    scoredRoles: path.join(inputDir, 'roles.json')
  }
  const [occupations, vectorsMeta, concepts, exposure, trends, scoredRoles] = await Promise.all([
    readJson(files.occupations),
    readJson(files.vectorsMeta),
    readJson(files.concepts),
    readOptionalJson(files.exposure),
    readOptionalJson(files.trends),
    readOptionalJson(files.scoredRoles)
  ])
  // Placeholder automatable shares of our 20 scored roles, so their stored outlook equals the app's score.
  const labelPctOf = new Map((scoredRoles?.roles ?? scoredRoles ?? []).filter((role) => Number.isFinite(role?.automatablePct)).map((role) => [role.code, role.automatablePct]))
  const index = await loadPackedIndex({ directory: path.join(inputDir, 'emasco', 'vectors'), occupations })
  const { dimension } = index

  const rank = createBm25Ranker(occupations.skills)
  const fieldVectors = buildFieldVectors({ fields: concepts.fields, rank, skillTexts: index.skillTexts, skillVectors: index.skillVectors, dimension })
  // Only what shapes the vectors counts: ids and search words (via the seeds) and the saved skill vectors. Wording of a
  // definition or label does not reclassify anything.
  const fieldsVersion = hashOf({ fields: concepts.fields.map((item) => ({ id: item.id, searchWords: item.searchWords })), seeds: fieldVectors.map((field) => field.seeds), skills: vectorsMeta.skillsHash })

  const emascoSource = { name: occupations.source, fetchedAt: occupations.fetchedAt }
  const entries = [
    ...occupations.roles.map((role) => ({ role, tasksOnly: false })),
    ...(occupations.tasksOnly ?? []).map((role) => ({ role, tasksOnly: true }))
  ]
  const fresh = []
  for (const { role, tasksOnly } of entries) {
    const row = index.roleRow.get(role.code)
    if (row === undefined) continue
    const offset = row * dimension
    const vectorHash = createHash('sha256').update(Buffer.from(index.roleVectors.buffer, index.roleVectors.byteOffset + offset * 4, dimension * 4)).digest('hex').slice(0, 16)
    const field = classify(fieldScores(index.roleVectors, offset, fieldVectors, dimension))
    fresh.push(buildRecord({ role, tasksOnly, field, vectorHash, exposure, trends, labelPct: labelPctOf.get(role.code) ?? null, emascoSource, fieldsVersion, runId, now: startedAt }))
  }

  const previous = await readStore(outDir)
  const { records, counts } = mergeRecords(previous?.roles, fresh)

  const tally = (pick) => {
    const out = {}
    for (const record of Object.values(records)) {
      if (record.inLatestSource === false) continue
      const key = pick(record)
      out[key] = (out[key] ?? 0) + 1
    }
    return out
  }
  const sources = {
    emasco: { ...emascoSource, builtAt: occupations.builtAt ?? null },
    aiUse: exposure ? { source: exposure.source, url: exposure.url, release: exposure.release, builtAt: exposure.builtAt } : null,
    demand: trends?.source ? { ...trends.source } : null
  }
  const run = {
    runId,
    mode,
    label,
    startedAt,
    finishedAt: new Date().toISOString(),
    inputs: [
      { source: 'eMASCO occupations', file: 'emasco/occupations.json', date: occupations.fetchedAt ?? null, hash: await fileHash(files.occupations) },
      { source: 'Saved bge-m3 role and skill vectors', file: 'emasco/vectors/meta.json', date: vectorsMeta.packedAt ?? null, hash: await fileHash(files.vectorsMeta) },
      { source: 'Field definitions (team draft)', file: 'team/field_concepts.json', date: concepts.version ?? null, hash: await fileHash(files.concepts) },
      { source: 'Anthropic Economic Index (observed AI use)', file: 'exposure.json', date: exposure?.builtAt ?? null, hash: await optionalFileHash(files.exposure) },
      { source: 'OpenDOSM wages_occupation', file: 'trends.json', date: trends?.source?.fetchedAt ?? null, hash: await optionalFileHash(files.trends) },
      { source: 'Our 20 scored roles (placeholder task labels)', file: 'roles.json', date: null, hash: await optionalFileHash(files.scoredRoles) }
    ],
    counts,
    fieldCounts: tally((record) => record.derived.field.primary),
    confidenceCounts: tally((record) => record.derived.field.confidence),
    outlookCounts: tally((record) => record.derived.outlook.status)
  }
  const meta = { builtAt: startedAt, runId, mode, methodVersion: METHOD_VERSION, fieldsVersion, conceptsVersion: concepts.version, sources, assumptions: ASSUMPTIONS, unavailable: UNAVAILABLE }
  const fieldsFile = {
    version: concepts.version,
    hash: fieldsVersion,
    builtAt: startedAt,
    note: concepts._note,
    method: `Field vector = normalised average of the saved bge-m3 vectors of up to ${SEEDS_PER_WORD} eMASCO skills per search word (word search). Field score = cosine with the occupation's saved vector.`,
    thresholds: { unclearBelow: UNCLEAR_BELOW, highFrom: HIGH_FROM, relatedWithin: RELATED_WITHIN, maxRelated: MAX_RELATED },
    fields: fieldVectors.map((field, position) => ({
      id: field.id,
      label: field.label,
      definition: field.definition,
      searchWords: concepts.fields[position].searchWords,
      seeds: field.seeds,
      vector: Array.from(field.vector, (value) => Math.round(value * 1e5) / 1e5)
    })),
    majorFields: concepts.majorFields ?? {},
    sectorFields: concepts.sectorFields ?? {}
  }
  await writeStore(outDir, { records, meta, fields: fieldsFile, run })
  return { run, meta }
}
