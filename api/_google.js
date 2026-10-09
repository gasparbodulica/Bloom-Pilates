import { JWT } from 'google-auth-library'

// Doris shares her calendar and the sheet with the service account's email;
// no OAuth consent screen, no tokens to refresh. Every integration below is
// optional — if the env vars are missing the feature is skipped and booking
// still works, so services can be connected one at a time.
const EMAIL = process.env.GOOGLE_SA_EMAIL
const KEY   = (process.env.GOOGLE_SA_KEY || '').replace(/\\n/g, '\n')
export const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID
export const SHEET_ID    = process.env.GOOGLE_SHEET_ID

export const googleReady = () => Boolean(EMAIL && KEY)

let client
const auth = async () => {
  if (!client) {
    client = new JWT({
      email: EMAIL,
      key: KEY,
      scopes: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/spreadsheets',
      ],
    })
  }
  const { token } = await client.getAccessToken()
  return token
}

const gfetch = async (url, opts = {}) => {
  const token = await auth()
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...opts.headers },
  })
  if (!res.ok) throw new Error(`google ${res.status}: ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

// One calendar event per slot, carrying every attendee — that is what lets her
// open the calendar and see what, when and who in a single entry.
export const upsertSlotEvent = async ({ slotId, startISO, endISO, type, people, capacity }) => {
  if (!googleReady() || !CALENDAR_ID) return null
  const cal = encodeURIComponent(CALENDAR_ID)
  const base = `https://www.googleapis.com/calendar/v3/calendars/${cal}/events`

  const summary = `${type === 'individualni' ? 'Individualni' : 'Grupni'} trening — ${people.length}/${capacity}`
  const body = {
    summary,
    description: people.length
      ? people.map(p => `• ${p}`).join('\n')
      : 'Nema prijavljenih.',
    start: { dateTime: startISO, timeZone: 'Europe/Zagreb' },
    end:   { dateTime: endISO,   timeZone: 'Europe/Zagreb' },
    // deterministic id ties one slot to one event, so re-booking updates
    // the same entry instead of creating duplicates
    id: 'bloom' + slotId.replace(/[^a-z0-9]/gi, '').toLowerCase(),
  }

  if (!people.length) {
    await gfetch(`${base}/${body.id}`, { method: 'DELETE' }).catch(() => {})
    return null
  }
  try {
    return await gfetch(base, { method: 'POST', body: JSON.stringify(body) })
  } catch (err) {
    if (String(err).includes('409')) {                   // already exists → update
      return gfetch(`${base}/${body.id}`, { method: 'PUT', body: JSON.stringify(body) })
    }
    throw err
  }
}

export const appendSheetRow = async (tab, values) => {
  if (!googleReady() || !SHEET_ID) return null
  const range = encodeURIComponent(`${tab}!A:Z`)
  return gfetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: [values] }) },
  )
}
