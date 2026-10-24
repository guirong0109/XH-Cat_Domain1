// Field classification from saved bge-m3 vectors. Pure: no file, network or model access.
// A field vector is the normalised average of the saved vectors of the eMASCO skills that a word search finds for the
// field's search words (data/team/field_concepts.json, a team draft). An occupation's field scores are the cosines
// between its saved role vector and each field vector. No occupation is ever mapped to a field by hand.

export const SEEDS_PER_WORD = 4
// Confidence comes from the gap between the best and the second-best field score (bge-m3 cosines sit close together,
// so the raw score says little). Cut-offs are about the lowest and highest quarter of gaps on the first real run of
// 25 Oct 2026; they were not tuned on labelled data.
export const UNCLEAR_BELOW = 0.01
export const HIGH_FROM = 0.04
// Other fields this close to the best one are listed as related.
export const RELATED_WITHIN = 0.02
export const MAX_RELATED = 2

const round4 = (value) => Math.round(value * 10000) / 10000

// fields: [{ id, label, definition, searchWords }]; rank(word) -> skill rows, best first (a word search).
// Returns [{ id, label, definition, seeds: [skill text], vector: Float64Array (unit length) }].
export function buildFieldVectors({ fields, rank, skillTexts, skillVectors, dimension, perWord = SEEDS_PER_WORD }) {
  return fields.map((field) => {
    const rows = []
    for (const word of field.searchWords) {
      for (const row of rank(word).slice(0, perWord)) if (!rows.includes(row)) rows.push(row)
    }
    if (rows.length === 0) throw new Error(`Field "${field.id}" found no eMASCO skills for its search words`)
    const vector = new Float64Array(dimension)
    for (const row of rows) {
      const offset = row * dimension
      for (let position = 0; position < dimension; position += 1) vector[position] += skillVectors[offset + position]
    }
    const length = Math.hypot(...vector)
    for (let position = 0; position < dimension; position += 1) vector[position] /= length
    return { id: field.id, label: field.label, definition: field.definition, seeds: rows.map((row) => skillTexts[row]), vector }
  })
}

// Cosine of one saved role vector (at `offset` in `vectors`) with every field vector, best first (ties by id).
export function fieldScores(vectors, offset, fieldVectors, dimension) {
  let length = 0
  for (let position = 0; position < dimension; position += 1) length += vectors[offset + position] ** 2
  length = Math.sqrt(length) || 1
  return fieldVectors
    .map((field) => {
      let sum = 0
      for (let position = 0; position < dimension; position += 1) sum += vectors[offset + position] * field.vector[position]
      return { id: field.id, score: sum / length }
    })
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
}

export function confidenceOf(margin) {
  if (margin < UNCLEAR_BELOW) return 'unclear'
  return margin >= HIGH_FROM ? 'high' : 'medium'
}

// scores: from fieldScores. Returns the derived field block of an intelligence record.
export function classify(scores) {
  const [best, second] = scores
  const margin = second ? best.score - second.score : 1
  const related = scores
    .slice(1)
    .filter((item) => best.score - item.score <= RELATED_WITHIN)
    .slice(0, MAX_RELATED)
    .map((item) => item.id)
  return {
    primary: best.id,
    second: second?.id ?? null,
    margin: round4(margin),
    confidence: confidenceOf(margin),
    related,
    scores: Object.fromEntries(scores.map((item) => [item.id, round4(item.score)]))
  }
}

// Which career list a role belongs to for a student whose major links to `userFields`.
// In your field: the best field is one of yours, or the field is unclear and the second-best is one of yours.
export function placeRole(field, userFields) {
  if (!field || !Array.isArray(userFields) || userFields.length === 0) return null
  if (userFields.includes(field.primary)) return 'in'
  if (field.confidence === 'unclear' && userFields.includes(field.second)) return 'in'
  return 'other'
}
