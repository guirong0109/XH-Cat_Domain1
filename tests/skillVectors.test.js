import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadSkillVectors } from '../server/skillVectors.js'

function fakeEmbedder(modelId = 'm1') {
  const calls = []
  return {
    modelId,
    calls,
    embed: async (texts) => {
      calls.push(texts)
      return texts.map((t) => [t.length, 1])
    },
  }
}

describe('loadSkillVectors', () => {
  const skills = [
    { label: 'SQL', keywords: ['mysql'] },
    { label: 'Teamwork', keywords: [], statements: ['Works in a team'] },
  ]
  async function cachePath() {
    const dir = await mkdtemp(path.join(tmpdir(), 'sv-'))
    return path.join(dir, 'sub', 'cache.json')
  }

  it('embeds once, groups per skill and creates the cache folder', async () => {
    const embedder = fakeEmbedder()
    const file = await cachePath()
    const out = await loadSkillVectors({ skills, embedder, cachePath: file, mode: 'label' })
    expect(embedder.calls).toHaveLength(1)
    expect(out.labels).toEqual(['SQL', 'Teamwork'])
    expect(out.vectorSets.map((s) => s.length)).toEqual([1, 2])
    expect(JSON.parse(await readFile(file, 'utf8')).modelId).toBe('m1')
  })

  it('reuses the cache; re-embeds on changed label, model or mode', async () => {
    const embedder = fakeEmbedder()
    const file = await cachePath()
    await loadSkillVectors({ skills, embedder, cachePath: file, mode: 'label' })
    await loadSkillVectors({ skills, embedder, cachePath: file, mode: 'label' })
    expect(embedder.calls).toHaveLength(1)
    const renamed = [{ ...skills[0], label: 'SQL!' }, skills[1]]
    await loadSkillVectors({ skills: renamed, embedder, cachePath: file, mode: 'label' })
    expect(embedder.calls).toHaveLength(2)
    const otherModel = fakeEmbedder('m2')
    await loadSkillVectors({ skills: renamed, embedder: otherModel, cachePath: file, mode: 'label' })
    expect(otherModel.calls).toHaveLength(1)
    await loadSkillVectors({ skills: renamed, embedder: otherModel, cachePath: file, mode: 'label+keywords' })
    expect(otherModel.calls).toHaveLength(2)
  })
})
