import { describe, expect, it } from 'vitest'
import { linkStatus, referencesLine, roleReference } from '../src/lib/referenceView.js'

const references = {
  checkedAt: '2026-10-22T10:00:00.000Z',
  links: {
    'https://ok.test': { ok: true, status: 200, checkedAt: '2026-10-22T10:00:00.000Z' },
    'https://bad.test': { ok: false, status: null, checkedAt: '2026-10-22T10:00:00.000Z' },
  },
  roles: {
    '1111-01': { ok: true, checkedAt: '2026-10-22T10:00:00.000Z', changed: [] },
    '2222-02': { ok: true, checkedAt: '2026-10-22T10:00:00.000Z', changed: ['tasks', 'basic_skills', 'specific_skills'] },
    '3333-03': { ok: false, failedAt: '2026-10-23T09:00:00.000Z', checkedAt: '2026-10-22T10:00:00.000Z', changed: [] },
  },
}

describe('linkStatus', () => {
  it('says the link works with its date', () => {
    expect(linkStatus(references, 'https://ok.test')).toEqual({ ok: true, text: 'Checked 22 Oct 2026, link works' })
  })
  it('keeps the link and says it could not be checked', () => {
    const status = linkStatus(references, 'https://bad.test')
    expect(status.ok).toBe(false)
    expect(status.text).toBe('Could not be checked on 22 Oct 2026. The link is kept, please try it.')
  })
  it('handles no data and unknown links', () => {
    expect(linkStatus(null, 'https://ok.test')).toEqual({ ok: null, text: 'Not checked yet' })
    expect(linkStatus(references, 'https://other.test').text).toBe('Not checked yet')
  })
})

describe('roleReference', () => {
  const role = (code) => ({ code, source: { fetchedAt: '2026-10-21' } })
  it('has no note when nothing changed', () => {
    expect(roleReference(references, role('1111-01'))).toEqual({ ok: true, text: 'Checked 22 Oct 2026, link works', note: null })
  })
  it('names what changed once and keeps the saved date', () => {
    const { note } = roleReference(references, role('2222-02'))
    expect(note).toBe('eMASCO changed the tasks and skills for this role on the last check. We still show the saved version from 21 Oct 2026. Our team needs to review the change.')
  })
  it('uses the failure date when the last check failed', () => {
    expect(roleReference(references, role('3333-03')).text).toContain('23 Oct 2026')
  })
  it('handles a role that was never checked', () => {
    expect(roleReference(references, role('9999-99'))).toEqual({ ok: null, text: 'Not checked yet', note: null })
    expect(roleReference(undefined, role('1111-01')).text).toBe('Not checked yet')
  })
})

describe('referencesLine', () => {
  it('summarises the last refresh', () => {
    expect(referencesLine(references)).toBe('Last refresh: 22 Oct 2026 · 2 roles read, 1 changed, 1 link not checked')
  })
  it('says when nothing was refreshed', () => {
    expect(referencesLine(null)).toBe('Not refreshed yet.')
  })
})
