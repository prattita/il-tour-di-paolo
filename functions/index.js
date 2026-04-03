const admin = require('firebase-admin')
const { onDocumentCreated } = require('firebase-functions/v2/firestore')
const { defineString } = require('firebase-functions/params')
const { logger } = require('firebase-functions')

admin.initializeApp()

/** Public site origin for web push `link` (no trailing slash). */
const webAppOrigin = defineString('WEB_APP_ORIGIN', { default: '' })

function medalLabel(medal) {
  if (!medal || typeof medal !== 'string') return ''
  const m = medal.toLowerCase()
  if (m === 'bronze' || m === 'silver' || m === 'gold') {
    return m.charAt(0).toUpperCase() + m.slice(1)
  }
  return medal
}

/**
 * Push only: new task_completion feed posts → other group members with FCM tokens.
 * Skips system posts and the member who completed the task (actor).
 */
exports.onFeedTaskCompletionPush = onDocumentCreated(
  {
    document: 'groups/{groupId}/feed/{postId}',
    region: 'us-central1',
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

      const userSnap = await db.doc(`users/${uid}`).get()
      if (!userSnap.exists) continue

      const n = userSnap.get('notifications')
      if (!n || n.pushEnabled !== true) continue

      const token = n.pushToken
      if (typeof token !== 'string' || token.length < 80) continue

      tokens.push(token)
    }

    if (tokens.length === 0) {
      logger.info('onFeedTaskCompletionPush: no targets', { groupId, postId: event.params.postId })
      return
    }

    const displayName = typeof post.displayName === 'string' && post.displayName.trim()
      ? post.displayName.trim()
      : 'Someone'
    const taskName =
      typeof post.taskName === 'string' && post.taskName.trim() ? post.taskName.trim() : 'Task'
    const activityName =
      typeof post.activityName === 'string' && post.activityName.trim()
        ? post.activityName.trim()
        : 'an activity'

    const medal = medalLabel(post.medal)
    const medalSuffix = medal ? ` — ${medal} medal` : ''

    const title = `${displayName} completed a task`
    const body = `${taskName} in ${activityName}${medalSuffix}`

    const origin = webAppOrigin.value().replace(/\/$/, '')
    const link = origin ? `${origin}/group/${groupId}/feed` : undefined

    /** @type {import('firebase-admin/messaging').MulticastMessage} */
    const message = {
      tokens,
      notification: { title, body },
      data: {
        groupId: String(groupId),
        kind: 'feed_task_completion',
      },
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
      logger.info('onFeedTaskCompletionPush sent', {
        groupId,
        postId: event.params.postId,
        success: res.successCount,
        failure: res.failureCount,
      })
      if (res.failureCount > 0) {
        res.responses.forEach((r, i) => {
          if (!r.success) {
            logger.warn('onFeedTaskCompletionPush token failed', {
              index: i,
              code: r.error?.code,
              message: r.error?.message,
            })
          }
        })
      }
    } catch (e) {
      logger.error('onFeedTaskCompletionPush error', { err: String(e), groupId })
    }
  },
)
