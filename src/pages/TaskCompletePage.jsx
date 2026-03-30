import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useGroupCompletionPickerData } from '../hooks/useGroupCompletionPickerData'
import {
  getEligibleTasksForPicker,
  isActivityEligibleForCompletionPicker,
  memberParticipatesInActivity,
  sortActivitiesByName,
} from '../lib/completionEligibility'
import { getTaskStatus } from '../lib/taskStatus'
import { createPendingSubmission } from '../services/pendingService'
import { PageLoading } from '../components/PageLoading'

const selectClass =
  'mt-1 w-full rounded-lg border border-black/18 bg-tour-surface px-2.5 py-2.5 text-[13px] text-tour-text focus:border-tour-accent focus:outline-none focus:ring-1 focus:ring-tour-accent disabled:cursor-not-allowed disabled:opacity-50'

export function TaskCompletePage() {
  const { groupId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const {
    loadingGroup,
    error,
    group,
    activities,
    member,
    pendingByActivityId,
    isMember,
    pickerDataReady,
  } = useGroupCompletionPickerData(groupId, user?.uid)

  const [selectedActivityId, setSelectedActivityId] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState('')

  const [imageFile, setImageFile] = useState(null)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  /** Strip orphan query param (only one of activityId / taskId). */
  useEffect(() => {
    const a = (searchParams.get('activityId') || '').trim()
    const b = (searchParams.get('taskId') || '').trim()
    const hasA = Boolean(a)
    const hasB = Boolean(b)
    if (hasA !== hasB) {
      navigate(`/group/${groupId}/complete`, { replace: true })
    }
  }, [groupId, navigate, searchParams])

  const activityIdParam = (searchParams.get('activityId') || '').trim()
  const taskIdParam = (searchParams.get('taskId') || '').trim()
  const wantsLockedRoute = Boolean(activityIdParam && taskIdParam)

  useEffect(() => {
    setSelectedTaskId('')
  }, [selectedActivityId])

  useEffect(() => {
    if (wantsLockedRoute) {
      setSelectedActivityId('')
      setSelectedTaskId('')
    }
  }, [wantsLockedRoute, activityIdParam, taskIdParam])

  useEffect(() => {
    setImageFile(null)
    setDescription('')
    setSubmitError('')
  }, [selectedActivityId, selectedTaskId])

  const eligibleActivities = useMemo(() => {
    if (!pickerDataReady || !member) return []
    return sortActivitiesByName(
      activities.filter((a) =>
        isActivityEligibleForCompletionPicker(a, member, pendingByActivityId[a.id] ?? null),
      ),
    )
  }, [activities, member, pendingByActivityId, pickerDataReady])

  const pickerActivity = useMemo(
    () => activities.find((a) => a.id === selectedActivityId),
    [activities, selectedActivityId],
  )

  const eligiblePickerTasks = useMemo(() => {
    if (!pickerActivity || !member) return []
    const pending = pendingByActivityId[pickerActivity.id] ?? null
    return getEligibleTasksForPicker(pickerActivity, member, pending)
  }, [pickerActivity, member, pendingByActivityId])

  const pickerTask = useMemo(
    () => eligiblePickerTasks.find((t) => t.id === selectedTaskId),
    [eligiblePickerTasks, selectedTaskId],
  )

  const lockedGateMessage = useMemo(() => {
    if (!wantsLockedRoute || !pickerDataReady || !member) return ''
    if (!memberParticipatesInActivity(member, activityIdParam)) {
      return 'You are not participating in this activity.'
    }
    const act = activities.find((a) => a.id === activityIdParam)
    if (!act) return 'Activity not found.'
    const tsk = (act.tasks || []).find((x) => x.id === taskIdParam)
    if (!tsk) return 'Task not found.'
    const pending = pendingByActivityId[activityIdParam] ?? null
    const status = getTaskStatus(tsk, member.progress?.[activityIdParam], pending)
    if (status !== 'empty') {
      if (status === 'approved') return 'This task is already completed.'
      if (status === 'pending') {
        return 'This task is already submitted for review. To cancel, go to Activities and tap Withdraw submission on that activity.'
      }
      return 'Finish your pending submission for another task in this activity first.'
    }
    return ''
  }, [
    wantsLockedRoute,
    pickerDataReady,
    member,
    activities,
    activityIdParam,
    taskIdParam,
    pendingByActivityId,
  ])

  const lockedActivity = wantsLockedRoute ? activities.find((a) => a.id === activityIdParam) : null
  const lockedTask =
    lockedActivity && taskIdParam
      ? (lockedActivity.tasks || []).find((x) => x.id === taskIdParam)
      : null

  const lockedOk = wantsLockedRoute && !lockedGateMessage && lockedActivity && lockedTask

  const displayActivity = lockedOk ? lockedActivity : pickerActivity
  const displayTask = lockedOk ? lockedTask : pickerTask

  const showUploadForm = Boolean(displayActivity && displayTask && (lockedOk || (pickerTask && selectedTaskId)))

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitError('')
    if (!imageFile) {
      setSubmitError('Please attach an image.')
      return
    }
    if (!user?.uid || !displayActivity || !displayTask || !groupId) return

    setSubmitting(true)
    try {
      await createPendingSubmission({
        groupId,
        userId: user.uid,
        displayName: user.displayName || user.email || 'Member',
        activityId: displayActivity.id,
        activityName: displayActivity.name,
        taskId: displayTask.id,
        taskName: displayTask.name,
        imageFile,
        description,
      })
      navigate(`/group/${groupId}/activities`, { replace: true, state: { submitted: true } })
    } catch (err) {
      setSubmitError(err.message || 'Submit failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const activitiesPath = `/group/${groupId}/activities`
  const feedPath = `/group/${groupId}/feed`

  const gateMessage = useMemo(() => {
    if (!pickerDataReady) return ''
    if (!group) return 'Group not found.'
    if (!user?.uid) return ''
    if (!isMember) return 'You are not a member of this group.'
    if (wantsLockedRoute && lockedGateMessage) return lockedGateMessage
    return ''
  }, [pickerDataReady, group, user?.uid, isMember, wantsLockedRoute, lockedGateMessage])

  const showPickerEmpty =
    pickerDataReady && isMember && !wantsLockedRoute && eligibleActivities.length === 0

  const showPickerUi =
    pickerDataReady && isMember && !wantsLockedRoute && eligibleActivities.length > 0

  const loadingUi = loadingGroup || (isMember && !pickerDataReady)

  return (
    <div className="min-h-dvh bg-tour-muted text-tour-text">
      <header className="flex items-center justify-between gap-3 border-b border-black/10 bg-tour-surface px-3 py-2.5">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="shrink-0 text-[12px] text-tour-text-secondary hover:text-tour-text"
        >
          ← Back
        </button>
        <h1 className="min-w-0 flex-1 truncate text-center text-[15px] font-medium">
          Complete a task
        </h1>
        <span className="w-10 shrink-0" aria-hidden />
      </header>

      <main className="mx-auto w-full max-w-lg px-3 py-4 sm:max-w-xl sm:px-4 lg:max-w-2xl">
        {loadingUi && <PageLoading />}

        {!loadingUi && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        {!loadingUi && !error && gateMessage && (
          <div className="space-y-4">
            <p className="text-sm text-tour-text">{gateMessage}</p>
            <Link
              to={activitiesPath}
              className="inline-block rounded-lg border border-black/10 bg-tour-surface px-3 py-1.5 text-sm font-medium text-tour-text hover:bg-tour-muted"
            >
              Back to activities
            </Link>
          </div>
        )}

        {!loadingUi && !error && !gateMessage && showPickerEmpty && (
          <div className="space-y-4">
            <p className="text-sm text-tour-text">You have no remaining tasks to submit.</p>
            <p className="text-sm text-tour-text-secondary">
              All your activities are complete or pending review.
            </p>
            <Link
              to={feedPath}
              className="inline-block rounded-lg border border-black/10 bg-tour-surface px-3 py-1.5 text-sm font-medium text-tour-text hover:bg-tour-muted"
            >
              Back to feed
            </Link>
          </div>
        )}

        {!loadingUi && !error && !gateMessage && showPickerUi && (
          <div className="space-y-4">
            <div>
              <label htmlFor="complete-activity" className="block text-[12px] font-medium text-tour-text-secondary">
                Activity
              </label>
              <select
                id="complete-activity"
                value={selectedActivityId}
                onChange={(e) => setSelectedActivityId(e.target.value)}
                className={selectClass}
              >
                <option value="">Select activity</option>
                {eligibleActivities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="complete-task" className="block text-[12px] font-medium text-tour-text-secondary">
                Task
              </label>
              <select
                id="complete-task"
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                disabled={!selectedActivityId}
                className={selectClass}
              >
                <option value="">Select task</option>
                {eligiblePickerTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {!loadingUi && !error && !gateMessage && showUploadForm && (
          <>
            <div
              className={`mb-3 rounded-xl border border-black/10 bg-tour-surface px-3.5 py-3 ${
                lockedOk ? '' : 'mt-4'
              }`}
            >
              <p className="text-[14px] font-medium text-tour-text">{displayActivity.name}</p>
              <p className="mt-1 text-[13px] text-tour-text-secondary">{displayTask.name}</p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-4 rounded-xl border border-black/10 bg-tour-surface p-3.5 sm:p-4"
            >
              <div>
                <p className="form-label mb-1 text-[12px] text-tour-text-secondary">
                  Photo proof <span className="text-[#A32D2D]">required</span>
                </p>
                <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed border-black/18 bg-tour-muted px-3 py-6">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-tour-accent-muted text-tour-accent">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="text-[13px] font-medium text-tour-text">Upload photo</span>
                  <span className="text-center text-[11px] text-tour-text-secondary">
                    Tap to choose from camera or library
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(ev) => setImageFile(ev.target.files?.[0] ?? null)}
                  />
                </label>
                {imageFile && (
                  <p className="mt-2 text-[11px] text-tour-text-secondary">{imageFile.name}</p>
                )}
              </div>

              <div>
                <label htmlFor="desc" className="mb-1 block text-[12px] text-tour-text-secondary">
                  Description <span className="text-tour-text-tertiary">optional</span>
                </label>
                <textarea
                  id="desc"
                  rows={3}
                  value={description}
                  onChange={(ev) => setDescription(ev.target.value)}
                  placeholder="Tell us about it..."
                  className="w-full resize-none rounded-lg border border-black/18 bg-tour-surface px-2.5 py-2 text-[13px] text-tour-text placeholder:text-tour-text-secondary focus:border-tour-accent focus:outline-none focus:ring-1 focus:ring-tour-accent"
                />
              </div>

              {submitError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !imageFile}
                className={`w-full rounded-lg py-2.5 text-center text-[14px] font-medium ${
                  submitting || !imageFile
                    ? 'border border-black/10 bg-tour-muted text-tour-text-secondary'
                    : 'bg-tour-accent text-white hover:opacity-95'
                }`}
              >
                {submitting ? 'Submitting…' : 'Submit for review'}
              </button>

              <p className="text-center text-[11px] text-tour-text-secondary">
                Your submission will appear in the feed once the owner approves it.
              </p>

              <button
                type="button"
                onClick={() => navigate(-1)}
                className="block w-full rounded-lg border border-black/10 py-2 text-center text-sm font-medium text-tour-text hover:bg-tour-muted"
              >
                Cancel
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  )
}
