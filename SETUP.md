# Bloom Pilates — connecting the booking system

Everything is built. Each service below is **optional and independent**: if its
variables are missing, that feature is skipped and booking still works. So you
can connect them one at a time and test as you go.

All variables go in **Vercel → Project → Settings → Environment Variables**
(Production + Preview). Nothing goes in the repo.

---

## 1. Redis — done

Provisioned via Vercel Storage. It injects `KV_REST_API_URL` and
`KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_*`) automatically.

This alone makes bookings shared across every device.

---

## 2. Stripe

**In Stripe** (see the walkthrough in chat for account setup):

1. Create four Products, named **exactly** as on the cjenik — the webhook matches
   on the product name:
   - `Paket 4 treninga (1x tjedno)` — 75 EUR
   - `Paket 8 treninga (2x tjedno)` — 130 EUR
   - `Paket 12 treninga (3x tjedno)` — 170 EUR
   - `Pojedinačni 1:1 trening` — 40 EUR
2. One Payment Link each. Turn on **Collect customers' names** (off by default),
   add a **phone** custom field, and under "After payment" choose
   **Don't show confirmation page → redirect** to exactly:

   ```
   https://bloompilates.studio/rezervacija.html?s={CHECKOUT_SESSION_ID}
   ```

   **The `?s={CHECKOUT_SESSION_ID}` part is not optional.** Stripe replaces it
   with the real session id, and the site trades that for the buyer's own
   booking link, so she can pick her dates on the spot instead of waiting for
   the email. Without it everyone lands with no identity at all and the page can
   only tell them to go find their email.
3. **Developers → Webhooks → Add endpoint**
   - URL: `https://bloompilates.studio/api/stripe-webhook`
   - Event: `checkout.session.completed`

   The webhook and the redirect race each other, and whichever wins creates the
   package — `api/_grant.js` is keyed on the Stripe session id, so one payment
   can never grant two packages. The webhook still matters: it is what grants the
   package if the buyer closes the tab before being redirected back.

**Variables**

| name | where from |
|---|---|
| `STRIPE_SECRET_KEY` | Developers → API keys → Secret key (`sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | the webhook's signing secret (`whsec_…`) |
| `SITE_URL` | `https://bloompilates.studio` |

**In the repo:** the four Payment Link URLs live in `api/_packs.js`, not in
`pricing.json` — the checkout URL is built server-side, after the places are
held, so that the hold id can be attached to it. A URL containing `test_` is
test mode and cannot take real money.

### The order of the flow

Dates come before money:

1. The cjenik button leads to `/rezervacija.html?p=<paket>` — no payment yet.
2. She picks her dates. Nothing is reserved while she does; the picks are
   staged in her browser.
3. "Nastavi na plaćanje" calls `/api/hold`, which reserves the places for
   **30 minutes** (`HOLD_MINUTES` in `api/_slots.js`) and sends her to Stripe
   with `?client_reference_id=<hold id>` appended.
4. The webhook reads `client_reference_id`, converts the hold into real
   bookings, and writes them to the calendar and the Sheet.

A hold expires by itself, so an abandoned checkout frees the places again. The
expiry is stored inside the slot value and checked on every read, so a stale
hold is never counted as occupied even before anything sweeps it.

**If a hold expires before the payment lands** — she took longer than 30
minutes at the checkout — the package is still granted in full and the email
tells her to pick her dates again. The money is never taken without the
sessions being granted.

---

## 3. Google Calendar + Sheets

1. [console.cloud.google.com](https://console.cloud.google.com) → new project
2. **APIs & Services → Enable APIs** → enable **Google Calendar API** and
   **Google Sheets API**
3. **Credentials → Create credentials → Service account** → create a **JSON key**
4. Open the JSON: `client_email` and `private_key` are the two values you need
5. **Share with the service account email**, exactly as you'd share with a person:
   - the Google Calendar she wants bookings in → permission **"Make changes to events"**
   - a Google Sheet with two tabs named **`Polaznice`** and **`Rezervacije`** → **Editor**

**Variables**

| name | value |
|---|---|
| `GOOGLE_SA_EMAIL` | `client_email` from the JSON |
| `GOOGLE_SA_KEY` | `private_key` from the JSON, newlines as `\n` |
| `GOOGLE_CALENDAR_ID` | Calendar settings → Integrate calendar → Calendar ID |
| `GOOGLE_SHEET_ID` | the long id in the sheet's URL |

What gets written:
- **Calendar** — one event per slot, titled `Grupni trening — 2/3`, with every
  attendee's name and pack in the description. Re-booking updates the same event;
  the last cancellation deletes it.
- **`Polaznice`** — one row per purchase: date, name, email, phone, pack, sessions,
  expiry, amount, paid, booking link.
- **`Rezervacije`** — one row per booking or cancellation.

---

## 4. Email (Resend)

1. [resend.com](https://resend.com) → add domain `bloompilates.studio` → add the
   DNS records it shows to **Porkbun**
2. Create an API key

**This does not depend on the stalled Zoho mailbox work** — Resend only proves
the domain for *sending*.

| name | value |
|---|---|
| `RESEND_API_KEY` | from Resend |
| `MAIL_FROM` | `Bloom Pilates <rezervacije@bloompilates.studio>` |

Sends: the purchase email with the personal booking link, and a confirmation per
booking.

---

## Done (live since 2026-10-09)

- [x] `api/seed.js` deleted
- [x] DEMO bar removed from `rezervacija.html`
- [x] The four live Payment Links wired in — they live in `api/_packs.js`, not
      `pricing.json`, because the checkout URL is assembled after the hold
- [x] Merged to `main`, which deploys
- [x] Redis connected and verified: a hold made in one request is visible as
      taken to another, capacity holds at 3 for group and 1 for one-to-one
- [x] Stripe live keys and the `checkout.session.completed` webhook in Vercel

## Still needed

- [ ] **`RESEND_API_KEY` and `MAIL_FROM` — treat as blocking a real sale.**
      Two things depend on it and nothing else does: the confirmation email
      after payment, and `/api/my-link`, which is how someone on a new phone
      gets her link back. Until the key is set, the recovery form says plainly
      that email is not configured yet; it starts working with no code change.
      The site deliberately has no way to *show* bookings for a typed-in
      address — typing an address is not proof of owning it — so the mailbox is
      the only route in from an unknown device.
- [ ] `GOOGLE_SA_EMAIL`, `GOOGLE_SA_KEY`, `GOOGLE_CALENDAR_ID`, `GOOGLE_SHEET_ID`,
      and Doris sharing the calendar ("Make changes to events") and a sheet with
      tabs `Polaznice` and `Rezervacije` (Editor) with the service account
- [ ] Legal review of the terms, in particular the withdrawal-right clause in
      `uvjeti.html`. The site is live without it; the owner accepted that.

## Still to build

- A reminder email before each session (needs a scheduled job — Vercel Cron).
  Her terms count a missed session as used, so it matters.
- A "resend my link" form, for when someone loses the email.
- A staff page for walk-ins. **The calendar sync is one-way:** a session Doris
  fills in by hand in Google Calendar stays bookable on the site, and a manual
  edit she makes to a site-created event is overwritten on the next booking.
  Entering walk-ins through the site instead keeps the calendar a true mirror.

## Notes from running this live

- Vercel serves **mixed old and new code** for about a minute after a push. If a
  test right after a deploy looks wrong, retry before believing it.
- Deployment Protection covers **previews only**, never production.
- Stripe is in **live mode**. A card entered on those links is really charged;
  refund from the dashboard, and the processing fee is not returned.
- Refunding in Stripe does **not** release the sessions on the site. The two are
  not connected.
