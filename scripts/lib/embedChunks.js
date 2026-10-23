// Resumable chunked embedding. The embedder is injected (createEmbedder in server/embed.js, or a fake).
// Chunks are saved as they finish; a changed input or model (hash) throws all old chunks away.
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DIMENSION, inputHash, packVectors, validateVector } from './emascoEmbed.js'

async function writeAtomically(filePath, content) {
  const temporaryPath = `${filePath}.tmp`
  await writeFile(temporaryPath, content)
  await rename(temporaryPath, filePath)
}

async function sizeOf(filePath) {
  try {
    return (await stat(filePath)).size
  } catch {
    return -1
  }
}

async function readText(filePath) {
  try {
    return await readFile(filePath, 'utf8')
  } catch {
    return null
  }
}

export async function embedTexts({
  name,
  texts,
  embedder,
  modelId,
  directory,
  chunkSize = 256,
  dimension = DIMENSION,
  log = () => {}
}) {
  const hash = inputHash(texts, modelId)
  if (texts.length === 0) return { count: 0, dimension, hash, resumedChunks: 0 }

  const chunksDirectory = path.join(directory, 'chunks')
  const hashPath = path.join(chunksDirectory, `${name}.hash`)
  const finalPath = path.join(directory, `${name}.f32`)
  const rowBytes = dimension * 4
  const chunkCount = Math.ceil(texts.length / chunkSize)
  await mkdir(chunksDirectory, { recursive: true })

  if ((await readText(hashPath)) === hash && (await sizeOf(finalPath)) === texts.length * rowBytes) {
    return { count: texts.length, dimension, hash, resumedChunks: chunkCount }
  }
  if ((await readText(hashPath)) !== hash) {
    for (const file of await readdir(chunksDirectory)) {
      if (file.startsWith(`${name}-`)) await rm(path.join(chunksDirectory, file), { force: true })
    }
    await writeFile(hashPath, hash)
  }

  const chunkPath = (index) => path.join(chunksDirectory, `${name}-${index}.f32`)
  let resumedChunks = 0
  for (let index = 0; index < chunkCount; index += 1) {
    const slice = texts.slice(index * chunkSize, (index + 1) * chunkSize)
    if ((await sizeOf(chunkPath(index))) === slice.length * rowBytes) {
      resumedChunks += 1
      continue
    }
    const vectors = await embedder.embed(slice)
    if (!Array.isArray(vectors) || vectors.length !== slice.length) {
      throw new Error(`Embedder returned ${vectors?.length} vectors for ${slice.length} texts (chunk ${index})`)
    }
    vectors.forEach((vector) => validateVector(vector, dimension))
    await writeAtomically(chunkPath(index), packVectors(vectors))
    log(`${name}: chunk ${index + 1} of ${chunkCount}`)
  }

  const parts = []
  for (let index = 0; index < chunkCount; index += 1) parts.push(await readFile(chunkPath(index)))
  await writeAtomically(finalPath, Buffer.concat(parts))
  for (let index = 0; index < chunkCount; index += 1) await rm(chunkPath(index), { force: true })
  return { count: texts.length, dimension, hash, resumedChunks }
}
