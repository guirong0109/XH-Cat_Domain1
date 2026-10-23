import { describe, expect, it } from 'vitest'
import { createAdminAuth } from '../server/adminAuth.js'

function run(auth, { header, ip = '1.1.1.1' } = {}) {
  const request = { headers: header === undefined ? {} : { authorization: header }, ip }
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    }
  }
  let passed = false
  auth.middleware(request, response, () => {
    passed = true
  })
  return { passed, status: response.statusCode, body: response.body }
}

describe('admin auth', () => {
  it('is off without a token, or with an empty or blank one, and answers 404 even for a bearer', () => {
    for (const token of [undefined, '', '   ']) {
      const auth = createAdminAuth({ token })
      expect(auth.enabled).toBe(false)
      expect(run(auth, { header: 'Bearer anything' })).toEqual({ passed: false, status: 404, body: { error: 'admin-off' } })
    }
  })

  it('lets the right bearer token through', () => {
    const auth = createAdminAuth({ token: 'secret-123' })
    expect(auth.enabled).toBe(true)
    expect(run(auth, { header: 'Bearer secret-123' }).passed).toBe(true)
  })

  it('answers 401 for a missing, wrong, empty or malformed bearer, without throwing for other lengths', () => {
    const auth = createAdminAuth({ token: 'secret-123' })
    const headers = [undefined, 'Bearer nope', 'Bearer ', 'Bearer', 'secret-123', 'Basic secret-123', `Bearer ${'x'.repeat(500)}`]
    for (const [position, header] of headers.entries()) {
      // A different address each time, so the wrong tries do not trigger the lock.
      const result = run(auth, { header, ip: `10.0.0.${position}` })
      expect(result.passed).toBe(false)
      expect(result.status).toBe(401)
    }
  })

  it('never puts the token in a response', () => {
    const auth = createAdminAuth({ token: 'secret-123' })
    expect(JSON.stringify(run(auth, { header: 'Bearer wrong' }).body)).not.toContain('secret-123')
  })

  it('locks one address after five wrong tries, even for the right token, until the lock ends', () => {
    let time = 0
    const auth = createAdminAuth({ token: 'secret-123', now: () => time, maxFailures: 5, lockMs: 60000 })
    for (let attempt = 0; attempt < 5; attempt += 1) expect(run(auth, { header: 'Bearer bad' }).status).toBe(401)
    expect(run(auth, { header: 'Bearer secret-123' })).toMatchObject({ passed: false, status: 429, body: { error: 'locked' } })
    expect(run(auth, { header: 'Bearer secret-123', ip: '2.2.2.2' }).passed).toBe(true)
    time = 60001
    expect(run(auth, { header: 'Bearer secret-123' }).passed).toBe(true)
  })

  it('a right token resets the count of wrong tries', () => {
    const auth = createAdminAuth({ token: 'secret-123' })
    for (let round = 0; round < 3; round += 1) {
      for (let attempt = 0; attempt < 4; attempt += 1) run(auth, { header: 'Bearer bad' })
      expect(run(auth, { header: 'Bearer secret-123' }).passed).toBe(true)
    }
  })
})
