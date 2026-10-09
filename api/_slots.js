import { redis, slotKey } from './_store.js'
import { upsertSlotEvent } from './_google.js'
import { capacityFor } from './_packs.js'

// A place in a slot is either paid for or held while someone is at the checkout.
// A hold has to expire by itself: with only three places per group session, a
// person who picks dates and never pays would otherwise block a third of a class
// forever.
//
// Redis has no portable per-field expiry, so the expiry rides in the value and
// expired fields are swept on read. That keeps correctness in one place — a
// stale hold is never counted, whether or not anything has cleaned it up yet.
export const HOLD_MINUTES = 30
export const HOLD_LABEL = 'REZERVIRANO — čeka uplatu'

export const holdValue = (until, label = HOLD_LABEL) => `HOLD|${until}|${label}`
export const paidValue = (label) => `OK|${label}`

export const parseEntry = (raw = '') => {
  if (raw.startsWith('HOLD|')) {
    const parts = raw.split('|')
    return { kind: 'hold', until: Number(parts[1]) || 0, label: parts.slice(2).join('|') }
  }
  if (raw.startsWith('OK|')) return { kind: 'paid', label: raw.slice(3) }
  return { kind: 'paid', label: raw }          // written before holds existed
}

export const isLive = (entry, now = Date.now()) =>
  entry.kind === 'paid' || entry.until > now

// Live occupants of one slot, sweeping anything that has expired.
export const readSlot = async (slotId) => {
  const hash = (await redis.hgetall(slotKey(slotId))) || {}
  const now = Date.now()
  const live = {}
  const stale = []
  for (const [field, raw] of Object.entries(hash)) {
    const entry = parseEntry(String(raw))
    if (isLive(entry, now)) live[field] = entry
    else stale.push(field)
  }
  if (stale.length) {
    // best effort; correctness does not depend on it
    redis.hdel(slotKey(slotId), ...stale).catch(e => console.error('sweep failed', e))
  }
  return live
}

export const holdKey = (id) => `hold:${id}`

// Rebuild a slot's calendar entry from whoever is currently in it, rather than
// patching it, so the event cannot drift after a cancellation or an expired
// hold. Shared by the booking endpoint and the payment grant.
export const syncSlot = async ({ slotId, slotType, startISO, endISO }) => {
  if (!startISO || !endISO) return
  try {
    const live = await readSlot(slotId)
    await upsertSlotEvent({
      slotId, startISO, endISO,
      type: slotType,
      people: Object.values(live).map(e => e.label),
      capacity: capacityFor(slotType),
    })
  } catch (err) {
    console.error('calendar sync failed', err)
  }
}
