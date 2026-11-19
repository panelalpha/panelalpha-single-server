import type { RouteRecordRaw } from 'vue-router'
import { withDeviceIcons } from '@/shared/ui/icons/lazy-devices'

export const accountRoutes: RouteRecordRaw[] = [
  {
    path: '/my-account',
    name: 'my-account',
    // The devices table draws the browser and system logos: their chunk loads with the view (`lazy-devices.ts`).
    component: () => withDeviceIcons(import('@/views/account/profile/MyAccountView.vue')),
    meta: { requiresAuth: true, displayNavbar: true, title: 'my-account' },
  },
]
