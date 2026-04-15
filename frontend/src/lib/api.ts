export function api(path: string) {
  const normalizedPath = path.replace(/^\/+/, '')
  const base = import.meta.env.VITE_API_BASE?.replace(/\/$/, '') || ''

  if (base) {
    return `${base}/api/${normalizedPath}`
  }

  return `${import.meta.env.BASE_URL}api/${normalizedPath}`
}
