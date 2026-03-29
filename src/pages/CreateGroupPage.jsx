import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { createGroup } from '../services/groupService'

function makeEmptyActivity() {
  return {
    name: '',
    description: '',
    tasks: ['', '', ''],
  }
}

export function CreateGroupPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [activities, setActivities] = useState([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const validActivityCount = useMemo(
    () => activities.filter((activity) => activity.name.trim()).length,
    [activities],
  )

  function addActivity() {
    setActivities((curr) => [...curr, makeEmptyActivity()])
  }

  function removeActivity(index) {
    setActivities((curr) => curr.filter((_, i) => i !== index))
  }

  function updateActivity(index, updater) {
    setActivities((curr) => curr.map((item, i) => (i === index ? updater(item) : item)))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setPending(true)
    try {
      if (!user) throw new Error('You must be logged in.')
      const result = await createGroup({
        ownerId: user.uid,
        ownerDisplayName: user.displayName || user.email || 'Member',
        ownerAvatarUrl: user.photoURL || null,
        name,
        description,
        activities,
      })
      navigate(`/group/${result.groupId}/feed`, { replace: true })
    } catch (err) {
      setError(err.message || 'Failed to create group.')
    } finally {
      setPending(false)
    }
  }

  const fieldClass =
    'min-h-11 w-full rounded-lg border border-black/18 bg-tour-surface px-3 py-2.5 text-tour-text shadow-sm focus:border-tour-accent focus:outline-none focus:ring-1 focus:ring-tour-accent'

  return (
    <div className="min-h-dvh bg-tour-muted text-tour-text">
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-5 md:py-10">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-xl border border-black/10 bg-tour-surface p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-tour-text-secondary">
              Il Tour di Paolo 2026
            </p>
            <h1 className="mt-1 text-xl font-semibold text-tour-text sm:text-2xl">Create group</h1>
            <p className="mt-2 text-sm text-tour-text-secondary">
              Start with zero or more activities. You can edit and add activities later in group
              settings.
            </p>
          </div>
          <Link
            to="/"
            className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-black/10 bg-tour-muted px-4 py-2.5 text-sm font-medium text-tour-text hover:bg-black/[0.04]"
          >
            Back to welcome
          </Link>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5">
          <section className="rounded-xl border border-black/10 bg-tour-surface p-4">
            <label htmlFor="groupName" className="mb-1 block text-sm font-medium text-tour-text">
              Group name
            </label>
            <input
              id="groupName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldClass}
              required
            />

            <label htmlFor="groupDescription" className="mb-1 mt-4 block text-sm font-medium text-tour-text">
              Description (optional)
            </label>
            <textarea
              id="groupDescription"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[5.5rem] w-full rounded-lg border border-black/18 bg-tour-surface px-3 py-2.5 text-tour-text shadow-sm focus:border-tour-accent focus:outline-none focus:ring-1 focus:ring-tour-accent"
            />
          </section>

          <section className="rounded-xl border border-black/10 bg-tour-surface p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-tour-text">Activities</h2>
                <p className="text-sm text-tour-text-secondary">
                  Valid activities: <span className="font-medium">{validActivityCount}</span>
                </p>
                <p className="mt-1 text-xs text-tour-text-secondary">
                  Medal award criteria: Bronze 1/3, Silver 2/3, Gold 3/3 tasks.
                </p>
              </div>
              <button
                type="button"
                onClick={addActivity}
                className="min-h-11 rounded-lg border border-black/10 bg-tour-muted px-4 py-2 text-sm font-medium text-tour-text hover:bg-black/[0.04]"
              >
                Add activity
              </button>
            </div>

            {activities.length === 0 && (
              <p className="rounded-lg border border-dashed border-black/18 bg-tour-muted px-3 py-3 text-sm text-tour-text-secondary">
                No activities yet. You can create the group now and add activities later.
              </p>
            )}

            <div className="space-y-4">
              {activities.map((activity, index) => (
                <article key={index} className="rounded-lg border border-black/10 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-tour-text">Activity {index + 1}</h3>
                    <button
                      type="button"
                      onClick={() => removeActivity(index)}
                      className="text-sm font-medium text-red-800 hover:text-red-900"
                    >
                      Remove
                    </button>
                  </div>

                  <label className="mb-1 block text-sm font-medium text-tour-text">Activity name</label>
                  <input
                    type="text"
                    value={activity.name}
                    onChange={(e) =>
                      updateActivity(index, (curr) => ({ ...curr, name: e.target.value }))
                    }
                    className="min-h-11 w-full rounded-lg border border-black/18 px-3 py-2.5 text-sm text-tour-text"
                  />

                  <label className="mb-1 mt-3 block text-sm font-medium text-tour-text">
                    Activity description (optional)
                  </label>
                  <input
                    type="text"
                    value={activity.description}
                    onChange={(e) =>
                      updateActivity(index, (curr) => ({ ...curr, description: e.target.value }))
                    }
                    className="min-h-11 w-full rounded-lg border border-black/18 px-3 py-2.5 text-sm text-tour-text"
                  />

                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    {activity.tasks.map((task, taskIndex) => (
                      <label key={taskIndex} className="block text-sm font-medium text-tour-text">
                        Task {taskIndex + 1}
                        <input
                          type="text"
                          value={task}
                          onChange={(e) =>
                            updateActivity(index, (curr) => {
                              const nextTasks = [...curr.tasks]
                              nextTasks[taskIndex] = e.target.value
                              return { ...curr, tasks: nextTasks }
                            })
                          }
                          className="mt-1 min-h-11 w-full rounded-lg border border-black/18 px-3 py-2.5 text-sm text-tour-text"
                        />
                      </label>
                    ))}
                  </div>

                </article>
              ))}
            </div>
          </section>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="min-h-11 rounded-lg bg-tour-accent px-5 py-3 text-sm font-medium text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Creating group…' : 'Create group'}
          </button>
        </form>
      </main>
    </div>
  )
}
