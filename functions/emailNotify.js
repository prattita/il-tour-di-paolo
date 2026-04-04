const { Resend } = require('resend')
const { logger } = require('firebase-functions')

function userWantsEmail(userSnap) {
  if (!userSnap || !userSnap.exists) return false
  const n = userSnap.get('notifications')
  return Boolean(n && n.emailEnabled === true)
}

async function getAuthEmail(admin, uid) {
  if (!uid) return null
  try {
    const u = await admin.auth().getUser(uid)
    return typeof u.email === 'string' && u.email.includes('@') ? u.email.trim() : null
  } catch (e) {
    logger.warn('getAuthEmail failed', { uid, err: String(e) })
    return null
  }
}

/**
 * @param {string | undefined} apiKey
 * @param {string} fromAddress — verified domain in production (e.g. `Name <noreply@yourdomain.com>`)
 */
async function sendResendEmail(apiKey, fromAddress, { to, subject, text, logLabel }) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 8) {
    return
  }
  if (!fromAddress || typeof fromAddress !== 'string') {
    logger.warn(`${logLabel}: skip email (invalid RESEND_FROM)`, {})
    return
  }
  if (!to) {
    logger.info(`${logLabel}: skip email (no Auth email for user)`, {})
    return
  }
  const resend = new Resend(apiKey)
  try {
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: [to],
      subject,
      text,
    })
    if (error) {
      logger.error(`${logLabel}: Resend error`, { message: error.message })
      return
    }
    logger.info(`${logLabel}: email sent`, {})
  } catch (e) {
    logger.error(`${logLabel}: email exception`, { err: String(e) })
  }
}

/**
 * If `users/{uid}.notifications.emailEnabled` and Auth has an email, send via Resend.
 */
async function maybeEmailUser(admin, db, apiKey, fromAddress, uid, { subject, text, logLabel }) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 8) {
    return
  }
  const userSnap = await db.doc(`users/${uid}`).get()
  if (!userWantsEmail(userSnap)) return
  const to = await getAuthEmail(admin, uid)
  await sendResendEmail(apiKey, fromAddress, { to, subject, text, logLabel })
}

module.exports = { maybeEmailUser, userWantsEmail, getAuthEmail, sendResendEmail }
