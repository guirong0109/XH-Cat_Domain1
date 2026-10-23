// Helpers for embedding the crawled eMASCO skills and roles (option B, phase 3).
// Pure functions: texts, hash, vector checks, packing. No model here.
import { createHash } from 'node:crypto'

export const MAX_PROFILE_CHARS = 2000
export const DIMENSION = 1024
const UNIT_TOLERANCE = 0.01

export function profileText(role, maxChars = MAX_PROFILE_CHARS) {
  const lines = [role.title, role.description]
  if (role.skills.length > 0) lines.push(...role.skills.map((skill) => skill.text))
  else lines.push(...role.tasks)
  return lines
    .filter((line) => line && line.trim())
    .join('\n')
    .slice(0, maxChars)
}

export function skillInputs(occupations) {
  const ids = []
  const texts = []
  for (const skill of occupations.skills) {
    if (!skill.text || !skill.text.trim()) throw new Error(`Skill ${skill.id} has no text`)
    ids.push(skill.id)
    texts.push(skill.text)
  }
  return { ids, texts }
}

export function roleInputs(occupations) {
  const ids = []
  const texts = []
  for (const role of [...occupations.roles, ...occupations.tasksOnly]) {
    const text = profileText(role)
    if (!text.trim()) throw new Error(`Role ${role.code} has an empty profile`)
    ids.push(role.code)
    texts.push(text)
  }
  return { ids, texts }
}

export function inputHash(texts, modelId) {
  return createHash('sha256').update(JSON.stringify({ modelId, texts })).digest('hex')
}

export function validateVector(vector, dimension = DIMENSION) {
  if (!Array.isArray(vector) || vector.length !== dimension) {
    throw new Error(`Vector has length ${vector?.length}, expected ${dimension}`)
  }
  let squares = 0
  for (const value of vector) {
    if (!Number.isFinite(value)) throw new Error('Vector has a value that is not a finite number')
    squares += value * value
  }
  if (Math.abs(Math.sqrt(squares) - 1) > UNIT_TOLERANCE) {
    throw new Error(`Vector length is ${Math.sqrt(squares).toFixed(4)}, expected 1`)
  }
}

export function packVectors(vectors) {
  const flat = new Float32Array(vectors.flat())
  return Buffer.from(flat.buffer, flat.byteOffset, flat.byteLength)
}

export function unpackVectors(buffer, dimension = DIMENSION) {
  const rowBytes = dimension * 4
  if (buffer.length % rowBytes !== 0) throw new Error('Buffer is not a whole number of vectors')
  const copy = new Uint8Array(buffer).buffer
  const flat = new Float32Array(copy)
  const rows = []
  for (let start = 0; start < flat.length; start += dimension) rows.push(Array.from(flat.subarray(start, start + dimension)))
  return rows
}
