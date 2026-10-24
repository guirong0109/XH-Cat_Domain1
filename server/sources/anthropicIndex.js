// Anthropic Economic Index (open dataset on Hugging Face): observed AI use per occupation and per task.
// We read the file list to see whether a newer release exists, then download the two exposure files.
// The data measures use of one assistant, mostly US, on US O*NET tasks; the app says so.
import { request } from './http.js'

const API = 'https://huggingface.co/api/datasets/Anthropic/EconomicIndex/tree/main'
const RAW = 'https://huggingface.co/datasets/Anthropic/EconomicIndex/resolve/main'
export const FILES = {
  jobExposure: 'labor_market_impacts/job_exposure.csv',
  taskPenetration: 'labor_market_impacts/task_penetration.csv',
}

// Minimal CSV reader: quoted fields, commas and doubled quotes inside quotes.
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += char
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export async function listRelease(ctx = {}) {
  const { body: top } = await request(API, { ...ctx, sourceId: 'anthropic-index' })
  if (!Array.isArray(top)) throw new Error('Anthropic index reply invalid: file list is not an array')
  const releases = top.map((item) => item.path).filter((name) => /^release_\d{4}_\d{2}_\d{2}$/.test(name)).sort()
  const { body: folder } = await request(`${API}/labor_market_impacts`, { ...ctx, sourceId: 'anthropic-index' })
  const files = Object.fromEntries(
    (Array.isArray(folder) ? folder : []).filter((item) => item.type === 'file').map((item) => [item.path, { oid: item.oid, size: item.size }]),
  )
  for (const path of Object.values(FILES)) if (!files[path]) throw new Error(`Anthropic index reply invalid: ${path} is missing`)
  return { latestRelease: releases.at(-1) ?? null, files }
}

function column(header, name) {
  const index = header.indexOf(name)
  if (index < 0) throw new Error(`Anthropic index file has no "${name}" column`)
  return index
}

export function parseJobExposure(text) {
  const [header, ...rows] = parseCsv(text)
  const code = column(header, 'occ_code')
  const value = column(header, 'observed_exposure')
  const title = column(header, 'title')
  const occupations = rows.map((row) => ({ code: row[code], title: row[title], exposure: Number(row[value]) }))
    .filter((item) => item.code && Number.isFinite(item.exposure))
  if (occupations.length < 500) throw new Error(`Anthropic index job file looks wrong: only ${occupations.length} occupations`)
  return occupations
}

export function parseTaskPenetration(text) {
  const [header, ...rows] = parseCsv(text)
  const task = column(header, 'task')
  const value = column(header, 'penetration')
  const tasks = rows.map((row) => ({ task: row[task], penetration: Number(row[value]) })).filter((item) => item.task && Number.isFinite(item.penetration))
  if (tasks.length < 10_000) throw new Error(`Anthropic index task file looks wrong: only ${tasks.length} tasks`)
  return tasks
}

export async function downloadExposure(ctx = {}) {
  const get = (name) => request(`${RAW}/${FILES[name]}`, { ...ctx, as: 'text', timeoutMs: 60_000, sourceId: 'anthropic-index' })
  const jobs = await get('jobExposure')
  const tasks = await get('taskPenetration')
  return { jobs: jobs.body, tasks: tasks.body, occupations: parseJobExposure(jobs.body), taskRows: parseTaskPenetration(tasks.body) }
}

export const ping = (ctx = {}) => request(API, { ...ctx, retries: 1, backoffMs: 500, sourceId: 'anthropic-index' })
