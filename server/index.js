import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'

const dataDirectory = fileURLToPath(new URL('../data', import.meta.url))

const port = process.env.PORT || 3000
createApp({ dataDir: dataDirectory }).listen(port, () => {
  console.log(`FutureReady MY listening on port ${port}`)
})
