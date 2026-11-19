import type * as GoCatalogApi from '@/views/onboarding/go/go-catalog.api'
import type { GoAppDetails } from '@/views/onboarding/go/go-catalog.api'
import { flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getGoApp, getGoApps, getGoCategories, getGoStatus } from '@/views/onboarding/go/go-catalog.api'
import { mountKit } from '@/test/mount-kit'
import OnboardingGoCatalogModal from './OnboardingGoCatalogModal.vue'

vi.mock('@/views/onboarding/go/go-catalog.api', async importOriginal => ({
  ...(await importOriginal<typeof GoCatalogApi>()),
  getGoApp: vi.fn(),
  getGoApps: vi.fn(),
  getGoCategories: vi.fn(),
  getGoStatus: vi.fn(),
}))

const memos: GoAppDetails = {
  slug: 'memos',
  name: 'Memos',
  tagline: 'Lightweight notes',
  categories: ['Notes'],
  repository: 'https://github.com/usememos/memos',
  page_url: 'https://go.panelalpha.com/repo/github.com/usememos/memos',
  icon_url: 'https://avatars.githubusercontent.com/u/1',
  cover_url: 'https://go.panelalpha.com/screens/memos.webp',
  verified: '2026-11-10',
  tried_30_days: 12,
  ready_image: false,
  stars: 41_250,
  stars_updated_at: '2026-11-17T09:30:00Z',
  replaces: ['Google Keep', 'Notion', 'Evernote'],
}

let host: HTMLDivElement

async function mountModal () {
  host = document.createElement('div')
  document.body.append(host)
  const wrapper = mountKit(OnboardingGoCatalogModal, {
    props: { modelValue: true },
    attachTo: host,
    global: { plugins: [createPinia()] },
  })
  await flushPromises()
  return wrapper
}

function el (testId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-testid="${CSS.escape(testId)}"]`)
}

/** A button of an element by its text (the card's hover buttons and the sidebar's entries have no test id of their own). */
function buttonIn (root: Element | null, text: string): HTMLElement | null {
  return [...root?.querySelectorAll<HTMLElement>('button, .v-list-item, .v-tab') ?? []].find(item => item.textContent?.includes(text)) ?? null
}

/** The catalog's Back: in the sidebar on a wide screen, above the list on a narrow one. */
function catalogBack (): HTMLElement | null {
  return el('tags-sidebar-back') ?? el('go-catalog-back-mobile')
}

beforeEach(() => {
  vi.mocked(getGoStatus).mockReset().mockResolvedValue({ connected: true, available: true, plan: 'free' })
  vi.mocked(getGoCategories).mockReset().mockResolvedValue([{ name: 'Notes', apps: 1 }, { name: 'Media', apps: 4 }])
  vi.mocked(getGoApps).mockReset().mockResolvedValue({ data: [memos], meta: { current_page: 1, last_page: 1, total: 1 } })
  vi.mocked(getGoApp).mockReset().mockResolvedValue({
    ...memos,
    description: 'Memos is a note-taking app.',
    highlights: [{ title: 'Markdown', text: 'Write in Markdown.' }],
    install: { source: 'git', git_repo: 'https://github.com/usememos/memos', git_branch: null, template: 'dind', memory_mb: 2048, disk_mb: 20_480 },
  })
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('OnboardingGoCatalogModal', () => {
  it('shows the catalog as the theme chooser: logo, title, categories, count, search and cards', async () => {
    await mountModal()

    expect(el('onboarding-go-catalog-modal')).not.toBeNull()
    expect(document.querySelector('.go-catalog__logo')?.getAttribute('alt')).toBe('heading.onboarding.instanceSource.go.title')
    expect(document.querySelector('h1')?.textContent).toContain('heading.onboarding.goCatalog.title')
    expect(el('go-catalog-search')?.querySelector('input')).not.toBeNull()
    expect(el('go-catalog-count')?.textContent).toContain('1')
    expect(document.body.textContent).toContain('heading.onboarding.chooseTheme.popular')
    expect(document.body.textContent).toContain('Media')
    expect(el('go-app-card-memos')?.textContent).toContain('Memos')
    expect(el('go-app-card-memos')?.textContent).toContain('Lightweight notes')
    expect(el('go-app-card-memos')?.textContent).toContain('Notes')
    // How often it was tried on Go is not shown in the panel.
    expect(el('go-app-card-memos')?.textContent).not.toContain('heading.onboarding.goCatalog.tried')
    expect(el('go-app-card-memos')?.textContent).not.toContain('12')
    expect(el('go-app-stars-memos')?.textContent).toContain('41k')
    expect(el('go-app-replaces-memos')?.textContent).toContain('heading.onboarding.goCatalog.replaces')
    expect(getGoApps).toHaveBeenCalledWith({ q: '', category: null, sort: 'tried', page: 1 })
    expect(buttonIn(el('go-app-card-memos'), 'button.onboarding.goCatalog.details')).not.toBeNull()
  })

  it('lists the apps of a category picked in the sidebar', async () => {
    await mountModal()

    buttonIn(document.body, 'Media')?.click()
    await flushPromises()

    expect(getGoApps).toHaveBeenLastCalledWith({ q: '', category: 'Media', sort: 'tried', page: 1 })
    expect(el('go-catalog-count')?.textContent).toContain('heading.onboarding.goCatalog.inCategory')
  })

  it('lists every app by its verification day under "Latest"', async () => {
    await mountModal()

    buttonIn(document.body, 'heading.onboarding.chooseTheme.latest')?.click()
    await flushPromises()

    expect(getGoApps).toHaveBeenLastCalledWith({ q: '', category: null, sort: 'verified', page: 1 })
  })

  it('opens an app from its Details button and from the card', async () => {
    await mountModal()

    buttonIn(el('go-app-card-memos'), 'button.onboarding.goCatalog.details')?.click()
    await flushPromises()
    expect(el('go-app-details')).not.toBeNull()

    el('go-catalog-back')?.click()
    await flushPromises()
    el('go-app-card-memos')?.querySelector<HTMLElement>('.v-card-text')?.click()
    await flushPromises()
    expect(el('go-app-details')).not.toBeNull()
  })

  it('opens an app and deploys the install Go answered for it', async () => {
    const wrapper = await mountModal()

    el('go-app-open-memos')?.click()
    await flushPromises()

    expect(getGoApp).toHaveBeenCalledWith('memos')
    expect(el('go-app-details')?.textContent).toContain('Memos is a note-taking app.')
    // The reasons to choose the app (Go's highlights) and the verified mark are not shown.
    expect(el('go-app-details')?.textContent).not.toContain('Markdown')
    expect(el('go-app-details')?.querySelector('.go-details__name .v-icon')).toBeNull()
    expect(el('go-app-details-stars')?.textContent).toContain('★')
    expect(el('go-app-details-stars')?.textContent).toContain('heading.onboarding.goCatalog.stars')
    expect(el('go-app-deploy')?.textContent).toContain('button.onboarding.goCatalog.install')
    // The deploy button sits on the title row; Go's facts, link and upsell are not shown.
    expect(el('go-app-details')?.querySelector('.go-details__head [data-testid="go-app-deploy"]')).not.toBeNull()
    expect(document.querySelector('a[href="https://go.panelalpha.com/repo/github.com/usememos/memos"]')).toBeNull()

    el('go-app-deploy')?.click()
    await flushPromises()

    const [[deployed]] = wrapper.emitted('deploy') as [[GoAppDetails]]
    expect(deployed.install?.git_repo).toBe('https://github.com/usememos/memos')
  })

  it('goes back from an app to the catalog, and from the catalog to the type choice', async () => {
    const wrapper = await mountModal()

    el('go-app-open-memos')?.click()
    await flushPromises()
    expect(el('go-app-details')).not.toBeNull()

    el('go-catalog-back')?.click()
    await flushPromises()
    expect(el('go-app-details')).toBeNull()
    expect(el('go-app-card-memos')).not.toBeNull()
    expect(wrapper.emitted('go-back')).toBeUndefined()

    catalogBack()?.click()
    expect(wrapper.emitted('go-back')).toHaveLength(1)
  })

  it('installs from the list with the recipe Go answers at that moment', async () => {
    const wrapper = await mountModal()

    buttonIn(el('go-app-card-memos'), 'button.onboarding.goCatalog.install')?.click()
    await flushPromises()

    expect(getGoApp).toHaveBeenCalledWith('memos')
    expect(el('go-app-details')).toBeNull()
    const [[deployed]] = wrapper.emitted('deploy') as [[GoAppDetails]]
    expect(deployed.install?.git_repo).toBe('https://github.com/usememos/memos')
  })

  it('opens the details with their error when Go cannot answer the recipe', async () => {
    vi.mocked(getGoApp).mockRejectedValue(new Error('down'))
    const wrapper = await mountModal()

    buttonIn(el('go-app-card-memos'), 'button.onboarding.goCatalog.install')?.click()
    await flushPromises()

    expect(wrapper.emitted('deploy')).toBeUndefined()
    expect(el('go-app-details')).not.toBeNull()
    expect((el('go-app-deploy') as HTMLButtonElement | null)?.disabled).toBe(true)
  })

  it('shows no stars when Go has no count', async () => {
    vi.mocked(getGoApps).mockResolvedValue({ data: [{ ...memos, stars: null }], meta: { current_page: 1, last_page: 1, total: 1 } })
    await mountModal()

    expect(el('go-app-card-memos')).not.toBeNull()
    expect(el('go-app-stars-memos')).toBeNull()
  })

  it('asks to connect to PanelAlpha Hub when the panel is not paired', async () => {
    vi.mocked(getGoStatus).mockResolvedValue({ connected: false, available: false })
    const wrapper = await mountModal()

    expect(el('go-catalog-connect-hub')).not.toBeNull()
    expect(el('go-catalog-search')).toBeNull()
    expect(catalogBack()).not.toBeNull()

    el('go-catalog-connect-hub')?.querySelector('button')?.click()
    expect(wrapper.emitted('connect-hub')).toHaveLength(1)
  })

  it('says the catalog is unavailable when Go is down', async () => {
    vi.mocked(getGoStatus).mockResolvedValue({ connected: true, available: false })
    await mountModal()

    expect(el('go-catalog-unavailable')).not.toBeNull()
    expect(getGoApps).not.toHaveBeenCalled()
  })
})
