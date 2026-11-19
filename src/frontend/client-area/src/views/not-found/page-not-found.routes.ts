import type { RouteRecordRaw } from 'vue-router'

// Catch-all; must be the last route registered.
export const pageNotFoundRoutes: RouteRecordRaw[] = [
  {
    path: '/:pathMatch(.*)*',
    name: 'error',
    component: () => import('@/views/not-found/PageNotFoundView.vue'),
    meta: { requiresAuth: false, displayNavbar: false, title: 'page-not-found' },
  },
]
