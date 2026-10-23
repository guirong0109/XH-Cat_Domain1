import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { createEmbedder } from './embed.js'
import { chooseEmbedderConfig } from './embedConfig.js'

const dataDirectory = fileURLToPath(new URL('../data', import.meta.url))
const defaultModelsDirectory = fileURLToPath(new URL('../models', import.meta.url))

const config = chooseEmbedderConfig(process.env, existsSync, defaultModelsDirectory)
const embedder = config ? createEmbedder({ url: config.url, modelsDir: config.modelsDir }) : null
if (!embedder) {
  console.log('AI CV check off: no local model (set MODELS_DIR, EMBED_URL or CV_AI_DOWNLOAD=on)')
}

const app = createApp({ dataDir: dataDirectory, embedder })
if (embedder) {
  embedder
    .warmUp()
    .then(() => app.locals.warmCv())
    .then(
      () => console.log('AI model ready'),
      (error) => console.error(`AI model failed to load: ${error.message}`),
    )
}

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`FutureReady MY listening on port ${port}`)
  console.log(`Admin console (this PC only): http://localhost:${port}/admin`)
})
