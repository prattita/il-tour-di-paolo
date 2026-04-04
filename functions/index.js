const admin = require('firebase-admin')
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { defineSecret, defineString } = require('firebase-functions/params')
const { logger } = require('firebase-functions')
const { maybeEmailUser } = require('./emailNotify')

admin.initializeApp()

/** Public site origin for web push `link` (no trailing slash). */
const webAppOrigin = defineString('WEB_APP_ORIGIN', { default: '' })

/** Set via `firebase functions:secrets:set RESEND_API_KEY` before deploy. */
const resendApiKey = defineSecret('RESEND_API_KEY')

/** Verified sender in Resend (e.g. `Il Tour <notify@yourdomain.com>`). Default is Resend sandbox. */
const resendFrom = defineString('RESEND_FROM', {
  default: 'Il Tour di Paolo <onboarding@resend.dev>',
})

const REGION = 'us-central1'

const emailTriggerOpts = {
  region: REGION,
  secrets: [resendApiKey],
}

function medalLabel(medal) {
  if (!medal || typeof medal !== 'string') return ''
  const m = medal.toLowerCase()
  if (m === 'bronze' || m === 'silver' || m === 'gold') {
    return m.charAt(0).toUpperCase() + m.slice(1)
  }
  return medal
}

/** First whitespace-delimited token; matches in-app feed display name shortening. */
function firstNameFromDisplayName(raw) {
  if (typeof raw !== 'string') return 'Someone'
  const part = raw.trim().split(/\s+/)[0]
  return part || 'Someone'
}

/** Display name for emails (spec “memberName”): full trimmed string or fallback. */
function memberDisplayName(raw) {
  if (typeof raw !== 'string') return 'Someone'
  const t = raw.trim()
  return t || 'Someone'
}

function absoluteLink(path) {
  const origin = webAppOrigin.value().replace(/\/$/, '')
  if (!origin) return undefined
  const p = path.startsWith('/') ? path : `/${path}`
  return `${origin}${p}`
}

function resendContext() {
  return { key: resendApiKey.value(), from: resendFrom.value() }
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} uid
 * @returns {Promise<string | null>}
 */
async function getPushTokenForUser(db, uid) {
  if (!uid) return null
  const userSnap = await db.doc(`users/${uid}`).get()
  if (!userSnap.exists) return null
  const n = userSnap.get('notifications')
  if (!n || n.pushEnabled !== true) return null
  const token = n.pushToken
  if (typeof token !== 'string' || token.length < 80) return null
  return token
}

async function sendMulticast(tokens, payload, logLabel) {
  if (!tokens.length) return
  const { title, body, link, data = {} } = payload
  /** @type {import('firebase-admin/messaging').MulticastMessage} */
  const message = {
    tokens,
    notification: { title, body },
    data,
    webpush: {
      notification: {
        title,
        body,
        icon: '/p-icon-512.png',
      },
      ...(link ? { fcmOptions: { link } } : {}),
    },
  }
  try {
    const res = await admin.messaging().sendEachForMulticast(message)
    logger.info(`${logLabel} sent`, {
      success: res.successCount,
      failure: res.failureCount,
    })
    if (res.failureCount > 0) {
      res.responses.forEach((r, i) => {
        if (!r.success) {
          logger.warn(`${logLabel} token failed`, {
            index: i,
            code: r.error?.code,
            message: r.error?.message,
          })
        }
      })
    }
  } catch (e) {
    logger.error(`${logLabel} error`, { err: String(e) })
  }
}

/**
 * Push: task_completion feed → other members; submitter gets approval push + email.
 */
exports.onFeedTaskCompletionPush = onDocumentCreated(
  {
    document: 'groups/{groupId}/feed/{postId}',
    ...emailTriggerOpts,
  },
  async (event) => {
    const snap = event.data
    if (!snap) return

    const post = snap.data()
    if (!post || post.type !== 'task_completion') return

    const { groupId } = event.params
    const actorId = typeof post.userId === 'string' ? post.userId : ''

    const db = admin.firestore()
    const groupSnap = await db.doc(`groups/${groupId}`).get()
    if (!groupSnap.exists) return

    const memberIds = groupSnap.get('memberIds')
    if (!Array.isArray(memberIds) || memberIds.length === 0) return

    const tokens = []
    for (const uid of memberIds) {
      if (typeof uid !== 'string' || !uid) continue
      if (uid === actorId) continue

      const token = await getPushTokenForUser(db, uid)
      if (token) tokens.push(token)
    }

    const actorFirstName = firstNameFromDisplayName(post.displayName)
    const taskName =
      typeof post.taskName === 'string' && post.taskName.trim() ? post.taskName.trim() : 'Task'
    const activityName =
      typeof post.activityName === 'string' && post.activityName.trim()
        ? post.activityName.trim()
        : 'an activity'

    const medal = medalLabel(post.medal)
    const medalSuffix = medal ? ` — ${medal} medal` : ''

    const title = `${actorFirstName} completed a task`
    const body = `${taskName} in ${activityName}${medalSuffix}`
    const link = absoluteLink(`/group/${groupId}/feed`)

    await sendMulticast(tokens, {
      title,
      body,
      link,
      data: {
        groupId: String(groupId),
        kind: 'feed_task_completion',
      },
    }, 'onFeedTaskCompletionPush')

    const actorToken = await getPushTokenForUser(db, actorId)
    if (actorToken) {
      const approvedTitle = 'Submission approved 🎉'
      const approvedBody = medal
        ? `Your ${taskName} earned a ${medal} medal!`
        : `Your ${taskName} was approved!`
      await sendMulticast(
        [actorToken],
        {
          title: approvedTitle,
          body: approvedBody,
          link,
          data: {
            groupId: String(groupId),
            kind: 'submission_approved',
          },
        },
        'onSubmissionApprovedPush',
      )
    } else {
      logger.info('onSubmissionApprovedPush: no submitter token', { groupId, actorId })
    }

    const { key, from } = resendContext()
    const emailBody = [
      `Your submission for "${taskName}" in ${activityName} has been approved.`,
      medal ? `You earned a ${medal} medal!` : '',
      link ? `\nOpen the app: ${link}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    await maybeEmailUser(admin, db, key, from, actorId, {
      subject: `Your submission was approved — ${taskName} 🎉`,
      text: emailBody,
      logLabel: 'onSubmissionApprovedEmail',
    })
  },
)

/**
 * Push + email: owner rejects — `rejected: true` on pending before delete.
 */
exports.pushPendingRejectedToSubmitter = onDocumentUpdated(
  {
    document: 'groups/{groupId}/pending/{pendingId}',
    ...emailTriggerOpts,
  },
  async (event) => {
    const change = event.data
    if (!change) return
    const { before, after } = change
    if (!after.exists) return

    const beforeData = before.data() || {}
    const afterData = after.data() || {}
    if (afterData.rejected !== true) return
    if (beforeData.rejected === true) return

    const { groupId } = event.params
    const submitterId = typeof afterData.userId === 'string' ? afterData.userId : ''
    const db = admin.firestore()

    const taskName =
      typeof afterData.taskName === 'string' && afterData.taskName.trim()
        ? afterData.taskName.trim()
        : 'your task'
    const activityName =
      typeof afterData.activityName === 'string' && afterData.activityName.trim()
        ? afterData.activityName.trim()
        : 'an activity'

    const pushTitle = 'Submission needs a resubmit'
    const pushBody = `Your ${taskName} submission was not approved. Tap to resubmit.`
    const link = absoluteLink(`/group/${groupId}/activities`)

    const token = await getPushTokenForUser(db, submitterId)
    if (token) {
      await sendMulticast(
        [token],
        {
          title: pushTitle,
          body: pushBody,
          link,
          data: {
            groupId: String(groupId),
            kind: 'submission_rejected',
          },
        },
        'pushPendingRejectedToSubmitter',
      )
    } else {
      logger.info('pushPendingRejectedToSubmitter: no submitter token', { groupId, submitterId })
    }

    const { key, from } = resendContext()
    await maybeEmailUser(admin, db, key, from, submitterId, {
      subject: `Your submission needs a resubmit — ${taskName}`,
      text: [
        `Your submission for "${taskName}" in ${activityName} was not approved.`,
        'Please resubmit with a new photo.',
        link ? `\nOpen the app: ${link}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      logLabel: 'onSubmissionRejectedEmail',
    })
  },
)

/**
 * Push + email: new pending submission → owner.
 */
exports.onNewPendingSubmissionPush = onDocumentCreated(
  {
    document: 'groups/{groupId}/pending/{pendingId}',
    ...emailTriggerOpts,
  },
  async (event) => {
    const snap = event.data
    if (!snap) return
    const pending = snap.data()
    if (!pending || pending.rejected === true) return

    const { groupId } = event.params
    const db = admin.firestore()
    const groupSnap = await db.doc(`groups/${groupId}`).get()
    if (!groupSnap.exists) return

    const ownerId = groupSnap.get('ownerId')
    if (typeof ownerId !== 'string' || !ownerId) return

    const memberName = memberDisplayName(pending.displayName)
    const memberFirst = firstNameFromDisplayName(pending.displayName)
    const taskName =
      typeof pending.taskName === 'string' && pending.taskName.trim()
        ? pending.taskName.trim()
        : 'a task'
    const activityName =
      typeof pending.activityName === 'string' && pending.activityName.trim()
        ? pending.activityName.trim()
        : 'an activity'

    const pushTitle = 'New submission to review'
    const pushBody = `${memberFirst} submitted ${taskName} in ${activityName}`
    const link = absoluteLink(`/group/${groupId}/approvals`)

    const token = await getPushTokenForUser(db, ownerId)
    if (token) {
      await sendMulticast(
        [token],
        {
          title: pushTitle,
          body: pushBody,
          link,
          data: {
            groupId: String(groupId),
            kind: 'new_pending_submission',
          },
        },
        'onNewPendingSubmissionPush',
      )
    } else {
      logger.info('onNewPendingSubmissionPush: no owner token', { groupId, ownerId })
    }

    const { key, from } = resendContext()
    await maybeEmailUser(admin, db, key, from, ownerId, {
      subject: `New submission to review — ${activityName}`,
      text: [
        `${memberName} submitted "${taskName}" in ${activityName}.`,
        'Open the app to review.',
        link ? `\n${link}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      logLabel: 'onNewPendingSubmissionEmail',
    })
  },
)

/**
 * Push + email: new member (not owner) → owner.
 */
exports.onNewMemberJoinedPush = onDocumentCreated(
  {
    document: 'groups/{groupId}/members/{memberId}',
    ...emailTriggerOpts,
  },
  async (event) => {
    const snap = event.data
    if (!snap) return
    const { groupId, memberId } = event.params

    const db = admin.firestore()
    const groupSnap = await db.doc(`groups/${groupId}`).get()
    if (!groupSnap.exists) return

    const ownerId = groupSnap.get('ownerId')
    if (typeof ownerId !== 'string' || !ownerId) return
    if (memberId === ownerId) return

    const member = snap.data() || {}
    const memberName = memberDisplayName(member.displayName)
    const memberFirst = firstNameFromDisplayName(member.displayName)

    const pushTitle = 'New member joined'
    const pushBody = `${memberFirst} joined your group`
    const link = absoluteLink(`/group/${groupId}/settings`)

    const token = await getPushTokenForUser(db, ownerId)
    if (token) {
      await sendMulticast(
        [token],
        {
          title: pushTitle,
          body: pushBody,
          link,
          data: {
            groupId: String(groupId),
            kind: 'new_member_joined',
          },
        },
        'onNewMemberJoinedPush',
      )
    } else {
      logger.info('onNewMemberJoinedPush: no owner token', { groupId, ownerId })
    }

    const { key, from } = resendContext()
    await maybeEmailUser(admin, db, key, from, ownerId, {
      subject: `${memberName} joined your group`,
      text: [
        `${memberName} has joined Il Tour di Paolo.`,
        link ? `\nOpen group settings: ${link}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      logLabel: 'onNewMemberJoinedEmail',
    })
  },
)
