import { Link } from 'react-router-dom'
import {
  getCompoundCount,
  getCompoundTarget,
  isCompoundTask,
  isCompoundCounterFrozen,
  isCompoundReadyToSubmit,
} from '../lib/compoundTask'
import { getTaskStatus } from '../lib/taskStatus'

function TaskStatusDot({ status }) {
  if (status === 'approved') {
    return (
      <div
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#C0DD97] text-[10px] text-[#173404]"
        aria-hidden
      >
        ✓
      </div>
    )
  }
  if (status === 'pending') {
    return (
      <div
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FAEEDA] text-[10px] text-[#633806]"
        aria-hidden
      >
        ⏳
      </div>
    )
  }
  return (
    <div className="h-5 w-5 shrink-0 rounded-full border border-black/18 bg-tour-muted" aria-hidden />
  )
}

/**
 * @param {object} props
 * @param {{ id: string, name?: string }} props.task
 * @param {string} props.groupId
 * @param {string} props.activityId
 * @param {object | null | undefined} props.progress
 * @param {object | null | undefined} props.pendingDoc
 * @param {object | null | undefined} props.member
 * @param {function} props.t
 * @param {(activityId: string, taskId: string, delta: number) => void} props.onCompoundDelta
 * @param {boolean} props.compoundBusy
 */
export function ActivityListTaskRow({
  task,
  groupId,
  activityId,
  progress,
  pendingDoc,
  member,
  t,
  onCompoundDelta,
  compoundBusy,
}) {
  const status = getTaskStatus(task, progress, pendingDoc)
  const compound = isCompoundTask(task)
  const y = compound ? getCompoundTarget(task) : null
  const x = compound ? getCompoundCount(member, activityId, task.id) : 0
  const counterFrozen = compound ? isCompoundCounterFrozen(task, progress, pendingDoc) : true

  const completePath = `/group/${groupId}/complete?${new URLSearchParams({
    activityId,
    taskId: task.id,
  }).toString()}`

  const completePillClass =
    'shrink-0 rounded-full border border-tour-accent px-2.5 py-1 text-[11px] font-medium text-tour-accent-foreground'

  const disabledPillClass =
    'shrink-0 cursor-not-allowed rounded-full border border-black/10 px-2.5 py-1 text-[11px] font-medium text-tour-text-secondary opacity-60'

  const canSubmitCompound = compound
    ? isCompoundReadyToSubmit(task, progress, pendingDoc, member, activityId)
    : true

  if (status === 'empty' && (!compound || canSubmitCompound)) {
    return (
      <li className="min-w-0 first:pt-0 last:pb-0">
        <Link
          to={completePath}
          className="-mx-2 flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-2 text-left text-inherit no-underline hover:bg-black/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-tour-accent"
        >
          <TaskStatusDot status={status} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-tour-text">{task.name}</p>
            {compound ? (
              <p className="mt-0.5 text-[11px] text-tour-text-secondary">{t('activities.compoundHint')}</p>
            ) : null}
          </div>
          {compound ? (
            <div
              className="flex shrink-0 items-center gap-1 rounded-full border border-black/10 bg-tour-muted px-1 py-0.5"
              onClick={(e) => e.preventDefault()}
            >
              <span className="min-w-[2.75rem] text-center text-[11px] font-medium tabular-nums text-tour-text">
                {x}/{y}
              </span>
            </div>
          ) : null}
          <span className={completePillClass}>{t('activities.taskComplete')}</span>
        </Link>
      </li>
    )
  }

  if (compound && (status === 'empty' || (status === 'blocked' && !counterFrozen))) {
    return (
      <li className="min-w-0 first:pt-0 last:pb-0">
        <div className="flex min-w-0 items-center gap-2.5 py-2">
          <TaskStatusDot status={status} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-tour-text">{task.name}</p>
            <p className="mt-0.5 text-[11px] text-tour-text-secondary">{t('activities.compoundHint')}</p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              disabled={counterFrozen || compoundBusy || x <= 0}
              aria-label={t('activities.compoundDecrementAria')}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-black/15 bg-tour-surface text-[15px] font-medium text-tour-text hover:bg-tour-muted disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => onCompoundDelta(activityId, task.id, -1)}
            >
              −
            </button>
            <span className="min-w-[2.75rem] text-center text-[11px] font-medium tabular-nums text-tour-text">
              {x}/{y}
            </span>
            <button
              type="button"
              disabled={counterFrozen || compoundBusy || x >= y}
              aria-label={t('activities.compoundIncrementAria')}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-black/15 bg-tour-surface text-[15px] font-medium text-tour-text hover:bg-tour-muted disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => onCompoundDelta(activityId, task.id, 1)}
            >
              +
            </button>
          </div>
          <button type="button" disabled className={disabledPillClass}>
            {t('activities.taskComplete')}
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className="min-w-0 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2.5 py-2">
        <TaskStatusDot status={status} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-tour-text">{task.name}</p>
          {status === 'pending' && (
            <p className="mt-0.5 text-[11px] text-tour-text-secondary">{t('activities.taskPending')}</p>
          )}
        </div>
        {status === 'blocked' && (
          <button type="button" disabled className={disabledPillClass}>
            {t('activities.taskComplete')}
          </button>
        )}
      </div>
    </li>
  )
}
