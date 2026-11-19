import type { PhpMyAdminDatabase } from './phpmyadmin-sso.api'
import { useTranslation } from 'i18next-vue'
import { reactive } from 'vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import { getErrorMessage } from '@/shared/api/error-message'
import { popupBlocked } from '@/shared/browser/popup'
import { useSessionStore } from '@/shared/session/session.store'
import { useSpaResourcePath } from '@/shared/session/use-spa-resource-path'
import { hasARecord, shouldOpenSsoModal } from './phpmyadmin-sso'
import { getPhpMyAdminSsoUrl, listPhpMyAdminDatabases } from './phpmyadmin-sso.api'

// The login flow and the Plesk database choice. Order as in legacy: the DNS check
// first, then one of the two paths. The second DNS lookup of legacy is left out: its answer never changes the modal, because
// the modal always opens with `dnsMismatchDetected: true`.

export interface PhpMyAdminSsoModalState {
  opened: boolean
  hostingAccountId: number | null
  serverType: string | null
  databases: PhpMyAdminDatabase[]
  dnsMismatchDetected: boolean
}

export interface PhpMyAdminChooseDatabaseState {
  opened: boolean
  hostingAccountId: number | null
  databases: PhpMyAdminDatabase[]
}

export interface PhpMyAdminSsoState {
  /** A second login while one runs is ignored. */
  loading: boolean
  ssoModal: PhpMyAdminSsoModalState
  chooseDatabase: PhpMyAdminChooseDatabaseState
}

export type PhpMyAdminSso = ReturnType<typeof usePhpMyAdminSso>

export function usePhpMyAdminSso () {
  const { t } = useTranslation()
  const alerts = useAlertsStore()
  const session = useSessionStore()
  const { isSingleServer } = useSpaResourcePath()

  const state = reactive<PhpMyAdminSsoState>({
    loading: false,
    ssoModal: { opened: false, hostingAccountId: null, serverType: null, databases: [], dnsMismatchDetected: false },
    chooseDatabase: { opened: false, hostingAccountId: null, databases: [] },
  })

  function alertError (error: unknown): void {
    alerts.addAlert({ success: false, errorMessage: getErrorMessage(error) })
  }

  function alertNoDatabases (): void {
    alerts.addAlert({ success: false, errorMessage: t('message.emptyTable.databases.database.description') })
  }

  /**
   * Only Plesk has a database list. `null` means the
   * request failed and its error alert is already shown, so the caller must not add the "no databases" alert on top.
   */
  async function fetchDatabases (accountId: number, serverType: string | undefined): Promise<PhpMyAdminDatabase[] | null> {
    if (serverType !== 'plesk') {
      return []
    }
    try {
      return await listPhpMyAdminDatabases(accountId)
    } catch (error) {
      alertError(error)
      return null
    }
  }

  /**
   * Opens the one-time SSO url. The window opens after an `await`, so the browser may block it (Safari, mobile) and the url would be
   * lost. Then the SSO modal opens instead: its buttons request a fresh url on a click and have their own popup fallback.
   * An empty url alerts.
   */
  function openSsoWindow (url: string | undefined, accountId: number, serverType: string | undefined, databases: PhpMyAdminDatabase[]): void {
    if (!url) {
      alerts.addAlert({ success: false, errorMessage: t('message.status.action.error') })
      return
    }
    if (popupBlocked(window.open(url))) {
      Object.assign(state.ssoModal, {
        opened: true,
        hostingAccountId: accountId,
        serverType: serverType ?? null,
        databases,
        dnsMismatchDetected: false,
      })
    }
  }

  /** The direct URL for one Plesk database, opened in a window. */
  async function loginToDatabase (accountId: number, databaseId: number | undefined): Promise<void> {
    try {
      const url = await getPhpMyAdminSsoUrl(accountId, databaseId)
      openSsoWindow(url, accountId, 'plesk', databaseId === undefined ? [] : [{ value: databaseId, label: '' }])
    } catch (error) {
      alertError(error)
    }
  }

  function closeChooseDatabase (): void {
    state.chooseDatabase.opened = false
  }

  async function login (accountId: number, serverType: string | undefined, ssoHost: string | null | undefined): Promise<void> {
    if (state.loading) {
      return
    }
    state.loading = true
    try {
      const dnsResolves = await hasARecord(ssoHost ?? '')
      const previewSiteProviderEnabled = Boolean(session.home?.app?.integrations?.preview_site_provider_enabled)

      if (shouldOpenSsoModal({ hasARecord: dnsResolves, isSingleServer: isSingleServer.value, previewSiteProviderEnabled })) {
        const databases = await fetchDatabases(accountId, serverType)
        if (databases === null) {
          return
        }
        if (serverType === 'plesk' && databases.length === 0) {
          alertNoDatabases()
          return
        }
        Object.assign(state.ssoModal, {
          opened: true,
          hostingAccountId: accountId,
          serverType: serverType ?? null,
          databases,
          dnsMismatchDetected: true,
        })
        return
      }

      if (serverType === 'plesk') {
        const databases = await fetchDatabases(accountId, serverType)
        if (databases === null) {
          return
        }
        if (databases.length === 0) {
          alertNoDatabases()
          return
        }
        if (databases.length === 1) {
          await loginToDatabase(accountId, databases[0]!.value)
          return
        }
        Object.assign(state.chooseDatabase, { opened: true, hostingAccountId: accountId, databases })
        return
      }

      try {
        openSsoWindow(await getPhpMyAdminSsoUrl(accountId), accountId, serverType, [])
      } catch (error) {
        alertError(error)
      }
    } finally {
      state.loading = false
    }
  }

  return { state, login, loginToDatabase, closeChooseDatabase }
}
