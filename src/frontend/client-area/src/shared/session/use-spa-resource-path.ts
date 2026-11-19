import { computed } from 'vue'
import { spaResourcePath } from '@/shared/api/resource-paths'
import { useSessionStore } from './session.store'

/** The SPA path of a resource (`/projects/...` under single server, `/instances/...` otherwise), as a composable. */
export function useSpaResourcePath () {
  const session = useSessionStore()
  const isSingleServer = computed(() => Boolean(session.home?.app?.single_server?.active))

  function spaPath (rest: string | number): string {
    return spaResourcePath(rest, isSingleServer.value)
  }

  /**
   * Target of the "manage" overlay and button: app opens `/instances/:id/general`, app-lite `$spaResourcePath(instance.id)`,
   * which the router sends on to `general`.
   */
  function managePath (id: string | number): string {
    return isSingleServer.value ? spaPath(id) : spaPath(`${id}/general`)
  }

  return { isSingleServer, spaPath, managePath }
}
