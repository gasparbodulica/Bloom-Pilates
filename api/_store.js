import { Redis } from '@upstash/redis'

// Shared state lives here, not in the browser. This is what makes a place taken
// by one person show as taken to everyone, on any device.
//
// Vercel names these variables differently depending on how the store was
// added: the KV / Marketplace route injects KV_REST_API_*, the Upstash
// integration injects UPSTASH_REDIS_REST_*. Redis.fromEnv() only reads the
// latter, so a store added the first way would leave the site saying "storage
// unavailable" with nothing visibly misconfigured. Accept either.
const URL_VAR   = ['UPSTASH_REDIS_REST_URL',   'KV_REST_API_URL',   'REDIS_REST_URL']
const TOKEN_VAR = ['UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN', 'REDIS_REST_TOKEN']

const pick = (names) => {
  const hit = names.find(n => process.env[n])
  return hit ? { name: hit, value: process.env[hit] } : null
}

const url   = pick(URL_VAR)
const token = pick(TOKEN_VAR)

export const storeReady = () => Boolean(url && token)

// Which variable names were found, never their values — for log diagnosis.
export const storeSource = () =>
  storeReady() ? `${url.name} + ${token.name}` : 'none'

export const redis = storeReady()
  ? new Redis({ url: url.value, token: token.value })
  : null

export const slotKey   = (slotId) => `slot:${slotId}`
export const clientKey = (token)  => `client:${token}`

export const json = (res, status, body) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.status(status).send(JSON.stringify(body))
}
