import { redis, clientKey, emailKey, json, storeReady } from './_store.js'
import { sendMail, wrap, mailReady } from './_email.js'

// POST /api/my-link  { email }
//
// Recovery for someone on a new phone, or who lost the email. She types her
// address and we send her personal link to it.
//
// Not "type an email and see the bookings": typing an address is no proof of
// owning it, and anyone who knew a client's address could otherwise read her
// name, her evenings at the studio and what she has left. The mailbox is the
// proof, so the link goes there and nowhere else.
//
// The reply is the same whether or not we know the address, so this cannot be
// used to find out who is a client.
const SAME_ANSWER = { ok: true, message: 'Ako imamo rezervaciju na tu adresu, poslali smo ti link e-mailom.' }

const clientIp = (req) =>
  String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '')
    .split(',')[0].trim() || 'unknown'

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
  if (!storeReady()) return json(res, 503, { error: 'rezervacije trenutno nisu dostupne' })
  if (!mailReady())
    return json(res, 503, { error: 'slanje e-maila još nije postavljeno — piši nam na pilatesstudiobloom@gmail.com' })

  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return json(res, 400, { error: 'unesi ispravnu e-mail adresu' })

  try {
    // Two limits: per address so nobody can be mail-bombed through this form,
    // and per connection so it cannot be used to probe addresses in bulk.
    for (const [key, max, window] of [
      [`mylink:e:${email}`, 5, 3600],
      [`mylink:ip:${clientIp(req)}`, 20, 3600],
    ]) {
      const n = await redis.incr(key)
      if (n === 1) await redis.expire(key, window)
      if (n > max) return json(res, 429, { error: 'previše zahtjeva — pokušaj kasnije' })
    }

    const tokens = (await redis.smembers(emailKey(email))) || []
    if (!tokens.length) return json(res, 200, SAME_ANSWER)   // same answer either way

    const site = process.env.SITE_URL || 'https://bloompilates.studio'
    const rows = []
    for (const token of tokens) {
      const row = await redis.hgetall(clientKey(token))
      if (!row || !Object.keys(row).length) continue
      const booked = (() => { try { return JSON.parse(row.booked || '[]') } catch { return [] } })()
      const left = Math.max(0, Number(row.total || 0) - booked.length)
      rows.push({
        pack: row.pack, left, total: Number(row.total || 0),
        expires: row.expires ? new Date(row.expires).toLocaleDateString('hr-HR') : '',
        link: `${site}/rezervacija.html?k=${token}`,
        name: row.name,
      })
    }
    if (!rows.length) return json(res, 200, SAME_ANSWER)

    await sendMail({
      to: email,
      subject: 'Tvoj link za rezervacije',
      html: wrap(`
        <p>Bok ${rows[0].name || ''},</p>
        <p>Evo linka po kojem vidiš i mijenjaš svoje termine:</p>
        ${rows.map(r => `
          <p style="margin:18px 0"><strong>${r.pack}</strong><br />
             preostalo ${r.left} od ${r.total}${r.expires ? ` &middot; vrijedi do ${r.expires}` : ''}<br />
             <a href="${r.link}" style="background:#484A2C;color:#fff;padding:10px 20px;border-radius:100px;text-decoration:none;display:inline-block;margin-top:8px">Moje rezervacije</a></p>`).join('')}
        <p style="font-size:13px;color:#7A6558">Ako nisi ti zatražila ovaj e-mail, slobodno ga ignoriraj — nitko ne može vidjeti tvoje termine bez ovog linka.</p>`),
    })

    return json(res, 200, SAME_ANSWER)
  } catch (err) {
    console.error('my-link failed', err)
    return json(res, 500, { error: 'nije moguće poslati link' })
  }
}
