// Checks the labelled skill-search set against the skill list: how many skills each query's patterns match.
import { readFile } from 'node:fs/promises'
const E = JSON.parse(await readFile('testing/skill_search_eval.json', 'utf8'))
const o = JSON.parse(await readFile('data/emasco/occupations.json', 'utf8'))
for (const q of E.queries) {
  if (q.expectNone) { console.log(q.id.padEnd(32), '(no results expected)'); continue }
  const r = new RegExp(q.relevant, 'i'); const re = q.related ? new RegExp(q.related, 'i') : null
  let a = 0, b = 0
  for (const s of o.skills) { if (r.test(s.text)) a += 1; else if (re && re.test(s.text)) b += 1 }
  console.log(q.id.padEnd(32), 'relevant', a, 'related', b, a < 3 ? '  <-- fewer than 3 relevant' : '')
}
for (const p of E.pairs) if (!o.skills.some((s) => s.text === p.skill)) console.log('PAIR SKILL MISSING:', p.skill)
