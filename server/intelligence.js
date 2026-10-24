// Occupation intelligence: one reusable, versioned record per eMASCO occupation. Built by
// scripts/build-intelligence.mjs from the saved source files, stored as JSON in data/intel/, read by the server for
// matching. Each record keeps observed source facts, derived values and what is unavailable apart.
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { SCENARIO_FACTOR, effectiveAutomatable } from '../src/lib/scoring.js'

// Bump when the way a record is derived changes; every record is then rebuilt on the next run.
export const METHOD_VERSION = 'intel-2'
export const MAX_RUNS_KEPT = 50
export const FILES = { records: 'occupations.json', fields: 'fields.json', runs: 'runs.json' }

export const AI_USE_METHOD =
  'Each eMASCO task is matched to the closest O*NET task with bge-m3 (cosine 0.80 or more, at least 3 matched tasks); observed use of the matched tasks comes from the Anthropic Economic Index.'
export const DEMAND_RULE = '50 + 2 x growth % of wage recipients, kept between 0 and 100 (server/opendosm.js).'

const round1 = (value) => Math.round(value * 10) / 10
const round4 = (value) => Math.round(value * 10000) / 10000

// JSON with sorted keys, so the same content always gives the same hash.
export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

export const hashOf = (value) => createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex').slice(0, 16)

export const usableObserved = (row) =>
  Boolean(row) && row.status === 'ok' && Number.isFinite(row.observedShare) && Number.isFinite(row.tasksUsed) &&
  Number.isFinite(row.tasksTotal) && row.tasksTotal > 0 && row.tasksUsed > 0

const noAiUseReason = (row) => (row?.status === 'not_enough' ? 'Too few of its tasks matched the AI-use data.' : 'No AI-use data for this role.')

// Future outlook under both scenarios, with the formula of scoreRole in src/lib/scoring.js:
//   outlook = 0.5 x demand + 0.5 x (100 - automatable x factor), factor Moderate 0.6 / Rapid 1.0.
// Our 20 scored roles (labelPct given) use effectiveAutomatable, so the number equals the app's. Other roles have no task
// labels, so the share of matched tasks with observed AI use stands for the whole role (said in `basis`).
// No demand figure, or neither observed data nor labels: unavailable, never a default.
export function outlookFor({ demand, observed, labelPct = null }) {
  if (!Number.isFinite(demand)) return { status: 'unavailable', reason: 'No job-market figure for this job group.' }
  const usable = usableObserved(observed)
  const labelled = Number.isFinite(labelPct)
  if (!usable && !labelled) return { status: 'unavailable', reason: noAiUseReason(observed) }
  let automatable
  let basis
  if (labelled) {
    const effect = effectiveAutomatable({ automatablePct: labelPct }, observed)
    automatable = effect.automatable
    basis = effect.observedWeight > 0
      ? `Same as the app's score: observed AI use for ${observed.tasksUsed} of ${observed.tasksTotal} tasks, our placeholder task labels (Sample) for the rest.`
      : 'Same as the app’s score: our placeholder task labels (Sample); no usable AI-use data.'
  } else {
    automatable = observed.observedShare * 100
    const withUse = Math.round(observed.observedShare * observed.tasksUsed)
    basis = `AI use observed in ${withUse} of ${observed.tasksUsed} matched tasks (${observed.tasksTotal} tasks in all); the matched tasks stand for the whole role.`
  }
  const at = (factor) => round1(0.5 * demand + 0.5 * (100 - automatable * factor))
  return { status: 'ok', moderate: at(SCENARIO_FACTOR.moderate), rapid: at(SCENARIO_FACTOR.fast), automatablePct: round1(automatable), basis }
}

// One record. role: an occupations.json entry (roles or tasksOnly); field: from classify(); exposure: data/exposure.json;
// trends: data/trends.json; labelPct: the placeholder automatable share of one of our 20 scored roles (else null);
// vectorHash: hash of the role's saved vector; fieldsVersion: hash of the field vectors' inputs.
export function buildRecord({ role, tasksOnly, field, vectorHash, exposure, trends, labelPct = null, emascoSource, fieldsVersion, runId, now }) {
  const observedRow = exposure?.roles?.[role.code] ?? null
  const group = trends?.groups?.[role.group] ?? null
  const haveGroup = Boolean(group) && Number.isFinite(group.demand)
  const aiUse = usableObserved(observedRow)
    ? {
        status: 'ok',
        observedShare: round4(observedRow.observedShare),
        tasksWithUse: Math.round(observedRow.observedShare * observedRow.tasksUsed),
        tasksMatched: observedRow.tasksUsed,
        tasksTotal: observedRow.tasksTotal,
        method: AI_USE_METHOD,
        source: exposure.source,
        release: exposure.release,
        builtAt: exposure.builtAt
      }
    : { status: 'unavailable', reason: noAiUseReason(observedRow), source: exposure?.source ?? null, release: exposure?.release ?? null }
  const demand = haveGroup
    ? {
        status: 'ok',
        level: 'MASCO major group (OpenDOSM publishes no finer level)',
        group: role.group,
        growthPct: group.growthPct,
        years: `${trends.source?.baseYear}-${trends.source?.latestYear}`,
        source: trends.source?.dataset ? `OpenDOSM ${trends.source.dataset}` : 'OpenDOSM',
        fetchedAt: trends.source?.fetchedAt ?? null
      }
    : { status: 'unavailable', reason: 'No job-market figure for this job group.' }
  const demandIndex = haveGroup ? { status: 'ok', value: group.demand, rule: DEMAND_RULE } : { status: 'unavailable', reason: demand.reason }
  // Dates (fetchedAt, builtAt) are left out of the hashes: a refresh that brings the same numbers is not a change.
  const inputParts = {
    emasco: hashOf({ title: role.title, description: role.description, tasks: role.tasks, skills: role.skills, group: role.group }),
    vector: vectorHash,
    aiUse: hashOf(aiUse.status === 'ok'
      ? { status: 'ok', share: aiUse.observedShare, matched: aiUse.tasksMatched, total: aiUse.tasksTotal, release: aiUse.release }
      : { status: aiUse.status, reason: aiUse.reason, release: aiUse.release }),
    demand: hashOf(haveGroup ? { group: role.group, growthPct: group.growthPct, demand: group.demand, years: demand.years } : { status: 'unavailable' }),
    labels: hashOf(Number.isFinite(labelPct) ? labelPct : null),
    fields: fieldsVersion
  }
  return {
    code: role.code,
    title: role.title,
    version: 1,
    runId,
    processedAt: now,
    checkedRunId: runId,
    checkedAt: now,
    methodVersion: METHOD_VERSION,
    inputHash: hashOf({ ...inputParts, method: METHOD_VERSION }),
    inputParts,
    observed: {
      emasco: { source: emascoSource?.name ?? 'eMASCO', url: role.url, retrievedAt: emascoSource?.fetchedAt ?? null, tasksOnly: Boolean(tasksOnly), skillCount: role.skills?.length ?? 0 },
      demand
    },
    derived: {
      field,
      aiUse,
      demandIndex,
      outlook: outlookFor({ demand: haveGroup ? group.demand : NaN, observed: observedRow, labelPct })
    }
  }
}

// Keeps the version of a record whose inputs are unchanged (its content is refreshed, so newer source dates show);
// a changed record gets the next version. A code that is no longer in the source is kept and flagged, never deleted.
export function mergeRecords(previous, fresh) {
  const counts = { processed: 0, new: 0, updated: 0, unchanged: 0, gone: 0 }
  const records = {}
  for (const record of fresh) {
    counts.processed += 1
    const old = previous?.[record.code]
    if (!old) {
      counts.new += 1
      records[record.code] = record
    } else if (old.inputHash === record.inputHash && old.inLatestSource !== false) {
      counts.unchanged += 1
      records[record.code] = { ...record, version: old.version, runId: old.runId, processedAt: old.processedAt }
    } else {
      counts.updated += 1
      records[record.code] = { ...record, version: old.version + 1 }
    }
  }
  for (const [code, old] of Object.entries(previous ?? {})) {
    if (records[code]) continue
    counts.gone += 1
    records[code] = { ...old, inLatestSource: false }
  }
  return { records, counts }
}

async function writeAtomically(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.tmp`
  await writeFile(temporaryPath, content)
  await rename(temporaryPath, filePath)
}

async function readOptional(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

// Writes the three store files. Records are written last so a reader never sees records without their fields file.
export async function writeStore(directory, { records, meta, fields, run }) {
  const runsFile = path.join(directory, FILES.runs)
  const runs = (await readOptional(runsFile))?.runs ?? []
  await writeAtomically(path.join(directory, FILES.fields), `${JSON.stringify(fields)}\n`)
  await writeAtomically(runsFile, `${JSON.stringify({ runs: [...runs, run].slice(-MAX_RUNS_KEPT) }, null, 1)}\n`)
  await writeAtomically(path.join(directory, FILES.records), `${JSON.stringify({ meta, roles: records })}\n`)
}

export async function readStore(directory) {
  const [records, fields, runs] = await Promise.all(
    [FILES.records, FILES.fields, FILES.runs].map((name) => readOptional(path.join(directory, name)))
  )
  if (!records || !fields) return null
  return { meta: records.meta, roles: records.roles, fields, runs: runs?.runs ?? [] }
}

// The fields a student's major (or a worker's sector) links to, from the team draft copied into the fields file.
// Own keys only, so ids such as "constructor" or "__proto__" find nothing.
export function userFieldsFor(fieldId, fields) {
  if (typeof fieldId !== 'string') return []
  const lookup = (map) => (map && Object.hasOwn(map, fieldId) && Array.isArray(map[fieldId]) ? map[fieldId] : null)
  const list = lookup(fields?.majorFields) ?? lookup(fields?.sectorFields) ?? []
  const known = new Set((fields?.fields ?? []).map((field) => field.id))
  return list.filter((id) => known.has(id))
}
