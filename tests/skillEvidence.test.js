import { describe, expect, it } from 'vitest'
import { SUPPORT_TEXT, evidenceHeadline, evidenceSourceLine, otherOfficialSkills, roleEvidenceFor, skillSupportRows, supportCounts } from '../src/lib/skillEvidence.js'
import { scoreRole } from '../src/lib/scoring.js'

const entry = {
  occupationStatus: 'ok', officialSkillCount: 11, source: { name: 'eMASCO (MASCO 2020)', url: 'https://emasco.mohr.gov.my/masco/2524-02', retrievedAt: '2026-10-23' },
  skills: {
    'SQL and databases': { support: 'related', evidence: [{ level: 'related', skillName: 'SQL for data querying', quote: 'Proficiency in SQL for data querying.', statementId: 's1' }] },
    Statistics: { support: 'not_listed', evidence: [] },
    Communication: { support: 'exact', evidence: [] },
  },
  otherOfficialCount: 2,
  otherOfficial: [
    { skillId: 'sk_1', skillName: 'Microsoft Excel', section: 'specific', status: 'validated', quote: 'Proficiency in Microsoft Excel.', relatedAppSkills: ['Spreadsheets (Excel)'] },
    { skillId: 'sk_2', skillName: 'Data cleaning methods', section: 'specific', status: 'needs_review', quote: 'q', relatedAppSkills: [] },
  ],
}
const role = { code: '2524-02', skills: [{ label: 'SQL and databases' }, { label: 'Statistics' }, { label: 'Communication' }, { label: 'Python programming' }] }

describe('skill evidence view', () => {
  it('finds the entry of a role, or null', () => {
    expect(roleEvidenceFor({ roles: { A: entry } }, 'A')).toBe(entry)
    expect(roleEvidenceFor({ roles: {} }, 'A')).toBeNull()
    expect(roleEvidenceFor(null, 'A')).toBeNull()
  })

  it('describes each role skill: exact, related, not listed, and unknown when there is no evidence entry for it', () => {
    const rows = skillSupportRows(entry, role.skills)
    expect(rows.map((row) => row.support)).toEqual(['related', 'not_listed', 'exact', null])
    expect(rows[0].evidence[0].quote).toContain('SQL')
    expect(rows[1].text).toContain('not proof the role does not need it')
  })

  it('related is worded as a different skill and never as a match', () => {
    expect(SUPPORT_TEXT.related).toMatch(/not the same one/)
    expect(SUPPORT_TEXT.not_listed).not.toMatch(/not required/i)
  })

  it('shows other official skills with a hint for a related skill the student has, and marks unreviewed ones', () => {
    const rows = otherOfficialSkills(entry, { skills: ['Spreadsheets (Excel)'] })
    expect(rows[0].relatedYouHave).toEqual(['Spreadsheets (Excel)'])
    expect(rows[1].needsReview).toBe(true)
    expect(otherOfficialSkills(entry, { skills: [] })[0].relatedYouHave).toEqual([])
    expect(otherOfficialSkills(null, { skills: [] })).toEqual([])
  })

  it('says honestly when an occupation has no usable list or only a short one', () => {
    expect(evidenceHeadline({ occupationStatus: 'insufficient', reason: 'No skills section.' })).toContain('No usable skill list')
    expect(evidenceHeadline({ occupationStatus: 'sparse', officialSkillCount: 1 })).toContain('a missing skill means little')
    expect(evidenceHeadline({ occupationStatus: 'missing' })).toContain('not in the skill dataset')
    expect(evidenceHeadline(entry)).toBe('The eMASCO page lists 11 skills for this role.')
    expect(evidenceHeadline(null)).toBeNull()
  })

  it('source line names the source and date, and the draft status of the matching', () => {
    expect(evidenceSourceLine(entry, { synonymTableStatus: 'draft' })).toMatch(/retrieved 2026-10-23.*draft/)
    expect(evidenceSourceLine(null, {})).toBeNull()
  })

  it('counts support levels', () => {
    expect(supportCounts(entry)).toMatchObject({ related: 1, not_listed: 1, exact: 1 })
  })

  it('has no effect on the score: the same role and profile score identically with or without evidence', () => {
    const scored = { id: 'x', title: 'X', group: 'professionals', automatablePct: 30, sdgs: [], code: '2524-02',
      skills: [{ label: 'SQL and databases', type: 'specific', moderate: 0.8, fast: 0.8 }, { label: 'Statistics', type: 'specific', moderate: 0.8, fast: 0.8 }] }
    const profile = { skills: ['SQL and databases'], sdgs: [], levels: {} }
    const ctx = { similar: {}, trendGroups: { professionals: { demand: 60 } } }
    const before = scoreRole(scored, profile, ctx, 'fast')
    skillSupportRows(entry, scored.skills)
    otherOfficialSkills(entry, profile)
    const after = scoreRole({ ...scored, skillEvidence: entry }, profile, { ...ctx, skillEvidence: { roles: { '2524-02': entry } } }, 'fast')
    expect(after.match).toBe(before.match)
    expect(after.fit).toBe(before.fit)
  })
})
