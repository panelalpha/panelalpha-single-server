import type { RouteRecordRaw } from 'vue-router'

// App-lite only (Free panel): `meta.freePanel` leads to `/` on a paid panel.
export const tasksRoutes: RouteRecordRaw[] = [
  {
    path: '/tasks',
    name: 'Tasks',
    component: () => import('@/views/account/tasks/TasksView.vue'),
    meta: { requiresAuth: true, displayNavbar: true, freePanel: true, title: 'tasks' },
  },
]
