import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { useAuth } from '../context/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { normalizeCompoundTargetInput } from '../lib/compoundTask'
import { subscribePendingCount } from '../services/approvalService'
import {
  subscribeActivities,
  subscribeGroupMembers,
  updateActivityDocument,
} from '../services/activityService'
import { getGroup } from '../services/groupService'
import {
  addGroupActivity,
  deleteEntireGroup,
  ensureActivityAdvancedDefaults,
  regenerateGroupInviteCode,
  removeGroupMember,
  updateGroupDetails,
} from '../services/groupSettingsService'

function emptyAddActivity() {
  return {
    name: '',
    description: '',
    tasks: [
      { name: '', kind: 'simple', targetCount: 10 },
      { name: '', kind: 'simple', targetCount: 10 },
      { name: '', kind: 'simple', targetCount: 10 },
    ],
    isAdvanced: false,
    prerequisiteActivityId: '',
    isPersonal: false,
    assignedUserId: '',
  }
}

export function GroupSettingsPage() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useTranslation()
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

  const [deleteGroupNameInput, setDeleteGroupNameInput] = useState('')
  const [deleteGroupBusy, setDeleteGroupBusy] = useState(false)
  const [deleteGroupError, setDeleteGroupError] = useState('')

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
      (e) => setCountError(e.message || t('groupSettings.pendingCountError')),
    )
    return () => unsub()
  }, [groupId, isOwner, t])

  useEffect(() => {
    if (!groupId || !isOwner) return
    ensureActivityAdvancedDefaults(groupId).catch(() => {})
  }, [groupId, isOwner])

  useEffect(() => {
    if (!groupId || !isOwner) return
    setListError('')
    const unsubM = subscribeGroupMembers(
      groupId,
      (list) => setMembers(list),
      (e) => setListError(e.message || t('groupSettings.listLoadMembersFailed')),
    )
    const unsubA = subscribeActivities(
      groupId,
      (list) => setActivities(list),
      (e) => setListError(e.message || t('groupSettings.listLoadActivitiesFailed')),
    )
    return () => {
      unsubM()
      unsubA()
    }
  }, [groupId, isOwner, t])

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
      setGroupSaveError(err.message || t('groupSettings.saveDetailsFailed'))
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
      setCopyHint(t('groupSettings.copied'))
      setTimeout(() => setCopyHint(''), 2000)
    } catch {
      setCopyHint(t('groupSettings.copyFailed'))
    }
  }

  async function handleRegenerateInvite() {
    if (!window.confirm(t('groupSettings.regenerateConfirm'))) {
      return
    }
    setInviteError('')
    setInviteBusy(true)
    try {
      const { inviteCode } = await regenerateGroupInviteCode(groupId)
      await refreshGroup()
      setCopyHint(t('groupSettings.newCodeHint', { code: inviteCode }))
      setTimeout(() => setCopyHint(''), 4000)
    } catch (err) {
      setInviteError(err.message || t('groupSettings.regenerateFailed'))
    } finally {
      setInviteBusy(false)
    }
  }

  async function handleDeleteGroup() {
    const expected = (group?.name || '').trim()
    if (!expected || deleteGroupNameInput.trim() !== expected) return
    if (!window.confirm(t('groupSettings.deleteGroupFinalConfirm'))) {
      return
    }
    if (!user?.uid) return
    setDeleteGroupError('')
    setDeleteGroupBusy(true)
    try {
      await deleteEntireGroup(groupId, user.uid)
      navigate('/', { replace: true })
    } catch (err) {
      setDeleteGroupError(err.message || t('groupSettings.deleteGroupFailed'))
    } finally {
      setDeleteGroupBusy(false)
    }
  }

  async function handleRemoveMember(memberId, displayName) {
    if (memberId === user?.uid) return
    if (
      !window.confirm(
        t('groupSettings.removeMemberConfirm', {
          name: displayName || t('groupSettings.removeMemberFallback'),
        }),
      )
    ) {
      return
    }
    setRemoveBusyId(memberId)
    try {
      await removeGroupMember(groupId, memberId, user.uid)
    } catch (err) {
      window.alert(err.message || t('groupSettings.removeMemberFailed'))
    } finally {
      setRemoveBusyId('')
    }
  }

  async function handleAddActivity(e) {
    e.preventDefault()
    setAddError('')
    setAddBusy(true)
    try {
      await addGroupActivity(
        groupId,
        addForm,
        user?.displayName || user?.email || t('groupShell.roleOwner'),
      )
      setAddForm(emptyAddActivity())
      setAddActivityExpanded(false)
    } catch (err) {
      setAddError(err.message || t('groupSettings.addActivityFailed'))
    } finally {
      setAddBusy(false)
    }
  }

  function openEditActivity(activity) {
    setEditingActivity(activity.id)
    setEditError('')
    const tks = (activity.tasks || []).slice(0, 3)
    const pad = (i) => tks[i] || {}
    const names = [0, 1, 2].map((i) => pad(i).name || '')
    setEditForm({
      name: activity.name || '',
      description: activity.description || '',
      taskNames: names,
      taskKinds: [0, 1, 2].map((i) => (pad(i).kind === 'compound' ? 'compound' : 'simple')),
      taskTargets: [0, 1, 2].map((i) => pad(i).targetCount ?? 10),
      isAdvanced: activity.isAdvanced === true,
      prerequisiteActivityId: activity.prerequisiteActivityId || '',
      isPersonal: activity.isPersonal === true,
      assignedUserId: activity.assignedUserId || '',
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
      const locked = activitySnap?.isLocked === true
      const tasksPayload = [0, 1, 2].map((i) => {
        const st = activitySnap?.tasks?.[i] || {}
        const name = taskNames[i]?.trim() || t('groupNew.taskLabel', { n: i + 1 })
        const description = st.description ?? null
        if (locked) {
          const kind = st.kind === 'compound' ? 'compound' : 'simple'
          return {
            name,
            description,
            kind,
            targetCount: kind === 'compound' ? normalizeCompoundTargetInput(st.targetCount) : null,
          }
        }
        const kind = editForm.taskKinds[i] === 'compound' ? 'compound' : 'simple'
        return {
          name,
          description,
          kind,
          targetCount: kind === 'compound' ? normalizeCompoundTargetInput(editForm.taskTargets[i]) : null,
        }
      })
      const personalPayload =
        activitySnap?.isLocked && activitySnap?.isPersonal && !activitySnap?.assignedUserId
          ? { assignedUserId: editForm.assignedUserId || null }
          : !activitySnap?.isLocked
            ? {
                isPersonal: editForm.isPersonal === true,
                assignedUserId:
                  editForm.isPersonal === true ? editForm.assignedUserId || null : null,
              }
            : {}

      await updateActivityDocument(groupId, editingActivity, {
        name: editForm.name,
        description: editForm.description,
        tasks: tasksPayload,
        ...(activitySnap?.isLocked
          ? {}
          : {
              isAdvanced: editForm.isAdvanced === true,
              prerequisiteActivityId: editForm.prerequisiteActivityId,
            }),
        ...personalPayload,
      })
      closeEditActivity()
    } catch (err) {
      setEditError(err.message || t('groupSettings.editActivityFailed'))
    } finally {
      setEditBusy(false)
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

      {loadingGroup && <p className="text-sm text-tour-text-secondary">{t('groupInfo.loading')}</p>}

      {!loadingGroup && isOwner && (
        <div className="space-y-4">
          <section className="rounded-xl border border-black/10 bg-tour-surface p-4">
            <h2 className="text-[14px] font-medium text-tour-text">
              {t('groupSettings.pendingApprovalsTitle')}
            </h2>
            {countError && <p className="mt-2 text-[12px] text-red-700">{countError}</p>}
            {!countError && (
              <p className="mt-2 text-[13px] text-tour-text-secondary">
                {pendingCount === 0
                  ? t('groupSettings.noSubmissionsAwaiting')
                  : pendingCount === 1
                    ? t('groupSettings.submissionsAwaiting_one', { count: pendingCount })
                    : t('groupSettings.submissionsAwaiting_other', { count: pendingCount })}
              </p>
            )}
            <Link
              to={`/group/${groupId}/approvals`}
              className="mt-3 inline-block rounded-full border border-tour-accent px-4 py-2 text-[12px] font-medium text-tour-accent-foreground"
            >
              {t('groupSettings.openApprovalQueue')}
              {pendingCount > 0 ? (
                <span className="ml-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-tour-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              ) : null}
            </Link>
          </section>

          <section className="rounded-xl border border-black/10 bg-tour-surface p-4">
            <h2 className="text-[14px] font-medium text-tour-text">
              {t('groupSettings.groupDetailsTitle')}
            </h2>
            <form onSubmit={handleSaveGroup} className="mt-3 space-y-3">
              <label className="block text-[12px] font-medium text-tour-text-secondary">
                {t('groupSettings.groupNameLabel')}
                <input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-black/18 bg-tour-surface px-3 py-2 text-[13px] text-tour-text shadow-sm focus:border-tour-accent focus:outline-none focus:ring-1 focus:ring-tour-accent"
                  required
                />
              </label>
              <label className="block text-[12px] font-medium text-tour-text-secondary">
                {t('groupSettings.groupDescriptionLabel')}
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
                {savingGroup ? t('groupSettings.savingDetails') : t('groupSettings.saveGroupDetails')}
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-black/10 bg-tour-surface p-4">
            <h2 className="text-[14px] font-medium text-tour-text">{t('groupSettings.inviteTitle')}</h2>
            <p className="mt-2 text-[12px] text-tour-text-secondary">{t('groupSettings.inviteHint')}</p>
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
                {t('groupSettings.copyLinkOrCode')}
              </button>
              <button
                type="button"
                onClick={handleRegenerateInvite}
                disabled={inviteBusy}
                className="rounded-lg border border-black/18 bg-tour-surface px-3 py-2 text-[12px] font-medium text-tour-text hover:bg-tour-muted disabled:opacity-60"
              >
                {inviteBusy ? t('groupSettings.regenerating') : t('groupSettings.regenerateCode')}
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-black/10 bg-tour-surface p-4">
            <h2 className="text-[14px] font-medium text-tour-text">{t('groupInfo.membersHeading')}</h2>
            {listError && <p className="mt-2 text-[12px] text-red-700">{listError}</p>}
            <ul className="mt-3 divide-y divide-black/10">
              {members.map((m) => {
                const isRowOwner = m.id === group?.ownerId
                return (
                  <li key={m.id} className="flex min-w-0 items-center gap-2 py-3 first:pt-0">
                    <Link
                      to={`/group/${groupId}/profile/${m.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1 text-tour-text hover:bg-black/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-tour-accent"
                    >
                      <Avatar
                        avatarUrl={m.avatarUrl}
                        displayName={m.displayName}
                        seed={m.id}
                        className="h-10 w-10 text-[12px] shrink-0"
                        alt=""
                      />
                      <div className="min-w-0 flex-1">
                        <span className="text-[13px] font-medium">
                          {m.displayName || t('groupShell.displayNameFallback')}
                        </span>
                        {isRowOwner && (
                          <span className="ml-2 rounded bg-tour-muted px-1.5 py-0.5 text-[10px] font-medium text-tour-text-secondary">
                            {t('groupShell.ownerTag')}
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
                        {removeBusyId === m.id ? t('groupSettings.removeBusy') : t('groupSettings.removeMember')}
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
              <h2 className="text-[14px] font-medium text-tour-text">
                {t('groupSettings.addActivityTitle')}
              </h2>
              <span className="shrink-0 text-[11px] text-tour-text-secondary" aria-hidden>
                {addActivityExpanded ? '▲' : '▼'}
              </span>
            </button>
            {addActivityExpanded && (
              <>
                <p className="mt-2 text-[12px] text-tour-text-secondary">
                  {t('groupSettings.addActivityHint')}
                </p>
                <form onSubmit={handleAddActivity} className="mt-3 space-y-3">
                  <label className="block text-[12px] font-medium text-tour-text-secondary">
                    {t('groupSettings.addActivityNameLabel')}
                    <input
                      value={addForm.name}
                      onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/18 px-3 py-2 text-[13px] text-tour-text"
                      required
                    />
                  </label>
                  <label className="block text-[12px] font-medium text-tour-text-secondary">
                    {t('groupNew.descriptionLabel')}
                    <input
                      value={addForm.description}
                      onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-black/18 px-3 py-2 text-[13px] text-tour-text"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[0, 1, 2].map((i) => {
                      const row = addForm.tasks[i] || { name: '', kind: 'simple', targetCount: 10 }
                      const name = typeof row === 'string' ? row : row.name || ''
                      const kind = typeof row === 'string' ? 'simple' : row.kind || 'simple'
                      const targetCount = typeof row === 'string' ? 10 : row.targetCount ?? 10
                      return (
                        <div key={i} className="rounded-lg border border-black/10 p-2.5">
                          <label className="block text-[12px] font-medium text-tour-text-secondary">
                            {t('groupNew.taskLabel', { n: i + 1 })}
                            <input
                              value={name}
                              onChange={(e) =>
                                setAddForm((f) => {
                                  const next = [...f.tasks]
                                  const prev = next[i]
                                  const base =
                                    typeof prev === 'string'
                                      ? { name: prev, kind: 'simple', targetCount: 10 }
                                      : { name: '', kind: 'simple', targetCount: 10, ...prev }
                                  next[i] = { ...base, name: e.target.value }
                                  return { ...f, tasks: next }
                                })
                              }
                              className="mt-1 w-full rounded-lg border border-black/18 px-3 py-2 text-[13px] text-tour-text"
                            />
                          </label>
                          <label className="mt-2 flex items-center gap-2 text-[11px] font-medium text-tour-text-secondary">
                            <input
                              type="checkbox"
                              checked={kind === 'compound'}
                              onChange={(e) =>
                                setAddForm((f) => {
                                  const next = [...f.tasks]
                                  const prev = next[i]
                                  const base =
                                    typeof prev === 'string'
                                      ? { name: prev, kind: 'simple', targetCount: 10 }
                                      : { name: '', kind: 'simple', targetCount: 10, ...prev }
                                  next[i] = {
                                    ...base,
                                    kind: e.target.checked ? 'compound' : 'simple',
                                    targetCount: e.target.checked ? base.targetCount || 10 : 10,
                                  }
                                  return { ...f, tasks: next }
                                })
                              }
                              className="mt-0.5"
                            />
                            <span>{t('groupNew.taskCompoundToggle')}</span>
                          </label>
                          {kind === 'compound' ? (
                            <label className="mt-2 block text-[11px] font-medium text-tour-text-secondary">
                              {t('groupNew.taskCompoundTargetLabel')}
                              <input
                                type="number"
                                min={1}
                                max={100}
                                value={targetCount}
                                onChange={(e) =>
                                  setAddForm((f) => {
                                    const next = [...f.tasks]
                                    const prev = next[i]
                                    const base =
                                      typeof prev === 'string'
                                        ? { name: prev, kind: 'compound', targetCount: 10 }
                                        : { name: '', kind: 'simple', targetCount: 10, ...prev }
                                    const n = parseInt(e.target.value, 10)
                                    next[i] = {
                                      ...base,
                                      targetCount: Number.isFinite(n) ? n : 10,
                                    }
                                    return { ...f, tasks: next }
                                  })
                                }
                                className="mt-1 w-full rounded-lg border border-black/18 px-3 py-2 text-[13px] text-tour-text"
                              />
                            </label>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                  <label className="flex items-start gap-2 text-[12px] font-medium text-tour-text-secondary">
                    <input
                      type="checkbox"
                      checked={addForm.isAdvanced === true}
                      onChange={(e) =>
                        setAddForm((f) => ({
                          ...f,
                          isAdvanced: e.target.checked,
                          prerequisiteActivityId: e.target.checked ? f.prerequisiteActivityId : '',
                          isPersonal: e.target.checked ? false : f.isPersonal,
                          assignedUserId: e.target.checked ? '' : f.assignedUserId,
                        }))
                      }
                      className="mt-0.5"
                    />
                    <span>{t('groupSettings.advancedCheckboxAdd')}</span>
                  </label>
                  {addForm.isAdvanced && (
                    <label className="block text-[12px] font-medium text-tour-text-secondary">
                      {t('groupSettings.prerequisiteLabel')}
                      <select
                        value={addForm.prerequisiteActivityId}
                        onChange={(e) =>
                          setAddForm((f) => ({ ...f, prerequisiteActivityId: e.target.value }))
                        }
                        className="mt-1 w-full rounded-lg border border-black/18 bg-tour-surface px-3 py-2 text-[13px] text-tour-text"
                        required={addForm.isAdvanced}
                      >
                        <option value="">{t('groupSettings.selectPrerequisitePlaceholder')}</option>
                        {activities
                          .filter((x) => !x.isAdvanced && !x.isPersonal)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  <label className="flex items-start gap-2 text-[12px] font-medium text-tour-text-secondary">
                    <input
                      type="checkbox"
                      checked={addForm.isPersonal === true}
                      onChange={(e) =>
                        setAddForm((f) => ({
                          ...f,
                          isPersonal: e.target.checked,
                          isAdvanced: e.target.checked ? false : f.isAdvanced,
                          prerequisiteActivityId: e.target.checked ? '' : f.prerequisiteActivityId,
                          assignedUserId: e.target.checked
                            ? f.assignedUserId || user?.uid || ''
                            : '',
                        }))
                      }
                      className="mt-0.5"
                    />
                    <span>{t('groupSettings.personalCheckboxAdd')}</span>
                  </label>
                  {addForm.isPersonal && (
                    <label className="block text-[12px] font-medium text-tour-text-secondary">
                      {t('groupSettings.assigneeLabel')}
                      <select
                        value={addForm.assignedUserId}
                        onChange={(e) =>
                          setAddForm((f) => ({ ...f, assignedUserId: e.target.value }))
                        }
                        className="mt-1 w-full rounded-lg border border-black/18 bg-tour-surface px-3 py-2 text-[13px] text-tour-text"
                        required={addForm.isPersonal}
                      >
                        <option value="">{t('groupSettings.selectAssigneePlaceholder')}</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.displayName || t('groupShell.displayNameFallback')}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {addError && <p className="text-[12px] text-red-700">{addError}</p>}
                  <button
                    type="submit"
                    disabled={addBusy}
                    className="rounded-lg bg-tour-accent px-4 py-2 text-[12px] font-medium text-tour-accent-muted hover:opacity-95 disabled:opacity-60"
                  >
                    {addBusy ? t('groupSettings.addingActivity') : t('groupSettings.addActivityButton')}
                  </button>
                </form>
              </>
            )}
          </section>

          <section className="rounded-xl border border-black/10 bg-tour-surface p-4">
            <h2 className="text-[14px] font-medium text-tour-text">
              {t('groupSettings.editActivitiesTitle')}
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-tour-text-secondary">
              {t('groupSettings.editActivitiesIntro')}
            </p>
            {activities.length === 0 ? (
              <p className="mt-3 text-[13px] text-tour-text-secondary">
                {t('groupSettings.noActivitiesYet')}
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {activities.map((a) => {
                  const rowTint = a.isPersonal
                    ? 'border-amber-200 bg-amber-50/30'
                    : a.isAdvanced === true
                      ? 'border-violet-200 bg-violet-50/40'
                      : 'border-black/10'
                  return (
                  <li
                    key={a.id}
                    className={['rounded-lg border p-3', rowTint].join(' ')}
                  >
                    {editingActivity === a.id && editForm ? (
                      <form onSubmit={handleSaveActivity} className="space-y-3">
                        <label className="block text-[12px] font-medium text-tour-text-secondary">
                          {t('groupNew.activityNameLabel')}
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
                          {t('groupNew.descriptionLabel')}
                          <input
                            value={editForm.description}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, description: e.target.value }))
                            }
                            className="mt-1 w-full rounded-lg border border-black/18 px-3 py-2 text-[13px] text-tour-text"
                          />
                        </label>
                        {(() => {
                          const snap = activities.find((x) => x.id === editingActivity)
                          const kinds = editForm.taskKinds || ['simple', 'simple', 'simple']
                          const targets = editForm.taskTargets || [10, 10, 10]
                          if (snap?.isLocked) {
                            return (
                              <div className="grid gap-2 sm:grid-cols-3">
                                {[0, 1, 2].map((i) => (
                                  <label
                                    key={i}
                                    className="block text-[12px] font-medium text-tour-text-secondary"
                                  >
                                    {t('groupNew.taskLabel', { n: i + 1 })}
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
                            )
                          }
                          return (
                            <div className="grid gap-4 sm:grid-cols-3">
                              {[0, 1, 2].map((i) => (
                                <div key={i} className="rounded-lg border border-black/10 p-2.5">
                                  <label className="block text-[12px] font-medium text-tour-text-secondary">
                                    {t('groupNew.taskLabel', { n: i + 1 })}
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
                                  <label className="mt-2 flex items-center gap-2 text-[11px] font-medium text-tour-text-secondary">
                                    <input
                                      type="checkbox"
                                      checked={kinds[i] === 'compound'}
                                      onChange={(e) =>
                                        setEditForm((f) => {
                                          const nk = [...(f.taskKinds || ['simple', 'simple', 'simple'])]
                                          nk[i] = e.target.checked ? 'compound' : 'simple'
                                          return { ...f, taskKinds: nk }
                                        })
                                      }
                                      className="mt-0.5"
                                    />
                                    <span>{t('groupNew.taskCompoundToggle')}</span>
                                  </label>
                                  {kinds[i] === 'compound' ? (
                                    <label className="mt-2 block text-[11px] font-medium text-tour-text-secondary">
                                      {t('groupNew.taskCompoundTargetLabel')}
                                      <input
                                        type="number"
                                        min={1}
                                        max={100}
                                        value={targets[i]}
                                        onChange={(e) =>
                                          setEditForm((f) => {
                                            const nt = [...(f.taskTargets || [10, 10, 10])]
                                            const n = parseInt(e.target.value, 10)
                                            nt[i] = Number.isFinite(n) ? n : 10
                                            return { ...f, taskTargets: nt }
                                          })
                                        }
                                        className="mt-1 w-full rounded-lg border border-black/18 px-3 py-2 text-[13px] text-tour-text"
                                      />
                                    </label>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          )
                        })()}
                        {(() => {
                          const snap = activities.find((x) => x.id === editingActivity)
                          if (snap?.isLocked) return null
                          return (
                            <>
                              <label className="flex items-start gap-2 text-[12px] font-medium text-tour-text-secondary">
                                <input
                                  type="checkbox"
                                  checked={editForm.isAdvanced === true}
                                  onChange={(e) =>
                                    setEditForm((f) => ({
                                      ...f,
                                      isAdvanced: e.target.checked,
                                      prerequisiteActivityId: e.target.checked
                                        ? f.prerequisiteActivityId
                                        : '',
                                      isPersonal: e.target.checked ? false : f.isPersonal,
                                      assignedUserId: e.target.checked ? '' : f.assignedUserId,
                                    }))
                                  }
                                  className="mt-0.5"
                                />
                                <span>{t('groupSettings.advancedCheckboxEdit')}</span>
                              </label>
                              {editForm.isAdvanced && (
                                <label className="block text-[12px] font-medium text-tour-text-secondary">
                                  {t('groupSettings.prerequisiteLabel')}
                                  <select
                                    value={editForm.prerequisiteActivityId || ''}
                                    onChange={(e) =>
                                      setEditForm((f) => ({
                                        ...f,
                                        prerequisiteActivityId: e.target.value,
                                      }))
                                    }
                                    className="mt-1 w-full rounded-lg border border-black/18 bg-tour-surface px-3 py-2 text-[13px] text-tour-text"
                                    required
                                  >
                                    <option value="">
                                      {t('groupSettings.selectPrerequisitePlaceholder')}
                                    </option>
                                    {activities
                                      .filter(
                                        (x) =>
                                          !x.isAdvanced && !x.isPersonal && x.id !== editingActivity,
                                      )
                                      .map((x) => (
                                        <option key={x.id} value={x.id}>
                                          {x.name}
                                        </option>
                                      ))}
                                  </select>
                                </label>
                              )}
                              <label className="flex items-start gap-2 text-[12px] font-medium text-tour-text-secondary">
                                <input
                                  type="checkbox"
                                  checked={editForm.isPersonal === true}
                                  onChange={(e) =>
                                    setEditForm((f) => ({
                                      ...f,
                                      isPersonal: e.target.checked,
                                      isAdvanced: e.target.checked ? false : f.isAdvanced,
                                      prerequisiteActivityId: e.target.checked
                                        ? ''
                                        : f.prerequisiteActivityId,
                                      assignedUserId: e.target.checked
                                        ? f.assignedUserId || user?.uid || ''
                                        : '',
                                    }))
                                  }
                                  className="mt-0.5"
                                />
                                <span>{t('groupSettings.personalCheckboxEdit')}</span>
                              </label>
                              {editForm.isPersonal && (
                                <label className="block text-[12px] font-medium text-tour-text-secondary">
                                  {t('groupSettings.assigneeLabel')}
                                  <select
                                    value={editForm.assignedUserId || ''}
                                    onChange={(e) =>
                                      setEditForm((f) => ({ ...f, assignedUserId: e.target.value }))
                                    }
                                    className="mt-1 w-full rounded-lg border border-black/18 bg-tour-surface px-3 py-2 text-[13px] text-tour-text"
                                    required={editForm.isPersonal}
                                  >
                                    <option value="">{t('groupSettings.selectAssigneePlaceholder')}</option>
                                    {members.map((m) => (
                                      <option key={m.id} value={m.id}>
                                        {m.displayName || t('groupShell.displayNameFallback')}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              )}
                            </>
                          )
                        })()}
                        {(() => {
                          const snap = activities.find((x) => x.id === editingActivity)
                          const pickupOnly =
                            snap?.isLocked && snap?.isPersonal === true && !snap?.assignedUserId
                          if (!pickupOnly) return null
                          return (
                            <label className="block text-[12px] font-medium text-tour-text-secondary">
                              {t('groupSettings.assigneePickupLabel')}
                              <select
                                value={editForm.assignedUserId || ''}
                                onChange={(e) =>
                                  setEditForm((f) => ({ ...f, assignedUserId: e.target.value }))
                                }
                                className="mt-1 w-full rounded-lg border border-black/18 bg-tour-surface px-3 py-2 text-[13px] text-tour-text"
                                required
                              >
                                <option value="">{t('groupSettings.selectAssigneePlaceholder')}</option>
                                {members.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.displayName || t('groupShell.displayNameFallback')}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )
                        })()}
                        {editError && <p className="text-[12px] text-red-700">{editError}</p>}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="submit"
                            disabled={editBusy}
                            className="rounded-lg bg-tour-accent px-3 py-1.5 text-[12px] font-medium text-tour-accent-muted disabled:opacity-60"
                          >
                            {editBusy ? t('groupSettings.savingEdit') : t('groupSettings.save')}
                          </button>
                          <button
                            type="button"
                            onClick={closeEditActivity}
                            className="rounded-lg border border-black/18 px-3 py-1.5 text-[12px] text-tour-text"
                          >
                            {t('groupSettings.cancel')}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-tour-text">
                            {a.name}
                            {a.isAdvanced === true ? (
                              <span className="ml-2 align-middle rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                                {t('activities.advancedBadge')}
                              </span>
                            ) : null}
                            {a.isPersonal === true ? (
                              <span className="ml-2 align-middle rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                                {t('activities.personalBadge')}
                              </span>
                            ) : null}
                          </p>
                          {a.isPersonal === true ? (
                            <p className="mt-0.5 text-[11px] text-amber-900/90">
                              {!a.assignedUserId
                                ? t('groupSettings.personalUnassignedShort')
                                : t('groupSettings.personalAssignedTo', {
                                    name:
                                      members.find((m) => m.id === a.assignedUserId)?.displayName ||
                                      t('groupShell.displayNameFallback'),
                                  })}
                            </p>
                          ) : null}
                          <p className="mt-0.5 text-[11px] leading-snug text-tour-text-secondary">
                            {a.isLocked ? (
                              <>
                                <span className="font-medium text-tour-text">
                                  {t('groupSettings.lockedLead')}
                                </span>
                                {t('groupSettings.lockedRest')}
                              </>
                            ) : (
                              <>
                                <span className="font-medium text-tour-text">
                                  {t('groupSettings.unlockedLead')}
                                </span>
                                {t('groupSettings.unlockedRest')}
                              </>
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openEditActivity(a)}
                          className="shrink-0 self-start rounded-lg border border-black/18 px-3 py-1.5 text-[12px] font-medium text-tour-text hover:bg-tour-muted"
                        >
                          {t('groupSettings.edit')}
                        </button>
                      </div>
                    )}
                  </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-red-200 bg-red-50/40 p-4">
            <h2 className="text-[14px] font-medium text-red-950">
              {t('groupSettings.deleteGroupSectionTitle')}
            </h2>
            <p className="mt-2 text-[12px] leading-relaxed text-red-900/90">
              {t('groupSettings.deleteGroupIntro')}
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-red-900/80">
              {t('groupSettings.deleteGroupUserIdsHint')}
            </p>
            <label className="mt-3 block text-[12px] font-medium text-red-950">
              {t('groupSettings.deleteGroupTypeLabel')}
              <input
                type="text"
                value={deleteGroupNameInput}
                onChange={(e) => setDeleteGroupNameInput(e.target.value)}
                autoComplete="off"
                placeholder={(group?.name || '').trim() || '…'}
                className="mt-1 w-full rounded-lg border border-red-200 bg-tour-surface px-3 py-2 text-[13px] text-tour-text shadow-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-300"
              />
            </label>
            {deleteGroupError ? (
              <p className="mt-2 text-[12px] text-red-800">{deleteGroupError}</p>
            ) : null}
            <button
              type="button"
              disabled={
                deleteGroupBusy ||
                !(group?.name || '').trim() ||
                deleteGroupNameInput.trim() !== (group?.name || '').trim()
              }
              onClick={handleDeleteGroup}
              className="mt-3 min-h-11 rounded-lg border border-red-300 bg-tour-surface px-4 py-2 text-[12px] font-semibold text-red-900 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleteGroupBusy ? t('groupSettings.deleteGroupDeleting') : t('groupSettings.deleteGroupDeleteButton')}
            </button>
          </section>
        </div>
      )}
    </div>
  )
}
