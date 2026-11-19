import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { getWizardSettings } from '@/views/wizard/wizard.api'
import { useWizardStore } from '@/views/wizard/wizard.store'
import { getHubStatus } from '@/entities/hub/hub.api'
import { listTokens } from '@/entities/mcp/mcp.api'
import { clearAllCachedGet } from '@/shared/api/cached-get'
import { emit } from '@/shared/events/app-events'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import ConnectAiStep from './steps/ConnectAiStep.vue'
import SummaryStep from './steps/SummaryStep.vue'
import WizardHubCard from './WizardHubCard.vue'

// Characterisation of the card frame of the wizard: the DOM of the Hub card, of step 3 in both states and of the
// Summary list stays the same when the frame moves from `views/wizard` to the kit. Written on the old code, kept on the new one. The
// classes of the moved components are renamed (`wizard-flag` -> `feature-flag`, `wizard-checks` -> `feature-checks`), so both are folded.
vi.mock('@/entities/hub/hub.api', () => ({ getHubStatus: vi.fn() }))
vi.mock('@/entities/mcp/mcp.api', () => ({ listTokens: vi.fn() }))
vi.mock('@/views/wizard/wizard.api', () => ({ getWizardSettings: vi.fn() }))
vi.mock('@/shared/api/cached-get', () => ({ clearAllCachedGet: vi.fn() }))
vi.mock('@/shared/events/app-events', () => ({ emit: vi.fn() }))
vi.mock('@/shared/session/session.store', () => ({ useSessionStore: vi.fn() }))
vi.mock('lottie-web', () => ({ default: { loadAnimation: vi.fn(() => ({ destroy: vi.fn() })) } }))
vi.mock('@/entities/mcp/ui/McpTokenCreateModal.vue', () => ({
  default: defineComponent({ name: 'McpTokenCreateModalStub', setup: (_, { expose }) => {
    expose({ open: vi.fn() })
    return () => h('i')
  } }),
}))

const session = {
  ensureHome: vi.fn(),
  refreshServices: vi.fn(),
  home: { app: { single_server: { active: true }, name: 'Home name', community_panel: true } } as Record<string, unknown> | null,
  user: { email: 'jane@example.com' } as { email: string } | null,
}

function fold (html: string): string {
  return normalizeHtml(html)
    .replaceAll('wizard-flag', 'feature-flag')
    .replaceAll('wizard-checks', 'feature-checks')
    .replace(/src="[^"]*hub-diagram[^"]*"/, 'src="hub-diagram"')
    // Whitespace around the text of a check is not rendered: the `li` is a flex container.
    .replace(/<\/svg>\s+/g, '</svg> ')
    .replace(/(\S)\s+<\/li>/g, '$1</li>')
}

async function mountWith (component: object, path: string, prepare?: () => void) {
  vi.stubGlobal('scrollTo', vi.fn())
  const pinia = createPinia()
  setActivePinia(pinia)
  prepare?.()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path, component },
      { path: '/settings', component: { template: '<div />' } },
      { path: '/wizard/summary', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = await mountKit(component as never, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.mocked(getHubStatus).mockReset().mockResolvedValue({ paired: false, account_name: null })
  vi.mocked(listTokens).mockReset().mockResolvedValue([])
  vi.mocked(clearAllCachedGet).mockReset()
  vi.mocked(emit).mockReset()
  session.refreshServices.mockReset().mockResolvedValue(undefined)
  session.ensureHome.mockReset().mockResolvedValue({})
  vi.mocked(getWizardSettings).mockReset().mockResolvedValue({ name: 'Saved name', default_language: 'en', default_date_format: 'DD/MM/YYYY' })
  vi.mocked(useSessionStore).mockReturnValue(session as unknown as ReturnType<typeof useSessionStore>)
})

describe('wizard card frame DOM', () => {
  it('step 1: the Hub card', async () => {
    const wrapper = await mountWith(WizardHubCard, '/x')
    expect(fold(wrapper.get('[data-testid="wizard-hub-card"]').html())).toMatchSnapshot()
  })

  it('step 3: the card without a token', async () => {
    const wrapper = await mountWith(ConnectAiStep, '/wizard/connect-ai')
    expect(fold(wrapper.get('[data-testid="wizard-ai-status"]').html())).toMatchSnapshot()
  })

  it('step 3: the connected card', async () => {
    vi.mocked(listTokens).mockResolvedValue([{ id: 1, name: 't', revoked_at: null } as never])
    const wrapper = await mountWith(ConnectAiStep, '/wizard/connect-ai')
    expect(fold(wrapper.get('[data-testid="wizard-ai-status"]').html())).toMatchSnapshot()
  })

  it('Summary after the Hub: the included list', async () => {
    const wrapper = await mountWith(SummaryStep, '/wizard/summary', () => useWizardStore().setHubConnected(true))
    expect(fold(wrapper.get('[data-testid="wizard-summary-connect-head"]').element.parentElement!.outerHTML)).toMatchSnapshot()
  })
})
