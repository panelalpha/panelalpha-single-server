import type { RouteRecordRaw } from 'vue-router'
import { summaryEntry } from '@/views/hosting/hosting-service'
import { isSingleServer } from '@/shared/session/home-access'
import { useSessionStore } from '@/shared/session/session.store'

// The frame is the parent and every hosting page a child with an absolute path, so the My Hosting
// tab of the navbar (`/hosting/`, not exact) stays active on all of them.
export const hostingRoutes: RouteRecordRaw[] = [
  {
    path: '/hosting/',
    name: 'hosting',
    component: () => import('@/views/hosting/HostingView.vue'),
    redirect: '/hosting/summary',
    meta: { requiresAuth: true, displayNavbar: true },
    children: [
      {
        path: '/hosting/summary',
        name: 'hosting-summary',
        component: () => import('@/views/hosting/summary/SummaryView.vue'),
        meta: { title: 'summary' },
        beforeEnter: () => summaryEntry(isSingleServer(useSessionStore().home)),
      },
      {
        path: '/hosting/usage',
        name: 'hosting-usage',
        component: () => import('@/views/hosting/usage/UsageView.vue'),
        meta: { title: 'usage' },
      },
      {
        path: '/hosting/domains',
        name: 'hosting-domains',
        component: () => import('@/views/hosting/domains/DomainsView.vue'),
        meta: { title: 'domains' },
      },
      {
        path: '/hosting/cron',
        name: 'hosting-cron',
        component: () => import('@/views/hosting/cron/CronView.vue'),
        meta: { title: 'cron' },
      },
      {
        path: '/hosting/ftp',
        name: 'hosting-ftp',
        component: () => import('@/views/hosting/ftp/FtpView.vue'),
        meta: { title: 'ftp' },
      },
      {
        path: '/hosting/sftp',
        name: 'hosting-sftp',
        component: () => import('@/views/hosting/sftp/SftpView.vue'),
        meta: { title: 'sftp' },
      },
      {
        path: '/hosting/databases',
        name: 'hosting-databases',
        component: () => import('@/views/hosting/databases/DatabasesView.vue'),
        meta: { title: 'databases' },
      },
      {
        path: '/hosting/email-addresses',
        name: 'hosting-email-addresses',
        component: () => import('@/views/hosting/email-addresses/EmailAddressesView.vue'),
        meta: { title: 'email-addresses' },
      },
      {
        path: '/hosting/email-forwarders',
        name: 'hosting-email-forwarders',
        component: () => import('@/views/hosting/email-forwarders/EmailForwardersView.vue'),
        meta: { title: 'email-forwarders' },
      },
      {
        path: '/hosting/dns',
        name: 'hosting-dns',
        component: () => import('@/views/hosting/dns/DnsView.vue'),
        meta: { title: 'dns' },
      },
      {
        path: '/hosting/file-manager',
        name: 'hosting-file-manager',
        component: () => import('@/views/hosting/file-manager/FileManagerView.vue'),
        meta: { title: 'file-manager' },
      },
      {
        // app-lite only: no sidebar item, reachable by direct URL.
        path: '/hosting/containers',
        name: 'hosting-containers',
        component: () => import('@/views/hosting/containers/ContainersView.vue'),
        meta: { title: 'containers' },
      },
    ],
  },
]
