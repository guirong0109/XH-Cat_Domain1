import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLogStore } from '../server/adminLog.js'

let directory
let filePath
let tick
const now = () => new Date(Date.UTC(2026, 9, 23, 6, 0, tick++))

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'admin-log-'))
  filePath = path.join(directory, 'logs', 'admin.jsonl')
  tick = 0
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('log store', () => {
  it('lists runs newest first with their status and summary', async () => {
    const store = createLogStore({ filePath, now })
    const first = await store.startRun({ type: 'quick-check' })
    await first.finish('ok', { rolesRead: 40 })
    const second = await store.startRun({ type: 'trends' })
    await second.finish('failed', { message: 'HTTP 500' })
    const runs = await store.listRuns(10)
    expect(runs.map((run) => run.type)).toEqual(['trends', 'quick-check'])
    expect(runs[1]).toMatchObject({ id: first.id, status: 'ok', summary: { rolesRead: 40 } })
    expect(runs[0].status).toBe('failed')
    expect(runs[0].finishedAt).toBeTruthy()
  })

  it('shows a run without an end event as running', async () => {
    const store = createLogStore({ filePath, now })
    await store.startRun({ type: 'full-check' })
    expect((await store.listRuns(5))[0].status).toBe('running')
  })

  it('keeps events in order with their level', async () => {
    const store = createLogStore({ filePath, now })
    const run = await store.startRun({ type: 'quick-check' })
    await run.log('info', 'started')
    await run.log('warn', 'slow page', { code: '1121-01' })
    await run.log('error', 'page failed')
    await run.finish('partial')
    const { run: summary, events } = await store.readRun(run.id)
    expect(events.map((event) => [event.level, event.message])).toEqual([
      ['info', 'started'],
      ['warn', 'slow page'],
      ['error', 'page failed']
    ])
    expect(events[1].data).toEqual({ code: '1121-01' })
    expect(summary.status).toBe('partial')
  })

  it('returns null for an unknown run', async () => {
    const store = createLogStore({ filePath, now })
    expect(await store.readRun('nope')).toBeNull()
  })

  it('lists nothing when the file is missing or empty', async () => {
    const store = createLogStore({ filePath, now })
    expect(await store.listRuns(5)).toEqual([])
    await store.startRun({ type: 'trends' }).then((run) => run.finish('ok'))
    await writeFile(filePath, '')
    expect(await store.listRuns(5)).toEqual([])
  })

  it('skips a corrupt line and keeps the rest', async () => {
    const store = createLogStore({ filePath, now })
    const run = await store.startRun({ type: 'trends' })
    await run.finish('ok')
    await writeFile(filePath, `${await readFile(filePath, 'utf8')}{not json\n`)
    expect((await store.listRuns(5)).map((item) => item.id)).toEqual([run.id])
  })

  it('rotates to .1 when the file is over the cap, and still lists runs from both files', async () => {
    const store = createLogStore({ filePath, maxBytes: 600, now })
    const ids = []
    for (let number = 0; number < 6; number += 1) {
      const run = await store.startRun({ type: 'trends' })
      await run.log('info', 'x'.repeat(80))
      await run.finish('ok')
      ids.push(run.id)
    }
    expect((await stat(`${filePath}.1`)).size).toBeGreaterThan(0)
    expect((await stat(filePath)).size).toBeLessThanOrEqual(1200)
    const listed = (await store.listRuns(50)).map((item) => item.id)
    expect(listed).toContain(ids[5])
  })

  it('never writes token, password, secret or cv text keys', async () => {
    const store = createLogStore({ filePath, now })
    const run = await store.startRun({ type: 'quick-check' })
    await run.log('info', 'check', { token: 'abc', nested: { Password: 'x', keep: 1 }, text: 'my cv', code: '1111-01' })
    const content = await readFile(filePath, 'utf8')
    expect(content).not.toMatch(/abc|my cv|"x"/)
    const { events } = await store.readRun(run.id)
    expect(events[0].data).toEqual({ nested: { keep: 1 }, code: '1111-01' })
  })

  it('marks runs without an end event as interrupted, once', async () => {
    const store = createLogStore({ filePath, now })
    const open = await store.startRun({ type: 'full-check' })
    const done = await store.startRun({ type: 'trends' })
    await done.finish('ok')
    expect(await store.markInterrupted()).toBe(1)
    expect(await store.markInterrupted()).toBe(0)
    const runs = await store.listRuns(5)
    expect(runs.find((run) => run.id === open.id).status).toBe('interrupted')
    expect(runs.find((run) => run.id === done.id).status).toBe('ok')
  })

  it('keeps writes in order when events are logged without waiting', async () => {
    const store = createLogStore({ filePath, now })
    const run = await store.startRun({ type: 'quick-check' })
    await Promise.all(Array.from({ length: 20 }, (item, number) => run.log('info', `event ${number}`)))
    const { events } = await store.readRun(run.id)
    expect(events.map((event) => event.message)).toEqual(Array.from({ length: 20 }, (item, number) => `event ${number}`))
  })
})
