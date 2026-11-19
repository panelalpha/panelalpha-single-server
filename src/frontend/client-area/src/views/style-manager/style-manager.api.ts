import type { ThemePayload } from '@/shared/theme/brand-theme'
import { api } from '@/shared/api/client'

/** Reseller branding, theme under `theme`. The response is not read. */
export async function putResellerBranding (theme: ThemePayload): Promise<void> {
  await api.put('/reseller/branding-settings', { theme })
}

/** Admin branding, flat body. The response is not read. */
export async function putUserappBranding (theme: ThemePayload): Promise<void> {
  await api.put('/settings/userapp-branding', theme)
}
