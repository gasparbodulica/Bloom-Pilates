import { Redis } from '@upstash/redis'

// Shared state lives here, not in the browser. This is what makes a place taken
// by one person show as taken to everyone, on any device.
export const redis = Redis.fromEnv()

// One hash per slot: field = client token, value = "Name — Pack".
export const slotKey = (slotId) => `slot:${slotId}`
// One hash per client: their entitlement row.
export const clientKey = (token) => `client:${token}`

export const json = (res, status, body) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.status(status).send(JSON.stringify(body))
}
