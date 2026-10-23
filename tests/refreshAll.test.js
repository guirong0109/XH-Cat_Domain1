import { describe, it, expect } from 'vitest'
import { exitCodeFor, pickSteps, runSteps } from '../scripts/lib/refreshAll.js'

const ok = (name, status = 'updated') => ({ name, run: async () => ({ status, message: `${name} done` }) })
const boom = (name) => ({
  name,
  run: async () => {
    throw new Error('HTTP 429')
  },
})
const quiet = () => {}

describe('runSteps', () => {
  it('runs every step in order and records each result', async () => {
    const results = await runSteps([ok('a'), ok('b', 'partial')], quiet)
    expect(results).toEqual([
      { name: 'a', status: 'updated', message: 'a done' },
      { name: 'b', status: 'partial', message: 'b done' },
    ])
  })

  it('records a throwing step as failed and still runs the next one', async () => {
    const results = await runSteps([boom('a'), ok('b')], quiet)
    expect(results.map((r) => [r.name, r.status])).toEqual([['a', 'failed'], ['b', 'updated']])
    expect(results[0].message).toBe('HTTP 429')
  })

  it('logs one line per step', async () => {
    const lines = []
    await runSteps([ok('a'), boom('b')], (line) => lines.push(line))
    expect(lines).toEqual(['a: updated - a done', 'b: failed - HTTP 429'])
  })
})

describe('exitCodeFor', () => {
  it('is 0 when at least one step worked, so partly fresh data is still saved', () => {
    expect(exitCodeFor([{ status: 'failed' }, { status: 'updated' }])).toBe(0)
    expect(exitCodeFor([{ status: 'partial' }])).toBe(0)
  })

  it('is 1 only when every step failed', () => {
    expect(exitCodeFor([{ status: 'failed' }, { status: 'failed' }])).toBe(1)
  })

  it('is 0 for no steps', () => {
    expect(exitCodeFor([])).toBe(0)
  })
})

describe('pickSteps', () => {
  const steps = [ok('trends'), ok('research'), ok('courses')]

  it('returns all steps without a flag', () => {
    expect(pickSteps(steps, [])).toBe(steps)
  })

  it('picks the named steps and keeps their order', () => {
    expect(pickSteps(steps, ['--only=courses,trends']).map((s) => s.name)).toEqual(['trends', 'courses'])
  })

  it('refuses an unknown step name', () => {
    expect(() => pickSteps(steps, ['--only=nope'])).toThrow(/Unknown step: nope/)
  })
})
