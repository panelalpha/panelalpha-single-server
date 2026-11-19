import type { RouteRecordRaw } from 'vue-router'

export const servicesRoutes: RouteRecordRaw[] = [
  {
    path: '/services',
    name: 'services',
    component: () => import('@/views/account/services/ServicesView.vue'),
    meta: { requiresAuth: true, displayNavbar: true, title: 'services' },
  },
]
