import { describe, it, expect } from 'vitest'
import { quantize, dequantize } from '../scripts/lib/packVectors.js'

function randomUnitVectors(rowCount, dimension, seed) {
  let state = seed
  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296 - 0.5
  }
  const vectors = new Float32Array(rowCount * dimension)
  for (let row = 0; row < rowCount; row += 1) {
    let squares = 0
    for (let position = 0; position < dimension; position += 1) {
      const value = next()
      vectors[row * dimension + position] = value
      squares += value * value
    }
    const length = Math.sqrt(squares)
    for (let position = 0; position < dimension; position += 1) vectors[row * dimension + position] /= length
  }
  return vectors
}

describe('quantize and dequantize', () => {
  it('keeps the cosine to the original at 0.999 or more', () => {
    const dimension = 64
    const vectors = randomUnitVectors(20, dimension, 7)
    const { codes, scales } = quantize(vectors, dimension)
    const back = dequantize(codes, scales, dimension)
    for (let row = 0; row < 20; row += 1) {
      let dot = 0
      let squares = 0
      for (let position = 0; position < dimension; position += 1) {
        dot += vectors[row * dimension + position] * back[row * dimension + position]
        squares += back[row * dimension + position] ** 2
      }
      expect(dot / Math.sqrt(squares)).toBeGreaterThan(0.999)
    }
  })

  it('is four times smaller plus one scale per vector', () => {
    const { codes, scales } = quantize(randomUnitVectors(3, 8, 1), 8)
    expect(codes.byteLength).toBe(24)
    expect(scales).toHaveLength(3)
  })

  it('does not divide by zero for an all-zero vector', () => {
    const { codes, scales } = quantize(new Float32Array(4), 4)
    expect(Array.from(codes)).toEqual([0, 0, 0, 0])
    expect(Number.isFinite(scales[0])).toBe(true)
    expect(Array.from(dequantize(codes, scales, 4))).toEqual([0, 0, 0, 0])
  })
})
