/** Map known `Error.message` strings from groupService (English at throw site) to t() keys. */
const MESSAGE_TO_KEY = {
  'You must be logged in.': 'errors.mustBeLoggedIn',
  'Firestore is not available. Check Firebase configuration.': 'errors.firestoreUnavailable',
  'Invite code is required.': 'errors.inviteCodeRequired',
  'Invite code not found.': 'errors.inviteNotFound',
  'This invite points to a missing group.': 'errors.inviteMissingGroup',
  'Group name is required.': 'errors.groupNameRequired',
  'Unable to generate unique invite code. Please try again.': 'errors.inviteCodeGenerateFailed',
}

/**
 * @param {unknown} err
 * @param {(key: string) => string} t
 * @param {string} fallbackKey — e.g. 'errors.joinFailed'
 */
export function translateGroupServiceError(err, t, fallbackKey) {
  const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : ''
  const key = msg && MESSAGE_TO_KEY[msg]
  if (key) return t(key)
  const maxActivities = msg.match(
    /^This group already has the maximum number of activities \((\d+)\)\.$/,
  )
  if (maxActivities) return t('errors.maxActivitiesPerGroup', { max: maxActivities[1] })
  return msg || t(fallbackKey)
}
