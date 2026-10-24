// arXiv: how many papers on a skill term plus AI were submitted in a year. Free; no key.
// arXiv asks for one request at a time with a few seconds between them (the caller waits).
import { request } from './http.js'

const BASE = 'https://export.arxiv.org/api/query'
const AI_CLAUSE = '(all:"artificial intelligence" OR all:"machine learning" OR all:"large language model")'

export function paperCountUrl(term, year) {
  const query = `all:"${term}" AND ${AI_CLAUSE} AND submittedDate:[${year}01010000 TO ${year}12312359]`
  return `${BASE}?search_query=${encodeURIComponent(query)}&max_results=1`
}

export function parseTotal(xml) {
  const match = /<opensearch:totalResults[^>]*>(\d+)</.exec(xml)
  if (!match) throw new Error('arXiv reply invalid: no totalResults')
  return Number(match[1])
}

export async function countPapers(term, year, ctx = {}) {
  const { body } = await request(paperCountUrl(term, year), { ...ctx, as: 'text', sourceId: 'arxiv' })
  return parseTotal(body)
}

export const ping = (ctx = {}) => request(`${BASE}?search_query=all:%22machine+learning%22&max_results=1`, { ...ctx, as: 'text', retries: 1, backoffMs: 500, sourceId: 'arxiv' })
