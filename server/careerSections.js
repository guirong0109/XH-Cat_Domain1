// Splits ranked eMASCO cards into "in your field" and "other fields" using the stored occupation intelligence.
// Pure. The order inside each list is the ranking order it receives (the AI fit order); nothing is re-scored here.
import { placeRole } from './fieldClassifier.js'

// Enough candidates to fill both lists: on the four sample students a pool of 80 already held 23 to 37 in-field roles.
export const POOL_SIZE = 150
export const SECTION_MAX = 20
// A student skill "carries over" only when one of its eMASCO skills is this close to one of the role's skills. Stricter
// than the 0.69 Explore cut-off: on 1,245 matched pairs of the four sample students (judged by Claude on 35 examples,
// 25 Oct 2026, not tuned), pairs under 0.85 were often unrelated ("graphic design software" ~ "audit software", 0.80).
export const TRANSFER_CUTOFF = 0.85

// The student's skills whose eMASCO skills closely match one of the role's skills.
// lineLabels[i] = the labels behind ranking line i (a list: two student skills can find the same eMASCO skill).
export function transferableLabels(card, lineLabels, cutoff = TRANSFER_CUTOFF) {
  const labels = []
  for (const skill of card.skills ?? []) {
    if (!skill.matched || !Number.isInteger(skill.line) || !(skill.score >= cutoff)) continue
    for (const label of lineLabels[skill.line] ?? []) if (!labels.includes(label)) labels.push(label)
  }
  return labels
}

// The field block a card carries to the browser (labels from the fields file).
export function fieldView(record, fields) {
  if (!record) return null
  const labelOf = new Map((fields?.fields ?? []).map((field) => [field.id, field.label]))
  const field = record.derived.field
  return {
    primary: field.primary,
    primaryLabel: labelOf.get(field.primary) ?? field.primary,
    second: field.second,
    secondLabel: labelOf.get(field.second) ?? field.second,
    related: field.related.map((id) => ({ id, label: labelOf.get(id) ?? id })),
    confidence: field.confidence,
    margin: field.margin,
    version: record.version,
    processedAt: record.processedAt
  }
}

// cards: ranked cards (best first); records: intelligence records by code; userFields: field ids of the student's major;
// generalLabels: skills almost every field uses (e.g. Teamwork). A card for another field is shown only when at least one
// of the student's other skills carries over, so a list of generic clerical matches does not pose as a career change.
export function splitCareers({ cards, records, fields, userFields, lineLabels, generalLabels = [], max = SECTION_MAX }) {
  const general = new Set(generalLabels)
  const inField = []
  const otherField = []
  let generalOnly = 0
  let unclassified = 0
  for (const card of cards) {
    const record = records?.[card.code]
    const field = record?.derived?.field
    const place = placeRole(field, userFields)
    if (!place) {
      unclassified += 1
      continue
    }
    const transferable = transferableLabels(card, lineLabels)
    const enriched = { ...card, field: fieldView(record, fields), transferable }
    if (place === 'in') {
      if (inField.length < max) inField.push(enriched)
    } else if (!transferable.some((label) => !general.has(label))) {
      generalOnly += 1
    } else if (otherField.length < max) {
      otherField.push(enriched)
    }
  }
  return { inField, otherField, generalOnly, unclassified }
}
