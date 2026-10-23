// Runs the data refresh steps one after another. A failing step is recorded and the next one still runs,
// so one blocked source (for example an OpenAlex 429) does not stop the others.
export async function runSteps(steps, log = console.log) {
  const results = []
  for (const step of steps) {
    try {
      const result = await step.run()
      results.push({ name: step.name, status: result.status, message: result.message })
    } catch (error) {
      results.push({ name: step.name, status: 'failed', message: error.message })
    }
    const last = results[results.length - 1]
    log(`${last.name}: ${last.status}${last.message ? ` - ${last.message}` : ''}`)
  }
  return results
}

// Fails the run only when nothing worked, so a partly fresh result is still saved.
export const exitCodeFor = (results) => (results.length > 0 && results.every((result) => result.status === 'failed') ? 1 : 0)

// "--only=courses,trends" picks steps by name; no flag means all of them.
export function pickSteps(steps, argv) {
  const flag = argv.find((argument) => argument.startsWith('--only='))
  if (!flag) return steps
  const wanted = new Set(flag.slice('--only='.length).split(',').filter(Boolean))
  const unknown = [...wanted].filter((name) => !steps.some((step) => step.name === name))
  if (unknown.length > 0) throw new Error(`Unknown step: ${unknown.join(', ')}. Choose from ${steps.map((step) => step.name).join(', ')}.`)
  return steps.filter((step) => wanted.has(step.name))
}
