import { watch } from 'vue'
import { runWhenIdle } from '@/shared/browser/idle'
import { reportError } from '@/shared/errors/report-error'
import { echoClient } from '@/shared/realtime/echo-client'
import { useSessionStore } from '@/shared/session/session.store'
import { useNotificationsStore } from './notifications/notifications.store'

export interface SessionLifecycleHandlers {
  /** `null -> user`: a cold start with a session, and every sign-in. */
  onSignIn: () => void
  /** `user -> null`: logout and the 401 interceptor (both end in `clearSession`). */
  onSignOut: () => void
}

/**
 * The one shell watcher on `session.user`. It reacts to the presence of a user, not to its identity:
 * a `/home` refresh that swaps the user object while signed in changes nothing. Call it from the `App.vue` setup, outside the
 * keyed `v-app`, so a language remount does not register it again.
 */
export function watchSessionLifecycle (
  user: () => unknown,
  handlers: SessionLifecycleHandlers,
): void {
  watch(() => Boolean(user()), (present, was) => {
    if (present && !was) {
      handlers.onSignIn()
    } else if (!present && was) {
      handlers.onSignOut()
    }
  }, { immediate: true })
}

/**
 * The shell's wiring of that watcher. `null -> user` loads the notifications (cold start and every sign-in, a deliberate
 * deviation from legacy) and connects Echo; `user -> null` clears them and disconnects. Echo is one connection per
 * session: `connect` drops an existing client first.
 */
export function useShellSessionLifecycle (user: () => unknown, idle: typeof runWhenIdle = runWhenIdle): void {
  const notifications = useNotificationsStore()
  const session = useSessionStore()
  let cancelConnect: (() => void) | null = null
  watchSessionLifecycle(user, {
    onSignIn: () => {
      void notifications.load().catch(() => {})
      // Echo (its libraries, the socket and `POST /broadcasting/auth`) waits for idle time, so it does not compete with the chunk
      // and the data of the first screen.
      cancelConnect?.()
      cancelConnect = idle(() => {
        cancelConnect = null
        echoClient.connect(session.home, { addNotification: n => notifications.addNotification(n) }).catch((error: unknown) => {
          reportError(error)
        })
      })
    },
    onSignOut: () => {
      cancelConnect?.()
      cancelConnect = null
      notifications.clear()
      echoClient.disconnect()
    },
  })
}
