import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { flushPromises } from '@vue/test-utils'
import i18next from 'i18next'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { testWordpressConnection } from '@/views/onboarding/onboarding.api'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import OnboardingImportSimpleMethodModal from './OnboardingImportSimpleMethodModal.vue'

vi.mock('@/views/onboarding/onboarding.api')
vi.mock('@/shared/realtime/echo-client', () => ({ echoClient: { connection: null } }))

let host: HTMLDivElement | undefined

afterEach(() => {
  host?.remove()
  host = undefined
  document.body.innerHTML = ''
})

// The two methods are a choice, not an accordion. Clicking the row that was already open collapsed both, which
// unmounted the admin login fields and left Continue with nothing to send; Vuetify's panels toggle by default.
describe('OnboardingImportSimpleMethodModal import method', () => {
  async function mountOpen () {
    host = document.createElement('div')
    document.body.append(host)
    const wrapper = await mountKit(OnboardingImportSimpleMethodModal, {
      props: { isOpen: false },
      attachTo: host,
      global: { plugins: [createPinia()] },
    })
    await wrapper.setProps({ isOpen: true })
    await flushPromises()
    return wrapper
  }

  const titles = () => [...document.querySelectorAll<HTMLElement>('[data-testid="onboarding-import-simple-modal"] .v-expansion-panel-title')]
  const adminTitle = () => titles().find(el => el.textContent?.includes('adminLoginDetails.title'))
  const manualTitle = () => titles().find(el => el.textContent?.includes('installPluginManually.title'))
  const fields = () => document.querySelectorAll('[data-testid="onboarding-import-simple-modal"] input')
  const panelOf = (title?: HTMLElement) => title?.closest('.v-expansion-panel')

  it('opens on the admin login row and keeps its fields when that row is clicked', async () => {
    const wrapper = await mountOpen()

    expect(panelOf(adminTitle())?.className).toContain('--active')
    expect(fields()).toHaveLength(3)

    adminTitle()?.click()
    await flushPromises()

    expect(panelOf(adminTitle())?.className).toContain('--active')
    expect(panelOf(manualTitle())?.className).not.toContain('--active')
    expect(fields()).toHaveLength(3)
    wrapper.unmount()
  })

  it('switches to the manual row and back without losing the fields', async () => {
    const wrapper = await mountOpen()

    manualTitle()?.click()
    await flushPromises()
    expect(panelOf(manualTitle())?.className).toContain('--active')
    expect(fields()).toHaveLength(0)

    manualTitle()?.click()
    await flushPromises()
    expect(panelOf(manualTitle())?.className).toContain('--active')

    adminTitle()?.click()
    await flushPromises()
    expect(panelOf(adminTitle())?.className).toContain('--active')
    expect(fields()).toHaveLength(3)
    wrapper.unmount()
  })
})

// jsdom does not evaluate scoped SCSS, so the radio and panel style is pinned in the source.
describe('OnboardingImportSimpleMethodModal panel style', () => {
  const style = readFileSync(join(import.meta.dirname, 'OnboardingImportSimpleMethodModal.vue'), 'utf8').split('<style', 2)[1]

  it('draws the radio dot without the V4 focus ring border', () => {
    const afterRule = style.match(/&::after \{([^}]*left: 29px[^}]*)\}/)?.[1] ?? ''
    expect(afterRule).toMatch(/border:\s*0;/)
  })

  it('fills the radio with the checkbox theme colour, not a transparent fill', () => {
    expect(style).toContain('background: rgb(var(--v-theme-checkbox));')
    expect(style).not.toMatch(/background:\s*transparent;/)
  })

  it('has no chevron in either panel header (legacy icon slot is empty)', () => {
    const source = readFileSync(join(import.meta.dirname, 'OnboardingImportSimpleMethodModal.vue'), 'utf8')
    const titles = source.split('<style', 1)[0].match(/<v-expansion-panel-title[^>]*>/g) ?? []
    expect(titles).toHaveLength(2)
    for (const tag of titles) {
      expect(tag).toContain('hide-actions')
    }
  })

  it('hides the V4 panel shadow node', () => {
    expect(style).toMatch(/:deep\(\.v-expansion-panel__shadow\)\s*\{\s*display:\s*none;/)
  })
})

// An unsuccessful connection test answers 200 with `success: false`; the wizard stays on the login step.
describe('OnboardingImportSimpleMethodModal connection answers', () => {
  const MODAL = '[data-testid="onboarding-import-simple-modal"]'

  /** The alert's copy from the English bundle (`message.alert.failed|warning` carry the answer's sentence). */
  async function withAlertCopy (run: () => Promise<void>): Promise<void> {
    i18next.addResourceBundle('en', 'translation', {
      message: { alert: { failed: 'Failed: {message}', warning: 'Warning: {message}' } },
      notification: { connectionFailed: 'Connection failed.' },
    }, true, true)
    try {
      await run()
    } finally {
      i18next.removeResourceBundle('en', 'translation')
      i18next.addResourceBundle('en', 'translation', {})
    }
  }

  async function submitAnswer (answer: Record<string, unknown>, singleServer = false) {
    vi.mocked(testWordpressConnection).mockResolvedValue(answer)
    host = document.createElement('div')
    document.body.append(host)
    const pinia = createPinia()
    if (singleServer) {
      setActivePinia(pinia)
      useSessionStore().hydrateHome({ app: { single_server: { active: true } }, user: {} } as never)
    }
    const wrapper = await mountKit(OnboardingImportSimpleMethodModal, {
      props: { isOpen: false, importUrl: 'https://old-site.example.com' },
      attachTo: host,
      global: { plugins: [pinia] },
    })
    await wrapper.setProps({ isOpen: true })
    await flushPromises()
    const inputs = [...document.querySelectorAll<HTMLInputElement>(`${MODAL} input`)]
    for (const [index, value] of [[1, 'fx27admin'], [2, 'Fx27-Wp193-Pass!']] as const) {
      inputs[index].value = value
      inputs[index].dispatchEvent(new Event('input'))
    }
    await flushPromises()
    const next = [...document.querySelectorAll<HTMLElement>(`${MODAL} button`)].find(button => button.textContent?.includes('button.continue'))
    next?.click()
    await flushPromises()
    return wrapper
  }

  const messages = (variant: 'error' | 'warning') => [...document.querySelectorAll(`${MODAL} .app-message--${variant}`)]
    .map(element => (element.textContent ?? '').replace(/\s+/g, ' ').trim())

  it('shows the answer that the source domain is taken and keeps the login step open', async () => {
    await withAlertCopy(async () => {
      const wrapper = await submitAnswer({
        success: false,
        error_type: 'error',
        message: 'This site\'s domain is already used by a project on this server.',
        import_details: { url: 'https://old-site.example.com' },
      })
      await flushPromises()

      expect(messages('error')).toEqual(['Failed: This site\'s domain is already used by a project on this server.'])
      expect(wrapper.emitted('import-instance')).toBeUndefined()
      expect(document.querySelectorAll(`${MODAL} input`)).toHaveLength(3)
      wrapper.unmount()
    })
  })

  it('says the answer in project wording on single server, where the panel\'s HTTP errors are rebranded', async () => {
    await withAlertCopy(async () => {
      const wrapper = await submitAnswer({
        success: false,
        error_type: 'error',
        message: 'Cannot generate subdomain for imported instance',
        import_details: {},
      }, true)
      await flushPromises()

      expect(messages('error')).toEqual(['Failed: Cannot generate subdomain for imported project'])
      wrapper.unmount()
    })
  })

  it('says the connection failed when an error answer carries no sentence', async () => {
    await withAlertCopy(async () => {
      const wrapper = await submitAnswer({ success: false, error_type: 'error', message: '', import_details: {} })
      await flushPromises()

      expect(messages('error')).toEqual(['Failed: Connection failed.'])
      expect(wrapper.emitted('import-instance')).toBeUndefined()
      wrapper.unmount()
    })
  })

  it('says the connection failed when a warning answer carries a blank sentence', async () => {
    await withAlertCopy(async () => {
      const wrapper = await submitAnswer({ success: false, error_type: 'warning', message: ' '.repeat(3), import_details: {} })
      await flushPromises()

      expect(messages('warning')).toEqual(['Warning: Connection failed.'])
      wrapper.unmount()
    })
  })

  it('shows the connection error and opens the manual plugin panel', async () => {
    await withAlertCopy(async () => {
      const wrapper = await submitAnswer({
        success: false,
        error_type: 'connection_error',
        message: 'Using your WordPress admin credentials will not work.',
        import_details: {},
      })
      await flushPromises()

      expect(messages('warning')).toEqual(['Warning: Using your WordPress admin credentials will not work.'])
      expect(document.querySelectorAll(`${MODAL} input`)).toHaveLength(0)
      wrapper.unmount()
    })
  })
})
