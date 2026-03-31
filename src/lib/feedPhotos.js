/** @typedef {{ url: string, path?: string, width: number, height: number }} NormalizedFeedPhoto */

/**
 * Normalize feed or pending doc image data: `photos[]` or legacy `imageUrl` / `imagePath`.
 * @param {object} doc
 * @returns {NormalizedFeedPhoto[]}
 */
export function normalizeDocPhotos(doc) {
  if (!doc || typeof doc !== 'object') return []

  if (Array.isArray(doc.photos) && doc.photos.length > 0) {
    return doc.photos
      .filter((p) => p && typeof p.url === 'string' && p.url.length > 0)
      .map((p) => ({
        url: p.url,
        path: typeof p.path === 'string' ? p.path : '',
        width: typeof p.width === 'number' && p.width > 0 ? p.width : 4,
        height: typeof p.height === 'number' && p.height > 0 ? p.height : 3,
      }))
  }

  if (typeof doc.imageUrl === 'string' && doc.imageUrl.length > 0) {
    return [
      {
        url: doc.imageUrl,
        path: typeof doc.imagePath === 'string' ? doc.imagePath : '',
        width: typeof doc.imageWidth === 'number' && doc.imageWidth > 0 ? doc.imageWidth : 4,
        height: typeof doc.imageHeight === 'number' && doc.imageHeight > 0 ? doc.imageHeight : 3,
      },
    ]
  }

  return []
}

export function docHasPhoto(doc) {
  return normalizeDocPhotos(doc).length > 0
}

/**
 * Storage paths to delete for a pending doc (multi-photo or legacy).
 * @param {object} pending — pending doc data
 * @returns {string[]}
 */
export function pendingPhotoStoragePaths(pending) {
  if (!pending) return []
  if (Array.isArray(pending.photos) && pending.photos.length > 0) {
    return pending.photos.map((p) => p?.path).filter((x) => typeof x === 'string' && x.length > 0)
  }
  if (typeof pending.imagePath === 'string' && pending.imagePath.length > 0) {
    return [pending.imagePath]
  }
  return []
}
