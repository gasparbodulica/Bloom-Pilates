import { randomBytes } from 'node:crypto'
import { redis, clientKey, slotKey, storeReady, storeSource } from './_store.js'
import { appendSheetRow } from './_google.js'
import { sendMail, wrap } from './_email.js'
import { packByProductName } from './_packs.js'
import { readSlot, holdKey, paidValue, syncSlot } from './_slots.js'
import { expiryFrom } from './_schedule.js'

// A paid Stripe session has to become an entitlement, and two things race to do
// it: the webhook, and the buyer landing back on the site from the redirect.
// Both go through here. The Stripe session id is the idempotency key, so one
// payment can never grant two packages, whichever arrives first.
//
// Since places are now chosen before paying, the payment also has to find its
// way back to the places being held. Stripe carries the hold id in
// client_reference_id, which /api/hold put on the checkout URL.

const sessKey = (id) => `sess:${id}`
const lockKey = (id) => `sesslock:${id}`
const newToken = () => randomBytes(16).toString('hex')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

export const tokenForSession = (id) => redis.get(sessKey(id))

export const loadSession = (stripe, id) =>
  stripe.checkout.sessions.retrieve(id, { expand: ['line_items'] })

const fmt = (iso) => new Date(iso).toLocaleString('hr-HR', {
  weekday: 'long', day: 'numeric', month: 'long',
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zagreb',
})

export const grantForSession = async (stripe, session) => {
  // Thrown, not returned: the payment already happened, so the caller must fail
  // loudly and let Stripe retry rather than quietly dropping the purchase.
  if (!storeReady()) throw new Error(`redis not configured — found: ${storeSource()}`)

  const existing = await redis.get(sessKey(session.id))
  if (existing) return { token: existing, created: false }

  if (session.payment_status !== 'paid')
    return { token: null, created: false, reason: 'not paid' }

  const productName = session.line_items?.data?.[0]?.description
    || (await loadSession(stripe, session.id)).line_items?.data?.[0]?.description
    || ''
  const pack = packByProductName(productName)
  if (!pack) return { token: null, created: false, reason: `unknown product: ${productName}` }

  const won = await redis.set(lockKey(session.id), '1', { nx: true, ex: 180 })
  if (!won) {
    for (let i = 0; i < 12; i++) {
      await sleep(250)
      const t = await redis.get(sessKey(session.id))
      if (t) return { token: t, created: false }
    }
    return { token: null, created: false, reason: 'granting in progress' }
  }

  const k = newToken()
  const name  = session.customer_details?.name  || 'Polaznica'
  const email = session.customer_details?.email || ''
  const phone = session.custom_fields?.[0]?.text?.value || session.customer_details?.phone || ''
  const label = `${name} — ${pack.label}`

  // --- claim the held places -----------------------------------------------
  // The hold may be gone: it expires after 30 minutes, and someone can take
  // longer than that at the checkout. That must not cost them their money, so
  // the package is granted either way and they are told to pick dates again.
  const holdId = session.client_reference_id || null
  let held = []
  if (holdId) {
    const raw = await redis.get(holdKey(holdId))
    const hold = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (hold?.slots?.length) {
      // What they paid for wins over what they held, in case the two disagree.
      held = hold.slots
        .slice()
        .sort((a, b) => String(a.startISO).localeCompare(String(b.startISO)))
        .slice(0, pack.total)
    }
  }

  const booked = []
  for (const slot of held) {
    try {
      // Take the place under the real token before releasing the hold, so the
      // place cannot be lost to someone else in between.
      await redis.hsetnx(slotKey(slot.id), k, paidValue(label))
      await redis.hdel(slotKey(slot.id), holdId)
      booked.push({ id: slot.id, week: slot.week })
    } catch (err) {
      console.error('could not claim held slot', slot.id, err)
    }
  }
  if (holdId) await redis.del(holdKey(holdId)).catch(() => {})

  const purchasedAt = new Date()
  const expires = expiryFrom(purchasedAt)             // the 5-week window

  await redis.hset(clientKey(k), {
    name, email, phone,
    pack: pack.label, type: pack.type,
    total: pack.total,
    purchasedAt: purchasedAt.toISOString(),
    expires: expires.toISOString(),
    booked: JSON.stringify(booked),
    stripeSession: session.id,
  })
  // Published only once the row exists, so nobody can read a token that has
  // nothing behind it.
  await redis.set(sessKey(session.id), k)

  const link = `${process.env.SITE_URL || 'https://bloompilates.studio'}/rezervacija.html?k=${k}`

  // Now the places are paid for and carry a name, so they are worth her seeing.
  for (const slot of held) {
    if (!booked.some(b => b.id === slot.id)) continue
    await syncSlot({ slotId: slot.id, slotType: slot.type, startISO: slot.startISO, endISO: slot.endISO })
  }

  await appendSheetRow('Polaznice', [
    purchasedAt.toLocaleString('hr-HR'), name, email, phone,
    pack.label, pack.total, booked.length, expires.toLocaleDateString('hr-HR'),
    (session.amount_total ?? 0) / 100 + ' EUR', 'DA', link,
  ]).catch(e => console.error('sheet append failed', e))

  for (const slot of held) {
    if (!booked.some(b => b.id === slot.id)) continue
    await appendSheetRow('Rezervacije', [
      purchasedAt.toLocaleString('hr-HR'), name, email,
      pack.label, slot.id, slot.startISO || '', 'POTVRĐENO',
    ]).catch(e => console.error('sheet append failed', e))
  }

  const dateList = held
    .filter(s => booked.some(b => b.id === s.id) && s.startISO)
    .map(s => `<li>${fmt(s.startISO)}</li>`).join('')

  await sendMail({
    to: email,
    subject: booked.length ? 'Uplata potvrđena — termini su rezervirani' : 'Tvoj paket je aktiviran',
    html: wrap(`
      <p>Bok ${name},</p>
      <p>Hvala na uplati! Aktiviran ti je <strong>${pack.label}</strong> —
         ${pack.total} ${pack.total === 1 ? 'trening' : 'treninga'},
         vrijedi do <strong>${expires.toLocaleDateString('hr-HR')}</strong>.</p>
      ${booked.length
        ? `<p>Potvrđeni termini:</p><ul>${dateList}</ul>
           <p>Preostalo ti je ${pack.total - booked.length} ${pack.total - booked.length === 1 ? 'trening' : 'treninga'} za odabir.</p>`
        : `<p>Termini koje si odabrala više nisu bili dostupni u trenutku uplate, pa ih odaberi ponovno na linku ispod — paket je u cijelosti tvoj.</p>`}
      <p><a href="${link}" style="background:#484A2C;color:#fff;padding:12px 22px;border-radius:100px;text-decoration:none;display:inline-block">${booked.length ? 'Pregledaj i promijeni termine' : 'Odaberi svoje termine'}</a></p>
      <p style="font-size:13px;color:#7A6558">Spremi ovaj link — po njemu se vraćaš svojim terminima.</p>
      <p style="font-size:13px;color:#7A6558">Podsjetnik: termin otkaži najkasnije 12 sati prije treninga.</p>`),
  })

  return { token: k, created: true, booked: booked.length }
}
