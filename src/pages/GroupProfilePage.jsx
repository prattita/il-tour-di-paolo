import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { FeedPhotoLightbox } from '../components/FeedPhotoLightbox'
import { useAuth } from '../context/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { MedalBadge } from '../components/MedalBadge'
import { filterActivitiesForSubjectProfile } from '../lib/activityVisibility'
import {
  buildProfileActivityRows,
  subscribeActivitiesForProfile,
  subscribeGroupMember,
} from '../services/activityService'
import { uploadUserAvatarAndSyncGroups } from '../services/avatarService'
import { getGroup } from '../services/groupService'
import { inclusiveMedalCounts, medalTierFromTasksCompleted } from '../lib/medalTier'

/** Fixed desktop width keeps bars aligned; `className` sets width (e.g. `w-full` / `w-[140px]`). */
function ActivityProgressBar({ tasksCompleted, className = 'w-full min-w-0 sm:w-[140px] sm:shrink-0' }) {
  const { t } = useTranslation()
  const n = Math.min(3, Math.max(0, Number(tasksCompleted) || 0))
  const pct = (n / 3) * 100
  return (
    <div
      className={`h-2 overflow-hidden rounded-full bg-black/10 ${className}`.trim()}
      role="progressbar"
      aria-valuenow={n}
      aria-valuemin={0}
      aria-valuemax={3}
      aria-label={t('profile.progressAria', { n })}
    >
      <div
        className="h-full rounded-full bg-tour-accent transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/** Fits “No medal yet” on one line at default badge size; keeps Gold/Bronze rhythm identical. */
const PROFILE_ACTIVITY_BADGE_W = 'w-[7.25rem]'
const PROFILE_SUMMARY_BADGE_W = 'w-[4.75rem]'

const PROFILE_AVATAR_INPUT_ID = 'profile-avatar-file-input'

function CameraGlyph({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2v11z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

export function GroupProfilePage() {
  const { t } = useTranslation()
  const { groupId, userId } = useParams()
  const { user } = useAuth()
  const [group, setGroup] = useState(null)
  const [loadingGroup, setLoadingGroup] = useState(true)
  const [activities, setActivities] = useState([])
  const [subjectMember, setSubjectMember] = useState(null)
  const [listError, setListError] = useState('')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const [avatarLightboxOpen, setAvatarLightboxOpen] = useState(false)
  /** Hero URL failed to load — hide self “View photo” and avoid empty lightbox. */
  const [profileHeroPhotoFailed, setProfileHeroPhotoFailed] = useState(false)

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

  const isMember = Boolean(user?.uid && group?.memberIds?.includes(user.uid))
  const subjectInGroup = Boolean(userId && group?.memberIds?.includes(userId))

  useEffect(() => {
    if (!groupId || !userId || !subjectInGroup) return
    setListError('')
    const unsubMember = subscribeGroupMember(
      groupId,
      userId,
      (m) => setSubjectMember(m),
      (e) => setListError(e.message || t('profile.loadProfileFailed')),
    )
    const unsubActs = subscribeActivitiesForProfile(
      groupId,
      userId,
      user?.uid,
      group?.ownerId,
      (list) => setActivities(list),
      (e) => setListError(e.message || t('profile.loadActivitiesFailed')),
    )
    return () => {
      unsubMember()
      unsubActs()
    }
  }, [groupId, userId, subjectInGroup, user?.uid, group?.ownerId, t])

  useEffect(() => {
    setProfileHeroPhotoFailed(false)
  }, [subjectMember?.avatarUrl])

  useEffect(() => {
    if (!subjectMember?.avatarUrl) setAvatarLightboxOpen(false)
  }, [subjectMember?.avatarUrl])

  const profileActivities = useMemo(
    () => filterActivitiesForSubjectProfile(activities, userId),
    [activities, userId],
  )

  const total = profileActivities.length
  const counts = useMemo(
    () => inclusiveMedalCounts(profileActivities, subjectMember?.progress),
    [profileActivities, subjectMember?.progress],
  )

  const profileActivityRows = useMemo(
    () => buildProfileActivityRows(profileActivities),
    [profileActivities],
  )

  const displayName = subjectMember?.displayName
  const isSelf = Boolean(user?.uid && userId && user.uid === userId)
  const isOwnerViewer = Boolean(user?.uid && group?.ownerId && user.uid === group.ownerId)
  const personalRowRedacted = (activity) =>
    activity?.isPersonal === true && !isSelf && !isOwnerViewer
  const canExpandProfilePhoto = Boolean(
    subjectMember?.avatarUrl && !profileHeroPhotoFailed && !avatarUploading,
  )
  const profilePhotoAlt = displayName
    ? t('profile.photoAltNamed', { name: displayName })
    : t('profile.photoAltGeneric')

  async function handleAvatarFile(ev) {
    const file = ev.target.files?.[0]
    ev.target.value = ''
    if (!file || !user?.uid) return
    setAvatarError('')
    setAvatarUploading(true)
    try {
      await uploadUserAvatarAndSyncGroups(user.uid, file)
    } catch (e) {
      setAvatarError(e.message || t('profile.avatarUpdateFailed'))
    } finally {
      setAvatarUploading(false)
    }
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

      {loadingGroup && (
        <p className="text-sm text-tour-text-secondary">{t('groupInfo.loading')}</p>
      )}

      {!loadingGroup && !group && (
        <p className="text-sm text-tour-text-secondary">{t('feed.groupNotFound')}</p>
      )}

      {!loadingGroup && group && !isMember && (
        <p className="text-sm text-tour-text-secondary">{t('feed.notMember')}</p>
      )}

      {!loadingGroup && group && isMember && !subjectInGroup && (
        <p className="text-sm text-tour-text-secondary">{t('profile.subjectNotInGroup')}</p>
      )}

      {listError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {listError}
        </div>
      )}

      {!loadingGroup && isMember && subjectInGroup && !subjectMember && !listError && (
        <p className="text-sm text-tour-text-secondary">{t('profile.memberProfileNotFound')}</p>
      )}

      {!loadingGroup && isMember && subjectInGroup && subjectMember && (
        <>
          <section className="mb-4 rounded-xl border border-black/10 bg-tour-surface px-3.5 py-3">
            <div className="flex items-center gap-3">
              {isSelf ? (
                <label
                  htmlFor={PROFILE_AVATAR_INPUT_ID}
                  aria-label={t('settings.changePhotoAria')}
                  className={`relative isolate inline-flex shrink-0 cursor-pointer ${avatarUploading ? 'pointer-events-none opacity-70' : ''}`}
                >
                  <Avatar
                    avatarUrl={subjectMember?.avatarUrl}
                    displayName={displayName}
                    email={user?.email}
                    seed={userId}
                    className="h-16 w-16 text-[16px]"
                    alt=""
                    onPhotoLoadError={() => setProfileHeroPhotoFailed(true)}
                  />
                  <span
                    className="pointer-events-none absolute bottom-0 right-0 z-10 flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-tour-surface bg-tour-accent text-white shadow-md"
                    aria-hidden
                  >
                    <CameraGlyph className="h-4 w-4" />
                  </span>
                  <input
                    id={PROFILE_AVATAR_INPUT_ID}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={handleAvatarFile}
                    disabled={avatarUploading}
                  />
                  {avatarUploading && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-[11px] font-medium text-white">
                      …
                    </span>
                  )}
                </label>
              ) : (
                <Avatar
                  avatarUrl={subjectMember?.avatarUrl}
                  displayName={displayName}
                  seed={userId}
                  className="h-12 w-12 text-[14px] shrink-0"
                  alt=""
                  {...(subjectMember?.avatarUrl
                    ? {
                        onImageClick: () => setAvatarLightboxOpen(true),
                        imageExpandAriaLabel: t('profile.expandPhotoAria'),
                        onPhotoLoadError: () => setProfileHeroPhotoFailed(true),
                      }
                    : {})}
                />
              )}
              <div className="min-w-0 flex-1">
                <h1 className="text-[16px] font-medium text-tour-text">
                  {displayName || t('groupShell.displayNameFallback')}
                </h1>
                {isSelf && (
                  <>
                    <p className="mt-0.5 text-[11px] text-tour-text-secondary">
                      {t('profile.youBadge')}
                    </p>
                    {canExpandProfilePhoto && (
                      <button
                        type="button"
                        onClick={() => setAvatarLightboxOpen(true)}
                        className="mt-1 block text-left text-[12px] font-medium text-tour-accent underline decoration-tour-accent/35 underline-offset-2 hover:decoration-tour-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tour-accent/40 rounded-sm"
                      >
                        {t('settings.viewPhoto')}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            {isSelf && avatarError && (
              <p className="mt-2 text-[12px] text-red-800">{avatarError}</p>
            )}
            {subjectMember?.avatarUrl && (
              <FeedPhotoLightbox
                isOpen={avatarLightboxOpen}
                photos={[{ url: subjectMember.avatarUrl }]}
                onClose={() => setAvatarLightboxOpen(false)}
                getImgProps={() => ({ alt: profilePhotoAlt })}
                overlayAriaLabel={t('profile.avatarLightboxAria')}
              />
            )}
          </section>

          <section className="mb-4 rounded-xl border border-black/10 bg-tour-surface px-3.5 py-3">
            <h2 className="text-[12px] font-medium uppercase tracking-wide text-tour-text-secondary">
              {t('profile.medalsHeading')}
            </h2>
            {total === 0 ? (
              <p className="mt-2 text-sm text-tour-text-secondary">
                {t('profile.noActivitiesForMedals')}
              </p>
            ) : (
              <>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="inline-flex items-center gap-1.5">
                    <MedalBadge tier="gold" size="sm" className={PROFILE_SUMMARY_BADGE_W} />
                    <span className="text-[12px] tabular-nums text-tour-text">
                      {counts.gold}/{total}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MedalBadge tier="silver" size="sm" className={PROFILE_SUMMARY_BADGE_W} />
                    <span className="text-[12px] tabular-nums text-tour-text">
                      {counts.silver}/{total}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MedalBadge tier="bronze" size="sm" className={PROFILE_SUMMARY_BADGE_W} />
                    <span className="text-[12px] tabular-nums text-tour-text">
                      {counts.bronze}/{total}
                    </span>
                  </span>
                </div>
              </>
            )}
          </section>

          <section className="rounded-xl border border-black/10 bg-tour-surface px-3.5 py-3">
            <h2 className="text-[12px] font-medium uppercase tracking-wide text-tour-text-secondary">
              {t('profile.byActivityHeading')}
            </h2>
            {profileActivities.length === 0 ? (
              <p className="mt-2 text-sm text-tour-text-secondary">{t('profile.noActivitiesShort')}</p>
            ) : (
              <ul className="mt-3 divide-y divide-black/10">
                {profileActivityRows.map(({ activity, depth }) => {
                  const actProgress = subjectMember?.progress?.[activity.id]
                  const tasksDone = actProgress?.tasksCompleted ?? 0
                  const tier = medalTierFromTasksCompleted(tasksDone)
                  const pad = depth > 0 ? { paddingLeft: `${depth * 0.75}rem` } : undefined
                  const nestedContentIndent = depth > 0 ? 'pl-4' : ''
                  const redacted = personalRowRedacted(activity)
                  return (
                    <li
                      key={activity.id}
                      style={pad}
                      className="grid grid-cols-1 gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_140px_7.25rem] sm:items-center sm:gap-x-4 sm:gap-y-0"
                    >
                      <div className="min-w-0 sm:col-start-1 sm:row-start-1">
                        <p className="text-[13px] font-medium text-tour-text">
                          {depth > 0 ? <span className="mr-1 text-tour-text-secondary">└</span> : null}
                          {activity.name}
                          {activity.isAdvanced === true ? (
                            <span className="ml-2 align-middle rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                              {t('activities.advancedBadge')}
                            </span>
                          ) : null}
                          {activity.isPersonal === true ? (
                            <span className="ml-2 align-middle rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                              {t('activities.personalBadge')}
                            </span>
                          ) : null}
                        </p>
                        {!redacted ? (
                          <p
                            className={`mt-0.5 text-[12px] text-tour-text-secondary ${nestedContentIndent}`.trim()}
                          >
                            {t('profile.tasksOfThree', { done: tasksDone })}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3 sm:contents">
                        <div
                          className={`min-w-0 flex-1 ${nestedContentIndent} sm:col-start-2 sm:row-start-1 sm:w-[140px] sm:flex-none sm:shrink-0 sm:pl-0`.trim()}
                        >
                          <ActivityProgressBar tasksCompleted={tasksDone} />
                        </div>
                        <div className="flex shrink-0 justify-end sm:col-start-3 sm:row-start-1 sm:justify-self-end">
                          <MedalBadge tier={tier} className={PROFILE_ACTIVITY_BADGE_W} />
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
