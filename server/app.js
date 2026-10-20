import express from 'express'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readTrends, refreshTrends } from './trends.js'

const distDirectory = fileURLToPath(new URL('../dist', import.meta.url))

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

export function createApp({ dataDir, fetchImpl = fetch }) {
  const app = express()
  const trendsPath = path.join(dataDir, 'trends.json')

  app.get('/api/data', async (request, response) => {
    try {
      const [roles, skills, sdg, samples, trends] = await Promise.all([
        readJson(path.join(dataDir, 'roles.json')),
        readJson(path.join(dataDir, 'skills.json')),
        readJson(path.join(dataDir, 'sdg.json')),
        readJson(path.join(dataDir, 'samples.json')),
        readTrends(trendsPath),
      ])
      response.json({ roles, skills, sdg, samples, trends })
    } catch (error) {
      response.status(500).json({ error: `Could not load data: ${error.message}` })
    }
  })

  app.post('/api/refresh-trends', async (request, response) => {
    response.json(await refreshTrends({ filePath: trendsPath, fetchImpl }))
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
