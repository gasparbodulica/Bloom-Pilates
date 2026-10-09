import { redis, slotKey, clientKey, json } from './_store.js'

// GET /api/bookings?k=<token>&ids=w0-d1-08:15,w0-d1-09:15
// Returns who is in each slot plus this client's entitlement, so every device
// renders from the same truth rather than from its own memory.
export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })

  const token = String(req.query.k || '')
  const ids = String(req.query.ids || '').split(',').filter(Boolean).slice(0, 400)
  if (!ids.length) return json(res, 400, { error: 'ids required' })

  try {
    const pipe = redis.pipeline()
    ids.forEach(id => pipe.hgetall(slotKey(id)))
    const results = await pipe.exec()

    const slots = {}
    ids.forEach((id, i) => {
      const people = results[i] || {}
      slots[id] = {
        taken: Object.keys(people).length,
        people: Object.values(people),
        mine: token ? Object.prototype.hasOwnProperty.call(people, token) : false,
      }
    })

    const client = token ? await redis.hgetall(clientKey(token)) : null
    return json(res, 200, { slots, client: client && Object.keys(client).length ? client : null })
  } catch (err) {
    console.error('bookings read failed', err)
    return json(res, 500, { error: 'storage unavailable' })
  }
}
