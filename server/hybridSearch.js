// Hybrid skill search for "Explore all roles" (idea taken from SkillPipe's retrieval.py).
// Four independent rankers, merged by Reciprocal Rank Fusion (RRF, ranks only, so scores of different models are never compared):
//   exact    every typed word is inside the skill text (the old search; best for "c++", codes, literal phrases)
//   bm25     BM25 over the skill texts, any word counts (finds partial matches, rare words weigh more)
//   concept  the query names one of our team skills (label or keyword); eMASCO skills that use those keywords
//   meaning  bge-m3 vector of the query against the 18,161 skill vectors (finds synonyms and Malay: "perakaunan")
// An optional cross-encoder (RERANKER_MODEL) re-orders the top results. Meaning and rerank need the local model:
// when it is off (for example on Replit) they are skipped and the result says so in `notes`. Nothing here changes a score.

export const RRF_K = 60
const DEPTH = 50
const MAX_QUERY_LENGTH = 100
const MAX_RESULTS = 20
// bge-m3 scores sit high for unrelated text, so a meaning hit must be close to the best hit and above a floor.
// 0.55: on the 36 labelled queries (testing/skill_search_eval.json) the best cosine of the 5 no-result queries was 0.40-0.52 and of
// every real query 0.62 or more, so 0.55 sits in the gap. Small sample; see docs/hybrid-search.md.
const DENSE_FLOOR = 0.55
const DENSE_BAND = 0.08
const CACHE_SIZE = 200

const tokenize = (text) => String(text ?? '').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#]*/gu) ?? []
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wholePhrase = (phrase) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(phrase)}($|[^\\p{L}\\p{N}])`, 'u')

export function rrf(rankLists, k = RRF_K) {
  const items = new Map()
  for (const [method, ids] of Object.entries(rankLists)) {
    ids.forEach((id, position) => {
      const item = items.get(id) ?? { id, score: 0, ranks: {} }
      item.score += 1 / (k + position + 1)
      item.ranks[method] = position + 1
      items.set(id, item)
    })
  }
  return [...items.values()].sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
}

// ---------------------------------------------------------------- rankers
export function createExactRanker(skills) {
  const lowered = skills.map((skill) => skill.text.toLowerCase())
  return function rank(query) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return []
    const phrase = words.join(' ')
    const whole = words.map((word) => wholePhrase(word))
    const scored = []
    lowered.forEach((text, row) => {
      if (!words.every((word) => text.includes(word))) return
      const order = (whole.every((pattern) => pattern.test(text)) ? 0 : 2) + (text.startsWith(phrase) ? 0 : 1)
      scored.push({ row, order, length: text.length })
    })
    return scored.sort((a, b) => a.order - b.order || a.length - b.length).slice(0, DEPTH).map((item) => item.row)
  }
}

// coverage: with 2 or fewer query words all must appear, with more at least 75% (the common "2<75%" rule), so a text
// that shares only one common word with a longer query is not proposed.
export function createBm25Ranker(skills, { k1 = 1.2, b = 0.75, coverage = false } = {}) {
  const postings = new Map()
  const lengths = new Int32Array(skills.length)
  skills.forEach((skill, row) => {
    const tokens = tokenize(skill.text)
    lengths[row] = tokens.length
    const counts = new Map()
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1)
    for (const [token, count] of counts) {
      if (!postings.has(token)) postings.set(token, [])
      postings.get(token).push([row, count])
    }
  })
  const average = lengths.reduce((sum, length) => sum + length, 0) / Math.max(1, skills.length)
  return function rank(query) {
    const scores = new Map()
    const matched = new Map()
    const words = new Set(tokenize(query))
    const needed = !coverage ? 1 : words.size <= 2 ? words.size : Math.ceil(words.size * 0.75)
    for (const token of words) {
      const list = postings.get(token)
      if (!list) continue
      const idf = Math.log(1 + (skills.length - list.length + 0.5) / (list.length + 0.5))
      for (const [row, count] of list) {
        const part = (count * (k1 + 1)) / (count + k1 * (1 - b + (b * lengths[row]) / average))
        scores.set(row, (scores.get(row) ?? 0) + idf * part)
        matched.set(row, (matched.get(row) ?? 0) + 1)
      }
    }
    return [...scores].filter(([row]) => matched.get(row) >= needed).sort((a, b2) => b2[1] - a[1] || a[0] - b2[0]).slice(0, DEPTH).map(([row]) => row)
  }
}

// ---------------------------------------------------------------- concepts (bilingual aliases)
// A concept is a search aid: a set of names (aliases in English and Bahasa Malaysia) and a set of English terms that find
// eMASCO skills. It never merges or renames skills. Two sources: our 38 team skills (label + keywords, English) and
// data/team/skill_aliases.json (a Claude draft awaiting teammate review, English + Malay).
export function buildConcepts({ teamSkills = [], aliasFile = null } = {}) {
  const concepts = []
  for (const skill of teamSkills ?? []) {
    concepts.push({
      id: `team:${skill.label}`, label: skill.label, source: 'team-skill',
      aliases: [skill.label, ...(skill.keywords ?? [])].map((text) => ({ text, lang: 'en' })),
      terms: skill.keywords ?? [], notTerms: skill.notKeywords ?? []
    })
  }
  for (const concept of aliasFile?.concepts ?? []) {
    concepts.push({
      id: concept.id, label: concept.label, source: 'alias-file',
      aliases: [{ text: concept.label, lang: 'en' }, ...(concept.aliases?.en ?? []).map((text) => ({ text, lang: 'en' })), ...(concept.aliases?.ms ?? []).map((text) => ({ text, lang: 'ms' }))],
      terms: concept.terms ?? [], notTerms: concept.notTerms ?? []
    })
  }
  return concepts
}

// The query with each verified Malay alias replaced by its English concept label; null when no Malay alias was found.
// Words that are not part of an alias stay as typed, and the original query is never changed.
export function expandQuery(query, matches) {
  let plain = ` ${tokenize(query).join(' ')} `
  let changed = false
  for (const match of matches) {
    if (match.lang !== 'ms') continue
    const alias = ` ${tokenize(match.alias).join(' ')} `
    if (plain.includes(alias)) {
      plain = plain.replace(alias, ` ${match.concept} `)
      changed = true
    }
  }
  return changed ? plain.trim().replace(/\s+/g, ' ') : null
}

// A concept is named when one of its aliases is a whole phrase of the query (the longest alias wins).
// Result rows are the skills that contain one of the concept's terms; `why` says which concept, alias and term made each row.
export function createConceptRanker(skills, concepts) {
  const lowered = skills.map((skill) => skill.text.toLowerCase())
  const prepared = (concepts ?? []).map((concept) => ({
    ...concept,
    names: concept.aliases.map((alias) => ({ ...alias, key: tokenize(alias.text).join(' ') })).filter((alias) => alias.key.length >= 3),
    blocked: (concept.notTerms ?? []).map((name) => String(name).toLowerCase()),
    patterns: (concept.terms ?? []).map((term) => ({ term: String(term).toLowerCase(), pattern: wholePhrase(String(term).toLowerCase()) }))
  }))
  return function rank(query) {
    const plain = ` ${tokenize(query).join(' ')} `
    const matches = []
    for (const concept of prepared) {
      const found = concept.names.filter((alias) => plain.includes(` ${alias.key} `)).sort((a, b) => b.key.length - a.key.length)[0]
      if (found) matches.push({ concept: concept.label, id: concept.id, source: concept.source, alias: found.text, lang: found.lang, named: concept })
    }
    if (matches.length === 0) return { rows: [], concepts: [], matches: [], why: new Map() }
    const hits = []
    const why = new Map()
    lowered.forEach((text, row) => {
      let count = 0
      for (const { named, concept, alias } of matches) {
        if (named.blocked.some((phrase) => text.includes(phrase))) continue
        const term = named.patterns.find((entry) => entry.pattern.test(text))
        if (!term) continue
        count += named.patterns.filter((entry) => entry.pattern.test(text)).length
        if (!why.has(row)) why.set(row, [])
        why.get(row).push({ concept, alias, term: term.term })
      }
      if (count > 0) hits.push({ row, count, length: text.length })
    })
    hits.sort((a, b) => b.count - a.count || a.length - b.length)
    const rows = hits.slice(0, DEPTH).map((hit) => hit.row)
    return {
      rows,
      concepts: matches.map((match) => match.concept),
      matches: matches.map(({ concept, id, source, alias, lang }) => ({ concept, id, source, alias, lang })),
      why
    }
  }
}

export function createDenseRanker({ index, embedder, timeoutMs = 8000, floor = DENSE_FLOOR, band = DENSE_BAND }) {
  const cache = new Map()
  async function queryVector(query) {
    if (cache.has(query)) {
      const vector = cache.get(query)
      cache.delete(query)
      cache.set(query, vector)
      return vector
    }
    const work = embedder.embed([query])
    let timer
    const limit = new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('The embedding took too long')), timeoutMs) })
    try {
      const [vector] = await Promise.race([work, limit])
      cache.set(query, vector)
      if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value)
      return vector
    } finally {
      clearTimeout(timer)
    }
  }
  // detail: the accepted rows with their cosine scores (semantic evidence), kept apart from the relevance decision.
  async function detail(query) {
    const vector = await queryVector(query)
    const { dimension, skillCount, skillVectors } = index
    if (!Array.isArray(vector) && !ArrayBuffer.isView(vector)) throw new Error('The embedder returned no vector')
    if (vector.length !== dimension) throw new Error('The query vector has the wrong size')
    const scored = []
    for (let row = 0; row < skillCount; row += 1) {
      let dot = 0
      const offset = row * dimension
      for (let d = 0; d < dimension; d += 1) dot += vector[d] * skillVectors[offset + d]
      scored.push([row, dot])
    }
    scored.sort((a, b) => b[1] - a[1] || a[0] - b[0])
    const best = scored[0]?.[1] ?? 0
    const accepted = best < floor ? [] : scored.filter(([, score]) => score >= floor && score >= best - band).slice(0, DEPTH)
    return { rows: accepted.map(([row]) => row), scores: new Map(accepted.map(([row, score]) => [row, score])), best }
  }
  const rank = async (query) => (await detail(query)).rows
  rank.detail = detail
  return rank
}

// ---------------------------------------------------------------- optional cross-encoder
// RERANKER_MODEL names a transformers.js text-classification model that scores (query, text) pairs. Off when unset; a model
// that cannot load is logged once and skipped. Not tested against a real model in this repo.
export function createReranker({ modelId, loadModel = defaultLoadReranker, log = console.warn } = {}) {
  if (!modelId) return null
  let scorer = null
  let failed = false
  return {
    modelId,
    async rerank(query, texts) {
      if (failed) return null
      try {
        scorer ??= await loadModel(modelId)
        const scores = await scorer(query, texts)
        return scores.length === texts.length ? scores : null
      } catch (error) {
        failed = true
        log('[search] reranker unavailable, skipped:', error.message)
        return null
      }
    }
  }
}

async function defaultLoadReranker(modelId) {
  const { pipeline } = await import('@huggingface/transformers')
  const classifier = await pipeline('text-classification', modelId)
  return async (query, texts) => {
    const out = await classifier(texts.map((text) => ({ text: query, text_pair: text })), { top_k: 1 })
    return out.map((entry) => (Array.isArray(entry) ? entry[0] : entry).score)
  }
}

// ---------------------------------------------------------------- the search
// aliasSemantic: what the meaning ranker reads when the query holds a verified Malay alias
//   'replace' (default) the English concept label replaces the Malay alias; the typed query is kept in `query.original`
//   'both'              two meaning lists, one for the typed query and one for the expanded query
//   'off'               always the typed query (the first version's behaviour)
// semantic: { floor, band } accept a meaning hit only when its cosine is at least `floor` and within `band` of the best hit.
export function createHybridSearch({ skills, index = null, embedder = null, concepts = [], reranker = null, rerankTop = 20, log = console.warn, aliasSemantic = 'replace', semantic = {}, bm25Coverage = true }) {
  const exact = createExactRanker(skills)
  const bm25 = createBm25Ranker(skills, { coverage: bm25Coverage })
  const concept = createConceptRanker(skills, concepts)
  const dense = index && embedder ? createDenseRanker({ index, embedder, ...semantic }) : null

  return async function search(query, limit = MAX_RESULTS, { meaningAllowed = true } = {}) {
    const text = String(query ?? '').slice(0, MAX_QUERY_LENGTH).trim()
    const wanted = Math.min(Math.max(1, Number(limit) || MAX_RESULTS), MAX_RESULTS)
    const notes = []
    if (!text) return { skills: [], methods: [], concepts: [], aliases: [], query: { original: '', expanded: null }, status: { meaning: dense ? 'idle' : 'off' }, notes }
    const lists = {}
    const cosine = new Map()
    const exactRows = exact(text)
    if (exactRows.length > 0) lists.exact = exactRows
    const bm25Rows = bm25(text)
    if (bm25Rows.length > 0) lists.bm25 = bm25Rows
    const named = concept(text)
    if (named.rows.length > 0) lists.concept = named.rows
    const expanded = expandQuery(text, named.matches)
    // status.meaning says what really happened: ran (even with no hits), off, loading or failed.
    let meaning = 'off'
    if (!dense) notes.push('meaning-search-off: no embedding model here, so only keyword, BM25 and concept search ran')
    else if (!meaningAllowed) {
      meaning = 'limited'
      notes.push('meaning-search-limited: too many searches in a short time, keyword search only for now')
    } else if (!embedder.isReady()) {
      meaning = 'loading'
      notes.push('meaning-search-off: the embedding model is still loading')
    } else {
      try {
        const asked = []
        if (expanded && aliasSemantic === 'replace') asked.push(['meaning', expanded])
        else if (expanded && aliasSemantic === 'both') asked.push(['meaning', text], ['meaningExpanded', expanded])
        else asked.push(['meaning', text])
        for (const [name, wording] of asked) {
          const found = await dense.detail(wording)
          if (found.rows.length > 0) lists[name] = found.rows
          for (const [row, score] of found.scores) cosine.set(row, Math.max(cosine.get(row) ?? -1, score))
        }
        meaning = 'ran'
      } catch (error) {
        meaning = 'failed'
        log('[search] meaning search failed:', error.message)
        notes.push('meaning-search-failed')
      }
    }
    let fused = rrf(lists, RRF_K).slice(0, Math.max(wanted, rerankTop))
    let method = Object.keys(lists).join('+')
    if (reranker && fused.length > 1) {
      const head = fused.slice(0, rerankTop)
      const scores = await reranker.rerank(expanded ?? text, head.map((item) => skills[item.id].text))
      if (scores) {
        const order = head.map((item, position) => ({ item, score: scores[position] })).sort((a, b) => b.score - a.score)
        order.forEach(({ item }, position) => { item.ranks.rerank = position + 1 })
        fused = [...order.map(({ item }) => item), ...fused.slice(rerankTop)]
        method += '+rerank'
      } else notes.push('rerank-skipped: the reranker is unavailable')
    }
    return {
      // semantic = cosine of the meaning ranker (null when it did not accept the skill); why = the concept evidence; foundBy = who proposed it.
      skills: fused.slice(0, wanted).map(({ id, ranks }) => ({
        id: skills[id].id,
        text: skills[id].text,
        roles: skills[id].roles.length,
        foundBy: Object.keys(ranks).filter((name) => name !== 'rerank'),
        semantic: cosine.has(id) ? Number(cosine.get(id).toFixed(3)) : null,
        why: named.why.get(id) ?? []
      })),
      methods: method ? method.split('+') : [],
      concepts: named.concepts,
      aliases: named.matches,
      query: { original: text, expanded },
      status: { meaning },
      notes
    }
  }
}
