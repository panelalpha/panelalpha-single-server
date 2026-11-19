import type { RouteRecordRaw } from 'vue-router'

// App-lite only: no single-server guard and no privilege; the gate is the shell tab (`navbar-rules.ts`).
export const connectAiRoutes: RouteRecordRaw[] = [
  {
    path: '/connect-ai',
    name: 'connect-ai',
    component: () => import('@/views/connect-ai/ConnectAiView.vue'),
    meta: { requiresAuth: true, displayNavbar: true, title: 'connect-ai' },
  },
]
