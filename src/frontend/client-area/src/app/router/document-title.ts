import type { HomeResponse } from '@/shared/session/session.api'
import i18next from 'i18next'
import { useInstanceStore } from '@/views/projects/project/instance.store'

export function resolveAppName (home: HomeResponse | null | undefined): string {
  const name = home?.app?.name?.trim()
  return name || 'PanelAlpha'
}

export interface TitleRouteLike {
  meta: object
  matched?: ReadonlyArray<{ meta: object }>
}

/**
 * The name of the instance for `instance_name`, as legacy `setInstanceName`. It is read from the
 * frame's store, so every title update (navigation, `session.home`, language) sees it. Only instance pages (`meta.instancePage` on a
 * matched record) have one.
 */
function resolveInstanceName (route: TitleRouteLike): string {
  const onInstancePage = route.matched?.some(record => (record.meta as Record<string, unknown>).instancePage === true) === true
  if (!onInstancePage) {
    return ''
  }
  try {
    return useInstanceStore().instance?.title ?? ''
  } catch {
    // Pinia may not be active during early boot / unit tests.
    return ''
  }
}

/** Sync document.title from the active route meta.title and home.app.name (legacy parity). */
export function updateDocumentTitle (
  route: TitleRouteLike,
  home: HomeResponse | null | undefined,
): void {
  const appName = resolveAppName(home)
  const rawTitle = (route.meta as Record<string, unknown>).title
  const titleSuffix = typeof rawTitle === 'string' ? rawTitle : ''
  const instanceName = resolveInstanceName(route)
  // A missing `title.*` key must not reach the tab as the raw key.
  if (titleSuffix && i18next.exists(`title.${titleSuffix}`)) {
    document.title = i18next.t(`title.${titleSuffix}`, {
      app_name: appName,
      instance_name: instanceName,
    })
    return
  }
  document.title = titleSuffix && instanceName ? `${appName}: ${instanceName}` : appName
}
