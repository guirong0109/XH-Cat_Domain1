// Every outside source the app depends on, in one list: what it is for, where it lives, what backs it up,
// and how to test it. The admin Sources panel and the refresh both read this list.
import { request } from './http.js'
import * as semanticScholar from './semanticScholar.js'
import * as arxiv from './arxiv.js'
import * as huggingface from './huggingface.js'
import * as anthropicIndex from './anthropicIndex.js'

export const SOURCES = [
  {
    id: 'anthropic-index',
    name: 'Anthropic Economic Index',
    url: 'https://huggingface.co/datasets/Anthropic/EconomicIndex',
    purpose: 'Observed AI use per occupation and per task (the role-specific AI-exposure).',
    fallback: 'Keeps the last downloaded release and shows its date.',
    ping: anthropicIndex.ping,
  },
  {
    id: 'semantic-scholar',
    name: 'Semantic Scholar',
    url: 'https://api.semanticscholar.org',
    purpose: 'AI research paper counts per skill.',
    fallback: 'OpenAlex counts are used when it is down.',
    backup: 'openalex',
    ping: semanticScholar.ping,
  },
  {
    id: 'openalex',
    name: 'OpenAlex',
    url: 'https://openalex.org',
    purpose: 'AI research paper counts per skill (first source).',
    fallback: 'Semantic Scholar counts are used when it is down or rate limited.',
    backup: 'semantic-scholar',
    ping: (ctx = {}) => request('https://api.openalex.org/works?per-page=1&select=id', { ...ctx, retries: 1, backoffMs: 500, sourceId: 'openalex' }),
  },
  {
    id: 'arxiv',
    name: 'arXiv',
    url: 'https://arxiv.org',
    purpose: 'New AI papers per skill (preprints, earliest signal).',
    fallback: 'The other paper sources still show; arXiv is left out and flagged.',
    ping: arxiv.ping,
  },
  {
    id: 'huggingface',
    name: 'Hugging Face Hub',
    url: 'https://huggingface.co',
    purpose: 'Trending AI models and daily papers (what AI can do now).',
    fallback: 'Keeps the last trending list and shows its date.',
    ping: huggingface.ping,
  },
  {
    id: 'opendosm',
    name: 'OpenDOSM',
    url: 'https://api.data.gov.my/opendosm',
    purpose: 'Malaysian job-market trend per occupation group.',
    fallback: 'Keeps the last saved trend and shows its date.',
    ping: (ctx = {}) => request('https://api.data.gov.my/opendosm?id=wages_occupation&limit=1', { ...ctx, retries: 1, backoffMs: 500, sourceId: 'opendosm' }),
  },
]

export const SOURCE_BY_ID = Object.fromEntries(SOURCES.map((source) => [source.id, source]))

// Public view of the list (no functions), for the admin page.
export const describeSources = () => SOURCES.map(({ ping, ...rest }) => rest)

// Tests every source once (no retries) so the admin page shows who is up right now.
export async function pingSources(ctx = {}, ids = null) {
  const chosen = ids ? SOURCES.filter((source) => ids.includes(source.id)) : SOURCES
  const results = []
  for (const source of chosen) {
    try {
      const result = await source.ping(ctx)
      results.push({ id: source.id, ok: true, status: result.status, latencyMs: result.latencyMs })
    } catch (error) {
      results.push({ id: source.id, ok: false, status: error.status ?? null, kind: error.kind ?? 'network', error: error.message })
    }
  }
  return results
}
