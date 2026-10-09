// One-off repair, 2026-10-09.
//
// Slot ids changed from week-relative ("w1-d1-18:00") to absolute
// ("2026-10-12-18:00") because the old form meant a different date for every
// client depending on the week they bought in. The change shipped without
// migrating what was already stored, so bookings made before it are filed
// under ids the site no longer looks for: the session shows as free, and the
// client cannot see or cancel it while the server still counts it against
// their package.
//
// This rewrites those entries in place. The old id is decoded against the
// client's own purchase date, which is the anchor the page used at the time.
//
//   node scripts/repair-slot-ids.mjs           # report only, writes nothing
//   node scripts/repair-slot-ids.mjs --apply   # make the changes
//
// Needs KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_*) in the
// environment: `vercel env pull .env.local` then run with --env-file=.env.local
import { Redis } from '@upstash/redis'

const APPLY = process.argv.includes('--apply')

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
if (!url || !token) {
  console.error('No Redis credentials. Run: vercel env pull .env.local')
  console.error('then: node --env-file=.env.local scripts/repair-slot-ids.mjs')
  process.exit(1)
}
const redis = new Redis({ url, token })

const OLD = /^w(\d+)-d([1-7])-(\d{2}:\d{2})$/
const PAD = (n) => String(n).padStart(2, '0')

// The page anchored its window to the Monday of the purchase week, in Zagreb.
const mondayOfPurchaseWeek = (purchasedAt) => {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zagreb', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(purchasedAt))
  const [y, m, d] = day.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  const shift = (t.getUTCDay() + 6) % 7                 // Monday = 0
  t.setUTCDate(t.getUTCDate() - shift)
  return t
}

const newIdFor = (oldId, purchasedAt) => {
  const m = OLD.exec(oldId)
  if (!m) return null
  const [, week, weekday, time] = m
  const t = mondayOfPurchaseWeek(purchasedAt)
  t.setUTCDate(t.getUTCDate() + Number(week) * 7 + (Number(weekday) - 1))
  return `${t.getUTCFullYear()}-${PAD(t.getUTCMonth() + 1)}-${PAD(t.getUTCDate())}-${time}`
}

const scanAll = async (match) => {
  const keys = []
  let cursor = '0'
  do {
    const [next, batch] = await redis.scan(cursor, { match, count: 200 })
    keys.push(...batch)
    cursor = String(next)
  } while (cursor !== '0')
  return keys
}

console.log(APPLY ? '--- APPLYING CHANGES ---' : '--- REPORT ONLY (pass --apply to write) ---')

let moved = 0
for (const key of await scanAll('client:*')) {
  const token = key.slice('client:'.length)
  const row = await redis.hgetall(key)
  if (!row?.booked) continue
  let booked
  try { booked = JSON.parse(row.booked) } catch { continue }
  if (!Array.isArray(booked) || !booked.length) continue

  const stale = booked.filter(b => OLD.test(String(b.id)))
  if (!stale.length) continue

  console.log(`\n${row.name || '?'} <${row.email || 'no email'}>  ${row.pack}`)
  console.log(`  bought ${row.purchasedAt}`)

  const next = []
  for (const b of booked) {
    if (!OLD.test(String(b.id))) { next.push(b); continue }
    const fresh = newIdFor(b.id, row.purchasedAt)
    const label = (await redis.hget(`slot:${b.id}`, token)) ?? `OK|${row.name} — ${row.pack}`
    console.log(`  ${b.id}  ->  ${fresh}`)
    console.log(`     entry: ${label}`)
    if (APPLY) {
      await redis.hset(`slot:${fresh}`, { [token]: label })
      await redis.hdel(`slot:${b.id}`, token)
      moved++
    }
    next.push({ ...b, id: fresh })
  }
  if (APPLY) await redis.hset(key, { booked: JSON.stringify(next) })
}

// Anything still sitting under an old id belongs to nobody we can place.
const leftovers = (await scanAll('slot:w*')).filter(k => OLD.test(k.slice('slot:'.length)))
if (leftovers.length) {
  console.log('\nstill under old ids (unpaid holds, or bookings with no client row):')
  for (const k of leftovers) {
    const h = await redis.hgetall(k)
    const n = Object.keys(h || {}).length
    console.log(`  ${k}  ${n} entr${n === 1 ? 'y' : 'ies'}  ${JSON.stringify(Object.values(h || {})).slice(0, 90)}`)
  }
  console.log('  Holds carry their own expiry and lapse on their own; left alone.')
}

console.log(APPLY ? `\nmoved ${moved} booking(s)` : '\nnothing written')
