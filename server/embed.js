// Text embedder for CV reading.
// Model: BAAI/bge-m3 (multilingual), run on the CPU in full precision (fp32),
// CLS pooling, normalised vectors.
// Hub repo: Xenova/bge-m3 (transformers.js ONNX export; has onnx/model.onnx +
// onnx/model.onnx_data, the full-precision weights). Licence: MIT (checked on
// huggingface.co/api/models/Xenova/bge-m3 on 2026-10-22; base model BAAI/bge-m3).
// Two modes: local (loads the model inside this server) or remote (POST to a URL).

export const MODEL_ID = 'Xenova/bge-m3'

async function defaultLoadModel({ modelsDir } = {}) {
  const { pipeline, env } = await import('@huggingface/transformers')
  if (modelsDir) {
    env.localModelPath = modelsDir
    env.allowRemoteModels = false
  }
  const extractor = await pipeline('feature-extraction', MODEL_ID, { dtype: 'fp32' })
  return async (texts) => {
    const tensor = await extractor(texts, { pooling: 'cls', normalize: true })
    return tensor.tolist()
  }
}

export function createEmbedder({
  url,
  fetchImpl = globalThis.fetch,
  loadModel = defaultLoadModel,
  timeoutMs = 30000,
  modelsDir
} = {}) {
  if (url) {
    return {
      modelId: MODEL_ID,
      isReady: () => true,
      warmUp: async () => {},
      async embed(texts) {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ texts }),
          signal: AbortSignal.timeout(timeoutMs)
        })
        if (!response.ok) throw new Error(`Embedding service replied ${response.status}`)
        const { vectors } = await response.json()
        if (!Array.isArray(vectors) || vectors.length !== texts.length) {
          throw new Error('Embedding service returned the wrong number of vectors')
        }
        return vectors
      }
    }
  }

  let run = null
  let loading = null

  function load() {
    if (!loading) {
      loading = loadModel({ modelsDir }).then(
        (fn) => {
          run = fn
          return fn
        },
        (error) => {
          loading = null
          throw error
        }
      )
    }
    return loading
  }

  return {
    modelId: MODEL_ID,
    isReady: () => run !== null,
    async warmUp() {
      await load()
    },
    async embed(texts) {
      const fn = await load()
      return fn(texts)
    }
  }
}
