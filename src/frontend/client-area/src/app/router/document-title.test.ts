import type { HomeResponse } from '@/shared/session/session.api'
import type { InstanceResource } from '@/entities/project/instance-resource'
import i18next from 'i18next'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useInstanceStore } from '@/views/projects/project/instance.store'
import { resolveAppName, updateDocumentTitle } from './document-title'

const frameRoute = {
  meta: { title: 'general-information' },
  matched: [{ meta: { instancePage: true } }, { meta: { title: 'general-information' } }],
}

describe('resolveAppName', () => {
  it('uses home.app.name when non-empty', () => {
    expect(resolveAppName({ app: { name: 'Acme' } } as HomeResponse)).toBe('Acme')
  })

  it('falls back to PanelAlpha when name is missing or blank', () => {
    expect(resolveAppName(null)).toBe('PanelAlpha')
    expect(resolveAppName({ app: { name: '' } } as HomeResponse)).toBe('PanelAlpha')
    expect(resolveAppName({ app: { name: '  ' } } as HomeResponse)).toBe('PanelAlpha')
  })
})

describe('updateDocumentTitle', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    if (i18next.isInitialized) {
      i18next.addResourceBundle('en', 'translation', {
        title: {
          'login': '{{- app_name}} - Login',
          'projects': '{{- app_name}} - Projects',
          'general-information': '{{- app_name}} - {{- instance_name}}',
        },
      }, true, true)
      await i18next.changeLanguage('en')
    } else {
      await i18next.init({
        lng: 'en',
        fallbackLng: 'en',
        resources: {
          en: {
            translation: {
              title: {
                'login': '{{- app_name}} - Login',
                'projects': '{{- app_name}} - Projects',
                'general-information': '{{- app_name}} - {{- instance_name}}',
              },
            },
          },
        },
        interpolation: { escapeValue: false },
      })
    }
    document.title = ''
  })

  it('sets login document title to PanelAlpha - Login', () => {
    updateDocumentTitle(
      { meta: { title: 'login' } },
      { app: { name: 'PanelAlpha' } } as HomeResponse,
    )
    expect(document.title).toBe('PanelAlpha - Login')
  })

  it('sets the /projects route title from title.projects (app-lite)', () => {
    updateDocumentTitle(
      { meta: { title: 'projects' } },
      { app: { name: 'My Server' } } as HomeResponse,
    )
    expect(document.title).toBe('My Server - Projects')
  })

  it('uses app name only when meta.title is absent', () => {
    updateDocumentTitle(
      { meta: {} },
      { app: { name: 'Acme Host' } } as HomeResponse,
    )
    expect(document.title).toBe('Acme Host')
  })

  it('does not show a missing title key, only the app name', () => {
    updateDocumentTitle(
      { meta: { title: 'env-file' } },
      { app: { name: 'My TestServer' } } as HomeResponse,
    )
    expect(document.title).toBe('My TestServer')
  })

  it('shows app and project when the page key is missing on an instance page', () => {
    useInstanceStore().instance = { title: 'Blog' } as unknown as InstanceResource
    updateDocumentTitle(
      { meta: { title: 'env-file' }, matched: [{ meta: { instancePage: true } }] },
      { app: { name: 'My TestServer' } } as HomeResponse,
    )
    expect(document.title).toBe('My TestServer: Blog')
  })

  describe('instance name of the frame', () => {
    function setInstanceTitle (title: string): void {
      useInstanceStore().instance = { title } as unknown as InstanceResource
    }

    it('keeps the instance name on a child of the frame (afterEach)', () => {
      setInstanceTitle('Blog')
      updateDocumentTitle(frameRoute, { app: { name: 'PanelAlpha' } } as HomeResponse)
      expect(document.title).toBe('PanelAlpha - Blog')
    })

    it('keeps the instance name when session.home is refreshed', () => {
      setInstanceTitle('Blog')
      updateDocumentTitle(frameRoute, { app: { name: 'PanelAlpha' } } as HomeResponse)
      updateDocumentTitle(frameRoute, { app: { name: 'Renamed' } } as HomeResponse)
      expect(document.title).toBe('Renamed - Blog')
    })

    it('gives an empty instance name outside the frame', () => {
      setInstanceTitle('Blog')
      updateDocumentTitle(
        { meta: { title: 'general-information' }, matched: [{ meta: { title: 'general-information' } }] },
        { app: { name: 'PanelAlpha' } } as HomeResponse,
      )
      expect(document.title).toBe('PanelAlpha -')
    })

    it('gives an empty instance name before the frame has loaded the instance', () => {
      updateDocumentTitle(frameRoute, { app: { name: 'PanelAlpha' } } as HomeResponse)
      expect(document.title).toBe('PanelAlpha -')
    })
  })
})
