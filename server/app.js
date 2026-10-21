import express from 'express'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readTrends, refreshTrends } from './trends.js'
import { readResearch, refreshResearch } from './research.js'

const distDirectory = fileURLToPath(new URL('../dist', import.meta.url))

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

export function createApp({ dataDir, fetchImpl = fetch }) {
  const app = express()
  const trendsPath = path.join(dataDir, 'trends.json')
  const researchPath = path.join(dataDir, 'research.json')

  app.get('/api/data', async (request, response) => {
    try {
      const [roles, skills, sdg, samples, trends, research] = await Promise.all([
        readJson(path.join(dataDir, 'roles.json')),
        readJson(path.join(dataDir, 'skills.json')),
        readJson(path.join(dataDir, 'sdg.json')),
        readJson(path.join(dataDir, 'samples.json')),
        readTrends(trendsPath),
        readResearch(researchPath),
      ])
      response.json({ roles, skills, sdg, samples, trends, research })
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

  app.use(express.static(distDirectory))
  app.use((request, response, next) => {
    if (request.method !== 'GET' || request.path.startsWith('/api/')) return next()
    response.sendFile(path.join(distDirectory, 'index.html'), (error) => {
      if (error) next(error)
    })
  })

  return app
}
