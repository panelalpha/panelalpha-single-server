import { api } from '@/shared/api/client'

/** Persists the dark-mode choice server-side. */
export async function putUserDarkMode (darkMode: boolean): Promise<void> {
  await api.put('/user/dark-mode', { dark_mode: darkMode })
}
