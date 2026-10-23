// Runs one admin job at a time (a check, in the background) and keeps its progress for the screen.
// work({ run, progress(done, total, message), isCancelled }) returns { status, summary, report }.

export function createJobManager({ logStore, writeReport }) {
  let active = null

  async function finish(job, run, outcome) {
    try {
      if (outcome.report) await writeReport(run.id, outcome.report)
    } catch (error) {
      await run.log('error', `The report could not be saved: ${error.message}`)
    }
    await run.finish(outcome.status, outcome.summary)
    if (active === job) active = null
  }

  async function start(type, work) {
    if (active) return { busy: true }
    // Claim the slot before the first await, so two clicks at the same moment cannot both start.
    const job = { runId: null, type, startedAt: new Date().toISOString(), cancelled: false, progress: { done: 0, total: 0, message: '' } }
    active = job
    let run
    try {
      run = await logStore.startRun({ type })
    } catch (error) {
      active = null
      throw error
    }
    job.runId = run.id
    const done = (async () => {
      let outcome
      try {
        outcome = await work({
          run,
          progress: (doneCount, total, message) => { job.progress = { done: doneCount, total, message } },
          isCancelled: () => job.cancelled
        })
      } catch (error) {
        await run.log('error', `The check failed: ${error.message}`)
        outcome = { status: 'failed', summary: { message: error.message }, report: null }
      }
      await finish(job, run, outcome)
    })()
    return { runId: run.id, done }
  }

  function cancel() {
    if (!active) return false
    active.cancelled = true
    return true
  }

  function current() {
    if (!active) return null
    return {
      runId: active.runId,
      type: active.type,
      startedAt: active.startedAt,
      state: active.cancelled ? 'cancelling' : 'running',
      progress: active.progress
    }
  }

  return { start, cancel, current }
}
