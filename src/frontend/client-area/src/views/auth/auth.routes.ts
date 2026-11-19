import type { RouteRecordRaw } from 'vue-router'
import { resolveForgotPasswordEntry } from '@/views/auth/login/forgot-password-entry'
import { resolveLoginEntry } from '@/views/auth/login/login-entry'
import { resolveRegisterEntry } from '@/views/auth/login/register-entry'
import { withProviderIcons } from '@/views/auth/login/social-icons'
import { useSessionStore } from '@/shared/session/session.store'
import { socialCallbackRoutePath } from '@/shared/session/social-callback-path'

export const authRoutes: RouteRecordRaw[] = [
  {
    path: '/accept-invite',
    name: 'accept-invite',
    component: () => import('@/views/auth/AcceptInviteView.vue'),
    meta: { requiresAuth: false, displayNavbar: false, title: 'accept-invite' },
  },
  {
    // No title; not `standalone` (the card needs `v-app`). The ticket exchange runs in the guard.
    path: '/hub-login',
    name: 'hub-login',
    component: () => import('@/views/auth/HubLoginView.vue'),
    meta: { requiresAuth: false, displayNavbar: false },
  },
  {
    path: '/login',
    name: 'login',
    component: () => withProviderIcons(import('@/views/auth/LoginView.vue')),
    // `hideShellFooter`: the screen has its own language switcher; after sign-in `home.user` is set while the route is
    // still `/login`, so the shell footer would show a second switcher until the redirect lands.
    meta: { requiresAuth: false, displayNavbar: false, hideShellFooter: true, title: 'login' },
    // A logged-in visitor is redirected before the form renders (no flash of the form).
    beforeEnter: to => resolveLoginEntry(to, useSessionStore()),
  },
  {
    path: '/register/:predefinedEmail?',
    name: 'register',
    component: () => withProviderIcons(import('@/views/auth/RegisterView.vue')),
    props: true,
    meta: { requiresAuth: false, displayNavbar: false, hideShellFooter: true, title: 'register' },
    // A logged-in visitor is redirected before the form renders.
    beforeEnter: to => resolveRegisterEntry(to, useSessionStore()),
  },
  {
    path: socialCallbackRoutePath,
    name: 'social-login',
    component: () => import('@/views/auth/SocialLoginView.vue'),
    meta: { requiresAuth: false, displayNavbar: false },
  },
  {
    // `standalone`: no shell (v-app); legacy has no title here.
    path: '/sso-login',
    name: 'sso-login',
    component: () => import('@/views/auth/SsoLoginView.vue'),
    meta: { requiresAuth: false, displayNavbar: false, standalone: true, paidArea: 'admin-area' },
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: () => import('@/views/auth/ForgotPasswordView.vue'),
    meta: { requiresAuth: false, displayNavbar: false, title: 'forgot-password' },
    // A logged-in visitor is redirected before the form renders.
    beforeEnter: to => resolveForgotPasswordEntry(to, useSessionStore()),
  },
  {
    path: '/password-reset/change',
    name: 'reset-password',
    component: () => import('@/views/auth/ResetPasswordView.vue'),
    meta: { requiresAuth: false, displayNavbar: false, title: 'reset-password' },
  },
]
