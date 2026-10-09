// The packages, server-side. The browser sends only a key, and everything that
// decides money or entitlement is looked up here, so a tampered page cannot ask
// for twelve sessions at the four-session price.
//
// The Stripe Payment Link lives here rather than in src/data/pricing.json
// because the checkout URL is now built server-side, after the places are held.
// pricing.json stays the source for what the cjenik *displays*.
export const PACKS = {
  paket4: {
    label: 'Paket 4 treninga (1x tjedno)', total: 4, type: 'grupni',
    checkout: 'https://buy.stripe.com/fZu3cva0T5VE5lI5tacwg00',
  },
  paket8: {
    label: 'Paket 8 treninga (2x tjedno)', total: 8, type: 'grupni',
    checkout: 'https://buy.stripe.com/7sY8wPc910BkcOa2gYcwg01',
  },
  paket12: {
    label: 'Paket 12 treninga (3x tjedno)', total: 12, type: 'grupni',
    checkout: 'https://buy.stripe.com/7sY3cvgph1Fo9BYf3Kcwg02',
  },
  pojedinacni: {
    label: 'Pojedinačni 1:1 trening', total: 1, type: 'individualni',
    checkout: 'https://buy.stripe.com/aFa5kD1unck28xUf3Kcwg03',
  },
}

// The webhook knows the purchase only by its Stripe product name. Substring
// match, so trailing detail like "(1x tjedno)" is harmless; no key is a prefix
// of another, so "paket 12" cannot be read as "paket 1".
const BY_PRODUCT = [
  ['paket 4',  'paket4'],
  ['paket 8',  'paket8'],
  ['paket 12', 'paket12'],
  ['pojedina', 'pojedinacni'],
]

export const packByProductName = (name = '') => {
  const n = name.toLowerCase()
  const hit = BY_PRODUCT.find(([needle]) => n.includes(needle))
  return hit ? { key: hit[1], ...PACKS[hit[1]], label: name } : null
}

export const packByKey = (key) =>
  PACKS[key] ? { key, ...PACKS[key] } : null

export const capacityFor = (type) => (type === 'individualni' ? 1 : 3)
