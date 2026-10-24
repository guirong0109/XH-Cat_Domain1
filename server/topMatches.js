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
// so a label whose full text finds nothing still finds skills by its main words. Ids are unique; no hit means the label is skipped.
export async function skillIdsForLabels(labels, search, perLabel = IDS_PER_LABEL) {
  const ids = new Set()
  for (const label of labels) {
    for (const query of searchQueries(label)) {
      const found = await search(query, perLabel)
      const skills = Array.isArray(found) ? found : found?.skills ?? []
      if (skills.length === 0) continue
      for (const skill of skills) ids.add(skill.id)
      break
    }
  }
  return [...ids]
}
