import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { createEmbedder } from './embed.js'

const dataDirectory = fileURLToPath(new URL('../data', import.meta.url))
const defaultModelsDirectory = fileURLToPath(new URL('../models', import.meta.url))

// Local model folder: MODELS_DIR, else the repo's models/ folder when the model is there.
function findModelsDirectory() {
  if (process.env.MODELS_DIR) return process.env.MODELS_DIR
  const model = path.join(defaultModelsDirectory, 'Xenova', 'bge-m3', 'onnx', 'model.onnx')
  return existsSync(model) ? defaultModelsDirectory : undefined
}

const embedder = createEmbedder({
  url: process.env.EMBED_URL || undefined,
  modelsDir: findModelsDirectory(),
})
embedder.warmUp().then(
  () => console.log('AI model ready'),
  (error) => console.error(`AI model failed to load: ${error.message}`),
)

const port = process.env.PORT || 3000
createApp({ dataDir: dataDirectory, embedder }).listen(port, () => {
  console.log(`FutureReady MY listening on port ${port}`)
})
