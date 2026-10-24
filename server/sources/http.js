// One careful HTTP helper for every outside data source: timeout, retries with back-off on rate limits
// and server errors, and a clear error kind so the admin page can say what went wrong.
export class SourceError extends Error {
  constructor(kind, message, { status = null } = {}) {
    super(message)
    this.kind = kind // 'timeout' | 'network' | 'rate_limit' | 'http' | 'invalid'
    this.status = status
  }
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const RETRY_STATUS = (status) => status === 429 || status >= 500
const MAX_WAIT_MS = 10_000

function retryDelay(response, attempt, backoffMs) {
  const asked = Number(response?.headers?.get?.('retry-after'))
  const wait = Number.isFinite(asked) && asked > 0 ? asked * 1000 : backoffMs * 2 ** attempt
  return Math.min(wait, MAX_WAIT_MS)
}

// Returns { body, status, latencyMs, attempts }. Throws SourceError after the last attempt.
// A monitor (optional) gets one record per call, with the final outcome.
export async function request(url, {
  fetchImpl = fetch, timeoutMs = 8000, retries = 2, backoffMs = 1000, sleep = defaultSleep,
  headers = {}, as = 'json', monitor = null, sourceId = null,
} = {}) {
  const started = Date.now()
  let lastError = null
  let attempts = 0
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    attempts += 1
    let response = null
    try {
      response = await fetchImpl(url, {
        headers: { 'User-Agent': 'FutureReadyMY-hackathon/0.1', ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) {
        throw new SourceError(response.status === 429 ? 'rate_limit' : 'http', `HTTP ${response.status}`, { status: response.status })
      }
      let body
      try {
        body = as === 'text' ? await response.text() : await response.json()
      } catch {
        throw new SourceError('invalid', `The reply was not valid ${as === 'text' ? 'text' : 'JSON'}`, { status: response.status })
      }
      const result = { body, status: response.status, latencyMs: Date.now() - started, attempts }
      monitor?.record({ id: sourceId, ok: true, status: response.status, latencyMs: result.latencyMs, attempts })
      return result
    } catch (error) {
      lastError = error instanceof SourceError ? error
        : error?.name === 'TimeoutError' || error?.name === 'AbortError' ? new SourceError('timeout', `No answer within ${timeoutMs / 1000} s`)
          : new SourceError('network', error?.message || 'Network error')
      const retryable = lastError.kind === 'timeout' || lastError.kind === 'network' || (lastError.status !== null && RETRY_STATUS(lastError.status))
      if (!retryable || attempt === retries) break
      await sleep(retryDelay(response, attempt, backoffMs))
    }
  }
  monitor?.record({ id: sourceId, ok: false, status: lastError.status, latencyMs: Date.now() - started, attempts, kind: lastError.kind, error: lastError.message })
  throw lastError
}
