import { redis, clientKey, json } from './_store.js'

// POST /api/seed  { token, name, pack }
// Stand-in for Stripe's webhook so the shared storage can be tried before the
// Stripe account exists. Must be removed, or locked behind a secret, before
// this goes live — otherwise anyone could grant themselves a package.
const PACKS = {
  paket4:  { label: 'Paket 4 treninga (1x tjedno)',  total: 4,  perWeek: 1, type: 'grupni' },
  paket8:  { label: 'Paket 8 treninga (2x tjedno)',  total: 8,  perWeek: 2, type: 'grupni' },
  paket12: { label: 'Paket 12 treninga (3x tjedno)', total: 12, perWeek: 3, type: 'grupni' },
  pojedinacni: { label: 'Pojedinačni 1:1 trening', total: 1, perWeek: 1, type: 'individualni' },
}

export default async function handler(req, res) {
  if (process.env.ALLOW_SEED !== '1') return json(res, 403, { error: 'seeding disabled' })
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })

  const { token, name = 'Testna Polaznica', pack = 'paket8' } = req.body || {}
  const p = PACKS[pack]
  if (!token || !p) return json(res, 400, { error: 'token and a valid pack required' })

  const purchasedAt = new Date()
  const expires = new Date(purchasedAt)
  expires.setDate(expires.getDate() + 35)          // the 5-week window

  await redis.hset(clientKey(token), {
    name, pack: p.label, type: p.type,
    total: p.total, perWeek: p.perWeek,
    purchasedAt: purchasedAt.toISOString(),
    expires: expires.toISOString(),
    booked: '[]',
  })
  return json(res, 200, { ok: true, token, pack: p.label, expires: expires.toISOString() })
}
