// Semantic Scholar: how many papers on a skill term plus AI in a year (bulk search, which keeps working
// when the normal search is rate limited). Free; no key needed. https://api.semanticscholar.org
import { request } from './http.js'

const BASE = 'https://api.semanticscholar.org/graph/v1/paper/search/bulk'
const AI_PHRASES = '("artificial intelligence" | "machine learning" | "large language model")'

export function paperCountUrl(term, year) {
  const query = `"${term}" + ${AI_PHRASES}`
  return `${BASE}?query=${encodeURIComponent(query)}&year=${year}-${year}&fields=title&limit=1`
}

export async function countPapers(term, year, ctx = {}) {
  const { body } = await request(paperCountUrl(term, year), { ...ctx, sourceId: 'semantic-scholar' })
  if (typeof body?.total !== 'number' || !Number.isFinite(body.total)) throw new Error('Semantic Scholar reply invalid: total is not a number')
  return body.total
}

export const ping = (ctx = {}) => request(`${BASE}?query=%22machine+learning%22&fields=title&limit=1`, { ...ctx, retries: 1, backoffMs: 500, sourceId: 'semantic-scholar' })
