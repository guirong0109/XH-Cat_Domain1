// Turns the app's skill labels into eMASCO skill ids, so all eMASCO roles can be ranked for a student.
export const IDS_PER_LABEL = 3

// search(query, limit) -> Promise<{ skills: [{ id }] }>. Skills with no hit are skipped; ids are unique.
export async function skillIdsForLabels(labels, search, perLabel = IDS_PER_LABEL) {
  const ids = new Set()
  for (const label of labels) {
    const found = await search(label, perLabel)
    for (const skill of found.skills ?? []) ids.add(skill.id)
  }
  return [...ids]
}
