// Small pure helpers for the "Explore all roles" feature: qualification levels, civil-service grade merge, skill search.

export const LEVELS = { none: 0, spm: 1, certificate: 2, diploma: 3, degree: 4, master: 5, phd: 6 }
const MAX_QUERY_LENGTH = 100
const MAX_SEARCH_RESULTS = 20

// eMASCO qualification text -> level name. Unknown text is 'other' (kept, never silently dropped).
export function qualificationLevel(text) {
  const plain = String(text ?? '').toLowerCase()
  if (/phd|doctor/.test(plain)) return 'phd'
  if (/master/.test(plain)) return 'master'
  if (/bachelor|degree|ijazah/.test(plain)) return 'degree'
  if (/diploma/.test(plain)) return 'diploma'
  if (/spm|sijil pelajaran/.test(plain)) return 'spm'
  if (/certificate|sijil/.test(plain)) return 'certificate'
  if (/no formal|primary|tiada/.test(plain)) return 'none'
  return 'other'
}

export function levelRank(level) {
  return LEVELS[level] ?? 0
}

// "Pharmacist Grade UF9" -> base "Pharmacist", grade "UF9". A trailing "(...)" stays with the base title.
export function splitGrade(title) {
  const match = /^(.*?)\s+Grade\s+([^(]*?)\s*(\(.*\))?\s*$/i.exec(title)
  if (!match) return { base: title, grade: '' }
  const [, base, grade, extra] = match
  return { base: extra ? `${base} ${extra}` : base, grade: grade.trim() }
}

// Grades of one job in one 4-digit unit group share a key and are shown as one card.
export function groupKey(role) {
  return `${splitGrade(role.title).base.toLowerCase()}|${role.code.slice(0, 4)}`
}

export function createSkillSearch(skills) {
  const entries = skills.map((skill) => ({ skill, lower: skill.text.toLowerCase() }))
  return function search(query, limit = MAX_SEARCH_RESULTS) {
    const words = String(query ?? '').slice(0, MAX_QUERY_LENGTH).toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return []
    const wanted = Math.min(Math.max(1, Number(limit) || MAX_SEARCH_RESULTS), MAX_SEARCH_RESULTS)
    const phrase = words.join(' ')
    // Whole words first ("excel" before "excellent"), then texts that start with the query, then shorter texts.
    const wholeWords = words.map((word) => new RegExp(`(^|[^\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u'))
    const rank = (entry) => (wholeWords.every((pattern) => pattern.test(entry.lower)) ? 0 : 2) + (entry.lower.startsWith(phrase) ? 0 : 1)
    return entries
      .filter((entry) => words.every((word) => entry.lower.includes(word)))
      .sort((left, right) => rank(left) - rank(right) || left.lower.length - right.lower.length)
      .slice(0, wanted)
      .map(({ skill }) => ({ id: skill.id, text: skill.text, roles: skill.roles.length }))
  }
}
