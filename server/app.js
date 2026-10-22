import express from 'express'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readTrends, refreshTrends } from './trends.js'
import { readResearch, refreshResearch } from './research.js'
import { CUTOFF, MAX_CHARS, SKILL_TEXT_MODE, matchSkills, splitCvLines } from './cvMatch.js'
import { loadSkillVectors } from './skillVectors.js'

const distDirectory = fileURLToPath(new URL('../dist', import.meta.url))

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

async function readOptionalJson(filePath) {
  try {
    return await readJson(filePath)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

export function createApp({ dataDir, fetchImpl = fetch, embedder = null, cvTimeoutMs = 15000 }) {
  const app = express()
  const trendsPath = path.join(dataDir, 'trends.json')
  const researchPath = path.join(dataDir, 'research.json')

  app.get('/api/data', async (request, response) => {
    try {
      const [roles, skills, sdg, samples, trends, research, fields] = await Promise.all([
        readJson(path.join(dataDir, 'roles.json')),
        readJson(path.join(dataDir, 'skills.json')),
        readJson(path.join(dataDir, 'sdg.json')),
        readJson(path.join(dataDir, 'samples.json')),
        readTrends(trendsPath),
        readResearch(researchPath),
        readOptionalJson(path.join(dataDir, 'fields.json')),
      ])
      response.json({ roles, skills, sdg, samples, trends, research, fields })
    } catch (error) {
      console.error('[data] load failed:', error.message)
      response.status(500).json({ error: 'Could not load data.' })
    }
  })

  app.post('/api/refresh-trends', async (request, response) => {
    response.json(await refreshTrends({ filePath: trendsPath, fetchImpl }))
  })

  app.post('/api/refresh-research', async (request, response) => {
    try {
      const skills = await readJson(path.join(dataDir, 'skills.json'))
      const terms = skills.labels.map(({ label, researchTerm }) => ({ label, researchTerm }))
      response.json(await refreshResearch({ filePath: researchPath, terms, fetchImpl }))
    } catch (error) {
      console.error('[research] refresh failed:', error.message)
      response.status(500).json({ error: 'Could not refresh research data.' })
    }
  })

  // One skill-vector load at a time; reset on failure so the next request retries.
  let skillVectorsLoad = null
  function getSkillVectors() {
    if (!skillVectorsLoad) {
      skillVectorsLoad = (async () => {
        const skills = (await readJson(path.join(dataDir, 'skills.json'))).labels
        const { vectorSets } = await loadSkillVectors({
          skills,
          embedder,
          cachePath: path.join(dataDir, 'cache', 'skill_vectors.json'),
          mode: SKILL_TEXT_MODE,
        })
        return { skills, vectorSets }
      })()
      skillVectorsLoad.catch(() => {
        skillVectorsLoad = null
      })
    }
    return skillVectorsLoad
  }

  async function matchCv(lines) {
    if (!lines.length) return []
    const { skills, vectorSets } = await getSkillVectors()
    const lineVectors = await embedder.embed(lines)
    return matchSkills(lines, lineVectors, skills, vectorSets, CUTOFF)
  }

  function parseCvBody(request, response, next) {
    express.json({ limit: '100kb' })(request, response, (error) => {
      if (!error) return next()
      if (error.type === 'entity.too.large') return response.status(413).json({ error: 'CV text is too long.' })
      response.status(400).json({ error: 'No CV text.' })
    })
  }

  app.post('/api/cv-skills', parseCvBody, async (request, response) => {
    const text = request.body?.text
    if (typeof text !== 'string' || !text.trim()) return response.status(400).json({ error: 'No CV text.' })
    if (text.length > MAX_CHARS) return response.status(413).json({ error: 'CV text is too long.' })
    if (!embedder || !embedder.isReady()) return response.status(503).json({ fallback: true })
    let timer
    try {
      const work = matchCv(splitCvLines(text))
      work.catch(() => {})
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), cvTimeoutMs)
      })
      const skills = await Promise.race([work, timeout])
      response.json({ skills, model: embedder.modelId, cutoff: CUTOFF })
    } catch (error) {
      // Never log the CV text; the message of our own errors does not contain it.
      console.error('[cv-skills] failed:', error.message)
      response.status(503).json({ fallback: true })
    } finally {
      clearTimeout(timer)
    }
  })

  app.use(express.static(distDirectory))
  app.use((request, response, next) => {
    if (request.method !== 'GET' || request.path.startsWith('/api/')) return next()
    response.sendFile(path.join(distDirectory, 'index.html'), (error) => {
      if (error) next(error)
    })
  })

  return app
}
