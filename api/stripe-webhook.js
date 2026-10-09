import Stripe from 'stripe'
import { json } from './_store.js'
import { grantForSession, loadSession } from './_grant.js'

// Stripe tells us a payment cleared. The signature check is what makes that
// trustworthy — without it anyone could POST "Ana paid" and grant themselves a
// package. Stripe knows nothing about sessions or limits; those are ours.
//
// The entitlement itself is created in _grant.js, shared with /api/claim, so
// the webhook and the buyer's redirect cannot grant the same payment twice.
export const config = { api: { bodyParser: false } }

const rawBody = async (req) => {
  const chunks = []
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c)
  return Buffer.concat(chunks)
}

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
    const session = await loadSession(stripe, event.data.object.id)
    const { token, created, reason } = await grantForSession(stripe, session)
    if (!token) {
      console.error('grant skipped', reason)
      return json(res, 200, { ignored: reason })      // 200, or Stripe keeps retrying
    }
    return json(res, 200, { ok: true, created })
  } catch (err) {
    console.error('webhook handling failed', err)
    return json(res, 500, { error: 'handling failed' })
  }
}
