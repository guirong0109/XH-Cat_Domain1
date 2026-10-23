// Embeds every distinct eMASCO skill and every role (data/emasco/occupations.json) with the local bge-m3.
// Run: node scripts/embed-emasco.mjs              (full run, resumable, writes data/cache/emasco/)
//      node scripts/embed-emasco.mjs --benchmark 200   (times 200 skills and 200 roles, writes nothing)
// Needs the model in models/ (or MODELS_DIR), like npm start.
import { existsSync } from 'node:fs'
import { readFile, rename, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEmbedder, MODEL_ID } from '../server/embed.js'
import { chooseEmbedderConfig } from '../server/embedConfig.js'
import { DIMENSION, roleInputs, skillInputs } from './lib/emascoEmbed.js'
import { embedTexts } from './lib/embedChunks.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OCCUPATIONS_PATH = path.join(ROOT, 'data', 'emasco', 'occupations.json')
const OUTPUT_DIRECTORY = path.join(ROOT, 'data', 'cache', 'emasco')
const MODEL_BATCH_SIZE = 16 // texts per model call; keeps memory low with long role profiles

async function writeJson(filePath, value) {
  const temporaryPath = `${filePath}.tmp`
  await writeFile(temporaryPath, JSON.stringify(value))
  await rename(temporaryPath, filePath)
}

function batchedEmbedder(embedder) {
  return {
    async embed(texts) {
      const vectors = []
      for (let start = 0; start < texts.length; start += MODEL_BATCH_SIZE) {
        vectors.push(...(await embedder.embed(texts.slice(start, start + MODEL_BATCH_SIZE))))
      }
      return vectors
    }
  }
}

async function benchmark(embedder, name, texts) {
  const started = Date.now()
  await embedder.embed(texts)
  const seconds = (Date.now() - started) / 1000
  console.log(`${name}: ${texts.length} texts in ${seconds.toFixed(1)} s = ${(texts.length / seconds).toFixed(1)} texts/s`)
  return texts.length / seconds
}

async function main() {
  const config = chooseEmbedderConfig(process.env, existsSync, path.join(ROOT, 'models'))
  if (!config || (!config.modelsDir && !config.url)) {
    console.error('No local model found. Put bge-m3 in models/ (Xenova/bge-m3/onnx/model.onnx) or set MODELS_DIR.')
    process.exit(1)
  }
  const occupations = JSON.parse(await readFile(OCCUPATIONS_PATH, 'utf8'))
  const skills = skillInputs(occupations)
  const roles = roleInputs(occupations)
  const embedder = batchedEmbedder(createEmbedder(config))

  const benchmarkIndex = process.argv.indexOf('--benchmark')
  if (benchmarkIndex !== -1) {
    const count = Number(process.argv[benchmarkIndex + 1]) || 200
    await embedder.embed(['warm up']) // load the model before timing
    const skillSpeed = await benchmark(embedder, 'skills', skills.texts.slice(0, count))
    const roleSpeed = await benchmark(embedder, 'roles ', roles.texts.slice(0, count))
    const estimateMinutes = (skills.texts.length / skillSpeed + roles.texts.length / roleSpeed) / 60
    console.log(`Estimated full run: ${estimateMinutes.toFixed(0)} minutes`)
    return
  }

  await mkdir(OUTPUT_DIRECTORY, { recursive: true })
  const log = (message) => console.log(`${new Date().toISOString().slice(11, 19)} ${message}`)
  const skillResult = await embedTexts({
    name: 'skills', texts: skills.texts, embedder, modelId: MODEL_ID, directory: OUTPUT_DIRECTORY, log
  })
  await writeJson(path.join(OUTPUT_DIRECTORY, 'skills_ids.json'), skills.ids)
  const roleResult = await embedTexts({
    name: 'roles', texts: roles.texts, embedder, modelId: MODEL_ID, directory: OUTPUT_DIRECTORY, log
  })
  await writeJson(path.join(OUTPUT_DIRECTORY, 'roles_ids.json'), roles.ids)
  await writeJson(path.join(OUTPUT_DIRECTORY, 'meta.json'), {
    modelId: MODEL_ID,
    dimension: DIMENSION,
    skillsHash: skillResult.hash,
    rolesHash: roleResult.hash,
    skillCount: skillResult.count,
    roleCount: roleResult.count,
    builtAt: new Date().toISOString()
  })
  console.log(`skills ${skillResult.count} rows, roles ${roleResult.count} rows, dimension ${DIMENSION}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
