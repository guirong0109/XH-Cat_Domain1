// Full re-check: walks the eMASCO code tree and reads every occupation page, then reports what is new,
// what is gone and what changed compared with data/emasco/occupations.json. It only reports.
// Progress is saved to stateFile every few pages so a stopped check can be resumed.
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { SECONDS_BETWEEN_PAGES, fetchOccupationPage, robotsAllows } from './adminChecks.js'
import { childCodes, compareRole, isOccupationCode, parseOccupationPage, savedFrom } from './emascoPage.js'

const TOP_LEVEL_CODES = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function readState(stateFile) {
  try {
    return JSON.parse(await readFile(stateFile, 'utf8'))
  } catch {
    return null
  }
}

async function writeState(stateFile, state) {
  await mkdir(path.dirname(stateFile), { recursive: true })
  await writeFile(`${stateFile}.tmp`, JSON.stringify(state))
  await rename(`${stateFile}.tmp`, stateFile)
}

export async function runFullCheck({
  run,
  occupations,
  stateFile,
  fetchImpl = fetch,
  sleep = sleepFor,
  progress = () => {},
  isCancelled = () => false,
  resume = false,
  saveEvery = 25,
  now = () => new Date()
}) {
  const saved = new Map([...occupations.roles, ...occupations.tasksOnly].map((role) => [role.code, role]))
  const knownUnparsed = new Set((occupations.unparsed ?? []).map((line) => String(line).split(':')[0].trim()))

  if (!(await robotsAllows({ fetchImpl }))) {
    await run.log('error', 'robots.txt does not allow reading /masco/. Stopped.')
    return { status: 'failed', summary: { message: 'robots.txt does not allow reading eMASCO.' }, report: { kind: 'full-check', stopped: 'robots' } }
  }

  let state = resume ? await readState(stateFile) : null
  if (state) await run.log('info', `Resuming: ${state.pagesRead} pages already read, ${state.pending.length} waiting`)
  else {
    state = { startedAt: now().toISOString(), pending: [...TOP_LEVEL_CODES].reverse(), seen: [], listed: [], treeRead: [], treeUnreadable: [], roles: {}, added: [], pagesRead: 0 }
    await run.log('info', 'Full re-check started')
  }
  const seen = new Set(state.seen)
  const listed = new Set(state.listed)
  const treeRead = new Set(state.treeRead)
  let requests = 0
  let cancelled = false

  const snapshot = () => ({ ...state, seen: [...seen], listed: [...listed], treeRead: [...treeRead] })

  while (state.pending.length > 0) {
    if (isCancelled()) {
      cancelled = true
      await run.log('warn', 'Cancelled by the admin. Progress is saved; the check can be resumed.')
      break
    }
    const code = state.pending.pop()
    if (seen.has(code)) continue
    seen.add(code)
    if (requests > 0) await sleep(SECONDS_BETWEEN_PAGES * 1000)
    requests += 1
    try {
      const html = await fetchOccupationPage(code, { fetchImpl })
      state.pagesRead += 1
      if (isOccupationCode(code)) {
        listed.add(code)
        try {
          const fresh = parseOccupationPage(html)
          if (fresh.code !== code) throw new Error(`page returned code ${fresh.code}`)
          const before = saved.get(code)
          if (!before) {
            state.added.push({ code, title: fresh.title })
            await run.log('warn', `${code} is new on eMASCO: ${fresh.title}`, { code })
          } else {
            const fields = compareRole(savedFrom(before), fresh)
            state.roles[code] = fields.length ? { status: 'changed', fields } : { status: 'unchanged' }
            if (fields.length) await run.log('warn', `${code} changed on eMASCO: ${fields.join(', ')}`, { code, fields })
          }
        } catch (error) {
          if (knownUnparsed.has(code) && !saved.has(code)) continue // still has no tasks or skills, as before
          state.roles[code] = { status: 'unreadable', error: error.message }
          await run.log('error', `${code} could not be read: ${error.message}`, { code })
        }
      } else {
        treeRead.add(code)
        state.pending.push(...childCodes(html, code).filter((child) => !seen.has(child)).reverse())
      }
    } catch (error) {
      if (isOccupationCode(code)) {
        listed.add(code)
        state.roles[code] = { status: 'unreadable', error: error.message }
      } else {
        state.treeUnreadable.push({ code, error: error.message })
      }
      await run.log('error', `${code} could not be read: ${error.message}`, { code })
    }
    progress(seen.size, seen.size + state.pending.length, `Read ${state.pagesRead} pages`)
    if (requests % saveEvery === 0) await writeState(stateFile, snapshot())
  }

  if (cancelled) {
    await writeState(stateFile, snapshot())
    return { status: 'cancelled', summary: { pagesRead: state.pagesRead, resumable: true }, report: null }
  }

  // A saved role is only called removed when the page that lists it was read and does not show it.
  const removed = []
  const unverified = []
  for (const [code, role] of saved) {
    if (listed.has(code)) continue
    if (treeRead.has(code.slice(0, 4))) removed.push({ code, title: role.title })
    else unverified.push(code)
  }
  const changed = Object.entries(state.roles).filter(([, item]) => item.status === 'changed').map(([code, item]) => ({ code, title: saved.get(code).title, fields: item.fields }))
  const unreadable = Object.entries(state.roles).filter(([, item]) => item.status === 'unreadable').map(([code, item]) => ({ code, error: item.error }))
  const summary = {
    pagesRead: state.pagesRead,
    siteRoles: listed.size,
    savedRoles: saved.size,
    added: state.added.length,
    removed: removed.length,
    changed: changed.length,
    unreadable: unreadable.length,
    treeUnreadable: state.treeUnreadable.length,
    unverified: unverified.length
  }
  let status = 'ok'
  if (state.pagesRead === 0) status = 'failed'
  else if (summary.unreadable > 0 || summary.treeUnreadable > 0) status = 'partial'
  await run.log(status === 'ok' ? 'info' : 'warn', `Full re-check finished: ${status}. ${summary.added} new, ${summary.removed} gone, ${summary.changed} changed, ${summary.unreadable} unreadable.`)
  await rm(stateFile, { force: true })
  return {
    status,
    summary,
    report: { kind: 'full-check', startedAt: state.startedAt, finishedAt: now().toISOString(), ...summary, addedRoles: state.added, removedRoles: removed, changedRoles: changed, unreadableRoles: unreadable, treeUnreadablePages: state.treeUnreadable, unverifiedCodes: unverified }
  }
}
