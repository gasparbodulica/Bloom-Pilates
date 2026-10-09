import './style.css'
import logoUrl from './assets/logo.jpg'
import pricing from './data/pricing.json'
import { currentLang, setLang, t } from './i18n.js'
import { showMyBooking } from './mybooking.js'

document.querySelectorAll('.logo-img').forEach(el => { el.src = logoUrl })

const grid = document.getElementById('package-grid')
const isEn = () => currentLang === 'en'

const money = (v) => new Intl.NumberFormat(isEn() ? 'en-GB' : 'hr-HR', {
  style: 'currency', currency: pricing.currency, maximumFractionDigits: 0,
}).format(v)

const render = () => {
  const buyable = pricing.groups
    .flatMap(g => g.rows.map(r => ({ ...r, group: isEn() ? g.title_en : g.title })))
    .filter(r => r.price > 0)

  grid.innerHTML = ''
  buyable.forEach(row => {
    const card = document.createElement('article')
    card.className = 'package-card'

    const group = document.createElement('span')
    group.className = 'package-group'
    group.textContent = row.group

    const name = document.createElement('h2')
    name.textContent = isEn() ? row.service_en : row.service

    const price = document.createElement('div')
    price.className = 'package-price'
    price.textContent = money(row.price)

    const cta = document.createElement('a')
    cta.className = 'package-cta'
    if (row.pack) {
      // Dates come before money: this leads to the calendar, which holds the
      // places and only then sends her to Stripe. The href is attached once
      // the cancellation policy is accepted.
      cta.dataset.href = `/rezervacija.html?p=${row.pack}`
      cta.setAttribute('aria-disabled', 'true')
      cta.textContent = t('packages.consentFirst')
    } else {
      cta.setAttribute('aria-disabled', 'true')
      cta.textContent = t('packages.soon')
    }

    card.append(group, name, price, cta)
    grid.appendChild(card)
  })
}

// Choosing dates is gated on accepting the 12-hour cancellation policy, since
// that is the moment places start being held.
const consent = document.getElementById('consent')

const applyConsent = () => {
  const ok = consent.checked
  document.querySelectorAll('.package-cta').forEach(a => {
    if (a.dataset.href) {                       // has a real Payment Link
      a.setAttribute('aria-disabled', String(!ok))
      if (ok) a.setAttribute('href', a.dataset.href)
      else a.removeAttribute('href')
      a.textContent = ok ? t('packages.buy') : t('packages.consentFirst')
    }
  })
  document.querySelector('.package-consent').classList.toggle('is-on', ok)
}

consent.addEventListener('change', applyConsent)

// pick up whichever language was chosen on the main site
setLang(currentLang)
render()
applyConsent()
document.addEventListener('bloom:langchange', () => { render(); applyConsent() })

// Offer the way back to one's own reservation, if this browser made one.
showMyBooking(document.getElementById('my-booking'))
