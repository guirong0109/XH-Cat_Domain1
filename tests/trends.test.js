import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readTrends, refreshTrends } from '../server/trends.js'

const wageRows = JSON.parse(readFileSync(new URL('./fixtures/wages_occupation.json', import.meta.url), 'utf8'))
const youthRows = JSON.parse(readFileSync(new URL('./fixtures/lfs_month_youth.json', import.meta.url), 'utf8'))

function fakeFetch(url) {
  const fixture = url.includes('id=wages_occupation') ? wageRows : youthRows
  return Promise.resolve({ status: 200, json: async () => fixture })
}

let directory
let filePath

beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  directory = await mkdtemp(path.join(tmpdir(), 'trends-'))
  filePath = path.join(directory, 'trends.json')
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

describe('refreshTrends', () => {
  it('first refresh writes file and reports updated', async () => {
    const result = await refreshTrends({ filePath, fetchImpl: fakeFetch })
    expect(result.status).toBe('updated')
    expect(result.message).toBe('Updated: data to 2025.')
    const saved = JSON.parse(await readFile(filePath, 'utf8'))
    expect(saved.source.latestYear).toBe(2025)
    expect(saved.groups.professionals.demand).toBe(75.6)
    expect(saved.youth.rate).toBe(10.2)
    expect(await readTrends(filePath)).toEqual(saved)
  })

  it('second refresh with same data reports unchanged', async () => {
    await refreshTrends({ filePath, fetchImpl: fakeFetch })
    const result = await refreshTrends({ filePath, fetchImpl: fakeFetch })
    expect(result.status).toBe('unchanged')
    expect(result.message).toBe('Up to date: no newer release. Latest data: 2025.')
    expect(result.trends.source.latestYear).toBe(2025)
  })

  it('failed refresh leaves old file byte-identical', async () => {
    await refreshTrends({ filePath, fetchImpl: fakeFetch })
    const before = await readFile(filePath)
    const result = await refreshTrends({ filePath, fetchImpl: () => Promise.reject(new Error('offline')) })
    expect(result.status).toBe('failed')
    expect(result.message.startsWith('Showing data from ')).toBe(true)
    expect(console.error).toHaveBeenCalledWith('[trends] refresh failed:', 'offline')
    expect(result.trends).not.toBeNull()
    expect(Buffer.compare(before, await readFile(filePath))).toBe(0)
  })

  it('invalid response is treated as failure', async () => {
    await writeFile(filePath, '{"source":{"fetchedAt":"2026-01-02T00:00:00.000Z"}}')
    const before = await readFile(filePath)
    const result = await refreshTrends({ filePath, fetchImpl: () => Promise.resolve({ status: 200, json: async () => [{}] }) })
    expect(result.status).toBe('failed')
    expect(result.message).toBe('Showing data from 2026-01-02. Live refresh failed.')
    expect(console.error).toHaveBeenCalledWith('[trends] refresh failed:', expect.stringContaining('OpenDOSM response invalid'))
    expect(Buffer.compare(before, await readFile(filePath))).toBe(0)
  })

  it('failure with no saved file says so', async () => {
    const result = await refreshTrends({ filePath, fetchImpl: () => Promise.reject(new Error('offline')) })
    expect(result).toEqual({ status: 'failed', message: 'Live refresh failed. No saved data yet.', trends: null })
  })

  it('invalid youth rows are treated as failure', async () => {
    const fetchImpl = (url) =>
      Promise.resolve({ status: 200, json: async () => (url.includes('id=wages_occupation') ? wageRows : []) })
    const result = await refreshTrends({ filePath, fetchImpl })
    expect(result.status).toBe('failed')
  })
})

describe('refreshTrends with a partial new-year release', () => {
  function fetchWith(extraRows) {
    return (url) =>
      Promise.resolve({
        status: 200,
        json: async () => (url.includes('id=wages_occupation') ? [...wageRows, ...extraRows] : youthRows),
      })
  }

  it('an overall-only 2026 row does not change the latest year', async () => {
    await refreshTrends({ filePath, fetchImpl: fakeFetch })
    const overall2026 = { occupation: 'overall', date: '2026-01-01', sex: 'both', recipients: 1 }
    const result = await refreshTrends({ filePath, fetchImpl: fetchWith([overall2026]) })
    expect(result.status).toBe('unchanged')
    expect(result.message).toBe('Up to date: no newer release. Latest data: 2025.')
    expect(Object.keys(result.trends.groups)).toHaveLength(9)
  })

  it('fewer groups than the saved file is a failure and keeps the old file', async () => {
    await refreshTrends({ filePath, fetchImpl: fakeFetch })
    const before = await readFile(filePath)
    const partial = { occupation: 'professionals', date: '2026-01-01', sex: 'both', recipients: 1 }
    const result = await refreshTrends({ filePath, fetchImpl: fetchWith([partial]) })
    expect(result.status).toBe('failed')
    expect(result.message.endsWith('Live refresh failed.')).toBe(true)
    expect(console.error).toHaveBeenCalledWith('[trends] refresh failed:', expect.stringContaining('groups'))
    expect(Object.keys(result.trends.groups)).toHaveLength(9)
    expect(Buffer.compare(before, await readFile(filePath))).toBe(0)
  })

  it('zero groups is a failure even without a saved file', async () => {
    const overallOnly = wageRows.filter((row) => row.occupation === 'overall')
    const fetchImpl = (url) =>
      Promise.resolve({ status: 200, json: async () => (url.includes('id=wages_occupation') ? overallOnly : youthRows) })
    const result = await refreshTrends({ filePath, fetchImpl })
    expect(result).toEqual({ status: 'failed', message: 'Live refresh failed. No saved data yet.', trends: null })
    expect(await readTrends(filePath)).toBeNull()
  })
})

describe('refreshTrends concurrency', () => {
  it('concurrent calls share one in-flight refresh', async () => {
    let calls = 0
    const countingFetch = (url) => {
      calls += 1
      return fakeFetch(url)
    }
    const [first, second] = await Promise.all([
      refreshTrends({ filePath, fetchImpl: countingFetch }),
      refreshTrends({ filePath, fetchImpl: countingFetch }),
    ])
    expect(calls).toBe(2)
    expect(first).toEqual(second)
    expect(first.status).toBe('updated')
  })

  it('a later call after the first finishes fetches again', async () => {
    let calls = 0
    const countingFetch = (url) => {
      calls += 1
      return fakeFetch(url)
    }
    await refreshTrends({ filePath, fetchImpl: countingFetch })
    await refreshTrends({ filePath, fetchImpl: countingFetch })
    expect(calls).toBe(4)
  })
})

describe('readTrends', () => {
  it('returns null when file is missing', async () => {
    expect(await readTrends(filePath)).toBeNull()
  })
})
