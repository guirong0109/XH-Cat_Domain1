import { describe, it, expect } from 'vitest'
import skills from '../data/skills.json'
import { mergeCvSkills, MAX_CV_BYTES, checkCvFile, guessLevel, extractSkills, CV_MESSAGES, cvBannerText, mergeMatches, sourceBadge, fetchCvSkills, CV_AI_TEXT, aiOnly } from '../src/lib/cvSkills.js'

const labels = [
  { label: 'SQL and databases', keywords: ['sql', 'database'] },
  { label: 'Java', keywords: ['java'] },
  { label: 'Data visualisation', keywords: ['power bi', 'dashboard'] },
  { label: 'Spreadsheets (Excel)', keywords: ['excel'] },
]

describe('extractSkills', () => {
  it('whole words only', () => {
    expect(extractSkills('NoSQL and JavaScript', labels)).toEqual([])
  })

  it('case-insensitive and multi-word keywords', () => {
    const found = extractSkills('Built dashboards in POWER BI', labels)
    expect(found.map((f) => f.label)).toEqual(['Data visualisation'])
  })

  it('finds a keyword next to punctuation', () => {
    expect(extractSkills('Skills: SQL, Excel.', labels).map((f) => f.label)).toEqual([
      'SQL and databases',
      'Spreadsheets (Excel)',
    ])
  })

  it('evidence is the matching line, trimmed, cut to 80 chars with an ellipsis', () => {
    const long = '   Used SQL ' + 'x'.repeat(100) + '   '
    const [hit] = extractSkills('first line\n' + long, labels)
    expect(hit.evidence.length).toBe(80)
    expect(hit.evidence.endsWith('…')).toBe(true)
    expect(hit.evidence.startsWith('Used SQL')).toBe(true)
    const [short] = extractSkills('  Used SQL daily  ', labels)
    expect(short.evidence).toBe('Used SQL daily')
  })

  it('first matching line wins and gives the level', () => {
    const [hit] = extractSkills('basic SQL\nexpert SQL', labels)
    expect(hit.level).toBe('basic')
    expect(hit.evidence).toBe('basic SQL')
  })

  it('empty or whitespace text gives []', () => {
    expect(extractSkills('', labels)).toEqual([])
    expect(extractSkills('  \n \t ', labels)).toEqual([])
    expect(extractSkills(undefined, labels)).toEqual([])
  })
})

describe('common-word keywords', () => {
  const real = [
    { label: 'Spreadsheets (Excel)', keywords: ['microsoft excel', 'pivot table'] },
    { label: 'Web development', keywords: ['reactjs', 'react.js'] },
    { label: 'Networking basics', keywords: ['computer networking', 'lan'] },
  ]
  it('does not match everyday words', () => {
    expect(extractSkills('I excel at teamwork', real)).toEqual([])
    expect(extractSkills('react quickly', real)).toEqual([])
    expect(extractSkills('networking events', real)).toEqual([])
  })
  it('matches the phrases', () => {
    expect(extractSkills('Microsoft Excel and ReactJS', real).map((f) => f.label)).toEqual(['Spreadsheets (Excel)', 'Web development'])
  })
})

describe('guessLevel', () => {
  it('strong', () => {
    for (const line of ['advanced Python', 'expert', 'proficient', 'led a team', '3 years of SQL', '5+ years', '4 yrs Excel', '10 + years', '3.5 years']) {
      expect(guessLevel(line)).toBe('strong')
    }
  })
  it('basic', () => {
    for (const line of ['basic Excel', 'beginner', 'familiar with', 'learning Git', 'introductory course']) {
      expect(guessLevel(line)).toBe('basic')
    }
  })
  it('good', () => {
    for (const line of ['2 years', '1.5 years', '0.5 yrs', 'Machine learning with Python', 'Deep learning', 'Installed LED lighting', 'Used Python at work', '']) {
      expect(guessLevel(line)).toBe('good')
    }
  })
})

describe('checkCvFile', () => {
  it('accepts pdf by type or by name', () => {
    expect(checkCvFile({ name: 'cv.pdf', type: 'application/pdf', size: 1000 })).toBeNull()
    expect(checkCvFile({ name: 'CV.PDF', type: '', size: 1000 })).toBeNull()
  })
  it('rejects other files', () => {
    expect(checkCvFile({ name: 'cv.png', type: 'image/png', size: 1000 })).toBe('not-pdf')
  })
  it('rejects big and empty files', () => {
    expect(checkCvFile({ name: 'cv.pdf', type: 'application/pdf', size: MAX_CV_BYTES + 1 })).toBe('too-big')
    expect(checkCvFile({ name: 'cv.pdf', type: 'application/pdf', size: 0 })).toBe('empty')
  })
})

describe('CV_MESSAGES', () => {
  it('has every key, each ending with the fallback line', () => {
    const keys = ['not-pdf', 'too-big', 'empty', 'password', 'no-text', 'none-found', 'load-failed']
    expect(Object.keys(CV_MESSAGES).sort()).toEqual([...keys].sort())
    for (const k of keys) expect(CV_MESSAGES[k].endsWith('You can pick your skills instead.')).toBe(true)
  })
})

describe('real keyword list', () => {
  const real = skills.labels
  const names = (text) => extractSkills(text, real).map((f) => f.label)
  it('does not match Malaysian names', () => {
    expect(names('Wan Nur Aisyah')).toEqual([])
    expect(names('Lan')).toEqual([])
  })
  it('does not match everyday words', () => {
    expect(names('I excel at teamwork')).not.toContain('Spreadsheets (Excel)')
    expect(names('networking events')).not.toContain('Networking basics')
  })
  it('still finds the network phrases', () => {
    expect(names('Set up a local area network')).toContain('Networking basics')
  })
})

describe('mergeCvSkills', () => {
  const found = [
    { label: 'A', level: 'strong', evidence: 'a' },
    { label: 'B', level: 'basic', evidence: 'b' },
  ]
  it('replaces a sample profile', () => {
    const r = mergeCvSkills({ sampleId: 'aina', skills: ['X'], levels: { X: 'good' } }, found)
    expect(r).toEqual({ skills: ['A', 'B'], levels: { A: 'strong', B: 'basic' }, mode: 'replaced' })
  })
  it('replaces when no skills are picked', () => {
    expect(mergeCvSkills({ sampleId: null, skills: [], levels: {} }, found).mode).toBe('replaced')
  })
  it('merges into the student picks and keeps their level', () => {
    const r = mergeCvSkills({ sampleId: null, skills: ['X', 'A'], levels: { X: 'basic', A: 'good' } }, found)
    expect(r.mode).toBe('merged')
    expect(r.skills).toEqual(['X', 'A', 'B'])
    expect(r.levels).toEqual({ X: 'basic', A: 'good', B: 'basic' })
  })
})

describe('cvBannerText', () => {
  it('replaced', () => {
    expect(cvBannerText('replaced', 4)).toBe('We filled in the 4 skills we found. Please check each one.')
  })
  it('merged N', () => {
    expect(cvBannerText('merged', 2)).toBe('We added 2 new skills from your CV and kept your picks. Please check each one.')
    expect(cvBannerText('merged', 1)).toBe('We added 1 new skill from your CV and kept your picks. Please check each one.')
  })
  it('merged 0', () => {
    expect(cvBannerText('merged', 0)).toBe('Your CV matched skills you already picked. We kept your picks. Please check each level.')
  })
})

describe('mergeMatches', () => {
  const kw = [{ label: 'SQL and databases', level: 'strong', evidence: 'Built MySQL reports for 3 years' }]
  it('keyword wins, union, no duplicates, AI level from evidence', () => {
    const ai = [
      { label: 'SQL and databases', score: 0.9, evidence: 'Other SQL line' },
      { label: 'Data visualisation', score: 0.8, evidence: 'Learning Power BI dashboards' },
    ]
    const out = mergeMatches(kw, ai)
    expect(out).toEqual([
      { label: 'SQL and databases', level: 'strong', evidence: 'Built MySQL reports for 3 years', source: 'keyword' },
      { label: 'Data visualisation', level: 'basic', evidence: 'Learning Power BI dashboards', source: 'ai' },
    ])
  })
  it('handles empty inputs', () => {
    expect(mergeMatches([], [])).toEqual([])
    expect(mergeMatches(kw, undefined)).toHaveLength(1)
  })
})

describe('sourceBadge and CV_AI_TEXT', () => {
  it('labels', () => {
    expect(sourceBadge('keyword')).toBe('Found by keyword')
    expect(sourceBadge('ai')).toBe('Found by AI · estimate')
    expect(CV_AI_TEXT.checking).toContain('15 s')
  })
})

describe('fetchCvSkills', () => {
  const reply = (status, body) => async () => ({ status, json: async () => body })
  it('200 gives skills', async () => {
    const r = await fetchCvSkills('x', reply(200, { skills: [{ label: 'A' }] }))
    expect(r).toEqual({ ok: true, skills: [{ label: 'A' }] })
  })
  it('503 gives ok false', async () => {
    expect(await fetchCvSkills('x', reply(503, { fallback: true }))).toEqual({ ok: false })
  })
  it('network error gives ok false', async () => {
    expect(await fetchCvSkills('x', async () => { throw new Error('down') })).toEqual({ ok: false })
  })
  it('bad JSON gives ok false', async () => {
    const bad = async () => ({ status: 200, json: async () => { throw new Error('bad') } })
    expect(await fetchCvSkills('x', bad)).toEqual({ ok: false })
    expect(await fetchCvSkills('x', reply(200, {}))).toEqual({ ok: false })
  })
})

describe('aiOnly', () => {
  const merged = [
    { label: 'SQL and databases', level: 'good', evidence: 'a', source: 'keyword' },
    { label: 'Data visualisation', level: 'good', evidence: 'b', source: 'ai' },
  ]
  it('keeps only AI items, so a removed keyword skill is not re-added', () => {
    const profile = { skills: ['Java'], levels: { Java: 'good' }, sampleId: null }
    const out = mergeCvSkills(profile, aiOnly(merged))
    expect(out.skills).toEqual(['Java', 'Data visualisation'])
    expect(out.skills).not.toContain('SQL and databases')
  })
  it('handles empty', () => {
    expect(aiOnly(undefined)).toEqual([])
  })
})
