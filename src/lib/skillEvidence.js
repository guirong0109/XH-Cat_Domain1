// What the official eMASCO page says about each skill of a scored role, from the preprocessed dataset (data/skills).
// Pure view helpers. Nothing here is used in a score: the fit formula still reads role.skills only.
// Missing evidence is never read as "not required": it is shown as "not listed" or "no usable list".

export const SUPPORT_TEXT = {
  exact: 'The eMASCO page lists this skill.',
  synonym: 'The eMASCO page lists this skill under another name (our synonym table is a draft).',
  related: 'The eMASCO page lists a related skill, not the same one.',
  not_listed: 'The eMASCO page lists skills for this role but none match this one. Our team added it; it is not proof the role does not need it.',
  no_official_data: 'The eMASCO page has no usable skill list for this role, so this says nothing either way.',
}

export const roleEvidenceFor = (skillEvidence, code) => skillEvidence?.roles?.[code] ?? null

export function skillSupportRows(entry, roleSkills) {
  return roleSkills.map((skill) => {
    const found = entry?.skills?.[skill.label]
    if (!found) return { label: skill.label, support: null, text: null, evidence: [] }
    return { label: skill.label, support: found.support, text: SUPPORT_TEXT[found.support] ?? null, evidence: found.evidence ?? [] }
  })
}

// Skills the official page lists for the role that none of the role's own skills cover. If the student has an app skill
// that is related to one of them, that is shown as a hint; it is never counted as having the skill.
export function otherOfficialSkills(entry, profile) {
  const have = new Set(profile?.skills ?? [])
  return (entry?.otherOfficial ?? []).map((item) => ({
    ...item,
    relatedYouHave: (item.relatedAppSkills ?? []).filter((label) => have.has(label)),
    needsReview: item.status !== 'validated',
  }))
}

export function evidenceHeadline(entry) {
  if (!entry) return null
  if (entry.occupationStatus === 'missing') return 'This role is not in the skill dataset.'
  if (entry.occupationStatus === 'insufficient' || entry.occupationStatus === 'failed') {
    return `No usable skill list on the eMASCO page. ${entry.reason ?? ''}`.trim()
  }
  const sparse = entry.occupationStatus === 'sparse' ? ' Only a short list is given, so a missing skill means little.' : ''
  return `The eMASCO page lists ${entry.officialSkillCount} skill${entry.officialSkillCount === 1 ? '' : 's'} for this role.${sparse}`
}

export function evidenceSourceLine(entry, meta) {
  if (!entry?.source) return null
  const date = entry.source.retrievedAt ? `, retrieved ${entry.source.retrievedAt}` : ''
  const draft = meta?.synonymTableStatus === 'draft' ? ' Skill matching is automatic and a draft until our team reviews it.' : ''
  return `Source: ${entry.source.name}${date}.${draft}`
}

export function supportCounts(entry) {
  const counts = { exact: 0, synonym: 0, related: 0, not_listed: 0, no_official_data: 0 }
  for (const item of Object.values(entry?.skills ?? {})) counts[item.support] = (counts[item.support] ?? 0) + 1
  return counts
}
