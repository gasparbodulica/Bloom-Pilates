// Doris's weekly pattern, and the only place it is written down. The browser
// imports this module too, so the page and the server cannot disagree about
// what a real session is, when one happens, or when a package runs out.
//
// Deliberately free of imports and of anything Node-only, so bundling it into
// the client stays harmless: it is public information either way.

// A package is valid for five weeks — thirty-five days counted from and
// including the day it is paid for, which is what the cjenik and the terms say.
export const VALID_DAYS = 35
export const WEEKS = 5

// day: 1 = Monday. capacity: group sessions hold 3, one-to-one holds 1.
export const AVAILABILITY = [
  { day: 1, time: '08:15', type: 'grupni',       capacity: 3 },
  { day: 1, time: '09:15', type: 'grupni',       capacity: 3 },
  { day: 1, time: '16:00', type: 'grupni',       capacity: 3 },
  { day: 1, time: '17:00', type: 'grupni',       capacity: 3 },
  { day: 1, time: '18:00', type: 'individualni', capacity: 1 },
  { day: 2, time: '08:15', type: 'grupni',       capacity: 3 },
  { day: 2, time: '09:15', type: 'grupni',       capacity: 3 },
  { day: 2, time: '10:15', type: 'individualni', capacity: 1 },
  { day: 2, time: '17:00', type: 'grupni',       capacity: 3 },
  { day: 2, time: '18:00', type: 'grupni',       capacity: 3 },
  { day: 3, time: '08:15', type: 'grupni',       capacity: 3 },
  { day: 3, time: '09:15', type: 'grupni',       capacity: 3 },
  { day: 3, time: '17:00', type: 'grupni',       capacity: 3 },
  { day: 3, time: '18:00', type: 'individualni', capacity: 1 },
  { day: 4, time: '16:00', type: 'individualni', capacity: 1 },
  { day: 4, time: '17:00', type: 'grupni',       capacity: 3 },
  { day: 5, time: '09:15', type: 'grupni',       capacity: 3 },
  { day: 5, time: '10:15', type: 'grupni',       capacity: 3 },
  { day: 5, time: '11:15', type: 'individualni', capacity: 1 },
]

const PAD = (n) => String(n).padStart(2, '0')

// --- dates -----------------------------------------------------------------
// Everything below works in the studio's own calendar, not the viewer's. A
// session is at 08:15 in Mursko Središće whether you are looking from Zagreb
// or from London, and the slot it belongs to must be the same one either way.

// The Zagreb calendar date of an instant, as YYYY-MM-DD.
export const zagrebDay = (when) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zagreb', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(when))

export const addDays = (day, n) => {
  const [y, m, d] = day.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86400000)
  return `${t.getUTCFullYear()}-${PAD(t.getUTCMonth() + 1)}-${PAD(t.getUTCDate())}`
}

// 1 = Monday … 7 = Sunday, for a plain calendar date.
export const weekdayOf = (day) => {
  const [y, m, d] = day.split('-').map(Number)
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return wd === 0 ? 7 : wd
}

const zagrebOffsetHours = (utcMs) => {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Zagreb', timeZoneName: 'shortOffset',
  }).formatToParts(new Date(utcMs)).find(p => p.type === 'timeZoneName')?.value || 'GMT+0'
  const m = /GMT([+-]\d+(?:\.\d+)?)/.exec(name)
  return m ? Number(m[1]) : 0
}

// The exact instant of a wall-clock time in Zagreb. Croatia changes offset
// twice a year, so the offset is looked up at that moment rather than assumed,
// and looked up again in case the first guess straddled the change.
export const zagrebInstant = (day, time) => {
  const [y, mo, d] = day.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const naive = Date.UTC(y, mo - 1, d, h, mi)
  const first = naive - zagrebOffsetHours(naive) * 3600000
  const second = naive - zagrebOffsetHours(first) * 3600000
  return new Date(second)
}

// --- slot identity ---------------------------------------------------------
// The id carries the absolute date. It used to be "w<week>-d<weekday>-<time>",
// which meant the same id pointed at a different Monday for every client,
// depending on the week they happened to buy in: two people would then share
// one Redis key and one calendar entry for two different sessions.
export const slotId = (day, time) => `${day}-${time}`

const ID = /^(\d{4}-\d{2}-\d{2})-(\d{2}:\d{2})$/

export const parseSlotId = (id = '') => {
  const m = ID.exec(String(id))
  return m ? { day: m[1], time: m[2] } : null
}

// The end of the last day a package can be used. Thirty-five days inclusive of
// the purchase day, so the last one is purchase + 34. One definition, shared by
// the page, the hold and the grant, which each used to compute their own and
// could disagree by hours.
export const expiryFrom = (from) => {
  const last = addDays(zagrebDay(from), VALID_DAYS - 1)
  return new Date(zagrebInstant(addDays(last, 1), '00:00').getTime() - 1)
}

// The page sends the slot it wants; this is what decides whether such a session
// exists. Without it the server would happily hold — and later write into
// Doris's calendar — a session at three in the morning.
export const findSlot = ({ id, type, startISO } = {}) => {
  const parsed = parseSlotId(id)
  if (!parsed) return { ok: false, reason: 'neispravan termin' }

  const slot = AVAILABILITY.find(
    a => a.day === weekdayOf(parsed.day) && a.time === parsed.time)
  if (!slot) return { ok: false, reason: 'taj termin ne postoji u rasporedu' }
  if (type && type !== slot.type) return { ok: false, reason: 'neispravna vrsta treninga' }

  // The id and the datetime claimed for it have to be the same moment, or the
  // id would say one thing and the calendar entry another.
  if (startISO) {
    const expected = zagrebInstant(parsed.day, parsed.time).getTime()
    if (new Date(startISO).getTime() !== expected)
      return { ok: false, reason: 'datum ne odgovara terminu' }
  }
  return { ok: true, slot, startsAt: zagrebInstant(parsed.day, parsed.time) }
}
