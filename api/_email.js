import { Resend } from 'resend'

// Optional, like the Google pieces: no key, no email, booking still works.
const KEY  = process.env.RESEND_API_KEY
const FROM = process.env.MAIL_FROM || 'Bloom Pilates <rezervacije@bloompilates.studio>'

export const mailReady = () => Boolean(KEY)

export const sendMail = async ({ to, subject, html }) => {
  if (!mailReady()) return null
  try {
    return await new Resend(KEY).emails.send({ from: FROM, to, subject, html })
  } catch (err) {
    // never fail a booking because an email bounced
    console.error('email failed', err)
    return null
  }
}

export const wrap = (body) => `
<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#5A3B2E;line-height:1.7">
  <h1 style="font-family:Georgia,serif;font-weight:500;font-size:24px;color:#5A3B2E">Bloom Pilates Studio</h1>
  ${body}
  <hr style="border:none;border-top:1px solid #C9B79F;margin:28px 0" />
  <p style="font-size:12px;color:#7A6558">
    Bloom Pilates Studio, obrt za usluge · vl. Doris Petković<br />
    Istarsko naselje 3A, 40315 Mursko Središće · OIB 66400993596
  </p>
</div>`
