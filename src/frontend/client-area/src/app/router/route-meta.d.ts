import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    /** Read by `document-title.ts`; routes without a legacy page title leave it unset. */
    title?: string
    /** Read by `auth-guard.ts`: the route (or a parent) needs a signed-in user. */
    requiresAuth?: boolean
    /** Read by `App.vue`: show the navbar around the route. */
    displayNavbar?: boolean
    /** Read by `setup-guard.ts`: Free-panel page, redirected to / on a paid panel. */
    freePanel?: boolean
    /** A paid edition's area: not reached where `/home` does not offer it. */
    paidArea?: 'reseller-area' | 'admin-area'
    /** Read by `theme-sync.ts`: the route is always light, whatever the stored dark mode says (the wizard). */
    forceLightTheme?: boolean
    /** Read by `App.vue` and `auth-guard.ts`: page rendered without the app frame. */
    standalone?: boolean
    /** Read by `document-title.ts`: instance page, title uses the instance name. */
    instancePage?: boolean
    /** Read by `AdvancedView.vue`: which advanced hosting section the route shows. */
    advancedHostingSection?: 'domains' | 'ftp' | 'file-manager' | 'cron' | 'databases' | 'sftp' | 'containers'
  }
}
