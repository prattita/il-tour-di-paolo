import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { useAuth } from '../context/useAuth'
import { getFirebaseDb } from '../lib/firebase'
import { getTaskStatus } from '../lib/taskStatus'
import { getGroup } from '../services/groupService'
import { getGroupMember } from '../services/activityService'
import { createPendingSubmission, getPendingSubmission } from '../services/pendingService'
import { PageLoading } from '../components/PageLoading'

export function TaskCompletePage() {
  const { groupId, activityId, taskId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [activity, setActivity] = useState(null)
  const [task, setTask] = useState(null)
  const [gateMessage, setGateMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [imageFile, setImageFile] = useState(null)
  const [description, setDescription] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      if (!groupId || !activityId || !taskId || !user?.uid) {
        if (active) setLoading(false)
        return
      }
      setLoading(true)
      setGateMessage('')
      setError('')
      try {
        const db = getFirebaseDb()
        if (!db) throw new Error('Firestore is not available.')

        const g = await getGroup(groupId)
        if (!g || !g.memberIds?.includes(user.uid)) {
          if (active) setGateMessage('You are not a member of this group.')
          return
        }
        const actSnap = await getDoc(doc(db, `groups/${groupId}/activities/${activityId}`))
        if (!actSnap.exists()) {
          if (active) setGateMessage('Activity not found.')
          return
        }
        const act = { id: actSnap.id, ...actSnap.data() }
        const t = (act.tasks || []).find((x) => x.id === taskId)
        if (!t) {
          if (active) setGateMessage('Task not found.')
          return
        }
        if (active) {
          setActivity(act)
          setTask(t)
        }

        const member = await getGroupMember(groupId, user.uid)
        const pending = await getPendingSubmission(groupId, user.uid, activityId)
        const status = getTaskStatus(t, member?.progress?.[activityId], pending)

        if (status !== 'empty') {
          if (active) {
            setGateMessage(
              status === 'approved'
                ? 'This task is already completed.'
                : status === 'pending'
                  ? 'This task is already submitted for review. To cancel, go to Activities and tap Withdraw submission on that activity.'
                  : 'Finish your pending submission for another task in this activity first.',
            )
          }
          return
        }
      } catch (e) {
        if (active) setError(e.message || 'Failed to load.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [groupId, activityId, taskId, user?.uid])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!imageFile) {
      setError('Please attach an image.')
      return
    }
    if (!user?.uid || !activity || !task || !groupId) return

    setSubmitting(true)
    try {
      await createPendingSubmission({
        groupId,
        userId: user.uid,
        displayName: user.displayName || user.email || 'Member',
        activityId: activity.id,
        activityName: activity.name,
        taskId: task.id,
        taskName: task.name,
        imageFile,
        description,
      })
      navigate(`/group/${groupId}/activities`, { replace: true, state: { submitted: true } })
    } catch (err) {
      setError(err.message || 'Submit failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const activitiesPath = `/group/${groupId}/activities`

  return (
    <div className="min-h-dvh bg-tour-muted text-tour-text">
      <header className="flex items-center justify-between gap-3 border-b border-black/10 bg-tour-surface px-3 py-2.5">
        <Link
          to={activitiesPath}
          className="shrink-0 text-[12px] text-tour-text-secondary hover:text-tour-text"
        >
          ← Back
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-center text-[15px] font-medium">Complete task</h1>
        <span className="w-10 shrink-0" aria-hidden />
      </header>

      <main className="mx-auto w-full max-w-lg px-3 py-4 sm:max-w-xl sm:px-4 lg:max-w-2xl">
        {loading && <PageLoading />}

        {!loading && gateMessage && (
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

        {!loading && !gateMessage && activity && task && (
          <>
            <div className="mb-3 rounded-xl border border-black/10 bg-tour-surface px-3.5 py-3">
              <p className="text-[14px] font-medium text-tour-text">{activity.name}</p>
              <p className="mt-1 text-[13px] text-tour-text-secondary">{task.name}</p>
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

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
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

              <Link
                to={activitiesPath}
                className="block w-full rounded-lg border border-black/10 py-2 text-center text-sm font-medium text-tour-text hover:bg-tour-muted"
              >
                Cancel
              </Link>
            </form>
          </>
        )}
      </main>
    </div>
  )
}
