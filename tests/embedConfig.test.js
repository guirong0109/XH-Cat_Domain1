import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { chooseEmbedderConfig } from '../server/embedConfig.js'

const model = (dir) => path.join(dir, 'Xenova', 'bge-m3', 'onnx', 'model.onnx')
const defaultDir = path.join('repo', 'models')

describe('chooseEmbedderConfig', () => {
  it('uses EMBED_URL when set', () => {
    expect(chooseEmbedderConfig({ EMBED_URL: 'http://x' }, () => false, defaultDir)).toEqual({ url: 'http://x' })
  })
  it('uses MODELS_DIR when the model is there, and stays off when it is wrong', () => {
    expect(chooseEmbedderConfig({ MODELS_DIR: 'm' }, (p) => p === model('m'), defaultDir)).toEqual({ modelsDir: 'm' })
    expect(chooseEmbedderConfig({ MODELS_DIR: 'bad', CV_AI_DOWNLOAD: 'on' }, () => false, defaultDir)).toBeNull()
  })
  it('uses the repo models folder when the model is there', () => {
    expect(chooseEmbedderConfig({}, (p) => p === model(defaultDir), defaultDir)).toEqual({ modelsDir: defaultDir })
  })
  it('downloads only with CV_AI_DOWNLOAD=on, otherwise off', () => {
    expect(chooseEmbedderConfig({ CV_AI_DOWNLOAD: 'on' }, () => false, defaultDir)).toEqual({ hubDownload: true })
    expect(chooseEmbedderConfig({}, () => false, defaultDir)).toBeNull()
  })
})
