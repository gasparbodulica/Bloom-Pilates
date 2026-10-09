// Someone who has bought a package gets back to it by a personal ?k= link,
// emailed after payment. An email is the durable copy — it survives a new
// phone — but it is also easy to lose, so this remembers the link in the
// browser that made the booking and offers it again on the way back in.
//
// Deliberately not a "type your email to see your bookings" page: that would
// let anyone who knows a customer's address read her schedule. Recovery for
// someone on a new device has to go through the mailbox itself.
const KEY = 'bloom-my-booking'

export const rememberBooking = (token) => {
  try { if (token) localStorage.setItem(KEY, token) } catch {}
}

export const savedBooking = () => {
  try { return localStorage.getItem(KEY) } catch { return null }
}

export const forgetBooking = () => {
  try { localStorage.removeItem(KEY) } catch {}
}

// Always offered, so there is a way back from any device. If this browser made
// the booking it goes straight there; otherwise it lands on the page that asks
// for the address and emails the link.
export const showMyBooking = (el) => {
  if (!el) return
  const token = savedBooking()
  const a = el.querySelector('a')
  if (a && token) a.href = `/rezervacija.html?k=${encodeURIComponent(token)}`
  el.hidden = false
}
