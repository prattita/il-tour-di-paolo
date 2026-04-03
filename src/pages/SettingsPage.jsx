import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { FeedPhotoLightbox } from '../components/FeedPhotoLightbox'
import { useAuth } from '../context/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { SUPPORTED_LANGUAGES } from '../i18n/storage.js'
import { uploadUserAvatarAndSyncGroups } from '../services/avatarService'
import { PushNotificationsSection } from '../components/settings/PushNotificationsSection'
import { subscribeUserProfile } from '../services/userService'

const SETTINGS_AVATAR_INPUT_ID = 'settings-avatar-file-input'

/** Allow only in-app relative paths (no open redirects). */
function safeSettingsBackPath(value) {
  if (typeof value !== 'string' || value.length === 0) return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  if (value.includes('://') || value.includes('\n') || value.includes('\r')) return null
  return value
}

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

export function SettingsPage() {
  const location = useLocation()
  const { t, language, changeLanguage } = useTranslation()
  const { user } = useAuth()
  const [userProfile, setUserProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState('')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [heroPhotoFailed, setHeroPhotoFailed] = useState(false)

  useEffect(() => {
    if (!user?.uid) {
      setUserProfile(null)
      setProfileLoading(false)
      return undefined
    }
    setProfileLoading(true)
    setProfileError('')
    const unsub = subscribeUserProfile(
      user.uid,
      (data) => {
        setUserProfile(data)
        setProfileLoading(false)
      },
      (e) => {
        setProfileError(e.message || t('settings.profileLoadError'))
        setProfileLoading(false)
      },
    )
    return () => unsub()
  }, [user?.uid, t])

  useEffect(() => {
    setHeroPhotoFailed(false)
  }, [userProfile?.avatarUrl])

  useEffect(() => {
    if (!userProfile?.avatarUrl) setLightboxOpen(false)
  }, [userProfile?.avatarUrl])

  const displayName = userProfile?.displayName || user?.displayName
  const avatarUrl = userProfile?.avatarUrl ?? null
  const canExpandPhoto = Boolean(avatarUrl && !heroPhotoFailed && !avatarUploading)
  const photoAlt = useMemo(
    () =>
      displayName
        ? t('profile.photoAltNamed', { name: displayName })
        : t('profile.photoAltGeneric'),
    [displayName, t],
  )

  const backTo = useMemo(() => {
    const raw = location.state?.settingsBack
    return safeSettingsBackPath(raw) || '/'
  }, [location.state])

  const backLabel =
    backTo === '/'
      ? t('settings.backToHome')
      : backTo.startsWith('/group/')
        ? t('settings.backToGroup')
        : t('settings.back')

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
    <div className="min-h-dvh bg-tour-muted text-tour-text">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6 sm:px-5 sm:py-8">
        <header className="mb-6 shrink-0 rounded-xl border border-black/10 bg-tour-surface px-4 py-4 sm:px-5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-tour-text-secondary">
            {t('common.brandLine')}
          </p>
          <h1 className="mt-1 text-lg font-semibold text-tour-text sm:text-xl">{t('settings.pageTitle')}</h1>
          <p className="mt-2 text-sm text-tour-text-secondary">
            {t('settings.signedInAs')}{' '}
            <span className="font-medium text-tour-text">
              {user?.displayName || user?.email || user?.uid}
            </span>
          </p>
          <Link
            to={backTo}
            className="mt-3 inline-block text-[13px] font-medium text-tour-accent underline decoration-tour-accent/35 underline-offset-2 hover:decoration-tour-accent"
          >
            {backLabel}
          </Link>
        </header>

        <section className="mb-4 rounded-xl border border-black/10 bg-tour-surface px-3.5 py-3 sm:px-4 sm:py-4">
          <h2 className="text-[12px] font-medium uppercase tracking-wide text-tour-text-secondary">
            {t('language.sectionTitle')}
          </h2>
          <p className="mt-2 text-sm text-tour-text-secondary">{t('language.sectionHint')}</p>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t('language.sectionTitle')}>
            {SUPPORTED_LANGUAGES.map((code) => {
              const active = language === code
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => changeLanguage(code)}
                  aria-pressed={active}
                  className={[
                    'rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
                    active
                      ? 'border-tour-accent bg-tour-accent-muted text-tour-accent-foreground'
                      : 'border-black/15 bg-tour-muted/50 text-tour-text hover:bg-black/[0.06]',
                  ].join(' ')}
                >
                  {t(`langName.${code}`)}
                </button>
              )
            })}
          </div>
        </section>

        {profileError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {profileError}
          </div>
        )}

        {profileLoading && (
          <p className="text-sm text-tour-text-secondary">{t('settings.loadingProfile')}</p>
        )}

        {!profileLoading && !userProfile && !profileError && (
          <p className="text-sm text-tour-text-secondary">{t('settings.profileLoadError')}</p>
        )}

        {!profileLoading && userProfile && (
          <>
            <section className="rounded-xl border border-black/10 bg-tour-surface px-3.5 py-3 sm:px-4 sm:py-4">
              <h2 className="text-[12px] font-medium uppercase tracking-wide text-tour-text-secondary">
                {t('settings.profilePhoto')}
              </h2>
              <p className="mt-1 text-[12px] text-tour-text-secondary">{t('settings.profilePhotoHint')}</p>
              <div className="mt-4 flex items-start gap-3">
                <label
                  htmlFor={SETTINGS_AVATAR_INPUT_ID}
                  aria-label={t('settings.changePhotoAria')}
                  className={`relative isolate inline-flex shrink-0 cursor-pointer ${avatarUploading ? 'pointer-events-none opacity-70' : ''}`}
                >
                  <Avatar
                    avatarUrl={avatarUrl}
                    displayName={displayName}
                    email={user?.email}
                    seed={user?.uid}
                    className="h-16 w-16 text-[16px]"
                    alt=""
                    onPhotoLoadError={() => setHeroPhotoFailed(true)}
                  />
                  <span
                    className="pointer-events-none absolute bottom-0 right-0 z-10 flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-tour-surface bg-tour-accent text-white shadow-md"
                    aria-hidden
                  >
                    <CameraGlyph className="h-4 w-4" />
                  </span>
                  <input
                    id={SETTINGS_AVATAR_INPUT_ID}
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
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-tour-text">
                    {displayName || t('groupShell.displayNameFallback')}
                  </p>
                  {canExpandPhoto && (
                    <button
                      type="button"
                      onClick={() => setLightboxOpen(true)}
                      className="mt-2 block text-left text-[12px] font-medium text-tour-accent underline decoration-tour-accent/35 underline-offset-2 hover:decoration-tour-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tour-accent/40 rounded-sm"
                    >
                      {t('settings.viewPhoto')}
                    </button>
                  )}
                </div>
              </div>
              {avatarError && <p className="mt-2 text-[12px] text-red-800">{avatarError}</p>}
              {avatarUrl && (
                <FeedPhotoLightbox
                  isOpen={lightboxOpen}
                  photos={[{ url: avatarUrl }]}
                  onClose={() => setLightboxOpen(false)}
                  getImgProps={() => ({ alt: photoAlt })}
                  overlayAriaLabel={t('profile.avatarLightboxAria')}
                />
              )}
            </section>

            <PushNotificationsSection
              uid={user?.uid}
              userEmail={user?.email || ''}
              notifications={userProfile.notifications}
            />
          </>
        )}
      </div>
    </div>
  )
}
