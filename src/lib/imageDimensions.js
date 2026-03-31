/**
 * Read intrinsic pixel size of an image File (browser only).
 * @param {File} file
 * @returns {Promise<{ width: number, height: number }>}
 */
export function getImageDimensionsFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const w = img.naturalWidth || 1
      const h = img.naturalHeight || 1
      resolve({ width: w, height: h })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image dimensions.'))
    }
    img.src = url
  })
}
