import { createApp } from './app.js'

const port = process.env.PORT || 3000
createApp({ dataDir: 'data' }).listen(port, () => {
  console.log(`FutureReady MY listening on port ${port}`)
})
