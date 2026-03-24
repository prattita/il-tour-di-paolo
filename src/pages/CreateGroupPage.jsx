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

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900">
      <main className="mx-auto w-full max-w-3xl px-4 py-8 md:py-10">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Phase 3</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-800">Create Group</h1>
            <p className="mt-2 text-sm text-slate-600">
              Start with 0 or more activities. You can edit and add activities later.
            </p>
          </div>
          <Link
            to="/"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back home
          </Link>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <label htmlFor="groupName" className="mb-1 block text-sm font-medium text-slate-700">
              Group name
            </label>
            <input
              id="groupName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              required
            />

            <label htmlFor="groupDescription" className="mb-1 mt-4 block text-sm font-medium text-slate-700">
              Description (optional)
            </label>
            <textarea
              id="groupDescription"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-800">Activities</h2>
                <p className="text-sm text-slate-600">
                  Valid activities: <span className="font-medium">{validActivityCount}</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Medal award criteria: Bronze 1/3, Silver 2/3, Gold 3/3 tasks.
                </p>
              </div>
              <button
                type="button"
                onClick={addActivity}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Add activity
              </button>
            </div>

            {activities.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                No activities yet. You can create the group now and add activities later.
              </p>
            )}

            <div className="space-y-4">
              {activities.map((activity, index) => (
                <article key={index} className="rounded-lg border border-slate-200 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-800">Activity {index + 1}</h3>
                    <button
                      type="button"
                      onClick={() => removeActivity(index)}
                      className="text-sm font-medium text-red-700 hover:text-red-800"
                    >
                      Remove
                    </button>
                  </div>

                  <label className="mb-1 block text-sm font-medium text-slate-700">Activity name</label>
                  <input
                    type="text"
                    value={activity.name}
                    onChange={(e) =>
                      updateActivity(index, (curr) => ({ ...curr, name: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />

                  <label className="mb-1 mt-3 block text-sm font-medium text-slate-700">
                    Activity description (optional)
                  </label>
                  <input
                    type="text"
                    value={activity.description}
                    onChange={(e) =>
                      updateActivity(index, (curr) => ({ ...curr, description: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />

                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    {activity.tasks.map((task, taskIndex) => (
                      <label key={taskIndex} className="block text-sm font-medium text-slate-700">
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
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
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
            className="rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Creating group…' : 'Create group'}
          </button>
        </form>
      </main>
    </div>
  )
}
