// Hugging Face Hub: what is trending in AI right now (public API, no key): models and daily papers.
import { request } from './http.js'

const MODELS = 'https://huggingface.co/api/models?sort=trendingScore&limit='
const PAPERS = 'https://huggingface.co/api/daily_papers?limit='

export async function fetchTrendingModels(limit = 30, ctx = {}) {
  const { body } = await request(`${MODELS}${limit}`, { ...ctx, sourceId: 'huggingface' })
  if (!Array.isArray(body)) throw new Error('Hugging Face reply invalid: models list is not an array')
  return body.filter((item) => item && typeof item.id === 'string').map((item) => ({
    id: item.id,
    pipelineTag: item.pipeline_tag ?? null,
    tags: Array.isArray(item.tags) ? item.tags.slice(0, 12) : [],
    trendingScore: item.trendingScore ?? null,
    downloads: item.downloads ?? null,
    createdAt: item.createdAt ?? null,
  }))
}

export async function fetchDailyPapers(limit = 30, ctx = {}) {
  const { body } = await request(`${PAPERS}${limit}`, { ...ctx, sourceId: 'huggingface' })
  if (!Array.isArray(body)) throw new Error('Hugging Face reply invalid: papers list is not an array')
  return body.map((item) => item?.paper).filter((paper) => paper && typeof paper.title === 'string').map((paper) => ({
    id: paper.id ?? null,
    title: paper.title,
    publishedAt: paper.publishedAt ?? null,
    upvotes: paper.upvotes ?? null,
  }))
}

// How many trending items mention a term (title, id or tags). A count, never a forecast.
export function mentions(items, term) {
  const needle = term.toLowerCase()
  return items.filter((item) => `${item.title ?? ''} ${item.id ?? ''} ${(item.tags ?? []).join(' ')}`.toLowerCase().includes(needle)).length
}

export const ping = (ctx = {}) => request(`${PAPERS}1`, { ...ctx, retries: 1, backoffMs: 500, sourceId: 'huggingface' })
