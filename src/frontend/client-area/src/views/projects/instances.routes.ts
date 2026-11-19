import type { RouteRecordRaw } from 'vue-router'

// One loader for both records, so the list is a single chunk (the same pattern as `wizard.routes.ts`).
const InstancesView = () => import('@/views/projects/InstancesView.vue')

// Dual registration as in app-lite: both paths render the same
// list and neither redirects to the other. Under single server `/` leads to `/projects` (`root-redirect.ts`).
export const instancesRoutes: RouteRecordRaw[] = [
  {
    path: '/instances',
    name: 'instances',
    component: InstancesView,
    meta: { requiresAuth: true, displayNavbar: true, title: 'instances' },
  },
  {
    path: '/projects',
    name: 'projects',
    component: InstancesView,
    meta: { requiresAuth: true, displayNavbar: true, title: 'projects' },
  },
]
