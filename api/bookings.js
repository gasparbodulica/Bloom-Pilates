import { redis, slotKey, clientKey, json, storeReady, storeSource } from './_store.js'
import { parseEntry, isLive } from './_slots.js'

// GET /api/bookings?k=<token>&ids=w0-d1-08:15,w0-d1-09:15
// Returns who is in each slot plus this client's entitlement, so every device
// renders from the same truth rather than from its own memory. The token is
// optional: before paying, the page needs availability without an identity.
//
// A place held by someone at the checkout counts as taken, but only until its
// hold expires — the expiry rides in the stored value, so a stale hold is never
// counted even if nothing has swept it yet.
export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })

  if (!storeReady()) {
    console.error('redis not configured — found:', storeSource())
    return json(res, 503, { error: 'storage not configured' })
  }

  const token = String(req.query.k || '')
  const ids = String(req.query.ids || '').split(',').filter(Boolean).slice(0, 400)
  if (!ids.length) return json(res, 400, { error: 'ids required' })

  try {
    const pipe = redis.pipeline()
    ids.forEach(id => pipe.hgetall(slotKey(id)))
    const results = await pipe.exec()

    const now = Date.now()
    const slots = {}
    const sweep = []

    ids.forEach((id, i) => {
      const hash = results[i] || {}
      const people = []
      let mine = false
      for (const [field, raw] of Object.entries(hash)) {
        const entry = parseEntry(String(raw))
        if (!isLive(entry, now)) { sweep.push([id, field]); continue }
        people.push(entry.label)
        if (token && field === token) mine = true
      }
      slots[id] = { taken: people.length, people, mine }
    })

    // One round trip for everything that has expired, and never blocking the
    // answer — the counts above already ignore it.
    if (sweep.length) {
      const p = redis.pipeline()
      sweep.forEach(([id, field]) => p.hdel(slotKey(id), field))
      p.exec().catch(e => console.error('sweep failed', e))
    }

    const client = token ? await redis.hgetall(clientKey(token)) : null
    return json(res, 200, { slots, client: client && Object.keys(client).length ? client : null })
  } catch (err) {
    console.error('bookings read failed', err)
    return json(res, 500, { error: 'storage unavailable' })
  }
}
