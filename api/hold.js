import { randomBytes } from 'node:crypto'
import { redis, slotKey, json, storeReady } from './_store.js'
import { packByKey } from './_packs.js'
import { readSlot, holdValue, holdKey, HOLD_MINUTES } from './_slots.js'
import { findSlot, expiryFrom } from './_schedule.js'

// POST /api/hold  { pack: 'paket8', slots: [{ id, type, startISO, endISO, week }] }
//
// The places are chosen before paying, so they have to be held while the person
// is at Stripe — otherwise two people pick the same place and only one of them
// can actually have it. The hold expires on its own after HOLD_MINUTES, so an
// abandoned checkout frees the places again.
//
// Nothing is written to Doris's calendar yet. Until the payment clears there is
// no name to write and nothing worth her seeing.
const newId = () => randomBytes(12).toString('hex')

const clientIp = (req) =>
  String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '')
    .split(',')[0].trim() || 'unknown'

const ipHoldKey = (ip) => `holdip:${ip}`
const ipRateKey = (ip) => `holdrate:${ip}`
// Generous on purpose. A household, an office or a café share one address, so
// a tight count locks out real people; the real cap on damage is the one live
// hold per address below, which limits anyone to a single package's worth of
// places at a time.
const MAX_HOLDS = 30
const RATE_WINDOW_S = 600

// Release a hold's places. Used when the same person starts over — otherwise
// going back and picking different dates would leave the first set blocked for
// half an hour, by them, against themselves.
const releaseHold = async (id) => {
  if (!id) return
  try {
    const raw = await redis.get(holdKey(id))
    const hold = typeof raw === 'string' ? JSON.parse(raw) : raw
    for (const slot of hold?.slots || []) {
      await redis.hdel(slotKey(slot.id), id).catch(() => {})
    }
    await redis.del(holdKey(id)).catch(() => {})
  } catch (err) {
    console.error('could not release previous hold', id, err)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
  if (!storeReady()) return json(res, 503, { error: 'rezervacije trenutno nisu dostupne' })

  // No payment is required to reach this endpoint, so without a limit someone
  // could hold every place in the schedule on repeat and nobody could book.
  // The count is of holds actually taken, not of attempts: refused attempts
  // occupy nothing, and counting them locked out anyone who simply retried
  // after picking a place that had just gone.
  const ip = clientIp(req)
  const held = Number(await redis.get(ipRateKey(ip))) || 0
  if (held >= MAX_HOLDS)
    return json(res, 429, { error: 'previše rezervacija s ove veze — pokušaj za nekoliko minuta' })

  const { pack: packKey, slots } = req.body || {}
  const pack = packByKey(packKey)
  if (!pack) return json(res, 400, { error: 'nepoznat paket' })
  if (!Array.isArray(slots) || !slots.length)
    return json(res, 400, { error: 'odaberi barem jedan termin' })
  if (slots.length > pack.total)
    return json(res, 400, { error: `${pack.label} dopušta najviše ${pack.total} termina` })

  const ids = slots.map(s => String(s.id))
  if (new Set(ids).size !== ids.length)
    return json(res, 400, { error: 'isti termin odabran dva puta' })

  // One live hold per person: starting over releases the previous set.
  await releaseHold(await redis.get(ipHoldKey(ip)))

  const id = newId()
  const until = Date.now() + HOLD_MINUTES * 60_000
  const taken = []                                  // what we managed to hold

  const rollback = async () => {
    await Promise.all(taken.map(sid => redis.hdel(slotKey(sid), id).catch(() => {})))
  }

  try {
    for (const slot of slots) {
      const sid = String(slot.id)

      if (slot.type && slot.type !== pack.type) {
        await rollback()
        return json(res, 409, { error: 'paket ne vrijedi za tu vrstu treninga' })
      }
      if (slot.startISO && new Date(slot.startISO) < new Date()) {
        await rollback()
        return json(res, 409, { error: 'termin je prošao' })
      }
      // The package will run from the moment she pays, so anything beyond that
      // window cannot be held now either.
      if (slot.startISO && new Date(slot.startISO) > expiryFrom(Date.now())) {
        await rollback()
        return json(res, 409, { error: 'termin je nakon isteka paketa' })
      }

      // The session has to actually exist in Doris's week. The page sends what
      // it likes; this is what makes it true.
      const real = findSlot({ id: sid, type: slot.type || pack.type, startISO: slot.startISO })
      if (!real.ok) {
        await rollback()
        return json(res, 400, { error: real.reason })
      }

      const capacity = real.slot.capacity

      // Atomic: HSETNX cannot overwrite someone else, and the count afterwards
      // is what decides, so two people racing for the last place cannot both win.
      const added = await redis.hsetnx(slotKey(sid), id, holdValue(until))
      if (!added) {
        await rollback()
        return json(res, 409, { error: 'termin je upravo zauzet' })
      }
      taken.push(sid)

      const live = await readSlot(sid)
      if (Object.keys(live).length > capacity) {
        await rollback()
        return json(res, 409, { error: 'termin je upravo popunjen — odaberi drugi' })
      }
    }

    await redis.set(holdKey(id), JSON.stringify({
      pack: pack.key, label: pack.label, total: pack.total, type: pack.type,
      slots: slots.map(s => ({
        id: String(s.id), type: s.type || pack.type,
        startISO: s.startISO || null, endISO: s.endISO || null,
        week: Number.isInteger(s.week) ? s.week : null,
      })),
      createdAt: new Date().toISOString(),
    }), { ex: HOLD_MINUTES * 60 })

    // client_reference_id is how the payment finds its way back to these places.
    await redis.set(ipHoldKey(ip), id, { ex: HOLD_MINUTES * 60 })
    const n = await redis.incr(ipRateKey(ip))
    if (n === 1) await redis.expire(ipRateKey(ip), RATE_WINDOW_S)

    const checkout = `${pack.checkout}?client_reference_id=${id}`
    return json(res, 200, { hold: id, checkout, holdMinutes: HOLD_MINUTES, expiresAt: until })
  } catch (err) {
    console.error('hold failed', err)
    await rollback()
    return json(res, 500, { error: 'nije moguće rezervirati termine' })
  }
}
