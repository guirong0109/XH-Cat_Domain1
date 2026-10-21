export const REQUIRED_FIELDS = ['occupation', 'date', 'sex', 'recipients']

const OPENDOSM_URL = 'https://api.data.gov.my/opendosm'

export function validateRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('OpenDOSM response invalid: expected a non-empty array')
  }
  rows.forEach((row, index) => {
    for (const field of REQUIRED_FIELDS) {
      if (row === null || typeof row !== 'object' || row[field] === undefined || row[field] === null) {
        throw new Error(`OpenDOSM response invalid: row ${index} is missing ${field}`)
      }
    }
  })
}

function roundToOneDecimal(value) {
  return Math.round(value * 10) / 10
}

export function computeGroupTrends(rows, years = 5) {
  const bothSexRows = rows.filter((row) => row.sex === 'both' && row.occupation !== 'overall')
  if (bothSexRows.length === 0) return { latestYear: null, baseYear: null, groups: {} }
  const latestYear = Math.max(...bothSexRows.map((row) => Number(row.date.slice(0, 4))))
  const baseYear = latestYear - years

  const recipientsByGroup = {}
  for (const row of bothSexRows) {
    const year = Number(row.date.slice(0, 4))
    recipientsByGroup[row.occupation] ??= {}
    recipientsByGroup[row.occupation][year] = row.recipients
  }

  const groups = {}
  for (const [group, byYear] of Object.entries(recipientsByGroup)) {
    const latest = byYear[latestYear]
    const base = byYear[baseYear]
    if (!Number.isFinite(latest) || !Number.isFinite(base) || base === 0) continue
    const growthPct = (latest / base - 1) * 100
    const demand = Math.min(100, Math.max(0, 50 + 2 * growthPct))
    groups[group] = { growthPct: roundToOneDecimal(growthPct), demand: roundToOneDecimal(demand) }
  }
  return { latestYear, baseYear, groups }
}

export function computeYouth(rows) {
  const latest = rows.reduce((newest, row) => (row.date > newest.date ? row : newest))
  return { rate: latest.u_rate_15_24, month: latest.date.slice(0, 7) }
}

export async function fetchDataset(id, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(`${OPENDOSM_URL}?id=${id}`, { signal: controller.signal })
    if (response.status !== 200) {
      throw new Error(`OpenDOSM request failed: HTTP ${response.status}`)
    }
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}
