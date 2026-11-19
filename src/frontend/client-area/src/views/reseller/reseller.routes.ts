import type { RouteRecordRaw } from 'vue-router'

// The frame is the parent and every page a child with an absolute path,
// so the Reseller Area tab of the navbar (`/reseller-area/`, not exact) stays active on all of them.
// Legacy sets no page title, so the route has no `meta.title`.
export const resellerRoutes: RouteRecordRaw[] = [
  {
    path: '/reseller-area/',
    name: 'reseller-area',
    component: () => import('@/views/reseller/ResellerAreaView.vue'),
    redirect: '/reseller-area/users',
    meta: { requiresAuth: true, displayNavbar: true, paidArea: 'reseller-area' },
    children: [
      {
        path: '/reseller-area/users',
        name: 'reseller-area-users',
        component: () => import('@/views/reseller/users/UsersView.vue'),
      },
      {
        path: '/reseller-area/branding',
        name: 'reseller-area-branding',
        component: () => import('@/views/reseller/branding/BrandingView.vue'),
      },
      {
        path: '/reseller-area/email-settings',
        name: 'reseller-area-email-settings',
        component: () => import('@/views/reseller/email-settings/EmailSettingsView.vue'),
      },
      {
        path: '/reseller-area/logs',
        name: 'reseller-area-logs',
        component: () => import('@/views/reseller/logs/LogsView.vue'),
      },
      {
        path: '/reseller-area/api',
        name: 'reseller-area-api',
        component: () => import('@/views/reseller/api/ApiView.vue'),
      },
    ],
  },
]
