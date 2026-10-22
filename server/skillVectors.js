import { createHash } from 'node:crypto'
import { readFile, rename, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { skillTexts } from './cvMatch.js'

async function readCache(cachePath) {
  try {
    return JSON.parse(await readFile(cachePath, 'utf8'))
  } catch {
    return null
  }
}

async function writeAtomically(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.tmp`
  await writeFile(temporaryPath, content)
  await rename(temporaryPath, filePath)
}

export async function loadSkillVectors({ skills, embedder, cachePath, mode }) {
  const groups = skills.map((skill) => skillTexts(skill, mode))
  const labels = skills.map((skill) => skill.label)
  const hash = createHash('sha256').update(JSON.stringify(groups)).digest('hex')
  const cache = await readCache(cachePath)
  if (cache && cache.modelId === embedder.modelId && cache.mode === mode && cache.hash === hash) {
    return { labels: cache.labels, vectorSets: cache.vectorSets }
  }
  const vectors = groups.length ? await embedder.embed(groups.flat()) : []
  let offset = 0
  const vectorSets = groups.map((group) => {
    const set = vectors.slice(offset, offset + group.length)
    offset += group.length
    return set
  })
  await writeAtomically(
    cachePath,
    JSON.stringify({ modelId: embedder.modelId, mode, hash, labels, vectorSets }),
  )
  return { labels, vectorSets }
}
