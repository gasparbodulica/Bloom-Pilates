import { randomBytes } from 'node:crypto'
import { redis, slotKey, json, storeReady } from './_store.js'
import { packByKey, capacityFor } from './_packs.js'
import { readSlot, holdValue, holdKey, HOLD_MINUTES } from './_slots.js'

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
  if (!storeReady()) return json(res, 503, { error: 'rezervacije trenutno nisu dostupne' })

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

      const capacity = capacityFor(slot.type || pack.type)

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
    const checkout = `${pack.checkout}?client_reference_id=${id}`
    return json(res, 200, { hold: id, checkout, holdMinutes: HOLD_MINUTES, expiresAt: until })
  } catch (err) {
    console.error('hold failed', err)
    await rollback()
    return json(res, 500, { error: 'nije moguće rezervirati termine' })
  }
}
