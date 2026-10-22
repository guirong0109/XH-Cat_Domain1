import { describe, expect, it, vi } from 'vitest'
import { createEmbedder, MODEL_ID } from '../server/embed.js'

const okReply = (vectors) => vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ vectors }) }))

describe('embedder remote mode', () => {
  it('posts texts and returns vectors', async () => {
    const fetchImpl = okReply([[1, 0], [0, 1]])
    const e = createEmbedder({ url: 'http://x/embed', fetchImpl })
    expect(e.isReady()).toBe(true)
    expect(await e.embed(['a', 'b'])).toEqual([[1, 0], [0, 1]])
    expect(fetchImpl.mock.calls[0][0]).toBe('http://x/embed')
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ texts: ['a', 'b'] })
  })

  it('rejects a non-200 reply', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    const e = createEmbedder({ url: 'http://x/embed', fetchImpl })
    await expect(e.embed(['a'])).rejects.toThrow()
  })

  it('rejects a wrong vector count', async () => {
    const e = createEmbedder({ url: 'http://x/embed', fetchImpl: okReply([[1]]) })
    await expect(e.embed(['a', 'b'])).rejects.toThrow()
  })
})

describe('embedder local mode', () => {
  it('is not ready until the model loads', async () => {
    let release
    const loadModel = () => new Promise((r) => { release = r })
    const e = createEmbedder({ loadModel })
    const warm = e.warmUp()
    expect(e.isReady()).toBe(false)
    release(async (texts) => texts.map(() => [1]))
    await warm
    expect(e.isReady()).toBe(true)
  })

  it('loads the model once', async () => {
    const loadModel = vi.fn(async () => async (texts) => texts.map(() => [1]))
    const e = createEmbedder({ loadModel })
    await e.embed(['a'])
    await e.embed(['b'])
    expect(loadModel).toHaveBeenCalledTimes(1)
  })

  it('a failed load leaves isReady false and embed rejects', async () => {
    const loadModel = vi.fn(async () => { throw new Error('no model') })
    const e = createEmbedder({ loadModel })
    await expect(e.embed(['a'])).rejects.toThrow('no model')
    expect(e.isReady()).toBe(false)
  })

  it('exposes the model id', () => {
    expect(createEmbedder({ loadModel: async () => async () => [] }).modelId).toBe(MODEL_ID)
  })
})
