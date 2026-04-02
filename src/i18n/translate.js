/** Walk nested object by dot path: 'settings.pageTitle' */
export function messageAt(dict, keyPath) {
  if (!dict || typeof keyPath !== 'string') return undefined
  const parts = keyPath.split('.')
  let node = dict
  for (const p of parts) {
    if (node == null || typeof node !== 'object') return undefined
    node = node[p]
  }
  return typeof node === 'string' ? node : undefined
}

export function interpolate(template, vars) {
  if (!vars || typeof template !== 'string') return template
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) =>
    vars[k] != null ? String(vars[k]) : `{{${k}}}`,
  )
}
