import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/useAuth'
import { signOutUser } from '../services/authService'
import { Link } from 'react-router-dom'
import { getUserGroupIds, pruneStaleGroupIdsFromUser } from '../services/userService'
import { getGroupsByIds } from '../services/groupService'
import { PageLoading } from '../components/PageLoading'
import { firstNameFromUser } from '../lib/userDisplay'
import { useTranslation } from '../hooks/useTranslation'

const primaryCtaClass =
  'inline-flex min-h-11 items-center justify-center rounded-lg bg-tour-accent px-5 py-3 text-sm font-medium text-white hover:opacity-95'
const secondaryCtaClass =
  'inline-flex min-h-11 items-center justify-center rounded-lg border border-black/10 bg-tour-surface px-5 py-3 text-sm font-medium text-tour-text hover:bg-tour-muted'

export function HomePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [groups, setGroups] = useState([])
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [groupError, setGroupError] = useState('')

  const firstName = firstNameFromUser(user)
  const welcomeHeading = useMemo(() => {
    return firstName ? t('home.welcomeBackWithName', { name: firstName }) : t('home.welcomeBack')
  }, [firstName, t])

  useEffect(() => {
    let active = true
    async function loadGroups() {
      if (!user?.uid) {
        if (active) {
          setGroups([])
          setLoadingGroups(false)
        }
        return
      }
      setLoadingGroups(true)
      setGroupError('')
      try {
        await pruneStaleGroupIdsFromUser(user.uid)
        const groupIds = await getUserGroupIds(user.uid)
        const groupDocs = await getGroupsByIds(groupIds)
        if (active) {
          setGroups(groupDocs)
        }
      } catch (e) {
        if (active) {
          setGroupError(e.message || t('home.loadGroupsFailed'))
        }
      } finally {
        if (active) {
          setLoadingGroups(false)
        }
      }
    }
    loadGroups()
    return () => {
      active = false
    }
  }, [user?.uid, t])

  async function handleSignOut() {
    try {
      await signOutUser()
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="min-h-dvh bg-tour-muted text-tour-text">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6 sm:px-5 sm:py-8">
        <header className="mb-6 shrink-0 rounded-xl border border-black/10 bg-tour-surface px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-tour-text-secondary">
                {t('common.brandLine')}
              </p>
              <h1 className="mt-1 text-lg font-semibold text-tour-text sm:text-xl">{welcomeHeading}</h1>
              <p className="mt-2 text-sm text-tour-text-secondary">
                {t('home.signedInAs')}{' '}
                <span className="font-medium text-tour-text">
                  {user?.displayName || user?.email || user?.uid}
                </span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:justify-end">
              <Link
                to="/settings"
                state={{ settingsBack: '/' }}
                className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-[13px] font-medium text-tour-text hover:bg-black/[0.04]"
              >
                {t('home.settings')}
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-[13px] font-medium text-[#A32D2D] hover:bg-red-50"
              >
                {t('home.signOut')}
              </button>
            </div>
          </div>
        </header>

        <section className="rounded-xl border border-black/10 bg-tour-surface p-4 sm:p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tour-text-secondary">
            {t('home.yourGroups')}
          </h2>
          {loadingGroups && <PageLoading label={t('home.loadingGroups')} />}
          {!loadingGroups && groupError && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {groupError}
            </p>
          )}
          {!loadingGroups && !groupError && groups.length === 0 && (
            <p className="mt-3 text-sm text-tour-text-secondary">{t('home.noGroupsYet')}</p>
          )}
          {!loadingGroups && !groupError && groups.length > 0 && (
            <ul className="mt-4 space-y-2">
              {groups.map((group) => {
                const memberCount = group.memberIds?.length || 0
                const membersKey =
                  memberCount === 1 ? 'home.membersCount_one' : 'home.membersCount_other'
                return (
                  <li key={group.id}>
                    <Link
                      to={`/group/${group.id}/feed`}
                      className="block min-h-[3rem] rounded-xl border border-black/10 px-3 py-3.5 text-sm text-tour-text transition-colors hover:bg-tour-muted"
                    >
                      <span className="font-medium">{group.name || t('home.untitledGroup')}</span>
                      <span className="ml-2 text-tour-text-secondary">
                        {t(membersKey, { count: memberCount })}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tour-text-secondary">
            {t('home.startJoinTitle')}
          </h2>
          <p className="mt-2 text-sm text-tour-text-secondary">{t('home.startJoinBody')}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/group/new" className={primaryCtaClass}>
              {t('home.createGroup')}
            </Link>
            <Link to="/join" className={secondaryCtaClass}>
              {t('home.joinWithInvite')}
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
