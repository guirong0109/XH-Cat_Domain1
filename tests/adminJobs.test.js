import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLogStore } from '../server/adminLog.js'
import { createJobManager } from '../server/adminJobs.js'

let directory
let logStore
let reports
let manager

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'admin-jobs-'))
  logStore = createLogStore({ filePath: path.join(directory, 'admin.jsonl') })
  reports = {}
  manager = createJobManager({ logStore, writeReport: async (id, report) => { reports[id] = report } })
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

// A job that finishes only when the test says so.
function controllable(result = { status: 'ok', summary: { rolesRead: 1 }, report: { kind: 'test' } }) {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const calls = []
  const work = async (tools) => {
    calls.push(tools)
    await gate
    return result
  }
  return { work, release, calls }
}

describe('job manager', () => {
  it('has no current job at the start', () => {
    expect(manager.current()).toBeNull()
  })

  it('runs one job at a time: the second start is busy', async () => {
    const job = controllable()
    const first = await manager.start('quick-check', job.work)
    expect(first.runId).toBeTruthy()
    expect(await manager.start('full-check', controllable().work)).toEqual({ busy: true })
    job.release()
    await first.done
    const next = await manager.start('quick-check', controllable().work)
    expect(next.busy).toBeUndefined()
  })

  it('two starts at the same moment: only one runs', async () => {
    const job = controllable()
    const [one, two] = await Promise.all([manager.start('quick-check', job.work), manager.start('quick-check', job.work)])
    expect([one.busy, two.busy].filter(Boolean)).toHaveLength(1)
    expect(job.calls).toHaveLength(1)
    expect((await logStore.listRuns(10)).filter((run) => run.status === 'running')).toHaveLength(1)
    job.release()
    await (one.done ?? two.done)
  })

  it('shows the running job with its progress, then nothing when it ends', async () => {
    const job = controllable()
    const started = await manager.start('quick-check', job.work)
    job.calls[0].progress(3, 40, 'Read 3 of 40 roles')
    expect(manager.current()).toMatchObject({
      runId: started.runId,
      type: 'quick-check',
      state: 'running',
      progress: { done: 3, total: 40, message: 'Read 3 of 40 roles' }
    })
    job.release()
    await started.done
    expect(manager.current()).toBeNull()
  })

  it('saves the report and ends the run with the status and summary of the work', async () => {
    const job = controllable({ status: 'partial', summary: { unreadable: 2 }, report: { kind: 'quick-check', x: 1 } })
    const started = await manager.start('quick-check', job.work)
    job.release()
    await started.done
    expect(reports[started.runId]).toEqual({ kind: 'quick-check', x: 1 })
    const [run] = await logStore.listRuns(1)
    expect(run).toMatchObject({ id: started.runId, status: 'partial', summary: { unreadable: 2 } })
  })

  it('cancelling tells the work to stop and shows cancelling meanwhile', async () => {
    const job = controllable({ status: 'cancelled', summary: {}, report: null })
    const started = await manager.start('full-check', job.work)
    expect(job.calls[0].isCancelled()).toBe(false)
    expect(manager.cancel()).toBe(true)
    expect(job.calls[0].isCancelled()).toBe(true)
    expect(manager.current().state).toBe('cancelling')
    job.release()
    await started.done
    expect((await logStore.listRuns(1))[0].status).toBe('cancelled')
    expect(reports[started.runId]).toBeUndefined()
  })

  it('cancel with nothing running does nothing', () => {
    expect(manager.cancel()).toBe(false)
  })

  it('a job that throws ends failed, logs the message, and frees the manager', async () => {
    const started = await manager.start('quick-check', async () => { throw new Error('boom') })
    await started.done
    const [run] = await logStore.listRuns(1)
    expect(run.status).toBe('failed')
    expect(run.summary.message).toBe('boom')
    const { events } = await logStore.readRun(run.id)
    expect(events.some((event) => event.level === 'error' && /boom/.test(event.message))).toBe(true)
    expect(manager.current()).toBeNull()
    expect((await manager.start('quick-check', controllable().work)).busy).toBeUndefined()
  })

  it('a report that cannot be saved is logged and the run still ends with the work status', async () => {
    const broken = createJobManager({ logStore, writeReport: async () => { throw new Error('disk full') } })
    const started = await broken.start('quick-check', async () => ({ status: 'ok', summary: {}, report: { a: 1 } }))
    await started.done
    const [run] = await logStore.listRuns(1)
    expect(run.status).toBe('ok')
    const { events } = await logStore.readRun(run.id)
    expect(events.some((event) => event.level === 'error' && /disk full/.test(event.message))).toBe(true)
  })
})
