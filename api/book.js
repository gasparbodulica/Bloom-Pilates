import { redis, slotKey, clientKey, json, storeReady } from './_store.js'
import { appendSheetRow } from './_google.js'
import { sendMail, wrap } from './_email.js'
import { readSlot, paidValue, syncSlot } from './_slots.js'
import { capacityFor } from './_packs.js'

// POST /api/book  { token, slotId, slotType, weekIndex, action: 'book' | 'cancel' }
//
// Every rule is re-checked here. The page already checks them, but a check in
// the browser is a suggestion — anyone can edit it. This is the one that counts.

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })

  if (!storeReady()) return json(res, 503, { error: 'rezervacije trenutno nisu dostupne' })

  const { token, slotId, slotType, weekIndex, startISO, endISO, action = 'book' } = req.body || {}
  if (!token || !slotId) return json(res, 400, { error: 'token and slotId required' })

  try {
    const client = await redis.hgetall(clientKey(token))
    if (!client || !Object.keys(client).length)
      return json(res, 404, { error: 'nepoznat link' })

    const total   = Number(client.total)
    const expires = new Date(client.expires)
    const booked  = JSON.parse(client.booked || '[]')        // [{id, week}]

    if (action === 'cancel') {
      await redis.hdel(slotKey(slotId), token)
      const next = booked.filter(b => b.id !== slotId)
      await redis.hset(clientKey(token), { booked: JSON.stringify(next) })
      await syncSlot({ slotId, slotType, startISO, endISO })
      await appendSheetRow('Rezervacije', [
        new Date().toLocaleString('hr-HR'), client.name, client.email,
        client.pack, slotId, startISO || '', 'OTKAZANO',
      ]).catch(e => console.error('sheet append failed', e))
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
    // No weekly cap by design — the package total is the only session limit, so
    // a client may book all of them in one week. weekIndex is kept for grouping.

    // Capacity, checked atomically. HSETNX only writes if this token is not
    // already in the slot, so a retry cannot double-count the same person. The
    // count that follows ignores expired holds.
    const capacity = capacityFor(slotType)
    const added = await redis.hsetnx(slotKey(slotId), token, paidValue(`${client.name} — ${client.pack}`))
    const taken = Object.keys(await readSlot(slotId)).length

    if (taken > capacity) {
      // lost the race for the last place — undo and tell them
      if (added) await redis.hdel(slotKey(slotId), token)
      return json(res, 409, { error: 'termin je upravo popunjen' })
    }

    const next = [...booked, { id: slotId, week: weekIndex }]
    await redis.hset(clientKey(token), { booked: JSON.stringify(next) })

    // Calendar and Sheet come after the booking is already safe in Redis, and
    // never block it — if Google is down the client still has their place.
    await syncSlot({ slotId, slotType, startISO, endISO })
    await appendSheetRow('Rezervacije', [
      new Date().toLocaleString('hr-HR'), client.name, client.email,
      client.pack, slotId, startISO || '', 'REZERVIRANO',
    ]).catch(e => console.error('sheet append failed', e))

    if (client.email && startISO) {
      const when = new Date(startISO).toLocaleString('hr-HR', {
        weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
      })
      await sendMail({
        to: client.email,
        subject: `Termin rezerviran — ${when}`,
        html: wrap(`
          <p>Bok ${client.name},</p>
          <p>Tvoj termin je rezerviran: <strong>${when}</strong>.</p>
          <p style="font-size:13px;color:#7A6558">Otkazivanje najkasnije 12 sati prije treninga. U slučaju otkazivanja unutar 12 sati ili nedolaska, termin se smatra iskorištenim.</p>`),
      })
    }

    return json(res, 200, { ok: true, used: next.length, left: total - next.length, taken })
  } catch (err) {
    console.error('booking failed', err)
    return json(res, 500, { error: 'storage unavailable' })
  }
}
