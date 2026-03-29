import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { subscribePendingCount } from '../services/approvalService'
import {
  subscribeActivities,
  subscribeGroupMembers,
  updateActivityDocument,
} from '../services/activityService'
import { getGroup } from '../services/groupService'
import {
  addGroupActivity,
  regenerateGroupInviteCode,
  removeGroupMember,
  updateGroupDetails,
} from '../services/groupSettingsService'

function userInitials(displayName, email) {
  const name = displayName?.trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  const em = email?.trim()
  if (em) return em.slice(0, 2).toUpperCase()
  return '??'
}

function emptyAddActivity() {
  return { name: '', description: '', tasks: ['', '', ''] }
}

export function GroupSettingsPage() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const [group, setGroup] = useState(null)
  const [loadingGroup, setLoadingGroup] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [countError, setCountError] = useState('')
  const [members, setMembers] = useState([])
  const [activities, setActivities] = useState([])
  const [listError, setListError] = useState('')

  const [groupName, setGroupName] = useState('')
  const [groupDescription, setGroupDescription] = useState('')
  const [savingGroup, setSavingGroup] = useState(false)
  const [groupSaveError, setGroupSaveError] = useState('')

  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [copyHint, setCopyHint] = useState('')

  const [addForm, setAddForm] = useState(emptyAddActivity)
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState('')
  const [addActivityExpanded, setAddActivityExpanded] = useState(false)

  const [editingActivity, setEditingActivity] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState('')

  const [removeBusyId, setRemoveBusyId] = useState('')

  async function refreshGroup() {
    if (!groupId) return
    const g = await getGroup(groupId)
    setGroup(g)
    if (g) {
      setGroupName(g.name || '')
      setGroupDescription(g.description ?? '')
    }
  }

  useEffect(() => {
    let active = true
    async function run() {
      if (!groupId) return
      setLoadingGroup(true)
      try {
        const g = await getGroup(groupId)
        if (active) {
          setGroup(g)
          if (g) {
            setGroupName(g.name || '')
            setGroupDescription(g.description ?? '')
          }
        }
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
    setCountError('')
    const unsub = subscribePendingCount(
      groupId,
      (n) => setPendingCount(n),
      (e) => setCountError(e.message || 'Could not load pending count.'),
    )
    return () => unsub()
  }, [groupId, isOwner])

  useEffect(() => {
    if (!groupId || !isOwner) return
    setListError('')
    const unsubM = subscribeGroupMembers(
      groupId,
      (list) => setMembers(list),
      (e) => setListError(e.message || 'Could not load members.'),
    )
    const unsubA = subscribeActivities(
      groupId,
      (list) => setActivities(list),
      (e) => setListError(e.message || 'Could not load activities.'),
    )
    return () => {
      unsubM()
      unsubA()
    }
  }, [groupId, isOwner])

  const inviteJoinUrl = useMemo(() => {
    if (!group?.inviteCode || typeof window === 'undefined') return ''
    return `${window.location.origin}/join/${group.inviteCode}`
  }, [group?.inviteCode])

  async function handleSaveGroup(e) {
    e.preventDefault()
    setGroupSaveError('')
    setSavingGroup(true)
    try {
      await updateGroupDetails(groupId, { name: groupName, description: groupDescription })
      await refreshGroup()
    } catch (err) {
      setGroupSaveError(err.message || 'Could not save.')
    } finally {
      setSavingGroup(false)
    }
  }

  async function handleCopyInvite() {
    setCopyHint('')
    const text = inviteJoinUrl || group?.inviteCode
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopyHint('Copied.')
      setTimeout(() => setCopyHint(''), 2000)
    } catch {
      setCopyHint('Copy failed — select the code manually.')
    }
  }

  async function handleRegenerateInvite() {
    if (
      !window.confirm(
        'Generate a new invite code? The old code will stop working immediately for anyone who has it.',
      )
    ) {
      return
    }
    setInviteError('')
    setInviteBusy(true)
    try {
      const { inviteCode } = await regenerateGroupInviteCode(groupId)
      await refreshGroup()
      setCopyHint(`New code: ${inviteCode}`)
      setTimeout(() => setCopyHint(''), 4000)
    } catch (err) {
      setInviteError(err.message || 'Could not regenerate.')
    } finally {
      setInviteBusy(false)
    }
  }

  async function handleRemoveMember(memberId, displayName) {
    if (memberId === user?.uid) return
    if (
      !window.confirm(
        `Remove ${displayName || 'this member'} from the group? Their pending submissions will be deleted.`,
      )
    ) {
      return
    }
    setRemoveBusyId(memberId)
    try {
      await removeGroupMember(groupId, memberId, user.uid)
    } catch (err) {
      window.alert(err.message || 'Could not remove member.')
    } finally {
      setRemoveBusyId('')
    }
  }

  async function handleAddActivity(e) {
    e.preventDefault()
    setAddError('')
    setAddBusy(true)
    try {
      await addGroupActivity(groupId, addForm, user?.displayName || user?.email || 'Owner')
      setAddForm(emptyAddActivity())
      setAddActivityExpanded(false)
    } catch (err) {
      setAddError(err.message || 'Could not add activity.')
    } finally {
      setAddBusy(false)
    }
  }

  function openEditActivity(activity) {
    setEditingActivity(activity.id)
    setEditError('')
    const names = (activity.tasks || []).slice(0, 3).map((t) => t.name || '')
    while (names.length < 3) names.push('')
    setEditForm({
      name: activity.name || '',
      description: activity.description || '',
      taskNames: names,
    })
  }

  function closeEditActivity() {
    setEditingActivity(null)
    setEditForm(null)
  }

  async function handleSaveActivity(e) {
    e.preventDefault()
    if (!editingActivity || !editForm) return
    setEditError('')
    setEditBusy(true)
    try {
      const activitySnap = activities.find((x) => x.id === editingActivity)
      const taskNames = [...(editForm.taskNames || [])]
      while (taskNames.length < 3) taskNames.push('')
      const tasksPayload = [0, 1, 2].map((i) => ({
        name: taskNames[i]?.trim() || `Task ${i + 1}`,
        description: activitySnap?.tasks?.[i]?.description ?? null,
      }))
      await updateActivityDocument(groupId, editingActivity, {
        name: editForm.name,
        description: editForm.description,
        tasks: tasksPayload,
      })
      closeEditActivity()
    } catch (err) {
      setEditError(err.message || 'Could not save activity.')
    } finally {
      setEditBusy(false)
    }
  }

  if (!loadingGroup && !group) {
    return <p className="text-sm text-tour-text-secondary">Group not found.</p>
  }

  if (!loadingGroup && group && !isMember) {
    return <p className="text-sm text-tour-text-secondary">You are not a member of this group.</p>
  }

  if (!loadingGroup && group && isMember && !isOwner) {
    return <Navigate to={`/group/${groupId}/feed`} replace />
  }

  return (
    <div className="text-tour-text">
      <div className="mb-4 border-b border-black/10 pb-3 lg:hidden">
        <p className="text-[11px] font-medium uppercase tracking-wide text-tour-text-secondary">
          Il Tour di Paolo
        </p>
        <p className="text-[15px] font-medium text-tour-text">{group?.name || 'Group'}</p>
      </div>

      {loadingGroup && <p className="text-sm text-tour-text-secondary">Loading…</p>}

      {!loadingGroup && isOwner && (
        <div className="space-y-4">
          <section className="rounded-xl border border-black/10 bg-tour-surface p-4">
            <h2 className="text-[14px] font-medium text-tour-text">Pending approvals</h2>
            {countError && <p className="mt-2 text-[12px] text-red-700">{countError}</p>}
            {!countError && (
              <p className="mt-2 text-[13px] text-tour-text-secondary">
                {pendingCount === 0
                  ? 'No submissions awaiting review.'
                  : `${pendingCount} submission${pendingCount === 1 ? '' : 's'} awaiting review.`}
              </p>
            )}
            <Link
              to={`/group/${groupId}/approvals`}
              className="mt-3 inline-block rounded-full border border-tour-accent px-4 py-2 text-[12px] font-medium text-tour-accent-foreground"
            >
              Open approval queue
              {pendingCount > 0 ? (
                <span className="ml-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-tour-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              ) : null}
            </Link>
          </section>

          <section className="rounded-xl border border-black/10 bg-tour-surface p-4">
            <h2 className="text-[14px] font-medium text-tour-text">Group details</h2>
            <form onSubmit={handleSaveGroup} className="mt-3 space-y-3">
              <label className="block text-[12px] font-medium text-tour-text-secondary">
                Name
                <input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-black/18 bg-tour-surface px-3 py-2 text-[13px] text-tour-text shadow-sm focus:border-tour-accent focus:outline-none focus:ring-1 focus:ring-tour-accent"
                  required
                />
              </label>
              <label className="block text-[12px] font-medium text-tour-text-secondary">
                Description (optional)
                <textarea
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-black/18 bg-tour-surface px-3 py-2 text-[13px] text-tour-text shadow-sm focus:border-tour-accent focus:outline-none focus:ring-1 focus:ring-tour-accent"
                />
              </label>
              {groupSaveError && (
                <p className="text-[12px] text-red-700">{groupSaveError}</p>
              )}
              <button
                type="submit"
                disabled={savingGroup}
                className="rounded-lg bg-tour-accent px-4 py-2 text-[12px] font-medium text-tour-accent-muted hover:opacity-95 disabled:opacity-60"
              >
                {savingGroup ? 'Saving…' : 'Save group details'}
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-black/10 bg-tour-surface p-4">
            <h2 className="text-[14px] font-medium text-tour-text">Invite</h2>
            <p className="mt-2 text-[12px] text-tour-text-secondary">
              Share this link or code so people can join.
            </p>
            <div className="mt-2 rounded-lg border border-black/10 bg-tour-muted/30 px-3 py-2 font-mono text-[13px] text-tour-text">
              {group?.inviteCode || '—'}
            </div>
            {inviteJoinUrl && (
              <p className="mt-2 break-all text-[11px] text-tour-text-secondary">{inviteJoinUrl}</p>
            )}
            {inviteError && <p className="mt-2 text-[12px] text-red-700">{inviteError}</p>}
            {copyHint && <p className="mt-2 text-[12px] text-tour-accent">{copyHint}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopyInvite}
                className="rounded-lg border border-black/18 bg-tour-surface px-3 py-2 text-[12px] font-medium text-tour-text hover:bg-tour-muted"
              >
                Copy link or code
              </button>
              <button
                type="button"
                onClick={handleRegenerateInvite}
                disabled={inviteBusy}
                className="rounded-lg border border-black/18 bg-tour-surface px-3 py-2 text-[12px] font-medium text-tour-text hover:bg-tour-muted disabled:opacity-60"
              >
                {inviteBusy ? 'Regenerating…' : 'Regenerate code'}
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-black/10 bg-tour-surface p-4">
            <h2 className="text-[14px] font-medium text-tour-text">Members</h2>
            {listError && <p className="mt-2 text-[12px] text-red-700">{listError}</p>}
            <ul className="mt-3 divide-y divide-black/10">
              {members.map((m) => {
                const isRowOwner = m.id === group?.ownerId
                const initials = userInitials(m.displayName, null)
                return (
                  <li key={m.id} className="flex min-w-0 items-center gap-2 py-3 first:pt-0">
                    <Link
                      to={`/group/${groupId}/profile/${m.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1 text-tour-text hover:bg-black/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-tour-accent"
                    >
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#B5D4F4] text-[12px] font-medium text-[#0C447C]"
                        aria-hidden
                      >
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-[13px] font-medium">{m.displayName || 'Member'}</span>
                        {isRowOwner && (
                          <span className="ml-2 rounded bg-tour-muted px-1.5 py-0.5 text-[10px] font-medium text-tour-text-secondary">
                            Owner
                          </span>
                        )}
                      </div>
                    </Link>
                    {m.id !== user?.uid && !isRowOwner && (
                      <button
                        type="button"
                        disabled={removeBusyId === m.id}
                        onClick={() => handleRemoveMember(m.id, m.displayName)}
                        className="shrink-0 rounded-lg border border-red-200 px-2.5 py-1.5 text-[11px] font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
                      >
                        {removeBusyId === m.id ? '…' : 'Remove'}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="rounded-xl border border-black/10 bg-tour-surface p-4">
            <button
              type="button"
              aria-expanded={addActivityExpanded}
              onClick={() => setAddActivityExpanded((v) => !v)}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <h2 className="text-[14px] font-medium text-tour-text">Add activity</h2>
              <span className="shrink-0 text-[11px] text-tour-text-secondary" aria-hidden>
                {addActivityExpanded ? '▲' : '▼'}
              </span>
            </button>
            {addActivityExpanded && (
              <>
                <p className="mt-2 text-[12px] text-tour-text-secondary">
                  New activities appear for everyone. A short post is added to the group feed.
                </p>
                <form onSubmit={handleAddActivity} className="mt-3 space-y-3">
                  <label className="block text-[12px] font-medium text-tour-text-secondary">
                    Activity name
                    <input
                      value={addForm.name}
                      onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/18 px-3 py-2 text-[13px] text-tour-text"
                      required
                    />
                  </label>
                  <label className="block text-[12px] font-medium text-tour-text-secondary">
                    Description (optional)
                    <input
                      value={addForm.description}
                      onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/18 px-3 py-2 text-[13px] text-tour-text"
                    />
                  </label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {[0, 1, 2].map((i) => (
                      <label key={i} className="block text-[12px] font-medium text-tour-text-secondary">
                        Task {i + 1}
                        <input
                          value={addForm.tasks[i]}
                          onChange={(e) =>
                            setAddForm((f) => {
                              const next = [...f.tasks]
                              next[i] = e.target.value
                              return { ...f, tasks: next }
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-black/18 px-3 py-2 text-[13px] text-tour-text"
                        />
                      </label>
                    ))}
                  </div>
                  {addError && <p className="text-[12px] text-red-700">{addError}</p>}
                  <button
                    type="submit"
                    disabled={addBusy}
                    className="rounded-lg bg-tour-accent px-4 py-2 text-[12px] font-medium text-tour-accent-muted hover:opacity-95 disabled:opacity-60"
                  >
                    {addBusy ? 'Adding…' : 'Add activity'}
                  </button>
                </form>
              </>
            )}
          </section>

          <section className="rounded-xl border border-black/10 bg-tour-surface p-4">
            <h2 className="text-[14px] font-medium text-tour-text">Edit activities</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-tour-text-secondary">
              Same fields as <span className="font-medium text-tour-text">Add activity</span> (activity
              name, optional description, three task names). After the first approval in an activity,
              the <span className="font-medium text-tour-text">three tasks and their order</span> are
              fixed in the database — you can still rename the activity and tasks; you cannot add,
              remove, or reorder tasks (see DESIGN §8).
            </p>
            {activities.length === 0 ? (
              <p className="mt-3 text-[13px] text-tour-text-secondary">No activities yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {activities.map((a) => (
                  <li key={a.id} className="rounded-lg border border-black/10 p-3">
                    {editingActivity === a.id && editForm ? (
                      <form onSubmit={handleSaveActivity} className="space-y-3">
                        <label className="block text-[12px] font-medium text-tour-text-secondary">
                          Activity name
                          <input
                            value={editForm.name}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, name: e.target.value }))
                            }
                            className="mt-1 w-full rounded-lg border border-black/18 px-3 py-2 text-[13px] text-tour-text"
                            required
                          />
                        </label>
                        <label className="block text-[12px] font-medium text-tour-text-secondary">
                          Description (optional)
                          <input
                            value={editForm.description}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, description: e.target.value }))
                            }
                            className="mt-1 w-full rounded-lg border border-black/18 px-3 py-2 text-[13px] text-tour-text"
                          />
                        </label>
                        <div className="grid gap-2 sm:grid-cols-3">
                          {[0, 1, 2].map((i) => (
                            <label key={i} className="block text-[12px] font-medium text-tour-text-secondary">
                              Task {i + 1}
                              <input
                                value={editForm.taskNames[i] ?? ''}
                                onChange={(e) =>
                                  setEditForm((f) => {
                                    const next = [...(f.taskNames || ['', '', ''])]
                                    next[i] = e.target.value
                                    return { ...f, taskNames: next }
                                  })
                                }
                                className="mt-1 w-full rounded-lg border border-black/18 px-3 py-2 text-[13px] text-tour-text"
                              />
                            </label>
                          ))}
                        </div>
                        {editError && <p className="text-[12px] text-red-700">{editError}</p>}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="submit"
                            disabled={editBusy}
                            className="rounded-lg bg-tour-accent px-3 py-1.5 text-[12px] font-medium text-tour-accent-muted disabled:opacity-60"
                          >
                            {editBusy ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={closeEditActivity}
                            className="rounded-lg border border-black/18 px-3 py-1.5 text-[12px] text-tour-text"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-tour-text">{a.name}</p>
                          <p className="mt-0.5 text-[11px] leading-snug text-tour-text-secondary">
                            {a.isLocked ? (
                              <>
                                <span className="font-medium text-tour-text">Progress started</span> — at
                                least one task has been approved. You can still rename this activity and
                                its three tasks; you cannot add, remove, or reorder tasks.
                              </>
                            ) : (
                              <>
                                <span className="font-medium text-tour-text">No approvals yet</span> —
                                rename freely; structure will lock after the first approval.
                              </>
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openEditActivity(a)}
                          className="shrink-0 self-start rounded-lg border border-black/18 px-3 py-1.5 text-[12px] font-medium text-tour-text hover:bg-tour-muted"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
