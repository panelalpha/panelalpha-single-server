import type { HomeResponse } from '@/shared/session/session.api'
import type { RouteLocationNormalized } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useSessionStore } from '@/shared/session/session.store'
import { instanceRoutes } from './instance.routes'

function location (id: string): RouteLocationNormalized {
  return { params: { id } } as unknown as RouteLocationNormalized
}

describe('instance routes: advanced', () => {
  for (const [segment, frameName, detailsName] of [
    ['instances', 'instance', 'instance-details'],
    ['projects', 'project', 'project-details'],
  ] as const) {
    it(`redirects /${segment}/:id/advanced to its details child`, () => {
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const redirect = advanced.redirect as (to: RouteLocationNormalized) => string

      expect(advanced.name).toBe(`${frameName}-advanced`)
      expect(redirect(location('7'))).toBe(`/${segment}/7/advanced/details`)
      expect(typeof advanced.component).toBe('function')
    })

    it(`has /${segment}/:id/advanced/details as a child of advanced with the details title and a lazy view`, () => {
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const details = advanced.children!.find(route => route.path === `/${segment}/:id/advanced/details`)!

      expect(details.name).toBe(detailsName)
      expect(details.meta).toEqual({ title: 'details' })
      expect(typeof details.component).toBe('function')
    })

    it(`has /${segment}/:id/advanced/security as a child of advanced with the security title and a lazy view`, () => {
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const security = advanced.children!.find(route => route.path === `/${segment}/:id/advanced/security`)!

      expect(security.name).toBe(`${frameName}-security`)
      expect(security.meta).toEqual({ title: 'security' })
      expect(typeof security.component).toBe('function')
    })

    it(`has /${segment}/:id/advanced/git as a child of advanced with the git title and a lazy view`, () => {
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const git = advanced.children!.find(route => route.path === `/${segment}/:id/advanced/git`)!

      expect(git.name).toBe(`${frameName}-git`)
      expect(git.meta).toEqual({ title: 'git' })
      expect(typeof git.component).toBe('function')
    })

    it(`has /${segment}/:id/advanced/copy-instance as a child of advanced with the copy-instance title and a lazy view`, () => {
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const copyInstance = advanced.children!.find(route => route.path === `/${segment}/:id/advanced/copy-instance`)!

      expect(copyInstance.name).toBe(`${frameName}-copy-instance`)
      expect(copyInstance.meta).toEqual({ title: 'copy-instance' })
      expect(typeof copyInstance.component).toBe('function')
    })
  }
})

describe('instance routes: advanced users', () => {
  for (const [segment, frameName, usersName] of [
    ['instances', 'instance', 'instance-users'],
    ['projects', 'project', 'project-users'],
  ] as const) {
    it(`has /${segment}/:id/advanced/users as a child of advanced with the users title and a lazy view`, () => {
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const users = advanced.children!.find(route => route.path === `/${segment}/:id/advanced/users`)!

      expect(users.name).toBe(usersName)
      expect(users.meta).toEqual({ title: 'users' })
      expect(typeof users.component).toBe('function')
    })

    it(`sends /${segment}/:id/advanced/users to details unless single_server is active (app-lite only)`, () => {
      setActivePinia(createPinia())
      const session = useSessionStore()
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const users = advanced.children!.find(route => route.path === `/${segment}/:id/advanced/users`)!
      const guard = users.beforeEnter as (to: RouteLocationNormalized) => unknown

      session.home = null
      expect(guard(location('7'))).toEqual({ path: `/${segment}/7/advanced/details` })

      session.home = { app: { single_server: { active: true } } } as unknown as HomeResponse
      expect(guard(location('7'))).toBe(true)
    })
  }
})

describe('instance routes: advanced env-file', () => {
  for (const [segment, frameName] of [
    ['instances', 'instance'],
    ['projects', 'project'],
  ] as const) {
    it(`has /${segment}/:id/advanced/env-file as a child of advanced with the env-file title and a lazy view`, () => {
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const envFile = advanced.children!.find(route => route.path === `/${segment}/:id/advanced/env-file`)!

      expect(envFile.name).toBe(`${frameName}-env-file`)
      expect(envFile.meta).toEqual({ title: 'env-file' })
      expect(typeof envFile.component).toBe('function')
    })

    it(`resolves /${segment}/7/advanced/env-file to ${frameName}-env-file`, () => {
      const router = createRouter({ history: createMemoryHistory(), routes: instanceRoutes })

      expect(router.resolve(`/${segment}/7/advanced/env-file`).name).toBe(`${frameName}-env-file`)
    })

    it(`sends /${segment}/:id/advanced/env-file to details unless single_server is active (app-lite only)`, () => {
      setActivePinia(createPinia())
      const session = useSessionStore()
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const envFile = advanced.children!.find(route => route.path === `/${segment}/:id/advanced/env-file`)!
      const guard = envFile.beforeEnter as (to: RouteLocationNormalized) => unknown

      session.home = null
      expect(guard(location('7'))).toEqual({ path: `/${segment}/7/advanced/details` })

      session.home = { app: { single_server: { active: true } } } as unknown as HomeResponse
      expect(guard(location('7'))).toBe(true)
    })
  }
})

describe('instance routes: advanced cloudflare', () => {
  for (const [segment, frameName] of [
    ['instances', 'instance'],
    ['projects', 'project'],
  ] as const) {
    it(`has /${segment}/:id/advanced/cloudflare as a child of advanced with the cloudflare title and a lazy view`, () => {
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const cloudflare = advanced.children!.find(route => route.path === `/${segment}/:id/advanced/cloudflare`)!

      expect(cloudflare.name).toBe(`${frameName}-cloudflare`)
      expect(cloudflare.meta).toEqual({ title: 'cloudflare' })
      expect(cloudflare.beforeEnter).toBeUndefined()
      expect(typeof cloudflare.component).toBe('function')
    })
  }
})

describe('instance routes: advanced edge-cache', () => {
  for (const [segment, frameName] of [
    ['instances', 'instance'],
    ['projects', 'project'],
  ] as const) {
    it(`has /${segment}/:id/advanced/edge-cache as a child of advanced after cloudflare with the edge-cache title and a lazy view`, () => {
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const edgeCache = advanced.children!.find(route => route.path === `/${segment}/:id/advanced/edge-cache`)!
      const paths = advanced.children!.map(route => route.path)

      expect(edgeCache.name).toBe(`${frameName}-edge-cache`)
      expect(edgeCache.meta).toEqual({ title: 'edge-cache' })
      expect(edgeCache.beforeEnter).toBeUndefined()
      expect(edgeCache.redirect).toBeUndefined()
      expect(typeof edgeCache.component).toBe('function')
      expect(paths.indexOf(`/${segment}/:id/advanced/edge-cache`)).toBe(paths.indexOf(`/${segment}/:id/advanced/cloudflare`) + 1)
    })
  }
})

describe('instance routes: advanced cdn', () => {
  for (const [segment, frameName] of [
    ['instances', 'instance'],
    ['projects', 'project'],
  ] as const) {
    it(`has /${segment}/:id/advanced/cdn as a child of advanced with the cdn title and a lazy view`, () => {
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const cdn = advanced.children!.find(route => route.path === `/${segment}/:id/advanced/cdn`)!

      expect(cdn.name).toBe(`${frameName}-cdn`)
      expect(cdn.meta).toEqual({ title: 'cdn' })
      expect(cdn.beforeEnter).toBeUndefined()
      expect(typeof cdn.component).toBe('function')
    })
  }
})

describe('instance routes: advanced developer-settings', () => {
  for (const [segment, frameName] of [
    ['instances', 'instance'],
    ['projects', 'project'],
  ] as const) {
    it(`has /${segment}/:id/advanced/developer-settings as a child of advanced after env-file with the developer-settings title and a lazy view`, () => {
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const developerSettings = advanced.children!.find(route => route.path === `/${segment}/:id/advanced/developer-settings`)!
      const paths = advanced.children!.map(route => route.path)

      expect(developerSettings.name).toBe(`${frameName}-developer-settings`)
      expect(developerSettings.meta).toEqual({ title: 'developer-settings' })
      expect(typeof developerSettings.component).toBe('function')
      expect(paths.indexOf(`/${segment}/:id/advanced/developer-settings`)).toBe(paths.indexOf(`/${segment}/:id/advanced/env-file`) + 1)
    })
  }
})

describe('instance routes: advanced auto-updates', () => {
  for (const [segment, frameName] of [
    ['instances', 'instance'],
    ['projects', 'project'],
  ] as const) {
    it(`has /${segment}/:id/advanced/auto-updates as a child of advanced with the auto-updates title and a lazy view`, () => {
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const autoUpdates = advanced.children!.find(route => route.path === `/${segment}/:id/advanced/auto-updates`)!

      expect(autoUpdates.name).toBe(`${frameName}-auto-updates`)
      expect(autoUpdates.meta).toEqual({ title: 'auto-updates' })
      expect(autoUpdates.beforeEnter).toBeUndefined()
      expect(typeof autoUpdates.component).toBe('function')
    })

    it(`resolves /${segment}/7/advanced/auto-updates to ${frameName}-auto-updates`, () => {
      const router = createRouter({ history: createMemoryHistory(), routes: instanceRoutes })

      expect(router.resolve(`/${segment}/7/advanced/auto-updates`).name).toBe(`${frameName}-auto-updates`)
    })
  }
})

describe('instance routes: advanced wordpress-mcp', () => {
  for (const [segment, frameName] of [
    ['instances', 'instance'],
    ['projects', 'project'],
  ] as const) {
    it(`has /${segment}/:id/advanced/wordpress-mcp as a child of advanced with the wordpress-mcp title and a lazy view`, () => {
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const wordpressMcp = advanced.children!.find(route => route.path === `/${segment}/:id/advanced/wordpress-mcp`)!

      expect(wordpressMcp.name).toBe(`${frameName}-wordpress-mcp`)
      expect(wordpressMcp.meta).toEqual({ title: 'wordpress-mcp' })
      expect(wordpressMcp.beforeEnter).toBeUndefined()
      expect(typeof wordpressMcp.component).toBe('function')
    })

    it(`resolves /${segment}/7/advanced/wordpress-mcp to ${frameName}-wordpress-mcp`, () => {
      const router = createRouter({ history: createMemoryHistory(), routes: instanceRoutes })

      expect(router.resolve(`/${segment}/7/advanced/wordpress-mcp`).name).toBe(`${frameName}-wordpress-mcp`)
    })
  }
})

describe('instance routes: advanced logs', () => {
  for (const [segment, frameName, logsName] of [
    ['instances', 'instance', 'instance-logs'],
    ['projects', 'project', 'project-logs'],
  ] as const) {
    it(`has /${segment}/:id/advanced/logs as a child of advanced with the logs title and a lazy view`, () => {
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const logs = advanced.children!.find(route => route.path === `/${segment}/:id/advanced/logs`)!

      expect(logs.name).toBe(logsName)
      expect(logs.meta).toEqual({ title: 'logs' })
      expect(typeof logs.component).toBe('function')
    })
  }
})

describe('instance routes: advanced themes', () => {
  for (const [segment, frameName, themesName] of [
    ['instances', 'instance', 'instance-themes'],
    ['projects', 'project', 'project-themes'],
  ] as const) {
    it(`has /${segment}/:id/advanced/themes as a child of advanced with the themes title and a lazy view`, () => {
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const themes = advanced.children!.find(route => route.path === `/${segment}/:id/advanced/themes`)!

      expect(themes.name).toBe(themesName)
      expect(themes.meta).toEqual({ title: 'themes' })
      expect(typeof themes.component).toBe('function')
    })
  }
})

describe('instance routes: advanced wordpress-config', () => {
  for (const [segment, frameName, wordpressConfigName] of [
    ['instances', 'instance', 'instance-wordpress-config'],
    ['projects', 'project', 'project-wordpress-config'],
  ] as const) {
    it(`has /${segment}/:id/advanced/wordpress-config as a child of advanced with the wordpress-config title and a lazy view`, () => {
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const wordpressConfig = advanced.children!.find(route => route.path === `/${segment}/:id/advanced/wordpress-config`)!

      expect(wordpressConfig.name).toBe(wordpressConfigName)
      expect(wordpressConfig.meta).toEqual({ title: 'wordpress-config' })
      expect(wordpressConfig.beforeEnter).toBeUndefined()
      expect(typeof wordpressConfig.component).toBe('function')
    })

    it(`resolves /${segment}/7/advanced/wordpress-config to ${wordpressConfigName}`, () => {
      const router = createRouter({ history: createMemoryHistory(), routes: instanceRoutes })

      expect(router.resolve(`/${segment}/7/advanced/wordpress-config`).name).toBe(wordpressConfigName)
    })
  }
})

describe('instance routes: advanced wordpress-users', () => {
  for (const [segment, frameName, wordpressUsersName] of [
    ['instances', 'instance', 'instance-wordpress-users'],
    ['projects', 'project', 'project-wordpress-users'],
  ] as const) {
    it(`has /${segment}/:id/advanced/wordpress-users as a child of advanced with the users title, no guard and a lazy view`, () => {
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const wordpressUsers = advanced.children!.find(route => route.path === `/${segment}/:id/advanced/wordpress-users`)!

      expect(wordpressUsers.name).toBe(wordpressUsersName)
      expect(wordpressUsers.meta).toEqual({ title: 'users' })
      expect(wordpressUsers.beforeEnter).toBeUndefined()
      expect(typeof wordpressUsers.component).toBe('function')
    })

    it(`resolves /${segment}/7/advanced/wordpress-users to ${wordpressUsersName}`, () => {
      const router = createRouter({ history: createMemoryHistory(), routes: instanceRoutes })

      expect(router.resolve(`/${segment}/7/advanced/wordpress-users`).name).toBe(wordpressUsersName)
    })
  }
})

describe('instance routes: advanced containers', () => {
  for (const [segment, frameName] of [
    ['instances', 'instance'],
    ['projects', 'project'],
  ] as const) {
    it(`has /${segment}/:id/advanced/containers as a child of advanced with the advanced-containers title, the containers section and a lazy view`, () => {
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const containers = advanced.children!.find(route => route.path === `/${segment}/:id/advanced/containers`)!

      expect(containers.name).toBe(`${frameName}-containers`)
      expect(containers.meta).toEqual({ title: 'advanced-containers', advancedHostingSection: 'containers' })
      expect(containers.beforeEnter).toBeUndefined()
      expect(typeof containers.component).toBe('function')
    })

    it(`resolves /${segment}/7/advanced/containers to ${frameName}-containers`, () => {
      const router = createRouter({ history: createMemoryHistory(), routes: instanceRoutes })

      expect(router.resolve(`/${segment}/7/advanced/containers`).name).toBe(`${frameName}-containers`)
    })

    it(`keeps /${segment}/:id/advanced/containers behind the login guard through the requiresAuth frame`, () => {
      const router = createRouter({ history: createMemoryHistory(), routes: instanceRoutes })

      expect(router.resolve(`/${segment}/7/advanced/containers`).matched.some(record => record.meta.requiresAuth === true)).toBe(true)
    })
  }
})

describe('instance routes: advanced ftp', () => {
  for (const [segment, frameName] of [
    ['instances', 'instance'],
    ['projects', 'project'],
  ] as const) {
    it(`has /${segment}/:id/advanced/ftp as a child of advanced with the advanced-ftp title, the ftp section and a lazy view`, () => {
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const ftp = advanced.children!.find(route => route.path === `/${segment}/:id/advanced/ftp`)!

      expect(ftp.name).toBe(`${frameName}-ftp`)
      expect(ftp.meta).toEqual({ title: 'advanced-ftp', advancedHostingSection: 'ftp' })
      expect(ftp.beforeEnter).toBeUndefined()
      expect(typeof ftp.component).toBe('function')
    })

    it(`resolves /${segment}/7/advanced/ftp to ${frameName}-ftp`, () => {
      const router = createRouter({ history: createMemoryHistory(), routes: instanceRoutes })

      expect(router.resolve(`/${segment}/7/advanced/ftp`).name).toBe(`${frameName}-ftp`)
    })

    it(`keeps /${segment}/:id/advanced/ftp behind the login guard through the requiresAuth frame`, () => {
      const router = createRouter({ history: createMemoryHistory(), routes: instanceRoutes })

      expect(router.resolve(`/${segment}/7/advanced/ftp`).matched.some(record => record.meta.requiresAuth === true)).toBe(true)
    })
  }
})

describe('instance routes: advanced file-manager', () => {
  for (const [segment, frameName] of [
    ['instances', 'instance'],
    ['projects', 'project'],
  ] as const) {
    it(`has /${segment}/:id/advanced/file-manager as a child of advanced with the advanced-file-manager title, the file-manager section and a lazy view`, () => {
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const fm = advanced.children!.find(route => route.path === `/${segment}/:id/advanced/file-manager`)!

      expect(fm.name).toBe(`${frameName}-file-manager`)
      expect(fm.meta).toEqual({ title: 'advanced-file-manager', advancedHostingSection: 'file-manager' })
      expect(fm.beforeEnter).toBeUndefined()
      expect(typeof fm.component).toBe('function')
    })

    it(`resolves /${segment}/7/advanced/file-manager to ${frameName}-file-manager`, () => {
      const router = createRouter({ history: createMemoryHistory(), routes: instanceRoutes })

      expect(router.resolve(`/${segment}/7/advanced/file-manager`).name).toBe(`${frameName}-file-manager`)
    })
  }
})

describe('instance routes: advanced cron', () => {
  for (const [segment, frameName] of [
    ['instances', 'instance'],
    ['projects', 'project'],
  ] as const) {
    it(`has /${segment}/:id/advanced/cron as a child of advanced with the advanced-cron title, the cron section and a lazy view`, () => {
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const cron = advanced.children!.find(route => route.path === `/${segment}/:id/advanced/cron`)!

      expect(cron.name).toBe(`${frameName}-cron`)
      expect(cron.meta).toEqual({ title: 'advanced-cron', advancedHostingSection: 'cron' })
      expect(cron.beforeEnter).toBeUndefined()
      expect(typeof cron.component).toBe('function')
    })

    it(`resolves /${segment}/7/advanced/cron to ${frameName}-cron`, () => {
      const router = createRouter({ history: createMemoryHistory(), routes: instanceRoutes })

      expect(router.resolve(`/${segment}/7/advanced/cron`).name).toBe(`${frameName}-cron`)
    })

    it(`keeps /${segment}/:id/advanced/cron behind the login guard through the requiresAuth frame`, () => {
      const router = createRouter({ history: createMemoryHistory(), routes: instanceRoutes })

      expect(router.resolve(`/${segment}/7/advanced/cron`).matched.some(record => record.meta.requiresAuth === true)).toBe(true)
    })
  }
})

describe('instance routes: advanced databases', () => {
  for (const [segment, frameName] of [
    ['instances', 'instance'],
    ['projects', 'project'],
  ] as const) {
    it(`has /${segment}/:id/advanced/databases as a child of advanced with the advanced-databases title, the databases section and a lazy view`, () => {
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const databases = advanced.children!.find(route => route.path === `/${segment}/:id/advanced/databases`)!

      expect(databases.name).toBe(`${frameName}-databases`)
      expect(databases.meta).toEqual({ title: 'advanced-databases', advancedHostingSection: 'databases' })
      expect(databases.beforeEnter).toBeUndefined()
      expect(typeof databases.component).toBe('function')
    })

    it(`resolves /${segment}/7/advanced/databases to ${frameName}-databases`, () => {
      const router = createRouter({ history: createMemoryHistory(), routes: instanceRoutes })

      expect(router.resolve(`/${segment}/7/advanced/databases`).name).toBe(`${frameName}-databases`)
    })

    it(`keeps /${segment}/:id/advanced/databases behind the login guard through the requiresAuth frame`, () => {
      const router = createRouter({ history: createMemoryHistory(), routes: instanceRoutes })

      expect(router.resolve(`/${segment}/7/advanced/databases`).matched.some(record => record.meta.requiresAuth === true)).toBe(true)
    })
  }
})

describe('instance routes: advanced sftp', () => {
  for (const [segment, frameName] of [
    ['instances', 'instance'],
    ['projects', 'project'],
  ] as const) {
    it(`has /${segment}/:id/advanced/sftp as a child of advanced with the advanced-sftp title, the sftp section and a lazy view`, () => {
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const sftp = advanced.children!.find(route => route.path === `/${segment}/:id/advanced/sftp`)!

      expect(sftp.name).toBe(`${frameName}-sftp`)
      expect(sftp.meta).toEqual({ title: 'advanced-sftp', advancedHostingSection: 'sftp' })
      expect(sftp.beforeEnter).toBeUndefined()
      expect(typeof sftp.component).toBe('function')
    })

    it(`resolves /${segment}/7/advanced/sftp to ${frameName}-sftp`, () => {
      const router = createRouter({ history: createMemoryHistory(), routes: instanceRoutes })

      expect(router.resolve(`/${segment}/7/advanced/sftp`).name).toBe(`${frameName}-sftp`)
    })
  }
})

describe('instance routes: advanced domains', () => {
  for (const [segment, frameName] of [
    ['instances', 'instance'],
    ['projects', 'project'],
  ] as const) {
    it(`has /${segment}/:id/advanced/domains as a child of advanced, before ftp, with the advanced-domains title, the domains section and a lazy view`, () => {
      const frame = instanceRoutes.find(route => route.name === frameName)!
      const advanced = frame.children!.find(route => route.path === `/${segment}/:id/advanced`)!
      const paths = advanced.children!.map(route => route.path)
      const domains = advanced.children!.find(route => route.path === `/${segment}/:id/advanced/domains`)!

      expect(domains.name).toBe(`${frameName}-domains`)
      expect(domains.meta).toEqual({ title: 'advanced-domains', advancedHostingSection: 'domains' })
      expect(domains.beforeEnter).toBeUndefined()
      expect(typeof domains.component).toBe('function')
      expect(paths.indexOf(domains.path)).toBeLessThan(paths.indexOf(`/${segment}/:id/advanced/ftp`))
    })

    it(`resolves /${segment}/7/advanced/domains to ${frameName}-domains`, () => {
      const router = createRouter({ history: createMemoryHistory(), routes: instanceRoutes })

      expect(router.resolve(`/${segment}/7/advanced/domains`).name).toBe(`${frameName}-domains`)
    })

    it(`keeps /${segment}/:id/advanced/domains behind the login guard through the requiresAuth frame`, () => {
      const router = createRouter({ history: createMemoryHistory(), routes: instanceRoutes })

      expect(router.resolve(`/${segment}/7/advanced/domains`).matched.some(record => record.meta.requiresAuth === true)).toBe(true)
    })
  }
})
