import { API_BASE, parseErrorMessage } from '../config/api'

type OpenTarget =
  | { path: string; url?: never }
  | { url: string; path?: never }

async function openSystemTarget(target: OpenTarget): Promise<void> {
  const res = await fetch(`${API_BASE}/files/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(target),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(parseErrorMessage(data, `HTTP ${res.status}`))
  }
}

export async function openFileExternal(path: string): Promise<void> {
  if (!path) return
  await openSystemTarget({ path })
}

export async function openUrlExternal(url: string): Promise<void> {
  if (!url) return
  await openSystemTarget({ url })
}
