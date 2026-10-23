// Reads one eMASCO page in Node (English). Same rules as pipeline/scrape_emasco.parse_role_page_tolerant:
// a section the page does not show stays empty; a page needs a code, a title and at least tasks or skills.
import { visibleBlocks } from './references.js'

const TAGS = new Set(['STEM', 'TVET', 'GREEN', 'GIG'])
const CLASSIFICATIONS = ['MSIC', 'NOSS', 'NEC']

function indexOf(blocks, heading, start, stop = blocks.length) {
  for (let position = start; position < stop; position += 1) if (blocks[position] === heading) return position
  return null
}

export function parseOccupationPage(html) {
  const blocks = visibleBlocks(html)
  const end = blocks.length
  const codeLabel = indexOf(blocks, 'MASCO Code', 0)
  const compareLabel = codeLabel === null ? null : indexOf(blocks, 'Compare', codeLabel)
  if (compareLabel === null) throw new Error('Role header not found')
  const code = blocks[codeLabel + 1]
  const title = blocks[compareLabel + 1]

  const tasksHeading = indexOf(blocks, 'Tasks', compareLabel)
  const skillsHeading = indexOf(blocks, 'Skills', tasksHeading ?? compareLabel)
  const additionalHeading = indexOf(blocks, 'Additional Info', compareLabel)
  const headerEnd = Math.min(...[tasksHeading, skillsHeading, additionalHeading, end].filter((value) => value !== null))
  const tags = blocks.slice(compareLabel + 2, headerEnd).filter((block) => TAGS.has(block))
  let description = ''
  if (tasksHeading !== null) description = blocks[tasksHeading - 1]
  else if (compareLabel + 2 < headerEnd && !TAGS.has(blocks[compareLabel + 2]) && !CLASSIFICATIONS.includes(blocks[compareLabel + 2]) && blocks[compareLabel + 2] !== 'Skills') {
    description = blocks[compareLabel + 2]
  }

  let tasks = []
  if (tasksHeading !== null) {
    const tasksEnd = Math.min(...[skillsHeading, additionalHeading, end].filter((value) => value !== null))
    const classification = CLASSIFICATIONS.map((name) => indexOf(blocks, name, tasksHeading, tasksEnd)).filter((value) => value !== null)
    tasks = blocks.slice(tasksHeading + 1, Math.min(tasksEnd, ...classification))
  }

  let basic = []
  let specific = []
  if (skillsHeading !== null) {
    if (additionalHeading === null) throw new Error(`Cannot find where the skills end for role ${code}`)
    const basicHeading = indexOf(blocks, 'Basic', skillsHeading, additionalHeading)
    const specificHeading = indexOf(blocks, 'Specific', skillsHeading, additionalHeading)
    const starts = [basicHeading, specificHeading].filter((value) => value !== null).sort((left, right) => left - right)
    for (const start of starts) {
      const stop = Math.min(...[...starts, additionalHeading].filter((value) => value > start))
      const list = blocks.slice(start + 1, stop)
      if (start === basicHeading) basic = list
      else specific = list
    }
  }

  let qualification = ''
  if (additionalHeading !== null) {
    const qualificationHeading = indexOf(blocks, 'QUALIFICATION', additionalHeading)
    if (qualificationHeading !== null) {
      const stop = indexOf(blocks, 'Related Courses', qualificationHeading) ?? qualificationHeading + 2
      qualification = blocks.slice(qualificationHeading + 1, stop).join(' ')
    }
  }

  if (tasks.length === 0 && basic.length === 0 && specific.length === 0) throw new Error(`No tasks and no skills on the page for role ${code}`)
  return { code, title, description, tags, tasks, basic, specific, qualification }
}

// Direct children of `code` that are linked on its page (same rule as pipeline/crawl_emasco_all.py).
export function childCodes(html, code) {
  const linked = new Set([...String(html).matchAll(/\/masco\/(\d+(?:-\d+)?)/g)].map((match) => match[1]))
  const children = []
  for (const candidate of linked) {
    if (code.length === 4) {
      if (new RegExp(`^${code}-\\d{2}$`).test(candidate)) children.push(candidate)
    } else if (!candidate.includes('-') && candidate.length === code.length + 1 && candidate.startsWith(code)) {
      children.push(candidate)
    }
  }
  return children.sort()
}

export const isOccupationCode = (code) => /^\d{4}-\d{2}$/.test(code)

// A role from data/emasco/occupations.json in the same shape as a parsed page.
export function savedFrom(role) {
  return {
    code: role.code,
    title: role.title,
    description: role.description ?? '',
    tasks: role.tasks ?? [],
    basic: (role.skills ?? []).filter((skill) => skill.type === 'basic').map((skill) => skill.text),
    specific: (role.skills ?? []).filter((skill) => skill.type === 'specific').map((skill) => skill.text),
    qualification: role.qualification ?? ''
  }
}

// Compared without case, spaces or punctuation, so a different quote mark is not a change.
const squash = (value) => (Array.isArray(value) ? value : [value]).map((item) => String(item ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''))
const same = (left, right) => JSON.stringify(squash(left)) === JSON.stringify(squash(right))

export function compareRole(saved, fresh) {
  const changed = []
  if (!same(saved.title, fresh.title)) changed.push('title')
  if (!same(saved.description, fresh.description)) changed.push('description')
  if (!same(saved.tasks, fresh.tasks)) changed.push('tasks')
  if (!same(saved.basic, fresh.basic) || !same(saved.specific, fresh.specific)) changed.push('skills')
  if (!same(saved.qualification, fresh.qualification)) changed.push('qualification')
  return changed
}
