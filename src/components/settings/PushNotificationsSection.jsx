import { useCallback, useEffect, useState } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { useTranslation } from '../../hooks/useTranslation'
import { isFcmVapidKeyConfigured } from '../../lib/fcmConfig'
import { getFirebaseDb } from '../../lib/firebase'
import { getFirebaseMessagingWhenReady } from '../../lib/firebaseMessaging'
import { disableWebPushForUser, enableWebPushForUser } from '../../services/pushSettingsService'

/** iPhone/iPad (excludes desktop Safari). */
function isLikelyIos() {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

function ToggleRow({ id, label, description, checked, disabled, busy, onChange, ariaLabel }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-black/10 pt-3 first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[14px] font-medium text-tour-text">
          {label}
        </label>
        {description != null ? (
          typeof description === 'string' ? (
            <p className="mt-1 text-[12px] text-tour-text-secondary">{description}</p>
          ) : (
            <div className="mt-1 text-[12px] text-tour-text-secondary">{description}</div>
          )
        ) : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel || label}
        disabled={disabled || busy}
        onClick={() => onChange(!checked)}
        className={[
          'relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tour-accent/45',
          checked ? 'bg-tour-accent' : 'bg-black/20',
          disabled || busy ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        ].join(' ')}
      >
        <span
          className={[
            'pointer-events-none inline-block h-6 w-6 translate-x-0.5 transform rounded-full bg-white shadow transition',
            checked ? 'translate-x-[1.35rem]' : 'translate-x-0.5',
          ].join(' ')}
        />
        {busy ? (
          <span className="sr-only">…</span>
        ) : null}
      </button>
    </div>
  )
}

export function PushNotificationsSection({ uid, userEmail, notifications }) {
  const { t } = useTranslation()
  const [pushSupported, setPushSupported] = useState(null)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushError, setPushError] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailError, setEmailError] = useState('')

  const pushEnabled = Boolean(notifications?.pushEnabled)
  const emailEnabled = Boolean(notifications?.emailEnabled)
  const permissionDenied = typeof Notification !== 'undefined' && Notification.permission === 'denied'
  const vapidOk = isFcmVapidKeyConfigured()

  useEffect(() => {
    let alive = true
    ;(async () => {
      const m = await getFirebaseMessagingWhenReady()
      if (alive) setPushSupported(Boolean(m))
    })()
    return () => {
      alive = false
    }
  }, [])

  const handlePushToggle = useCallback(
    async (next) => {
      if (!uid || pushBusy) return
      setPushError('')
      if (next === pushEnabled) return

      setPushBusy(true)
      try {
        if (next) {
          await enableWebPushForUser(uid)
        } else {
          await disableWebPushForUser(uid)
        }
      } catch (e) {
        setPushError(e.message || t('settings.pushToggleError'))
      } finally {
        setPushBusy(false)
      }
    },
    [uid, pushBusy, pushEnabled, t],
  )

  const handleEmailToggle = useCallback(
    async (next) => {
      if (!uid || emailBusy || next === emailEnabled) return
      if (!userEmail) return
      setEmailError('')
      setEmailBusy(true)
      try {
        const db = getFirebaseDb()
        if (!db) throw new Error(t('settings.emailToggleError'))
        await updateDoc(doc(db, 'users', uid), { 'notifications.emailEnabled': next })
      } catch (e) {
        setEmailError(e.message || t('settings.emailToggleError'))
      } finally {
        setEmailBusy(false)
      }
    },
    [uid, emailBusy, emailEnabled, userEmail, t],
  )

  /** Order: config / permission before “unsupported” so iOS+VAPID issues still show the right error. */
  const pushBlockReason =
    !vapidOk ? 'vapid' : permissionDenied ? 'denied' : pushSupported === false ? 'unsupported' : null

  const pushDescription =
    pushBlockReason === 'vapid'
      ? t('settings.pushMissingVapid')
      : pushBlockReason === 'denied'
        ? t('settings.pushDeniedHint')
        : pushBlockReason === 'unsupported'
          ? isLikelyIos()
            ? (
                <>
                  <p>{t('settings.pushNotSupported')}</p>
                  <p className="mt-2 font-normal text-tour-text-secondary">
                    {t('settings.pushIosHomeScreenHint')}
                  </p>
                </>
              )
            : t('settings.pushNotSupported')
          : pushSupported === null
            ? t('settings.pushCheckingSupport')
            : t('settings.pushNotificationsHint')

  return (
    <section className="mt-4 rounded-xl border border-black/10 bg-tour-surface px-3.5 py-3 sm:px-4 sm:py-4">
      <h2 className="text-[12px] font-medium uppercase tracking-wide text-tour-text-secondary">
        {t('settings.notificationsTitle')}
      </h2>
      <p className="mt-2 text-sm text-tour-text-secondary">{t('settings.notificationsHint')}</p>

      <div className="mt-4 space-y-4">
        <ToggleRow
          id="settings-push-toggle"
          label={t('settings.pushNotificationsLabel')}
          description={pushDescription}
          checked={pushEnabled}
          disabled={pushBlockReason != null}
          busy={pushBusy}
          onChange={handlePushToggle}
        />

        {pushError ? <p className="text-[12px] text-red-800">{pushError}</p> : null}

        <ToggleRow
          id="settings-email-toggle"
          label={t('settings.emailNotificationsLabel')}
          description={
            <>
              <p>
                {!userEmail
                  ? t('settings.emailNoAddressHint')
                  : t('settings.emailNotificationsHint')}
              </p>
              {userEmail ? (
                <p className="mt-2 break-all font-normal text-tour-text-secondary">{userEmail}</p>
              ) : null}
            </>
          }
          checked={emailEnabled}
          disabled={!userEmail}
          busy={emailBusy}
          onChange={handleEmailToggle}
        />
        {emailError ? <p className="text-[12px] text-red-800">{emailError}</p> : null}
      </div>
    </section>
  )
}
