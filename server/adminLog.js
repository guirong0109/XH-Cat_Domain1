// Append-only log of what the system does behind the scenes (checks and data refreshes).
// One JSON object per line. Never stores tokens, passwords or CV text.
import { randomBytes } from 'node:crypto'
import { appendFile, mkdir, readFile, rename, stat } from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_MAX_BYTES = 5_000_000
// Credentials anywhere in the key name, and the keys that could hold CV text (exact names only, so "context" is fine).
const FORBIDDEN_KEY = /token|password|secret|authorization|^(cv|cvtext|text)$/i
const MAX_DEPTH = 4

// Removes keys that must never be logged, at any depth.
function clean(value, depth = 0) {
  if (depth > MAX_DEPTH) return undefined
  if (Array.isArray(value)) return value.map((item) => clean(item, depth + 1))
  if (value && typeof value === 'object') {
    const result = {}
    for (const [key, inner] of Object.entries(value)) {
      if (!FORBIDDEN_KEY.test(key)) result[key] = clean(inner, depth + 1)
    }
    return result
  }
  return value
}

async function readLines(filePath) {
  try {
    return (await readFile(filePath, 'utf8')).split('\n')
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

function parse(lines) {
  const entries = []
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      entries.push(JSON.parse(line))
    } catch {
      // A damaged line is skipped; the rest of the log still reads.
    }
  }
  return entries
}

export function createLogStore({ filePath, maxBytes = DEFAULT_MAX_BYTES, now = () => new Date() }) {
  // Writes go through one chain so events stay in the order they were logged.
  let queue = Promise.resolve()

  function append(entry) {
    const write = queue.then(async () => {
      await mkdir(path.dirname(filePath), { recursive: true })
      try {
        if ((await stat(filePath)).size > maxBytes) await rename(filePath, `${filePath}.1`)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      await appendFile(filePath, `${JSON.stringify({ t: now().toISOString(), ...entry })}\n`)
    })
    queue = write.catch(() => {})
    return write
  }

  async function readEntries() {
    await queue
    return [...parse(await readLines(`${filePath}.1`)), ...parse(await readLines(filePath))]
  }

  function fold(entries) {
    const runs = new Map()
    for (const entry of entries) {
      if (entry.kind === 'start') {
        runs.set(entry.runId, { id: entry.runId, type: entry.type, startedAt: entry.t, finishedAt: null, status: 'running', summary: null })
      } else if (entry.kind === 'end') {
        const run = runs.get(entry.runId)
        if (run) Object.assign(run, { finishedAt: entry.t, status: entry.status, summary: entry.summary ?? null })
      }
    }
    return runs
  }

  async function startRun({ type }) {
    const runId = `${now().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${randomBytes(2).toString('hex')}`
    await append({ kind: 'start', runId, type })
    return {
      id: runId,
      log: (level, message, data) => append({ kind: 'event', runId, level, message, ...(data === undefined ? {} : { data: clean(data) }) }),
      finish: (status, summary) => append({ kind: 'end', runId, status, ...(summary === undefined ? {} : { summary: clean(summary) }) })
    }
  }

  async function listRuns(limit = 20) {
    const runs = [...fold(await readEntries()).values()]
    return runs.sort((left, right) => (left.startedAt < right.startedAt ? 1 : left.startedAt > right.startedAt ? -1 : 0)).slice(0, limit)
  }

  async function readRun(id) {
    const entries = await readEntries()
    const run = fold(entries).get(id)
    if (!run) return null
    const events = entries
      .filter((entry) => entry.kind === 'event' && entry.runId === id)
      .map(({ t, level, message, data }) => ({ time: t, level, message, ...(data === undefined ? {} : { data }) }))
    return { run, events }
  }

  // Runs that never got an end event were cut off by a restart.
  async function markInterrupted() {
    const open = [...fold(await readEntries()).values()].filter((run) => run.status === 'running')
    for (const run of open) await append({ kind: 'end', runId: run.id, status: 'interrupted', summary: { message: 'The server restarted during this run.' } })
    return open.length
  }

  return { startRun, listRuns, readRun, markInterrupted }
}
