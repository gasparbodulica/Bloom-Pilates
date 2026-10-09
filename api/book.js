import { redis, slotKey, clientKey, json } from './_store.js'

// POST /api/book  { token, slotId, slotType, weekIndex, action: 'book' | 'cancel' }
//
// Every rule is re-checked here. The page already checks them, but a check in
// the browser is a suggestion — anyone can edit it. This is the one that counts.
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })

  const { token, slotId, slotType, weekIndex, action = 'book' } = req.body || {}
  if (!token || !slotId) return json(res, 400, { error: 'token and slotId required' })

  try {
    const client = await redis.hgetall(clientKey(token))
    if (!client || !Object.keys(client).length)
      return json(res, 404, { error: 'nepoznat link' })

    const total   = Number(client.total)
    const perWeek = Number(client.perWeek)
    const expires = new Date(client.expires)
    const booked  = JSON.parse(client.booked || '[]')        // [{id, week}]

    if (action === 'cancel') {
      await redis.hdel(slotKey(slotId), token)
      const next = booked.filter(b => b.id !== slotId)
      await redis.hset(clientKey(token), { booked: JSON.stringify(next) })
      return json(res, 200, { ok: true, used: next.length, left: total - next.length })
    }

    // --- the rules ---
    if (booked.some(b => b.id === slotId))
      return json(res, 409, { error: 'termin je već rezerviran' })
    if (booked.length >= total)
      return json(res, 409, { error: 'potrošeni su svi treninzi iz paketa' })
    if (new Date() > expires)
      return json(res, 409, { error: 'paket je istekao' })
    if (slotType && client.type && slotType !== client.type)
      return json(res, 409, { error: 'paket ne vrijedi za ovu vrstu treninga' })
    if (booked.filter(b => b.week === weekIndex).length >= perWeek)
      return json(res, 409, { error: `paket dopušta ${perWeek}x tjedno` })

    // Capacity, checked atomically. HSETNX only writes if this token is not
    // already in the slot, so a retry cannot double-count the same person.
    const capacity = slotType === 'individualni' ? 1 : 3
    const added = await redis.hsetnx(slotKey(slotId), token, `${client.name} — ${client.pack}`)
    const taken = await redis.hlen(slotKey(slotId))

    if (taken > capacity) {
      // lost the race for the last place — undo and tell them
      if (added) await redis.hdel(slotKey(slotId), token)
      return json(res, 409, { error: 'termin je upravo popunjen' })
    }

    const next = [...booked, { id: slotId, week: weekIndex }]
    await redis.hset(clientKey(token), { booked: JSON.stringify(next) })
    return json(res, 200, { ok: true, used: next.length, left: total - next.length, taken })
  } catch (err) {
    console.error('booking failed', err)
    return json(res, 500, { error: 'storage unavailable' })
  }
}
