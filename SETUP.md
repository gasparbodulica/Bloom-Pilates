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

**In the repo:** paste the four live Payment Link URLs into the `checkout`
field of each row in `src/data/pricing.json`. A URL containing `test_` is test
mode and cannot take real money.

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

## Before going live

- [ ] **Delete `api/seed.js`** — it grants a package to anyone who calls it. It is
      inert unless `ALLOW_SEED=1`, but it should not exist in production.
- [ ] Remove the yellow DEMO bar from `rezervacija.html`
- [ ] Paste the four real Payment Links into `pricing.json`
- [ ] Have the terms reviewed — specifically the withdrawal-right clause in
      `uvjeti.html`
- [ ] Merge `checkout-draft` into `main` (this is what deploys to production)

## Still to build

- 24-hour reminder email (needs a scheduled job — Vercel Cron)
- "Resend my link" form
