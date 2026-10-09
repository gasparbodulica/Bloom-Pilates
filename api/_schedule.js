// Doris's weekly pattern, and the only place it is written down. The browser
// imports this module too, so the page and the server cannot disagree about
// what a real session is.
//
// Deliberately free of imports and of anything Node-only, so bundling it into
// the client stays harmless: it is public information either way, since the
// schedule is on the page.
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

const ID = /^w(\d+)-d([1-7])-(\d{2}:\d{2})$/

export const parseSlotId = (id = '') => {
  const m = ID.exec(String(id))
  if (!m) return null
  return { week: Number(m[1]), day: Number(m[2]), time: m[3] }
}

// What the studio's clock says, not the server's — the slots are local times
// and Croatia changes offset twice a year.
const localParts = (iso) => {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zagreb', weekday: 'short',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const get = (t) => f.find(p => p.type === t)?.value
  const DAYS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return { day: DAYS[get('weekday')], time: `${get('hour')}:${get('minute')}` }
}

// The page sends the slot it wants; this is what decides whether such a session
// exists. Without it the server would happily hold — and later write into
// Doris's calendar — a session at three in the morning.
export const findSlot = ({ id, type, startISO } = {}) => {
  const parsed = parseSlotId(id)
  if (!parsed) return { ok: false, reason: 'neispravan termin' }
  if (parsed.week < 0 || parsed.week >= WEEKS) return { ok: false, reason: 'termin je izvan razdoblja paketa' }

  const slot = AVAILABILITY.find(a => a.day === parsed.day && a.time === parsed.time)
  if (!slot) return { ok: false, reason: 'taj termin ne postoji u rasporedu' }
  if (type && type !== slot.type) return { ok: false, reason: 'neispravna vrsta treninga' }

  // The id and the actual datetime have to agree, or the id would say one thing
  // and the calendar entry another.
  if (startISO) {
    const when = localParts(startISO)
    if (when.day !== slot.day || when.time !== slot.time)
      return { ok: false, reason: 'datum ne odgovara terminu' }
  }
  return { ok: true, slot }
}
