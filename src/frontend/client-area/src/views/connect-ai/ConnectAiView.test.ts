// Frame of the Connect AI screen: written on the hand-made frame, kept green on `PageFrame`.
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listTokens } from '@/entities/mcp/mcp.api'
import { mountKit } from '@/test/mount-kit'
import ConnectAiView from './ConnectAiView.vue'

vi.mock('@/entities/mcp/mcp.api', () => ({
  listTokens: vi.fn(),
  createToken: vi.fn(),
  revokeToken: vi.fn(),
  deleteToken: vi.fn(),
  listActivityLogs: vi.fn(),
}))

const width = window.innerWidth

async function mountView () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(ConnectAiView, { global: { plugins: [pinia] } })
  await flushPromises()
  return wrapper
}

describe('ConnectAiView frame', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listTokens).mockResolvedValue([])
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    // The sidebar list (and the 48px content padding) start at 1200px.
    window.innerWidth = 1500
  })

  afterEach(() => {
    window.innerWidth = width
  })

  it('renders the title, the divider, the sidebar list and the Claude Code panel in the content column', async () => {
    const wrapper = await mountView()

    expect(wrapper.get('[data-testid="connect-ai-title"]').text()).toBe('heading.connectAi.title')
    expect(wrapper.find('.v-divider').exists()).toBe(true)
    expect(wrapper.find('[data-testid="connect-ai-sidebar"]').exists()).toBe(true)
    expect(wrapper.get('.v-col--cols-lg-10').classes()).toContain('pl-12')
    expect(wrapper.get('.v-col--cols-lg-10').find('[data-testid="connect-ai-panel-title"]').exists()).toBe(true)
    expect(listTokens).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('switches the content column to the tokens view from the sidebar', async () => {
    const wrapper = await mountView()

    await wrapper.get('[data-testid="connect-ai-sidebar-tokens"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="connect-ai-panel-title"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="connect-ai-server-url-title"]').text()).toBe('heading.connectAi.serverUrl')
    expect(wrapper.get('[data-testid="connect-ai-tokens-title"]').text()).toBe('heading.connectAi.tokens')
    wrapper.unmount()
  })
})
