import { api } from '@/shared/api/client'

// Call of the Control Panel SSO login, same contract as legacy. Shared by the
// hosting Summary and the developer settings of an instance.

/** `POST /server-accounts/{id}/control-panel-sso-url`: the URL to open (backend answers 422 `control_panel_sso_disabled|failed` on a failure). */
export async function getControlPanelSsoUrl (accountId: number): Promise<string> {
  const { data } = await api.post<{ data: { url: string } }>(`/server-accounts/${accountId}/control-panel-sso-url`)
  return data.data.url
}
