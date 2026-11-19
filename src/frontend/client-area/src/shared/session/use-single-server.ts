import { computed, type ComputedRef } from 'vue'
import { useSessionStore } from './session.store'

/** Whether single server is active (`!!home.app.single_server.active`), as a composable; `active` is a boolean, so `=== true` reads the same. */
export function useSingleServer (): ComputedRef<boolean> {
  const session = useSessionStore()
  return computed(() => session.home?.app?.single_server?.active === true)
}
