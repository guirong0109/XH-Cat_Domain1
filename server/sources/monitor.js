// Remembers how every outside source is doing (last success, failures in a row, rate limits, speed)
// so the admin page can show which source is down and since when. Saved to a small JSON file.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const HISTORY = 20
const DAY_MS = 86_400_000

export const DOWN_AFTER = 3 // failures in a row

export function createSourceMonitor({ filePath, now = () => new Date(), staleAfterDays = 8 }) {
  let state = {}
  let saving = Promise.resolve()

  const ready = readFile(filePath, 'utf8')
    .then((text) => { state = JSON.parse(text) })
    .catch(() => { state = {} })

  function persist() {
    saving = saving.then(async () => {
      await mkdir(path.dirname(filePath), { recursive: true })
      const temporary = `${filePath}.tmp`
      await writeFile(temporary, JSON.stringify(state, null, 2))
      await rename(temporary, filePath)
    }).catch(() => {})
    return saving
  }

  // Records wait for the saved state to load first, and are applied in the order they were made.
  let chain = ready

  function record(info) {
    if (!info?.id) return
    const at = now().toISOString()
    chain = chain.then(() => apply(info, at))
  }

  function apply({ id, ok, status = null, latencyMs = null, attempts = 1, kind = null, error = null }, at) {
    const entry = state[id] ?? { consecutiveFailures: 0, rateLimitHits: 0, totalFailures: 0, totalCalls: 0, history: [] }
    entry.totalCalls += 1
    entry.lastAttempt = { at, ok, status, latencyMs, attempts, kind, error }
    if (ok) {
      entry.lastSuccess = at
      entry.consecutiveFailures = 0
    } else {
      entry.consecutiveFailures += 1
      entry.totalFailures += 1
      if (kind === 'rate_limit') entry.rateLimitHits += 1
      entry.lastError = { at, kind, status, message: error }
    }
    entry.history = [...entry.history, { at, ok, status, latencyMs }].slice(-HISTORY)
    state[id] = entry
    persist()
  }

  function health(entry) {
    if (!entry) return 'never'
    if (entry.consecutiveFailures >= DOWN_AFTER) return 'down'
    if (entry.consecutiveFailures > 0) return 'degraded'
    if (!entry.lastSuccess) return 'never'
    return now().getTime() - new Date(entry.lastSuccess).getTime() > staleAfterDays * DAY_MS ? 'degraded' : 'ok'
  }

  // One row per registered source, in registry order.
  async function snapshot(registry) {
    await chain
    return registry.map((source) => {
      const entry = state[source.id]
      const successes = (entry?.history ?? []).filter((item) => item.ok && typeof item.latencyMs === 'number')
      const latency = successes.length ? Math.round(successes.reduce((sum, item) => sum + item.latencyMs, 0) / successes.length) : null
      return {
        id: source.id,
        health: health(entry),
        lastSuccess: entry?.lastSuccess ?? null,
        lastAttempt: entry?.lastAttempt ?? null,
        lastError: entry?.lastError ?? null,
        consecutiveFailures: entry?.consecutiveFailures ?? 0,
        rateLimitHits: entry?.rateLimitHits ?? 0,
        totalFailures: entry?.totalFailures ?? 0,
        totalCalls: entry?.totalCalls ?? 0,
        averageLatencyMs: latency,
      }
    })
  }

  return { record, snapshot, ready }
}
