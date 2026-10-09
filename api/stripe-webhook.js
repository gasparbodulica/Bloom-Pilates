import Stripe from 'stripe'
import { redis, clientKey, json } from './_store.js'
import { appendSheetRow } from './_google.js'
import { sendMail, wrap } from './_email.js'

// Stripe tells us a payment cleared. The signature check is what makes that
// trustworthy — without it anyone could POST "Ana paid" and grant themselves a
// package. Stripe knows nothing about sessions or limits; those are ours.
export const config = { api: { bodyParser: false } }

const PACKS = {
  'paket 4':  { total: 4,  perWeek: 1, type: 'grupni' },
  'paket 8':  { total: 8,  perWeek: 2, type: 'grupni' },
  'paket 12': { total: 12, perWeek: 3, type: 'grupni' },
  'pojedina': { total: 1,  perWeek: 1, type: 'individualni' },
}

// Match on the Stripe product name, which is why each Payment Link must be
// named after its package.
const matchPack = (name = '') => {
  const n = name.toLowerCase()
  const key = Object.keys(PACKS).find(k => n.includes(k))
  return key ? { ...PACKS[key], label: name } : null
}

const rawBody = async (req) => {
  const chunks = []
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c)
  return Buffer.concat(chunks)
}

const token = () => [...crypto.getRandomValues(new Uint8Array(16))]
  .map(b => b.toString(16).padStart(2, '0')).join('')

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  let event
  try {
    event = stripe.webhooks.constructEvent(
      await rawBody(req),
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET,
    )
  } catch (err) {
    console.error('bad stripe signature', err.message)
    return json(res, 400, { error: 'invalid signature' })
  }

  if (event.type !== 'checkout.session.completed') return json(res, 200, { ignored: event.type })

  try {
    const s = event.data.object
    const full = await stripe.checkout.sessions.retrieve(s.id, { expand: ['line_items'] })
    const productName = full.line_items?.data?.[0]?.description || ''
    const pack = matchPack(productName)
    if (!pack) {
      console.error('unrecognised product', productName)
      return json(res, 200, { ignored: 'unknown product' })
    }

    const name  = s.customer_details?.name  || 'Polaznica'
    const email = s.customer_details?.email || ''
    const phone = s.custom_fields?.[0]?.text?.value || s.customer_details?.phone || ''

    const k = token()
    const purchasedAt = new Date()
    const expires = new Date(purchasedAt)
    expires.setDate(expires.getDate() + 35)             // the 5-week window

    await redis.hset(clientKey(k), {
      name, email, phone,
      pack: pack.label, type: pack.type,
      total: pack.total, perWeek: pack.perWeek,
      purchasedAt: purchasedAt.toISOString(),
      expires: expires.toISOString(),
      booked: '[]',
      stripeSession: s.id,
    })

    const link = `${process.env.SITE_URL || 'https://bloompilates.studio'}/rezervacija.html?k=${k}`

    await appendSheetRow('Polaznice', [
      purchasedAt.toLocaleString('hr-HR'), name, email, phone,
      pack.label, pack.total, 0, expires.toLocaleDateString('hr-HR'),
      (s.amount_total ?? 0) / 100 + ' EUR', 'DA', link,
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
        <p style="font-size:13px;color:#7A6558">Podsjetnik: termin otkaži najkasnije 24 sata prije treninga.</p>`),
    })

    return json(res, 200, { ok: true })
  } catch (err) {
    console.error('webhook handling failed', err)
    return json(res, 500, { error: 'handling failed' })
  }
}
