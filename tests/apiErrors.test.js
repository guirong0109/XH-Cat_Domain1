import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'

let directory
let server

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'api-errors-'))
  for (const name of ['roles', 'skills', 'sdg', 'samples']) await writeFile(path.join(directory, `${name}.json`), '[]')
  server = createApp({ dataDir: directory, fetchImpl: async () => ({ ok: false, status: 503 }), adminSleep: async () => {} }).listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
})
afterEach(async () => {
  await new Promise((resolve) => server.close(resolve))
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
})

const url = (route) => `http://127.0.0.1:${server.address().port}${route}`
const post = (route, body) => fetch(url(route), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })

describe('error answers do not leak stack traces or file paths', () => {
  it('broken JSON on an admin route gives a short JSON 400', async () => {
    const response = await post('/api/admin/checks/quick', '{bad')
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'bad-json' })
  })

  it('an oversized admin body gives 413 JSON', async () => {
    const response = await post('/api/admin/sources/test', JSON.stringify({ ids: ['x'.repeat(5000)] }))
    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: 'too-large' })
  })

  it('no response body contains a file path or "at " stack lines', async () => {
    for (const [route, body] of [['/api/admin/checks/quick', '{bad'], ['/api/emasco/match', '{bad'], ['/api/cv-skills', '{bad']]) {
      const text = await (await post(route, body)).text()
      expect(text).not.toMatch(/node_modules|\Users\|\/Users\/|\n\s+at /)
    }
  })
})
