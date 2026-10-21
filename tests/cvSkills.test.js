import { describe, it, expect } from 'vitest'
import { MAX_CV_BYTES, checkCvFile, guessLevel, extractSkills, CV_MESSAGES } from '../src/lib/cvSkills.js'

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

describe('guessLevel', () => {
  it('strong', () => {
    for (const line of ['advanced Python', 'expert', 'proficient', 'led a team', '3 years of SQL', '5+ years', '4 yrs Excel', '10 + years']) {
      expect(guessLevel(line)).toBe('strong')
    }
  })
  it('basic', () => {
    for (const line of ['basic Excel', 'beginner', 'familiar with', 'learning Git', 'introductory course']) {
      expect(guessLevel(line)).toBe('basic')
    }
  })
  it('good', () => {
    for (const line of ['2 years', 'Used Python at work', '']) {
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
