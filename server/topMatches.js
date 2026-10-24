// Turns the app's skill labels into eMASCO skill ids, so all eMASCO roles can be ranked for a student.
export const IDS_PER_LABEL = 3
const MIN_WORD_LENGTH = 4

// Words of a label that are worth searching alone ("SQL and databases" -> sql, databases is too short for sql, so databases).
function searchQueries(label) {
  const clean = label.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim()
  const words = clean.split(' ').filter((word) => word.length >= MIN_WORD_LENGTH)
  return [clean, ...words.filter((word) => word !== clean)]
}

// search(query, limit) -> an array of { id } or { skills: [{ id }] } (the hybrid search). The first query with a hit is used,
// so a label whose full text finds nothing still finds skills by its main words. No hit means the label is skipped.
// Returns [{ label, ids }] in label order, so a matched eMASCO skill can be traced back to the student's skill.
export async function skillIdsByLabel(labels, search, perLabel = IDS_PER_LABEL) {
  const found = []
  for (const label of labels) {
    for (const query of searchQueries(label)) {
      const result = await search(query, perLabel)
      const skills = Array.isArray(result) ? result : result?.skills ?? []
      if (skills.length === 0) continue
      found.push({ label, ids: skills.map((skill) => skill.id) })
      break
    }
  }
  return found
}

// The unique ids of skillIdsByLabel, in order.
export async function skillIdsForLabels(labels, search, perLabel = IDS_PER_LABEL) {
  return [...new Set((await skillIdsByLabel(labels, search, perLabel)).flatMap((entry) => entry.ids))]
}

// The student's skills behind each eMASCO skill id (every label that found it, in label order). Used to name
// transferable skills, so a field skill is not hidden when a general skill found the same eMASCO skill first.
export function labelsOfId(byLabel) {
  const map = new Map()
  for (const { label, ids } of byLabel) {
    for (const id of ids) {
      const labels = map.get(id) ?? []
      if (!labels.includes(label)) labels.push(label)
      map.set(id, labels)
    }
  }
  return map
}
