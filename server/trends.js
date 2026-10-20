import { readFile, rename, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { computeGroupTrends, computeYouth, fetchDataset, validateRows } from './opendosm.js'

const DATASET_ID = 'wages_occupation'
const DATASET_URL = `https://api.data.gov.my/opendosm?id=${DATASET_ID}`

export async function readTrends(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

function validateYouthRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('OpenDOSM response invalid: youth rows expected a non-empty array')
  }
  const latest = rows.reduce((newest, row) => (row?.date > newest?.date ? row : newest))
  if (typeof latest?.date !== 'string' || typeof latest.u_rate_15_24 !== 'number') {
    throw new Error('OpenDOSM response invalid: latest youth row needs date and u_rate_15_24')
  }
}

async function writeAtomically(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.tmp`
  await writeFile(temporaryPath, content)
  await rename(temporaryPath, filePath)
}

async function readExistingSafely(filePath) {
  try {
    return await readTrends(filePath)
  } catch {
    return null
  }
}

export async function refreshTrends({ filePath, fetchImpl = fetch, now = new Date() }) {
  const existing = await readExistingSafely(filePath)
  try {
    const [wageRows, youthRows] = await Promise.all([
      fetchDataset(DATASET_ID, { fetchImpl }),
      fetchDataset('lfs_month_youth', { fetchImpl }),
    ])
    validateRows(wageRows)
    validateYouthRows(youthRows)
    const { latestYear, baseYear, groups } = computeGroupTrends(wageRows)
    const youth = computeYouth(youthRows)
    const fetchedAt = now.toISOString()
    const trends = {
      source: { dataset: DATASET_ID, url: DATASET_URL, fetchedAt, latestYear, baseYear },
      groups,
      youth: { ...youth, fetchedAt },
    }
    await writeAtomically(filePath, `${JSON.stringify(trends, null, 2)}\n`)
    const unchanged = existing?.source?.latestYear === latestYear
    return unchanged
      ? { status: 'unchanged', message: 'Up to date: no newer release.', trends }
      : { status: 'updated', message: `Updated: data to ${latestYear}.`, trends }
  } catch {
    const savedDate = existing?.source?.fetchedAt?.slice(0, 10)
    const message = existing
      ? `Showing data from ${savedDate}. Live refresh failed.`
      : 'Live refresh failed. No saved data yet.'
    return { status: 'failed', message, trends: existing }
  }
}
