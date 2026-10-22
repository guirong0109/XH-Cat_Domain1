import path from 'node:path'

const MODEL_FILE = path.join('Xenova', 'bge-m3', 'onnx', 'model.onnx')

// Decides how the AI CV check is set up. Returns { url, modelsDir, hubDownload } or null (AI off).
// On: EMBED_URL, a local model folder, or the opt-in CV_AI_DOWNLOAD=on.
export function chooseEmbedderConfig(env, existsFn, defaultModelsDir) {
  if (env.EMBED_URL) return { url: env.EMBED_URL }
  if (env.MODELS_DIR) {
    if (existsFn(path.join(env.MODELS_DIR, MODEL_FILE))) return { modelsDir: env.MODELS_DIR }
    // A wrong MODELS_DIR never falls back to a download.
    return null
  }
  if (existsFn(path.join(defaultModelsDir, MODEL_FILE))) return { modelsDir: defaultModelsDir }
  if (env.CV_AI_DOWNLOAD === 'on') return { hubDownload: true }
  return null
}
