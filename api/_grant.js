import { randomBytes } from 'node:crypto'
import { redis, clientKey } from './_store.js'
import { appendSheetRow } from './_google.js'
import { sendMail, wrap } from './_email.js'

// A paid Stripe session has to become an entitlement, and two things race to do
// it: the webhook, and the buyer landing back on the site from the redirect.
// Both go through here. The Stripe session id is the idempotency key, so one
// payment can never grant two packages, whichever arrives first.

const PACKS = {
  'paket 4':  { total: 4,  type: 'grupni' },
  'paket 8':  { total: 8,  type: 'grupni' },
  'paket 12': { total: 12, type: 'grupni' },
  'pojedina': { total: 1,  type: 'individualni' },
}

// Matched on the Stripe product name, which is why each Payment Link must be
// named after its package. Substring, so trailing detail like "(1x tjedno)"
// is harmless; no key is a prefix of another, so "paket 12" cannot match
// "paket 1".
export const matchPack = (name = '') => {
  const n = name.toLowerCase()
  const key = Object.keys(PACKS).find(k => n.includes(k))
  return key ? { ...PACKS[key], label: name } : null
}

const sessKey = (id) => `sess:${id}`
const lockKey = (id) => `sesslock:${id}`
const newToken = () => randomBytes(16).toString('hex')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

export const tokenForSession = (id) => redis.get(sessKey(id))

// Fetch the session with its line items, which is where the product name lives.
export const loadSession = (stripe, id) =>
  stripe.checkout.sessions.retrieve(id, { expand: ['line_items'] })

export const grantForSession = async (stripe, session) => {
  const existing = await redis.get(sessKey(session.id))
  if (existing) return { token: existing, created: false }

  if (session.payment_status !== 'paid')
    return { token: null, created: false, reason: 'not paid' }

  const productName = session.line_items?.data?.[0]?.description
    || (await loadSession(stripe, session.id)).line_items?.data?.[0]?.description
    || ''
  const pack = matchPack(productName)
  if (!pack) return { token: null, created: false, reason: `unknown product: ${productName}` }

  // Only one caller gets to create the row; the other waits for the index.
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

  const purchasedAt = new Date()
  const expires = new Date(purchasedAt)
  expires.setDate(expires.getDate() + 35)             // the 5-week window

  await redis.hset(clientKey(k), {
    name, email, phone,
    pack: pack.label, type: pack.type,
    total: pack.total,
    purchasedAt: purchasedAt.toISOString(),
    expires: expires.toISOString(),
    booked: '[]',
    stripeSession: session.id,
  })
  // Published only once the row exists, so nobody can read a token that has
  // nothing behind it.
  await redis.set(sessKey(session.id), k)

  const link = `${process.env.SITE_URL || 'https://bloompilates.studio'}/rezervacija.html?k=${k}`

  await appendSheetRow('Polaznice', [
    purchasedAt.toLocaleString('hr-HR'), name, email, phone,
    pack.label, pack.total, 0, expires.toLocaleDateString('hr-HR'),
    (session.amount_total ?? 0) / 100 + ' EUR', 'DA', link,
  ]).catch(e => console.error('sheet append failed', e))

  await sendMail({
    to: email,
    subject: 'Tvoj paket je aktiviran — odaberi termine',
    html: wrap(`
      <p>Bok ${name},</p>
      <p>Hvala na uplati! Aktiviran ti je <strong>${pack.label}</strong> —
         ${pack.total} ${pack.total === 1 ? 'trening' : 'treninga'},
         vrijedi do <strong>${expires.toLocaleDateString('hr-HR')}</strong>.</p>
      <p><a href="${link}" style="background:#484A2C;color:#fff;padding:12px 22px;border-radius:100px;text-decoration:none;display:inline-block">Odaberi svoje termine</a></p>
      <p style="font-size:13px;color:#7A6558">Spremi ovaj link — po njemu se vraćaš svojim terminima.</p>
      <p style="font-size:13px;color:#7A6558">Podsjetnik: termin otkaži najkasnije 12 sati prije treninga.</p>`),
  })

  return { token: k, created: true }
}
