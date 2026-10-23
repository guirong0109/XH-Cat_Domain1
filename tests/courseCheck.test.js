import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  changedCourseFields,
  checkCourse,
  collectCourses,
  parseElatihCourse,
  readCourseChecks,
  refreshCourseChecks,
} from '../server/courseCheck.js'

const page = ({ title = 'Time Management', price = 'Free', duration = '2 Hours 50 Min', level = 'Beginner' } = {}) => `
<html><head><title>e-LATiH | Malaysia&#039;s Premier Learning Hub | ${title}</title></head>
<body><script>var x = "Duration: 9 Hours Skill Level: Expert";</script>
<div>${price} <a>Enrol Now</a></div>
<div>This course includes:</div><div>Duration: ${duration}</div><div>Skill Level: ${level}</div></body></html>`

const saved = {
  portal: 'elatih',
  title: 'Time Management',
  url: 'https://elatih.hrdcorp.gov.my/courses-details/time-management',
  price: 'Free',
  duration: '2 Hours 50 Min',
  level: 'Beginner',
}
const tvet = { portal: 'tvet', title: 'AUDIT TENAGA AWAL', url: 'https://www.tvet.gov.my/awam-kursus/kursus?id_kursus=48887' }

const reply = (status, body = '') => async () => ({ status, text: async () => body })
const fixed = new Date('2026-10-24T10:00:00Z')
const noSleep = async () => {}

describe('parseElatihCourse', () => {
  it('reads title, price, duration and level, ignoring script text', () => {
    expect(parseElatihCourse(page())).toEqual({ title: 'Time Management', price: 'Free', duration: '2 Hours 50 Min', level: 'Beginner' })
  })

  it('reads a paid price', () => {
    expect(parseElatihCourse(page({ price: 'RM 60.00' })).price).toBe('RM60.00')
  })

  it('gives nulls for missing details instead of guessing', () => {
    expect(parseElatihCourse('<title>x | Only Title</title><p>hello</p>')).toEqual({ title: 'Only Title', price: null, duration: null, level: null })
  })
})

describe('changedCourseFields', () => {
  it('is empty for the same course, even with different punctuation or case', () => {
    expect(changedCourseFields(saved, { ...saved, title: 'time  management!' })).toEqual([])
  })

  it('lists the fields that differ', () => {
    expect(changedCourseFields(saved, { title: 'Time Management', price: 'RM99.00', duration: '1 Hour', level: 'Beginner' })).toEqual(['price', 'duration'])
  })

  it('does not call a missing saved field a change', () => {
    expect(changedCourseFields({ title: 'x' }, { title: 'x', price: 'Free', duration: '1 Hour', level: 'Beginner' })).toEqual([])
  })
})

describe('collectCourses', () => {
  it('lists each course page once across skill and AI courses', () => {
    const skills = {
      labels: [{ label: 'A', courses: [saved] }, { label: 'B', courses: [saved, tvet] }, { label: 'C' }],
      aiCourses: { general: [saved], bySkill: { A: [tvet] } },
    }
    expect(collectCourses(skills).map((c) => c.url)).toEqual([saved.url, tvet.url])
  })

  it('copes with no course data', () => {
    expect(collectCourses(undefined)).toEqual([])
  })
})

describe('checkCourse', () => {
  it('is ok when the page matches the saved copy', async () => {
    expect(await checkCourse(saved, { fetchImpl: reply(200, page()), now: fixed })).toMatchObject({ status: 'ok', changed: [] })
  })

  it('flags a changed price', async () => {
    expect(await checkCourse(saved, { fetchImpl: reply(200, page({ price: 'RM60.00' })), now: fixed })).toMatchObject({ status: 'changed', changed: ['price'] })
  })

  it('says gone only for 404 or 410', async () => {
    expect((await checkCourse(saved, { fetchImpl: reply(404) })).status).toBe('gone')
    expect((await checkCourse(saved, { fetchImpl: reply(410) })).status).toBe('gone')
    expect((await checkCourse(saved, { fetchImpl: reply(500) })).status).toBe('unreadable')
    expect((await checkCourse(saved, { fetchImpl: reply(403) })).status).toBe('unreadable')
  })

  it('says unreadable on a network error or a page with no title', async () => {
    const boom = async () => {
      throw new Error('timeout')
    }
    expect((await checkCourse(saved, { fetchImpl: boom })).status).toBe('unreadable')
    expect((await checkCourse(saved, { fetchImpl: reply(200, '<p>maintenance</p>') })).status).toBe('unreadable')
  })

  it('checks a MyTVET course by its saved title being on the page', async () => {
    expect((await checkCourse(tvet, { fetchImpl: reply(200, '<h3>Audit Tenaga Awal</h3>') })).status).toBe('ok')
    expect((await checkCourse(tvet, { fetchImpl: reply(200, '<h3>Something else</h3>') })).changed).toEqual(['title'])
  })
})

describe('refreshCourseChecks', () => {
  let directory
  let filePath
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'course-check-'))
    filePath = path.join(directory, 'course_checks.json')
  })
  afterEach(() => rm(directory, { recursive: true, force: true }))

  const skills = { labels: [{ label: 'A', courses: [saved, tvet] }] }
  const byUrl = (map) => async (url) => map[url]()

  it('saves each result with the date and counts', async () => {
    const fetchImpl = byUrl({ [saved.url]: reply(200, page()), [tvet.url]: reply(404) })
    const result = await refreshCourseChecks({ filePath, skills, fetchImpl, now: fixed, sleep: noSleep })
    expect(result.status).toBe('updated')
    const file = await readCourseChecks(filePath)
    expect(file.checkedAt).toBe('2026-10-24T10:00:00.000Z')
    expect(file.counts).toEqual({ ok: 1, changed: 0, gone: 1, unreadable: 0 })
    expect(file.courses[tvet.url].status).toBe('gone')
  })

  it('keeps the earlier result for a page it could not read this time', async () => {
    await refreshCourseChecks({ filePath, skills, fetchImpl: byUrl({ [saved.url]: reply(200, page()), [tvet.url]: reply(200, 'AUDIT TENAGA AWAL') }), now: fixed, sleep: noSleep })
    const later = new Date('2026-10-31T10:00:00Z')
    const result = await refreshCourseChecks({ filePath, skills, fetchImpl: byUrl({ [saved.url]: reply(500), [tvet.url]: reply(200, 'AUDIT TENAGA AWAL') }), now: later, sleep: noSleep })
    expect(result.status).toBe('partial')
    const file = await readCourseChecks(filePath)
    expect(file.courses[saved.url].status).toBe('ok')
    expect(file.courses[saved.url].checkedAt).toBe('2026-10-24T10:00:00.000Z')
    expect(file.counts.unreadable).toBe(1)
  })

  it('keeps the saved file when nothing could be read', async () => {
    await refreshCourseChecks({ filePath, skills, fetchImpl: byUrl({ [saved.url]: reply(200, page()), [tvet.url]: reply(200, 'AUDIT TENAGA AWAL') }), now: fixed, sleep: noSleep })
    const before = await readFile(filePath, 'utf8')
    const result = await refreshCourseChecks({ filePath, skills, fetchImpl: reply(500), now: new Date('2026-11-01T00:00:00Z'), sleep: noSleep })
    expect(result.status).toBe('failed')
    expect(result.message).toContain('2026-10-24')
    expect(await readFile(filePath, 'utf8')).toBe(before)
  })

  it('waits between pages and runs one check at a time', async () => {
    const sleeps = []
    let started = 0
    const fetchImpl = async () => {
      started += 1
      return { status: 200, text: async () => page() }
    }
    const options = { filePath, skills: { labels: [{ label: 'A', courses: [saved, { ...saved, url: `${saved.url}-2` }] }] }, fetchImpl, now: fixed, sleep: async (ms) => sleeps.push(ms) }
    const [first, second] = await Promise.all([refreshCourseChecks(options), refreshCourseChecks(options)])
    expect(first).toBe(second)
    expect(started).toBe(2)
    expect(sleeps).toEqual([2000])
  })
})
