import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile, readdir, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { embedTexts } from '../scripts/lib/embedChunks.js'
import { unpackVectors } from '../scripts/lib/emascoEmbed.js'

const DIMENSION = 4

// A unit vector that depends on the text, so row order can be checked.
function vectorFor(text) {
  const angle = text.length
  return [Math.cos(angle), Math.sin(angle), 0, 0]
}

function fakeEmbedder({ failOnCall, wrongCount, badVector } = {}) {
  const calls = []
  return {
    calls,
    async embed(texts) {
      calls.push(texts)
      if (calls.length === failOnCall) throw new Error('model crashed')
      if (wrongCount) return texts.slice(1).map(vectorFor)
      if (badVector) return texts.map(() => [Number.NaN, 0, 0, 0])
      return texts.map(vectorFor)
    }
  }
}

let directory
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'embed-'))
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

const run = (texts, embedder, extra = {}) =>
  embedTexts({ name: 'skills', texts, embedder, modelId: 'm', directory, chunkSize: 2, dimension: DIMENSION, ...extra })

async function rows() {
  return unpackVectors(await readFile(path.join(directory, 'skills.f32')), DIMENSION)
}

describe('embedTexts', () => {
  it('writes every row in input order, in chunks', async () => {
    const texts = ['a', 'bb', 'ccc', 'dddd', 'eeeee']
    const embedder = fakeEmbedder()
    const result = await run(texts, embedder)
    expect(result).toMatchObject({ count: 5, dimension: DIMENSION, resumedChunks: 0 })
    expect(embedder.calls.map((call) => call.length)).toEqual([2, 2, 1])
    const saved = await rows()
    expect(saved).toHaveLength(5)
    texts.forEach((text, index) => expect(saved[index][0]).toBeCloseTo(vectorFor(text)[0], 5))
  })

  it('resumes after a crash and gives the same result as a clean run', async () => {
    const texts = ['a', 'bb', 'ccc', 'dddd', 'eeeee']
    await expect(run(texts, fakeEmbedder({ failOnCall: 2 }))).rejects.toThrow('model crashed')
    const embedder = fakeEmbedder()
    const result = await run(texts, embedder)
    expect(result.resumedChunks).toBe(1)
    expect(embedder.calls).toHaveLength(2)
    const resumed = await rows()
    await rm(directory, { recursive: true, force: true })
    await mkdir(directory, { recursive: true })
    await run(texts, fakeEmbedder())
    expect(await rows()).toEqual(resumed)
  })

  it('discards old chunks when a text changes', async () => {
    await expect(run(['a', 'bb', 'ccc', 'dddd'], fakeEmbedder({ failOnCall: 2 }))).rejects.toThrow()
    const newTexts = ['zz', 'bb', 'ccc', 'dddd']
    const result = await run(newTexts, fakeEmbedder())
    expect(result.resumedChunks).toBe(0)
    const saved = await rows()
    expect(saved[0][0]).toBeCloseTo(vectorFor('zz')[0], 5)
  })

  it('does nothing on a second run with the same input', async () => {
    const texts = ['a', 'bb', 'ccc']
    await run(texts, fakeEmbedder())
    const embedder = fakeEmbedder()
    await run(texts, embedder)
    expect(embedder.calls).toHaveLength(0)
  })

  it('throws and saves no chunk when the embedder returns the wrong number of vectors', async () => {
    await expect(run(['a', 'bb'], fakeEmbedder({ wrongCount: true }))).rejects.toThrow(/vectors/)
    const files = await readdir(path.join(directory, 'chunks'))
    expect(files.filter((file) => file.endsWith('.f32'))).toEqual([])
  })

  it('throws and saves no chunk when a vector has NaN', async () => {
    await expect(run(['a', 'bb'], fakeEmbedder({ badVector: true }))).rejects.toThrow()
    const files = await readdir(path.join(directory, 'chunks'))
    expect(files.filter((file) => file.endsWith('.f32'))).toEqual([])
  })

  it('ignores a leftover .tmp file', async () => {
    await mkdir(path.join(directory, 'chunks'), { recursive: true })
    await writeFile(path.join(directory, 'chunks', 'skills-0.f32.tmp'), 'junk')
    await run(['a', 'bb', 'ccc'], fakeEmbedder())
    expect(await rows()).toHaveLength(3)
  })

  it('returns count 0 without calling the embedder for no texts', async () => {
    const embedder = fakeEmbedder()
    const result = await run([], embedder)
    expect(result.count).toBe(0)
    expect(embedder.calls).toHaveLength(0)
  })
})
