import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { useAuth } from '../context/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import {
  approvePendingSubmission,
  rejectPendingSubmission,
  subscribePendingQueue,
} from '../services/approvalService'
import { getGroup } from '../services/groupService'
import { FeedPhotoCarousel } from '../components/FeedPhotoCarousel'
import { PageLoading } from '../components/PageLoading'
import { normalizeDocPhotos } from '../lib/feedPhotos'

function formatSubmittedAt(value, locale) {
  if (!value) return '—'
  const d = typeof value.toDate === 'function' ? value.toDate() : value
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function GroupApprovalsPage() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const { t, language } = useTranslation()
  const [group, setGroup] = useState(null)
  const [loadingGroup, setLoadingGroup] = useState(true)
  const [queue, setQueue] = useState([])
  const [queueError, setQueueError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    let active = true
    async function run() {
      if (!groupId) return
      setLoadingGroup(true)
      try {
        const g = await getGroup(groupId)
        if (active) setGroup(g)
      } catch {
        if (active) setGroup(null)
      } finally {
        if (active) setLoadingGroup(false)
      }
    }
    run()
    return () => {
      active = false
    }
  }, [groupId])

  const isOwner = Boolean(user?.uid && group?.ownerId === user.uid)
  const isMember = Boolean(user?.uid && group?.memberIds?.includes(user.uid))

  useEffect(() => {
    if (!groupId || !isOwner) return
    setQueueError('')
    const unsub = subscribePendingQueue(
      groupId,
      (items) => setQueue(items),
      (e) => setQueueError(e.message || t('approvals.loadQueueFailed')),
    )
    return () => unsub()
  }, [groupId, isOwner, t])

  const APPROVAL_DEADLINE_MS = 120_000

  async function handleApprove(pending) {
    if (!groupId || busyId) return
    setActionError('')
    setBusyId(pending.id)
    let deadlineId
    const deadline = new Promise((_, reject) => {
      deadlineId = setTimeout(() => {
        reject(new Error(t('approvals.approvalTimeout')))
      }, APPROVAL_DEADLINE_MS)
    })
    try {
      await Promise.race([
        approvePendingSubmission(groupId, pending.id, pending),
        deadline,
      ])
    } catch (e) {
      setActionError(e?.message || e?.code || t('approvals.approveFailed'))
      console.error('[approve]', e)
    } finally {
      clearTimeout(deadlineId)
      setBusyId(null)
    }
  }

  async function handleReject(pending) {
    if (!groupId || busyId) return
    if (
      !window.confirm(
        t('approvals.rejectConfirm', {
          member: pending.displayName || t('approvals.rejectMemberFallback'),
          task: pending.taskName || '',
        }),
      )
    ) {
      return
    }
    setActionError('')
    setBusyId(pending.id)
    try {
      await rejectPendingSubmission(groupId, pending.id, pending)
    } catch (e) {
      setActionError(e.message || t('approvals.rejectFailed'))
    } finally {
      setBusyId(null)
    }
  }

  if (!loadingGroup && !group) {
    return <p className="text-sm text-tour-text-secondary">{t('feed.groupNotFound')}</p>
  }

  if (!loadingGroup && group && !isMember) {
    return <p className="text-sm text-tour-text-secondary">{t('feed.notMember')}</p>
  }

  if (!loadingGroup && group && isMember && !isOwner) {
    return <Navigate to={`/group/${groupId}/feed`} replace />
  }

  return (
    <div className="text-tour-text">
      <div className="mb-4 border-b border-black/10 pb-3 lg:hidden">
        <p className="text-[11px] font-medium uppercase tracking-wide text-tour-text-secondary">
          {t('common.brandLine')}
        </p>
        <p className="text-[15px] font-medium text-tour-text">
          {group?.name || t('groupShell.titleGroup')}
        </p>
      </div>

      {loadingGroup && <PageLoading />}

      {actionError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {actionError}
        </div>
      )}

      {queueError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {queueError}
        </div>
      )}

      {!loadingGroup && isOwner && queue.length === 0 && !queueError && (
        <p className="rounded-xl border border-black/10 bg-tour-surface p-4 text-sm text-tour-text-secondary">
          {t('approvals.emptyQueue')}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {queue.map((pending) => {
          const pendingPhotos = normalizeDocPhotos(pending)
          return (
            <article
              key={pending.id}
              className="overflow-hidden rounded-xl border border-black/10 bg-tour-surface"
            >
              {pendingPhotos.length > 1 ? (
                <FeedPhotoCarousel photos={pendingPhotos} isHeroImage={false} />
              ) : pendingPhotos.length === 1 ? (
                <img
                  src={pendingPhotos[0].url}
                  alt=""
                  className="aspect-[4/3] w-full object-cover"
                />
              ) : null}
              <div className="space-y-2 px-3.5 py-3">
                <div className="flex items-start gap-2.5 text-[13px]">
                  <Avatar
                    avatarUrl={pending.avatarUrl}
                    displayName={pending.displayName}
                    seed={pending.userId}
                    className="h-9 w-9 text-[12px] shrink-0"
                    alt=""
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-tour-text">
                      {pending.displayName || t('groupShell.displayNameFallback')}
                    </p>
                    <p className="mt-0.5 text-tour-text-secondary">
                      <span className="text-tour-text">{pending.activityName}</span>
                      {' · '}
                      <span className="text-tour-text">{pending.taskName}</span>
                    </p>
                    <p className="mt-1 text-[11px] text-tour-text-secondary">
                      {t('approvals.submittedAt', {
                        when: formatSubmittedAt(pending.submittedAt, language),
                      })}
                    </p>
                  </div>
                </div>
                {pending.description && (
                  <p className="text-[12px] text-tour-text-secondary">{pending.description}</p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busyId === pending.id}
                    onClick={() => handleApprove(pending)}
                    className="rounded-full bg-tour-accent px-4 py-2 text-[12px] font-medium text-white disabled:opacity-50"
                  >
                    {busyId === pending.id ? t('approvals.working') : t('approvals.approve')}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === pending.id}
                    onClick={() => handleReject(pending)}
                    className="rounded-full border border-black/15 px-4 py-2 text-[12px] font-medium text-tour-text disabled:opacity-50"
                  >
                    {t('approvals.reject')}
                  </button>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
