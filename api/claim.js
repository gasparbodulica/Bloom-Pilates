import Stripe from 'stripe'
import { json, storeReady } from './_store.js'
import { grantForSession, loadSession, tokenForSession } from './_grant.js'

// GET /api/claim?s=<checkout_session_id>
//
// Stripe redirects the buyer here after paying, so they can pick their dates
// straight away instead of waiting on an email that might take minutes or land
// in spam. The webhook usually arrives first; when it has not, this grants the
// package itself. Both paths share the same idempotency key, so one payment
// yields one package.
//
// The session id is the proof of purchase. It is long and random and only the
// buyer is handed it — the same trust model as the emailed link.
export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })

  if (!storeReady()) return json(res, 503, { error: 'rezervacije trenutno nisu dostupne' })

  const id = String(req.query.s || '')
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return json(res, 400, { error: 'neispravan id' })

  try {
    const known = await tokenForSession(id)
    if (known) return json(res, 200, { k: known })

    if (!process.env.STRIPE_SECRET_KEY)
      return json(res, 503, { error: 'plaćanje nije konfigurirano' })

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const session = await loadSession(stripe, id)
    const { token, reason } = await grantForSession(stripe, session)

    if (!token) {
      if (reason === 'not paid') return json(res, 402, { error: 'uplata još nije potvrđena' })
      console.error('claim failed', reason)
      return json(res, 409, { error: 'paket se još priprema — osvježi za nekoliko sekundi' })
    }
    return json(res, 200, { k: token })
  } catch (err) {
    console.error('claim failed', err)
    return json(res, 500, { error: 'nije moguće potvrditi uplatu' })
  }
}
