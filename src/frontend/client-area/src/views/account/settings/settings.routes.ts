import type { RouteRecordRaw } from 'vue-router'

// App-lite only (Free panel): `meta.freePanel` leads to `/` on a paid panel.
// `/hub-connected` belongs to the wizard.
export const settingsRoutes: RouteRecordRaw[] = [
  {
    path: '/settings',
    name: 'settings',
    meta: { requiresAuth: true, displayNavbar: true, freePanel: true, title: 'settings' },
    component: () => import('@/views/account/settings/SettingsView.vue'),
  },
]
