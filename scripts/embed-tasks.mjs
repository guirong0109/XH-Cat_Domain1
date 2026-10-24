// Embeds the O*NET tasks of the Anthropic Economic Index (data/cache/anthropic/task_penetration.csv)
// and every eMASCO task (data/emasco/occupations.json) with the local bge-m3.
// Run: node scripts/embed-tasks.mjs                 (resumable; writes data/cache/exposure/)
//      node scripts/embed-tasks.mjs --benchmark 200 (times 200 texts, writes nothing)
// Needs the model in models/ (or MODELS_DIR) and one refresh of the live AI signals first (/admin).
import { existsSync } from 'node:fs'
import { readFile, rename, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEmbedder, MODEL_ID } from '../server/embed.js'
import { chooseEmbedderConfig } from '../server/embedConfig.js'
import { parseTaskPenetration } from '../server/sources/anthropicIndex.js'
import { DIMENSION } from './lib/emascoEmbed.js'
import { embedTexts } from './lib/embedChunks.js'
import { emascoTaskInputs } from './lib/taskMatch.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUTPUT = path.join(ROOT, 'data', 'cache', 'exposure')
const BATCH = 32

async function writeJson(filePath, value) {
  const temporary = `${filePath}.tmp`
  await writeFile(temporary, JSON.stringify(value))
  await rename(temporary, filePath)
}

function batched(embedder) {
  return {
    async embed(texts) {
      const vectors = []
      for (let start = 0; start < texts.length; start += BATCH) vectors.push(...(await embedder.embed(texts.slice(start, start + BATCH))))
      return vectors
    },
  }
}

async function main() {
  const config = chooseEmbedderConfig(process.env, existsSync, path.join(ROOT, 'models'))
  if (!config || (!config.modelsDir && !config.url)) {
    console.error('No local model found. Put bge-m3 in models/ (Xenova/bge-m3/onnx/model.onnx) or set MODELS_DIR.')
    process.exit(1)
  }
  const csvPath = path.join(ROOT, 'data', 'cache', 'anthropic', 'task_penetration.csv')
  if (!existsSync(csvPath)) {
    console.error('No O*NET task file. Open /admin and press "Refresh live AI signals" first.')
    process.exit(1)
  }
  const onet = parseTaskPenetration(await readFile(csvPath, 'utf8'))
  const occupations = JSON.parse(await readFile(path.join(ROOT, 'data', 'emasco', 'occupations.json'), 'utf8'))
  const emasco = emascoTaskInputs(occupations)
  const embedder = batched(createEmbedder(config))

  const benchmarkIndex = process.argv.indexOf('--benchmark')
  if (benchmarkIndex !== -1) {
    const count = Number(process.argv[benchmarkIndex + 1]) || 200
    await embedder.embed(['warm up'])
    const started = Date.now()
    await embedder.embed(emasco.texts.slice(0, count))
    const speed = count / ((Date.now() - started) / 1000)
    console.log(`${speed.toFixed(1)} texts/s; estimated full run ${(((onet.length + emasco.texts.length) / speed) / 60).toFixed(0)} minutes`)
    return
  }

  await mkdir(OUTPUT, { recursive: true })
  const log = (message) => console.log(`${new Date().toISOString().slice(11, 19)} ${message}`)
  const onetTexts = onet.map((item) => item.task)
  const onetResult = await embedTexts({ name: 'onet', texts: onetTexts, embedder, modelId: MODEL_ID, directory: OUTPUT, log })
  await writeJson(path.join(OUTPUT, 'onet.json'), onet)
  const emascoResult = await embedTexts({ name: 'emasco', texts: emasco.texts, embedder, modelId: MODEL_ID, directory: OUTPUT, log })
  await writeJson(path.join(OUTPUT, 'emasco.json'), emasco.items)
  await writeJson(path.join(OUTPUT, 'meta.json'), {
    modelId: MODEL_ID, dimension: DIMENSION, onetCount: onetResult.count, emascoCount: emascoResult.count, builtAt: new Date().toISOString(),
  })
  console.log(`O*NET tasks ${onetResult.count}, eMASCO tasks ${emascoResult.count}, dimension ${DIMENSION}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
