import type { RouteRecordRaw } from 'vue-router'
import { useSessionStore } from '@/shared/session/session.store'

// The frame is the parent and each child has an absolute path. `general`, `backups`, `monitoring`
// and `plugins` are registered, and `advanced` is a sub-frame with its `details`,
// `security`, `cloudflare`, `edge-cache`, `cdn`, `copy-instance`, `env-file` and `developer-settings`, `auto-updates`
// and `wordpress-mcp` and `domains` (hidden by the redirect of the Advanced frame) and `ftp` (the section is hidden by the redirect of the Advanced frame) and `file-manager` (same) and `cron` (the same) and `databases` (same), `sftp` and `containers` (same redirect) children and a redirect
// to `details`, `logs`, `wordpress-config`, `wordpress-users` (no route guard) and `users` (app-lite only). Later slices
// add their children here, as the hosting slices do in `hosting.routes.ts`.

// A non-numeric id goes to the 404 page.
function requireNumericId (to: { params: Record<string, unknown> }) {
  return Number(to.params.id) ? true : { name: 'error' }
}

// Lite-only pages (`users`, `env-file`): on app (multi-server) the legacy page does not exist, so the URL goes to the details page.
export function requireSingleServer (segment: 'instances' | 'projects', to: { params: Record<string, unknown> }) {
  const session = useSessionStore()
  return session.home?.app?.single_server?.active ? true : { path: `/${segment}/${String(to.params.id)}/advanced/details` }
}

function resourceFrame (segment: 'instances' | 'projects', name: 'instance' | 'project'): RouteRecordRaw {
  return {
    path: `/${segment}/:id`,
    name,
    props: true,
    component: () => import('@/views/projects/project/InstanceView.vue'),
    redirect: to => `/${segment}/${String(to.params.id)}/general`,
    meta: { requiresAuth: true, displayNavbar: true, instancePage: true },
    beforeEnter: requireNumericId,
    children: [
      {
        path: `/${segment}/:id/general`,
        name: `${name}-general`,
        component: () => import('@/views/projects/project/general/GeneralView.vue'),
        meta: { title: 'general-information' },
      },
      {
        path: `/${segment}/:id/backups`,
        name: `${name}-backups`,
        component: () => import('@/views/projects/project/backups/BackupsView.vue'),
        meta: { title: 'backups' },
      },
      {
        path: `/${segment}/:id/monitoring`,
        name: `${name}-monitoring`,
        component: () => import('@/views/projects/project/monitoring/MonitoringView.vue'),
        meta: { title: 'monitoring' },
      },
      {
        path: `/${segment}/:id/plugins`,
        name: `${name}-plugins`,
        component: () => import('@/views/projects/project/plugins/PluginsView.vue'),
        meta: { title: 'plugins' },
      },
      {
        path: `/${segment}/:id/advanced`,
        name: `${name}-advanced`,
        component: () => import('@/views/projects/project/advanced/AdvancedView.vue'),
        redirect: to => `/${segment}/${String(to.params.id)}/advanced/details`,
        children: [
          {
            path: `/${segment}/:id/advanced/details`,
            name: `${name}-details`,
            component: () => import('@/views/projects/project/advanced/details/DetailsView.vue'),
            meta: { title: 'details' },
          },
          {
            path: `/${segment}/:id/advanced/security`,
            name: `${name}-security`,
            component: () => import('@/views/projects/project/advanced/security/SecurityView.vue'),
            meta: { title: 'security' },
          },
          {
            path: `/${segment}/:id/advanced/cloudflare`,
            name: `${name}-cloudflare`,
            component: () => import('@/views/projects/project/advanced/cloudflare/CloudflareView.vue'),
            meta: { title: 'cloudflare' },
          },
          {
            path: `/${segment}/:id/advanced/edge-cache`,
            name: `${name}-edge-cache`,
            component: () => import('@/views/projects/project/advanced/edge-cache/EdgeCacheView.vue'),
            meta: { title: 'edge-cache' },
          },
          {
            path: `/${segment}/:id/advanced/cdn`,
            name: `${name}-cdn`,
            component: () => import('@/views/projects/project/advanced/cdn/CdnView.vue'),
            meta: { title: 'cdn' },
          },
          {
            path: `/${segment}/:id/advanced/logs`,
            name: `${name}-logs`,
            component: () => import('@/views/projects/project/advanced/logs/LogsView.vue'),
            meta: { title: 'logs' },
          },
          {
            path: `/${segment}/:id/advanced/wordpress-config`,
            name: `${name}-wordpress-config`,
            component: () => import('@/views/projects/project/advanced/wordpress-config/WordpressConfigView.vue'),
            meta: { title: 'wordpress-config' },
          },
          {
            path: `/${segment}/:id/advanced/wordpress-users`,
            name: `${name}-wordpress-users`,
            component: () => import('@/views/projects/project/advanced/wordpress-users/WordpressUsersView.vue'),
            meta: { title: 'users' },
          },
          {
            path: `/${segment}/:id/advanced/git`,
            name: `${name}-git`,
            component: () => import('@/views/projects/project/advanced/git/GitView.vue'),
            meta: { title: 'git' },
          },
          {
            path: `/${segment}/:id/advanced/copy-instance`,
            name: `${name}-copy-instance`,
            component: () => import('@/views/projects/project/advanced/copy-instance/CopyInstanceView.vue'),
            meta: { title: 'copy-instance' },
          },
          {
            path: `/${segment}/:id/advanced/users`,
            name: `${name}-users`,
            component: () => import('@/views/projects/project/advanced/users/UsersView.vue'),
            beforeEnter: to => requireSingleServer(segment, to),
            meta: { title: 'users' },
          },
          {
            path: `/${segment}/:id/advanced/themes`,
            name: `${name}-themes`,
            component: () => import('@/views/projects/project/advanced/themes/ThemesView.vue'),
            meta: { title: 'themes' },
          },
          {
            path: `/${segment}/:id/advanced/env-file`,
            name: `${name}-env-file`,
            component: () => import('@/views/projects/project/advanced/env-file/EnvFileView.vue'),
            beforeEnter: to => requireSingleServer(segment, to),
            meta: { title: 'env-file' },
          },
          {
            path: `/${segment}/:id/advanced/developer-settings`,
            name: `${name}-developer-settings`,
            component: () => import('@/views/projects/project/advanced/developer-settings/DeveloperSettingsView.vue'),
            meta: { title: 'developer-settings' },
          },
          {
            path: `/${segment}/:id/advanced/auto-updates`,
            name: `${name}-auto-updates`,
            component: () => import('@/views/projects/project/advanced/auto-updates/AutoUpdatesView.vue'),
            meta: { title: 'auto-updates' },
          },
          {
            path: `/${segment}/:id/advanced/wordpress-mcp`,
            name: `${name}-wordpress-mcp`,
            component: () => import('@/views/projects/project/advanced/wordpress-mcp/WordpressMcpView.vue'),
            meta: { title: 'wordpress-mcp' },
          },
          {
            path: `/${segment}/:id/advanced/domains`,
            name: `${name}-domains`,
            component: () => import('@/views/projects/project/advanced/domains/AdvancedDomainsView.vue'),
            meta: { title: 'advanced-domains', advancedHostingSection: 'domains' },
          },
          {
            path: `/${segment}/:id/advanced/ftp`,
            name: `${name}-ftp`,
            component: () => import('@/views/projects/project/advanced/ftp/AdvancedFtpView.vue'),
            meta: { title: 'advanced-ftp', advancedHostingSection: 'ftp' },
          },
          {
            path: `/${segment}/:id/advanced/file-manager`,
            name: `${name}-file-manager`,
            component: () => import('@/views/projects/project/advanced/file-manager/AdvancedFileManagerView.vue'),
            meta: { title: 'advanced-file-manager', advancedHostingSection: 'file-manager' },
          },
          {
            path: `/${segment}/:id/advanced/cron`,
            name: `${name}-cron`,
            component: () => import('@/views/projects/project/advanced/cron/AdvancedCronView.vue'),
            meta: { title: 'advanced-cron', advancedHostingSection: 'cron' },
          },
          {
            path: `/${segment}/:id/advanced/databases`,
            name: `${name}-databases`,
            component: () => import('@/views/projects/project/advanced/databases/AdvancedDatabasesView.vue'),
            meta: { title: 'advanced-databases', advancedHostingSection: 'databases' },
          },
          {
            path: `/${segment}/:id/advanced/sftp`,
            name: `${name}-sftp`,
            component: () => import('@/views/projects/project/advanced/sftp/AdvancedSftpView.vue'),
            meta: { title: 'advanced-sftp', advancedHostingSection: 'sftp' },
          },
          {
            path: `/${segment}/:id/advanced/containers`,
            name: `${name}-containers`,
            component: () => import('@/views/projects/project/advanced/containers/AdvancedContainersView.vue'),
            meta: { title: 'advanced-containers', advancedHostingSection: 'containers' },
          },
        ],
      },
    ],
  }
}

export const instanceRoutes: RouteRecordRaw[] = [
  resourceFrame('instances', 'instance'),
  resourceFrame('projects', 'project'),
]
