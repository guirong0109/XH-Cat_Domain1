// Field-mismatch notice check. Run: node scripts/eval-field.mjs
// Uses the answer skills of the test CVs as "found skills". `field` in answers.json is a draft label.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { suggestField } from '../src/lib/fieldCheck.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (...p) => JSON.parse(readFileSync(path.join(ROOT, ...p), 'utf8'))

export function evaluate(answers, roles, fields) {
  const rows = []
  for (const [id, a] of Object.entries(answers)) {
    const own = suggestField(a.skills, a.field, roles, fields)
    rows.push({ cv: id, trueField: a.field, picked: a.field, case: 'true-picked', result: own ? 'false-notice' : 'none', suggested: own?.majorId ?? '' })
    for (const major of fields.majors) {
      if (major.id === a.field) continue
      const s = suggestField(a.skills, major.id, roles, fields)
      const result = !s ? 'none' : s.majorId === a.field ? 'right' : 'wrong'
      rows.push({ cv: id, trueField: a.field, picked: major.id, case: 'other-picked', result, suggested: s?.majorId ?? '' })
    }
  }
  return rows
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const roles = read('data', 'roles.json')
  const fields = read('data', 'fields.json')
  const answers = read('testing', 'cv_test_set', 'answers.json')
  const rows = evaluate(answers, roles, fields)
  const head = 'cv,true_field,picked,case,result,suggested'
  writeFileSync(path.join(ROOT, 'testing', 'results', 'field_check_eval.csv'), [head, ...rows.map((r) => [r.cv, r.trueField, r.picked, r.case, r.result, r.suggested].join(','))].join('\n') + '\n')
  const a = rows.filter((r) => r.case === 'true-picked')
  const b = rows.filter((r) => r.case === 'other-picked')
  const n = (list, v) => list.filter((r) => r.result === v).length
  console.log(`(a) true field picked: ${a.length} CVs, false notices: ${n(a, 'false-notice')}`)
  for (const r of a.filter((r) => r.result === 'false-notice')) console.log(`    ${r.cv} (${r.trueField}) -> suggested ${r.suggested}`)
  console.log(`(b) other major picked: ${b.length} cases, right: ${n(b, 'right')}, wrong: ${n(b, 'wrong')}, none: ${n(b, 'none')}`)
}
