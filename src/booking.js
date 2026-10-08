import './style.css'
import logoUrl from './assets/logo.jpg'
import demo from './data/booking-demo.json'

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

// Doris's availability is stored as a weekly PATTERN (weekday + time), never as
// fixed dates — so it never goes stale. Concrete dates are generated on every
// load, anchored to the week the client bought in, which is what makes their
// 5-week window roll forward on its own as real weeks pass.
const buildSlots = () => {
  const base = startOfWeek(PURCHASED_AT)
  const slots = []
  for (let w = 0; w < demo.weeks; w++) {
    for (const a of demo.availability) {
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
const TOKEN = params.get('k') || 'demo-a7f3c91e0b24'

// Purchase date anchors the whole window. ?d=YYYY-MM-DD simulates buying earlier,
// so you can see weeks fall off the top as they pass.
const PURCHASED_AT = params.get('d') ? new Date(params.get('d') + 'T12:00:00') : new Date()

const state = {
  packKey: params.get('p') || 'paket8',
  slots: buildSlots(),
  mine: [],                                    // slot ids this client booked
}

const pack = () => demo.packs[state.packKey]
const used = () => state.mine.length
const left = () => pack().sessions - used()
const expiry = () => {
  const d = startOfWeek(PURCHASED_AT)
  d.setDate(d.getDate() + demo.weeks * 7 - 1)
  return d
}
// a week is spent once its last slot is in the past
const weekIsPast = (w) => {
  const end = startOfWeek(PURCHASED_AT)
  end.setDate(end.getDate() + w * 7 + 7)
  return end < new Date()
}
const bookedInWeek = (w) =>
  state.mine.filter(id => state.slots.find(s => s.id === id)?.week === w).length

// The booking rules, in one place
const why = (slot) => {
  if (state.mine.includes(slot.id)) return { ok: false, reason: 'booked' }
  if (left() <= 0) return { ok: false, reason: 'Potrošila si sve treninge iz paketa' }
  if (slot.date < new Date()) return { ok: false, reason: 'Termin je prošao' }
  if (slot.type !== pack().type) return { ok: false, reason: `Tvoj paket vrijedi za ${pack().type} trening` }
  if (slot.taken >= slot.capacity) return { ok: false, reason: 'Termin je popunjen' }
  if (bookedInWeek(slot.week) >= pack().perWeek)
    return { ok: false, reason: `Tvoj paket dopušta ${pack().perWeek}x tjedno` }
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

  // summary
  document.getElementById('bk-pack').textContent = p.label
  document.getElementById('bk-left').textContent = `${left()} / ${p.sessions}`
  document.getElementById('bk-rule').textContent = `najviše ${p.perWeek}x tjedno`
  document.getElementById('bk-expiry').textContent =
    expiry().toLocaleDateString('hr-HR', { day: 'numeric', month: 'long', year: 'numeric' })

  // weeks
  const wrap = document.getElementById('bk-weeks')
  wrap.innerHTML = ''
  let shown = 0
  for (let w = 0; w < demo.weeks; w++) {
    if (weekIsPast(w)) continue              // that week is gone, drop it
    shown++
    const week = document.createElement('section')
    week.className = 'bk-week'

    const head = document.createElement('div')
    head.className = 'bk-week-head'
    const n = document.createElement('h2')
    n.textContent = `${w + 1}. tjedan od ${demo.weeks}`
    const c = document.createElement('span')
    const inWeek = bookedInWeek(w)
    c.className = 'bk-week-count' + (inWeek >= p.perWeek ? ' is-full' : '')
    c.textContent = `${inWeek} / ${p.perWeek}`
    head.append(n, c)

    const grid = document.createElement('div')
    grid.className = 'bk-slots'

    state.slots.filter(s => s.week === w).forEach(slot => {
      const v = why(slot)
      const mine = state.mine.includes(slot.id)
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'bk-slot' + (mine ? ' is-mine' : '') + (!v.ok && !mine ? ' is-off' : '')
      btn.disabled = !v.ok && !mine

      const when = document.createElement('span')
      when.className = 'bk-when'
      when.textContent = `${fmtDate(slot.date)} ${fmtTime(slot.date)}`

      const meta = document.createElement('span')
      meta.className = 'bk-meta'
      meta.textContent = mine
        ? 'rezervirano ✓'
        : slot.type === 'individualni'
          ? (slot.taken >= slot.capacity ? 'zauzeto' : '1:1 slobodno')
          : `${slot.capacity - slot.taken} od ${slot.capacity} mjesta`

      btn.append(when, meta)
      if (!v.ok && !mine && v.reason !== 'booked') btn.title = v.reason
      btn.addEventListener('click', () => {
        if (mine) {                            // cancel
          state.mine = state.mine.filter(id => id !== slot.id)
          slot.taken--
          slot.people = slot.people.filter(n => !n.startsWith('Ti —'))
        } else {
          if (!why(slot).ok) return
          state.mine.push(slot.id)
          slot.taken++
          slot.people.push(`Ti — ${pack().label}`)
        }
        render()
      })
      grid.appendChild(btn)
    })

    week.append(head, grid)
    wrap.appendChild(week)
  }

  document.getElementById('bk-weeks-left').textContent =
    shown === 0 ? 'paket je istekao' : `prikazano ${shown} od ${demo.weeks} tjedana`

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

// demo controls
document.getElementById('bk-pack-select').addEventListener('change', (e) => {
  state.packKey = e.target.value
  state.slots = buildSlots()
  state.mine = []
  render()
})
document.getElementById('bk-reset').addEventListener('click', () => {
  state.slots = buildSlots()
  state.mine = []
  render()
})

render()
