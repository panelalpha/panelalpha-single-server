import type { HomeResponse } from '@/shared/session/session.api'
import i18next from 'i18next'
import { beforeAll, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { routes } from '@/app/router'
import { resolveAuthGuardRedirect } from '@/app/router/auth-guard'
import { updateDocumentTitle } from '@/app/router/document-title'
import { resolveRootRedirect } from '@/app/router/root-redirect'

function memoryRouter () {
  return createRouter({ history: createMemoryHistory(), routes })
}

describe('page-not-found routes', () => {
  it.each(['/this-page-does-not-exist', '/instances-x/1'])('resolves unknown path %s to the error route', path => {
    expect(memoryRouter().resolve(path).name).toBe('error')
  })

  it('does not swallow known routes', () => {
    const router = memoryRouter()
    expect(router.resolve('/login').name).toBe('login')
    expect(router.resolve('/instances').name).toBe('instances')
  })

  it('is public and without navbar', () => {
    const { meta } = memoryRouter().resolve('/nope')
    expect(meta).toMatchObject({ requiresAuth: false, displayNavbar: false, title: 'page-not-found' })
  })

  it('leads the home route to /instances in the guard, which then sends a guest to login', () => {
    const router = memoryRouter()
    const home = router.resolve('/')
    expect(home.name).toBe('home')
    expect(home.matched[0]!.redirect).toBeUndefined()

    const root = resolveRootRedirect(home, null)
    expect(root).toEqual({ path: '/instances', replace: true })

    const target = router.resolve(root!.path)
    expect(resolveAuthGuardRedirect(target, false)).toEqual({ path: '/login', query: { redirect: '/instances' } })
    expect(resolveAuthGuardRedirect(target, true)).toBe(true)
  })
})

describe('page-not-found document title', () => {
  beforeAll(async () => {
    const resources = { title: { 'page-not-found': '{{- app_name}} - Page Not Found' } }
    if (i18next.isInitialized) {
      i18next.addResourceBundle('en', 'translation', resources, true, true)
      await i18next.changeLanguage('en')
    } else {
      await i18next.init({
        lng: 'en',
        fallbackLng: 'en',
        resources: { en: { translation: resources } },
        interpolation: { escapeValue: false },
      })
    }
  })

  it('uses the app name from home', () => {
    const route = memoryRouter().resolve('/nope')
    updateDocumentTitle(route, { app: { name: 'MG' } } as HomeResponse)
    expect(document.title).toBe('MG - Page Not Found')
  })
})
