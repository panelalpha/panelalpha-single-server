import { useSessionStore } from '@/shared/session/session.store'
import { preloadSocialIcons } from '@/shared/ui/icons/socials/lazy-socials'

/**
 * The login and register views draw one button per provider of `/home` (`app.integrations.auth`). The logos are separate
 * chunks (`lazy-socials.ts`); the route loader waits for the enabled ones, so no button renders without its logo.
 * `/home` is known here: `router.beforeEach` fetches it before the lazy component of a route is resolved.
 * `async`, so a throw (no active Pinia) is a rejection that `withProviderIcons` swallows, not a failed route.
 */
export async function preloadProviderIcons (): Promise<void> {
  const providers = useSessionStore().home?.app?.integrations?.auth
  await preloadSocialIcons(Array.isArray(providers) ? providers.map(String) : [])
}

/** A route loader: the view's chunk together with the logos of the enabled providers. A logo that fails never fails the route. */
export async function withProviderIcons<T> (view: Promise<T>): Promise<T> {
  const icons = preloadProviderIcons().catch(() => undefined)
  const [loaded] = await Promise.all([view, icons])
  return loaded
}
