import { describe, expect, it } from 'vitest'
import { isLocalRequest, jsonOnly, localOnly } from '../server/adminAccess.js'

const request = ({ address = '127.0.0.1', headers = { host: 'localhost:3000' }, method = 'GET', json = true } = {}) => ({
  socket: { remoteAddress: address },
  headers,
  method,
  is: (type) => json && type === 'application/json'
})

function respond(middleware, req) {
  const response = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
  let passed = false
  middleware(req, response, () => { passed = true })
  return { passed, status: response.statusCode, body: response.body }
}

describe('isLocalRequest', () => {
  it('accepts a direct visit from this PC, over IPv4 or IPv6, with a localhost address', () => {
    expect(isLocalRequest(request())).toBe(true)
    expect(isLocalRequest(request({ address: '::1', headers: { host: '[::1]:3000' } }))).toBe(true)
    expect(isLocalRequest(request({ address: '::ffff:127.0.0.1', headers: { host: '127.0.0.1:3200' } }))).toBe(true)
    expect(isLocalRequest(request({ headers: { host: 'localhost' } }))).toBe(true)
  })

  it('refuses another computer, even with a localhost Host header', () => {
    expect(isLocalRequest(request({ address: '192.168.1.20' }))).toBe(false)
    expect(isLocalRequest(request({ address: '203.0.113.9' }))).toBe(false)
    expect(isLocalRequest({ headers: { host: 'localhost' } })).toBe(false)
  })

  it('refuses a request that came through a tunnel or proxy, although it reaches us from this PC', () => {
    for (const name of ['x-forwarded-for', 'cf-connecting-ip', 'x-real-ip', 'forwarded', 'x-forwarded-host', 'cf-ray', 'via']) {
      expect(isLocalRequest(request({ headers: { host: 'localhost:3000', [name]: '1.2.3.4' } }))).toBe(false)
    }
  })

  it('refuses another host name pointing at this PC (DNS rebinding) and look-alike names', () => {
    for (const host of ['evil.example.com', 'abc.trycloudflare.com', 'localhost.evil.com', '127.0.0.1.evil.com', 'localhostx:3000', '', undefined]) {
      expect(isLocalRequest(request({ headers: host === undefined ? {} : { host } }))).toBe(false)
    }
  })
})

describe('localOnly', () => {
  it('passes a local request and answers 403 local-only to others', () => {
    expect(respond(localOnly, request()).passed).toBe(true)
    expect(respond(localOnly, request({ address: '10.0.0.5' }))).toEqual({ passed: false, status: 403, body: { error: 'local-only' } })
  })
})

describe('jsonOnly', () => {
  it('lets GET requests and JSON posts through, and refuses a post that is not JSON', () => {
    expect(respond(jsonOnly, request({ method: 'GET', json: false })).passed).toBe(true)
    expect(respond(jsonOnly, request({ method: 'POST', json: true })).passed).toBe(true)
    expect(respond(jsonOnly, request({ method: 'POST', json: false }))).toEqual({ passed: false, status: 415, body: { error: 'json-only' } })
  })
})
