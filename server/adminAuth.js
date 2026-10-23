// Token sign-in for the admin console. The token comes from the ADMIN_TOKEN environment variable;
// it is compared in constant time, never logged and never sent back.
import { createHash, timingSafeEqual } from 'node:crypto'

const digest = (value) => createHash('sha256').update(String(value)).digest()

export function createAdminAuth({ token, now = () => Date.now(), maxFailures = 5, lockMs = 60000 }) {
  const wanted = typeof token === 'string' && token.trim() ? digest(token) : null
  const failures = new Map() // address -> { count, lockedUntil }

  function middleware(request, response, next) {
    if (!wanted) return response.status(404).json({ error: 'admin-off' })
    const address = request.ip ?? 'unknown'
    const record = failures.get(address) ?? { count: 0, lockedUntil: 0 }
    if (record.lockedUntil > now()) return response.status(429).json({ error: 'locked' })

    const match = /^Bearer (.+)$/.exec(request.headers?.authorization ?? '')
    if (match && timingSafeEqual(digest(match[1]), wanted)) {
      failures.delete(address)
      return next()
    }
    record.count += 1
    if (record.count >= maxFailures) {
      record.count = 0
      record.lockedUntil = now() + lockMs
    }
    failures.set(address, record)
    return response.status(401).json({ error: 'unauthorized' })
  }

  return { enabled: Boolean(wanted), middleware }
}
