import type { RouteRecordRaw } from 'vue-router'

export const billingRoutes: RouteRecordRaw[] = [
  {
    path: '/billing',
    name: 'billing',
    component: () => import('@/views/account/billing/BillingView.vue'),
    meta: { requiresAuth: true, displayNavbar: true, title: 'billing' },
  },
]
