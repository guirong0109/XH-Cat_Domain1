import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeGroupTrends, computeYouth, fetchDataset, validateRows } from '../server/opendosm.js'

const wageRows = JSON.parse(readFileSync(new URL('./fixtures/wages_occupation.json', import.meta.url), 'utf8'))
const youthRows = JSON.parse(readFileSync(new URL('./fixtures/lfs_month_youth.json', import.meta.url), 'utf8'))

function row(occupation, year, recipients) {
  return { sex: 'both', date: `${year}-01-01`, occupation, recipients }
}

describe('computeGroupTrends', () => {
  it('computes professionals growth from fixture', () => {
    const { latestYear, baseYear, groups } = computeGroupTrends(wageRows)
    expect(latestYear).toBe(2025)
    expect(baseYear).toBe(2020)
    expect(groups.professionals.growthPct).toBe(12.8)
    expect(groups.professionals.demand).toBe(75.6)
    expect(groups.agriculture.growthPct).toBe(-31.7)
    expect('overall' in groups).toBe(false)
  })

  it('clamps demand to 0..100', () => {
    const rows = [row('up', 2020, 100), row('up', 2025, 140), row('down', 2020, 100), row('down', 2025, 60)]
    const { groups } = computeGroupTrends(rows)
    expect(groups.up.demand).toBe(100)
    expect(groups.down.demand).toBe(0)
  })

  it('skips groups without base year', () => {
    const rows = [...wageRows, row('newgroup', 2025, 50)]
    const { groups } = computeGroupTrends(rows)
    expect(groups.newgroup).toBeUndefined()
    expect(groups.professionals).toBeDefined()
  })
})

describe('validateRows', () => {
  it('rejects missing field', () => {
    expect(() => validateRows([{ sex: 'both', date: '2025-01-01', occupation: 'x' }])).toThrow(/recipients/)
    expect(() => validateRows([{}])).toThrow()
    expect(() => validateRows([])).toThrow(/OpenDOSM response invalid/)
    expect(() => validateRows({})).toThrow(/OpenDOSM response invalid/)
  })

  it('accepts the fixture', () => {
    expect(() => validateRows(wageRows)).not.toThrow()
  })
})

describe('computeYouth', () => {
  it('returns latest month', () => {
    expect(computeYouth(youthRows)).toEqual({ rate: 10.2, month: '2026-06' })
  })
})

describe('fetchDataset', () => {
  it('aborts after timeout', async () => {
    const fetchImpl = (url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')))
      })
    await expect(fetchDataset('wages_occupation', { fetchImpl, timeoutMs: 50 })).rejects.toThrow()
  })

  it('throws on non-200 and requests the right URL', async () => {
    let requestedUrl
    const fetchImpl = async (url) => {
      requestedUrl = url
      return { status: 503, json: async () => [] }
    }
    await expect(fetchDataset('x', { fetchImpl })).rejects.toThrow(/503/)
    expect(requestedUrl).toBe('https://api.data.gov.my/opendosm?id=x')
  })

  it('returns parsed rows on success', async () => {
    const fetchImpl = async () => ({ status: 200, json: async () => [1] })
    await expect(fetchDataset('x', { fetchImpl })).resolves.toEqual([1])
  })
})
