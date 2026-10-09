import './style.css'
import logoUrl from './assets/logo.jpg'
import demo from './data/booking-demo.json'
// The same module the server validates against, so the page cannot offer a
// session the server will refuse.
import { AVAILABILITY, MAX_WEEKS, expiryFrom } from '../api/_schedule.js'

document.querySelectorAll('.logo-img').forEach(el => { el.src = logoUrl })

// ---------------------------------------------------------------------------
// DRAFT. Availability and the client's entitlement are mocked here. In the real
// version both arrive from /api: availability read from Doris's Google Calendar,
// the entitlement from the Sheet row Stripe's webhook created. The rule logic
// below is the real logic and does not change.
// ---------------------------------------------------------------------------

const DAYS = ['nedjelja', 'ponedjeljak', 'utorak', 'srijeda', 'četvrtak', 'petak', 'subota']
const DAYS_SHORT = ['ned', 'pon', 'uto', 'sri', 'čet', 'pet', 'sub']

const startOfWeek = (d) => {
  const x = new Date(d)
  const shift = (x.getDay() + 6) % 7          // Monday = 0
  x.setDate(x.getDate() - shift)
  x.setHours(0, 0, 0, 0)
  return x
}

// What the server knows about this client, kept outside `state` because the
// window has to be computed while `state` itself is still being built.
let serverClient = null

// The last day the package can be used. The server's value wins once known,
// because that is the one it enforces.
const expiryDate = () =>
  serverClient?.expires ? new Date(serverClient.expires) : expiryFrom(PURCHASED_AT)

// However many calendar weeks those 35 days touch — five if bought on a
// Monday, six otherwise. Showing a fixed five cut days off the end of the
// package that the client had paid for.
const weekCount = () => {
  const span = expiryDate() - startOfWeek(PURCHASED_AT)
  return Math.min(MAX_WEEKS, Math.max(1, Math.ceil(span / (7 * 86400000))))
}

// Doris's availability is stored as a weekly PATTERN (weekday + time), never as
// fixed dates — so it never goes stale. Concrete dates are generated on every
// load, anchored to the week the client bought in, which is what makes their
// 5-week window roll forward on its own as real weeks pass.
const buildSlots = () => {
  const base = startOfWeek(PURCHASED_AT)
  const slots = []
  for (let w = 0; w < weekCount(); w++) {
    for (const a of AVAILABILITY) {
      const date = new Date(base)
      date.setDate(base.getDate() + w * 7 + (a.day - 1))
      const [h, m] = a.time.split(':').map(Number)
      date.setHours(h, m, 0, 0)
      const pre = demo.preBooked.find(p => p.week === w && p.day === a.day && p.time === a.time)
      slots.push({
        id: `w${w}-d${a.day}-${a.time}`,
        week: w, date, type: a.type,
        capacity: a.capacity,
        taken: pre ? pre.count : 0,
        people: pre ? [...pre.people] : [],
      })
    }
  }
  return slots
}

// The token identifies the buyer. Stripe's webhook creates the row and emails
// this link; the server reads sessions used and weekly counts from that row, so
// the limits cannot be bypassed by clearing the browser.
const params = new URLSearchParams(location.search)

// The browser fallback and the demo identity exist so the draft is usable under
// `vite dev`, where no serverless function runs. Neither may apply in
// production: a booking the server never saw would leave someone turning up
// without a place, and a shared demo token would put every buyer on the same
// entitlement.
const IS_DEV = ['localhost', '127.0.0.1', '::1'].includes(location.hostname)

// Resolved before anything renders: ?k= is the personal link from the email,
// ?s= is the Stripe session the buyer is redirected back with.
let TOKEN = params.get('k') || (IS_DEV ? 'demo-a7f3c91e0b24' : null)

// Two ways to be on this page. Before paying, arriving from the cjenik with
// ?p=<paket>, the picks are staged in the browser and only become real places
// when /api/hold reserves them on the way to the checkout. After paying, with
// ?k= or ?s=, every click is written straight through to the server.
const PREPAY = Boolean(params.get('p')) && !params.get('k') && !params.get('s')

// Purchase date anchors the whole window, and the server's value wins once we
// have it — otherwise someone opening their link in week three would see five
// fresh weeks while the server still expires them 35 days after paying.
// ?d=YYYY-MM-DD simulates buying earlier, so you can watch weeks fall off.
let PURCHASED_AT = params.get('d') ? new Date(params.get('d') + 'T12:00:00') : new Date()

// Storage. The server is the source of truth — that is what makes a place taken
// by one person show as taken on every other device. localStorage is only a
// fallback for running the draft under `vite dev`, where /api is not served; the
// page says so out loud rather than pretending the state is shared.
const STORE = () => PREPAY ? `bloom-prepay-${state.packKey}` : `bloom-booking-${TOKEN}`
const load = () => {
  try { return JSON.parse(localStorage.getItem(STORE())) || [] } catch { return [] }
}
const save = () => {
  try { localStorage.setItem(STORE(), JSON.stringify(state.mine)) } catch {}
}

const state = {
  packKey: params.get('p') || 'paket8',
  slots: buildSlots(),
  mine: [],                                    // slot ids this client booked
}

// replay what this client already booked onto the freshly generated slots
const restore = () => {
  state.mine = load().filter(id => state.slots.some(s => s.id === id))
  if (PREPAY) {                                 // nothing is reserved yet
    state.mine = state.mine.slice(0, demo.packs[state.packKey].sessions)
    return
  }
  state.mine.forEach(id => {
    const slot = state.slots.find(s => s.id === id)
    if (slot && !slot.people.some(n => n.startsWith('Ti —'))) {
      slot.taken++
      slot.people.push(`Ti — ${demo.packs[state.packKey].label}`)
    }
  })
}

const pack = () => demo.packs[state.packKey]
const used = () => state.mine.length
const left = () => pack().sessions - used()
const expiry = expiryDate
// a week is spent once its last slot is in the past
const weekIsPast = (w) => {
  const end = startOfWeek(PURCHASED_AT)
  end.setDate(end.getDate() + w * 7 + 7)
  return end < new Date()
}
// Shown per week for orientation only. There is deliberately no weekly cap:
// a client spends their sessions however they like — four in one week if they
// want. The "(1x tjedno)" in a package name is a suggested rhythm, not a limit.
const bookedInWeek = (w) =>
  state.mine.filter(id => state.slots.find(s => s.id === id)?.week === w).length

// The booking rules, in one place
const why = (slot) => {
  if (state.mine.includes(slot.id)) return { ok: false, reason: 'booked' }
  if (left() <= 0) return { ok: false, reason: 'Potrošila si sve treninge iz paketa' }
  if (slot.date < new Date()) return { ok: false, reason: 'Termin je prošao' }
  // still checked here because the server must re-check it; the UI already filters
  if (slot.type !== pack().type) return { ok: false, reason: `Tvoj paket vrijedi za ${pack().type} trening` }
  if (slot.taken >= slot.capacity) return { ok: false, reason: 'Termin je popunjen' }
  if (slot.date > expiryDate()) return { ok: false, reason: 'Termin je nakon isteka paketa' }
  return { ok: true }
}

const fmtDate = (d) =>
  `${DAYS_SHORT[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`
const fmtTime = (d) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

const render = () => {
  const p = pack()

  document.getElementById('bk-token').textContent = TOKEN
  document.getElementById('bk-link').textContent =
    `bloompilates.studio/rezervacija.html?k=${TOKEN}`

  const done = left() <= 0
  document.getElementById('bk-done').hidden = !done
  if (PREPAY) {
    // "you have used up your package" is meaningless before she has bought one
    document.getElementById('bk-done').hidden = true
    payCount.textContent = `${used()} / ${p.sessions}`
    payBtn.disabled = used() === 0
  }

  // summary
  document.getElementById('bk-pack').textContent = p.label
  document.getElementById('bk-left').textContent = `${left()} / ${p.sessions}`
  document.getElementById('bk-rule').textContent = 'slobodno, bez tjednog ograničenja'
  document.getElementById('bk-caltype').textContent =
    p.type === 'grupni' ? 'Raspored grupnih treninga' : 'Raspored individualnih treninga'
  document.getElementById('bk-expiry').textContent =
    expiry().toLocaleDateString('hr-HR', { day: 'numeric', month: 'long', year: 'numeric' })

  // weeks
  const wrap = document.getElementById('bk-weeks')
  wrap.innerHTML = ''
  let shown = 0
  for (let w = 0; w < weekCount(); w++) {
    if (weekIsPast(w)) continue              // that week is gone, drop it
    shown++
    const week = document.createElement('section')
    week.className = 'bk-week'

    const head = document.createElement('div')
    head.className = 'bk-week-head'
    const n = document.createElement('h2')
    n.textContent = `${w + 1}. tjedan od ${weekCount()}`
    const c = document.createElement('span')
    const inWeek = bookedInWeek(w)
    c.className = 'bk-week-count'
    c.textContent = inWeek === 0
      ? ''
      : inWeek === 1 ? '1 termin' : `${inWeek} termina`
    head.append(n, c)

    const grid = document.createElement('div')
    grid.className = 'bk-slots'

    state.slots
      .filter(s => s.week === w && s.type === p.type)   // their pack's calendar only
      .forEach(slot => {
      const v = why(slot)
      const mine = state.mine.includes(slot.id)
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'bk-slot' + (mine ? ' is-mine' : '') + (!v.ok && !mine ? ' is-off' : '')
      btn.disabled = !v.ok && !mine

      const when = document.createElement('span')
      when.className = 'bk-when'
      when.textContent = `${fmtDate(slot.date)} ${fmtTime(slot.date)}`

      // "2 od 3 mjesta slobodna" reads unambiguously; a bare "2 od 3" was being
      // taken to mean places already filled. The adjective follows Croatian
      // agreement — one mjesto is slobodno, two or three are slobodna.
      const freeLabel = (free, cap) =>
        free === 0 ? 'popunjeno'
                   : `${free} od ${cap} mjesta ${free === 1 ? 'slobodno' : 'slobodna'}`

      const meta = document.createElement('span')
      meta.className = 'bk-meta'
      meta.textContent = mine
        ? (PREPAY ? 'odabrano ✓' : 'rezervirano ✓')
        : slot.type === 'individualni'
          ? (slot.taken >= slot.capacity ? 'popunjeno' : '1:1 slobodno')
          : freeLabel(slot.capacity - slot.taken, slot.capacity)

      btn.append(when, meta)
      if (!v.ok && !mine && v.reason !== 'booked') btn.title = v.reason
      btn.addEventListener('click', async () => {
        const action = mine ? 'cancel' : 'book'
        if (!mine && !why(slot).ok) return

        // Before payment nothing is reserved yet — the places are held in one
        // go by /api/hold when she continues to the checkout.
        if (PREPAY) {
          state.mine = mine
            ? state.mine.filter(id => id !== slot.id)
            : [...state.mine, slot.id]
          save()
          render()
          return
        }

        if (online) {
          btn.disabled = true
          try {
            await pushToServer(slot, action)
            await pullFromServer()              // re-read, never assume
          } catch (err) {
            alert(err.message)                  // e.g. "termin je upravo popunjen"
            await pullFromServer().catch(() => {})
          }
          render()
          return
        }

        if (mine) {
          state.mine = state.mine.filter(id => id !== slot.id)
          slot.taken--
          slot.people = slot.people.filter(n => !n.startsWith('Ti —'))
        } else {
          state.mine.push(slot.id)
          slot.taken++
          slot.people.push(`Ti — ${pack().label}`)
        }
        save()
        render()
      })
      grid.appendChild(btn)
    })

    week.append(head, grid)
    wrap.appendChild(week)
  }

  document.getElementById('bk-weeks-left').textContent =
    shown === 0 ? 'paket je istekao' : `prikazano ${shown} od ${weekCount()} tjedana`

  // my bookings
  const list = document.getElementById('bk-mine')
  list.innerHTML = ''
  const mineSlots = state.mine
    .map(id => state.slots.find(s => s.id === id))
    .sort((a, b) => a.date - b.date)
  if (!mineSlots.length) {
    const li = document.createElement('li')
    li.className = 'bk-empty'
    li.textContent = 'Još nemaš rezerviranih termina.'
    list.appendChild(li)
  }
  mineSlots.forEach(s => {
    const li = document.createElement('li')
    li.textContent = `${DAYS[s.date.getDay()]} ${s.date.getDate()}.${s.date.getMonth() + 1}. u ${fmtTime(s.date)} — ${s.type}`
    list.appendChild(li)
  })
  document.getElementById('bk-sync').hidden = mineSlots.length === 0

  // --- what lands in Doris's Google Calendar ---
  const cal = document.getElementById('bk-calendar')
  cal.innerHTML = ''
  const booked = state.slots
    .filter(s => s.people.length > 0 && s.date >= new Date())
    .sort((a, b) => a.date - b.date)
    .slice(0, 6)

  booked.forEach(s => {
    const ev = document.createElement('article')
    ev.className = 'bk-event' + (s.taken >= s.capacity ? ' is-full' : '')

    const title = document.createElement('h3')
    title.textContent = s.type === 'individualni'
      ? `Individualni trening — ${s.taken}/${s.capacity}`
      : `Grupni trening — ${s.taken}/${s.capacity}`

    const when = document.createElement('p')
    when.className = 'bk-event-when'
    const end = new Date(s.date.getTime() + 60 * 60 * 1000)
    when.textContent = `${DAYS[s.date.getDay()]} ${s.date.getDate()}.${s.date.getMonth() + 1}.${s.date.getFullYear()}. · ${fmtTime(s.date)}–${fmtTime(end)}`

    const who = document.createElement('ul')
    who.className = 'bk-event-who'
    s.people.forEach(n => {
      const li = document.createElement('li')
      li.textContent = n
      if (n.startsWith('Ti —')) li.className = 'is-me'
      who.appendChild(li)
    })

    ev.append(title, when, who)
    cal.appendChild(ev)
  })

  document.getElementById('bk-cal-empty').hidden = booked.length > 0
}

// Demo controls. Removed from the live page, kept working here so the draft
// can still be driven by hand if the markup is put back for testing.
const packSelect = document.getElementById('bk-pack-select')
packSelect?.addEventListener('change', (e) => {
  state.packKey = e.target.value
  state.slots = buildSlots()
  state.mine = []
  save()
  render()
})
document.getElementById('bk-reset')?.addEventListener('click', () => {
  state.slots = buildSlots()
  state.mine = []
  save()
  render()
})

// --- server-backed state -------------------------------------------------
let online = false

const api = async (path, opts) => {
  const res = await fetch(path, opts)
  if (!res.ok) {
    // Fall back to our own words, never to res.statusText — a deploy in
    // progress answers 404, and "Not Found" is not a message for someone
    // trying to book a pilates class.
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Nešto nije u redu. Osvježi stranicu i pokušaj ponovno.')
  }
  return res.json()
}

const pullFromServer = async () => {
  const ids = state.slots.map(s => s.id).join(',')
  const data = await api(`/api/bookings?k=${encodeURIComponent(TOKEN || '')}&ids=${encodeURIComponent(ids)}`)
  state.slots.forEach(slot => {
    const row = data.slots[slot.id]
    if (!row) return
    slot.taken = row.taken
    slot.people = row.people
  })
  // Before payment the server has no idea who she is, so her staged picks
  // live only here and must not be wiped by what it reports.
  if (!PREPAY) state.mine = state.slots.filter(s => data.slots[s.id]?.mine).map(s => s.id)
  if (data.client) {
    state.serverClient = data.client
    serverClient = data.client
    const match = Object.entries(demo.packs).find(([, v]) => v.label === data.client.pack)
    if (match) state.packKey = match[0]
  }
}

const pushToServer = async (slot, action) =>
  api('/api/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: TOKEN, slotId: slot.id, slotType: slot.type,
      weekIndex: slot.week, action,
      startISO: slot.date.toISOString(),
      endISO: new Date(slot.date.getTime() + 60 * 60 * 1000).toISOString(),
    }),
  })

const setMode = () => {
  const el = document.getElementById('bk-mode')
  if (online) {
    el.textContent = 'Povezano sa zajedničkom pohranom — isti termini na svim uređajima.'
    el.className = 'bk-mode is-online'
  } else if (IS_DEV) {
    el.textContent = 'Lokalni demo — /api ne radi pod `vite dev`, pa se termini pamte samo u ovom pregledniku.'
    el.className = 'bk-mode is-local'
  } else {
    el.textContent = 'Rezervacije trenutno nisu dostupne. Pokušaj za koji trenutak ili nam piši na pilatesstudiobloom@gmail.com.'
    el.className = 'bk-mode is-down'
  }
}

if (packSelect) packSelect.value = state.packKey

const payBar    = document.getElementById('bk-pay')
const payBtn    = document.getElementById('bk-pay-btn')
const payCount  = document.getElementById('bk-pay-count')
const payStatus = document.getElementById('bk-pay-status')

// Hold the places, then hand her to Stripe. The hold id travels on the
// checkout URL as client_reference_id, which is how the payment finds its way
// back to these exact places.
const payNow = async () => {
  payBtn.disabled = true
  payStatus.textContent = 'Rezerviram mjesta…'
  const slots = state.mine.map(id => state.slots.find(s => s.id === id)).filter(Boolean)
  try {
    const { checkout } = await api('/api/hold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pack: state.packKey,
        slots: slots.map(s => ({
          id: s.id, type: s.type, week: s.week,
          startISO: s.date.toISOString(),
          endISO: new Date(s.date.getTime() + 60 * 60 * 1000).toISOString(),
        })),
      }),
    })
    try { localStorage.removeItem(STORE()) } catch {}
    location.href = checkout
  } catch (err) {
    payStatus.textContent = err.message || 'Nije moguće rezervirati termine.'
    payBtn.disabled = false
    // A place may have gone while she was choosing; show the truth and drop
    // anything she can no longer have.
    await pullFromServer().catch(() => {})
    state.mine = state.mine.filter(id => {
      const s = state.slots.find(x => x.id === id)
      return s && s.taken < s.capacity
    })
    save()
    render()
  }
}
payBtn?.addEventListener('click', payNow)

const applyPrepayChrome = () => {
  if (!PREPAY) return
  document.querySelector('.bk-identity').hidden = true
  const h1 = document.querySelector('.bk-head h1')
  const lead = document.querySelector('.bk-head p')
  if (h1) h1.textContent = 'Odaberi svoje termine'
  if (lead) lead.textContent =
    'Prvo odaberi termine koji ti odgovaraju, a zatim nastavi na plaćanje. Mjesta se drže 30 minuta dok ne dovršiš uplatu.'
  payBar.hidden = false
}

const hideBooking = () => {
  document.querySelector('.bk-layout').hidden = true
  document.querySelector('.bk-summary').hidden = true
  document.querySelector('.bk-caltype').hidden = true
  document.querySelector('.bk-identity').hidden = true
}

// Stripe sends the buyer back with ?s=<session>. Trading it for their own token
// here is what lets them pick dates immediately after paying, rather than
// waiting on the email.
const claimFromStripe = async () => {
  const sid = params.get('s')
  if (!sid) return
  const note = document.getElementById('bk-mode')
  note.textContent = 'Potvrđujemo uplatu…'
  note.className = 'bk-mode'
  const { k } = await api(`/api/claim?s=${encodeURIComponent(sid)}`)
  TOKEN = k
  // Replace the session id with the personal link, so a reload or a bookmark
  // keeps working and the receipt id stays out of the address bar.
  history.replaceState({}, '', `/rezervacija.html?k=${k}`)
}

const start = async () => {
  if (!params.get('k') && params.get('s')) {
    try {
      await claimFromStripe()
    } catch (err) {
      hideBooking()
      const el = document.getElementById('bk-mode')
      el.textContent = err.message || 'Nije moguće potvrditi uplatu.'
      el.className = 'bk-mode is-down'
      return
    }
  }

  if (!TOKEN && !PREPAY) {                      // production, arrived with no link
    hideBooking()
    document.getElementById('bk-nolink').hidden = false
    document.getElementById('bk-mode').hidden = true
    return
  }

  try {
    await pullFromServer()
    // The purchase date the server holds beats the one we assumed, so rebuild
    // the window around it and re-read availability for the new slot ids.
    const bought = state.serverClient?.purchasedAt && new Date(state.serverClient.purchasedAt)
    if (bought && startOfWeek(bought).getTime() !== startOfWeek(PURCHASED_AT).getTime()) {
      PURCHASED_AT = bought
      state.slots = buildSlots()
      await pullFromServer()
    }
    // Staged picks live only in this browser, so they have to be read back
    // after the server read rather than instead of it — otherwise a reload
    // mid-choice silently empties the basket.
    if (PREPAY) restore()
    online = true
  } catch (err) {
    online = false
    if (IS_DEV) {
      restore()                                 // dev only: this browser's memory
    } else {
      console.error('booking API unreachable', err)
      hideBooking()
    }
  }

  applyPrepayChrome()

  // A real client has no use for the demo controls.
  const demoBar = document.querySelector('.bk-demo')
  if (state.serverClient && demoBar) demoBar.hidden = true

  setMode()
  if (online || IS_DEV) render()
}
start()

// ---------------------------------------------------------------------------
// "None of these times suit me" — goes to the same Formspree endpoint as the
// waiting list, tagged with its own subject so Doris can see which times people
// are actually asking for.
// ---------------------------------------------------------------------------
const FORMSPREE_URL = 'https://formspree.io/f/meaqrlnb'
const sForm = document.getElementById('bk-suggest-form')
const sBtn = document.getElementById('bk-suggest-btn')
const sNote = document.getElementById('bk-suggest-status')

sForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  sNote.textContent = ''
  sNote.classList.remove('is-error')
  sBtn.disabled = true
  sBtn.textContent = 'Slanje…'
  try {
    const res = await fetch(FORMSPREE_URL, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new FormData(sForm),
    })
    if (!res.ok) throw new Error(`Formspree responded ${res.status}`)
    sForm.reset()
    sBtn.textContent = 'Poslano ✓'
  } catch (err) {
    // never claim it sent when it did not
    console.error('Suggestion submit failed:', err)
    sNote.textContent = 'Slanje nije uspjelo. Pokušaj ponovno ili nam piši na pilatesstudiobloom@gmail.com.'
    sNote.classList.add('is-error')
    sBtn.disabled = false
    sBtn.textContent = 'Pošalji prijedlog'
  }
})
