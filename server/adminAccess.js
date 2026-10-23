// Who may use the admin page: only a browser on the same PC, opened directly at localhost.
// There is no password. A request that came through a proxy or tunnel (Cloudflare, Replit) is refused,
// and so is a request whose Host is not localhost (which blocks DNS-rebinding tricks).

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i
// Headers that reverse proxies and tunnels add. A direct visit from the same PC has none of them.
const PROXY_HEADERS = ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'forwarded', 'x-real-ip', 'cf-connecting-ip', 'cf-ray', 'via']

export function isLocalRequest(request) {
  const address = request.socket?.remoteAddress ?? ''
  if (!LOOPBACK.has(address)) return false
  if (PROXY_HEADERS.some((name) => request.headers?.[name] !== undefined)) return false
  return LOCAL_HOST.test(request.headers?.host ?? '')
}

export function localOnly(request, response, next) {
  if (isLocalRequest(request)) return next()
  return response.status(403).json({ error: 'local-only' })
}

// A page on another website cannot send JSON without a permission check by the browser, so asking for it
// stops other sites from starting a check by posting a form to localhost.
export function jsonOnly(request, response, next) {
  if (request.method !== 'POST' || request.is('application/json')) return next()
  return response.status(415).json({ error: 'json-only' })
}
