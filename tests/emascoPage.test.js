import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { childCodes, compareRole, isOccupationCode, parseOccupationPage, savedFrom } from '../server/emascoPage.js'

const fixture = readFileSync(new URL('../pipeline/tests/fixtures/emasco_2511-01.html', import.meta.url), 'utf8')

describe('parseOccupationPage', () => {
  it('reads a full page: code, title, tags, tasks, both skill lists and the qualification', () => {
    const role = parseOccupationPage(fixture)
    expect(role.code).toBe('2511-01')
    expect(role.title.length).toBeGreaterThan(3)
    expect(role.tags).toContain('STEM')
    expect(role.tasks.length).toBeGreaterThan(2)
    expect(role.basic.length).toBeGreaterThan(0)
    expect(role.specific.length).toBeGreaterThan(0)
    expect(role.qualification).toMatch(/degree|diploma|certificate/i)
  })

  it('keeps a page with only tasks, with empty skills and qualification', () => {
    const role = parseOccupationPage(
      '<p>MASCO Code</p><p>1111-01</p><p>Compare</p><p>Legislator</p><p>Describes the job.</p><h3>Tasks</h3><p>Lead things.</p><p>Draft laws.</p><p>NEC</p><p>0111</p>'
    )
    expect(role).toMatchObject({ code: '1111-01', description: 'Describes the job.', tasks: ['Lead things.', 'Draft laws.'], basic: [], specific: [], qualification: '' })
  })

  it('keeps a page with only specific skills', () => {
    const role = parseOccupationPage(
      '<p>MASCO Code</p><p>2132-07</p><p>Compare</p><p>Officer</p><p>About.</p><h3>Tasks</h3><p>Work.</p><h3>Skills</h3><h4>Specific</h4><p>Soil science</p><h3>Additional Info</h3><h3>QUALIFICATION</h3><p>Degree</p><h3>Related Courses</h3>'
    )
    expect(role).toMatchObject({ basic: [], specific: ['Soil science'], qualification: 'Degree' })
  })

  it('keeps a page with skills but no tasks', () => {
    const role = parseOccupationPage(
      '<p>MASCO Code</p><p>2311-18</p><p>Compare</p><p>Lecturer</p><p>About.</p><h3>Skills</h3><h4>Basic</h4><p>Teaching</p><h4>Specific</h4><p>Anatomy</p><h3>Additional Info</h3>'
    )
    expect(role).toMatchObject({ tasks: [], basic: ['Teaching'], specific: ['Anatomy'] })
  })

  it('refuses a page with no tasks and no skills, a page that is not a role page, and skills with no known end', () => {
    expect(() => parseOccupationPage('<p>MASCO Code</p><p>1113-01</p><p>Compare</p><p>Headman</p><h3>Additional Info</h3>')).toThrow(/No tasks and no skills/)
    expect(() => parseOccupationPage('<html><body>Service unavailable</body></html>')).toThrow(/header/)
    expect(() => parseOccupationPage('<p>MASCO Code</p><p>2311-18</p><p>Compare</p><p>Lecturer</p><h3>Skills</h3><h4>Basic</h4><p>Teaching</p>')).toThrow(/skills end/)
  })
})

describe('childCodes', () => {
  const links = (...codes) => `<a href="/masco/1">1</a><a href="/masco/11">11</a>${codes.map((code) => `<a href="/masco/${code}?lang=en">x</a>`).join('')}`
  it('finds the direct children at every level and ignores the side menu', () => {
    expect(childCodes(links('11', '12', '111'), '1')).toEqual(['11', '12'])
    expect(childCodes(links('111', '112', '1121', '12'), '11')).toEqual(['111', '112'])
    expect(childCodes(links('1121', '1121-01', '1121-09', '1122-01'), '1121')).toEqual(['1121-01', '1121-09'])
    expect(childCodes('<html></html>', '1')).toEqual([])
  })
  it('knows an occupation code', () => {
    expect(isOccupationCode('1121-01')).toBe(true)
    expect(isOccupationCode('1121')).toBe(false)
  })
})

describe('compareRole', () => {
  const saved = savedFrom({
    code: '1111-01',
    title: 'Legislator',
    description: 'Makes laws.',
    tasks: ['Lead the team.', 'Write reports.'],
    skills: [{ text: 'Teamwork', type: 'basic' }, { text: 'Law', type: 'specific' }],
    qualification: 'Bachelor’s degree or equivalent'
  })
  const fresh = (changes = {}) => ({ ...saved, ...changes })

  it('adapts a saved role to the page shape', () => {
    expect(saved).toMatchObject({ basic: ['Teamwork'], specific: ['Law'], tasks: ['Lead the team.', 'Write reports.'] })
  })
  it('sees no change for the same role, or a different quote mark, case or spacing', () => {
    expect(compareRole(saved, fresh())).toEqual([])
    expect(compareRole(saved, fresh({ qualification: "Bachelor's  DEGREE or equivalent" }))).toEqual([])
  })
  it('names the fields that changed', () => {
    expect(compareRole(saved, fresh({ title: 'Lawmaker' }))).toEqual(['title'])
    expect(compareRole(saved, fresh({ tasks: ['Lead the team.', 'Write laws.'] }))).toEqual(['tasks'])
    expect(compareRole(saved, fresh({ specific: ['Law', 'Ethics'] }))).toEqual(['skills'])
    expect(compareRole(saved, fresh({ basic: [], qualification: 'Diploma or equivalent', description: 'New.' }))).toEqual(['description', 'skills', 'qualification'])
  })
})
