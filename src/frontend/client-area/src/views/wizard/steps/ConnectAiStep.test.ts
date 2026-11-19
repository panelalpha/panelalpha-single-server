import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useWizardStore } from '@/views/wizard/wizard.store'
import { mcpServerUrl } from '@/entities/mcp/mcp-url'
import { listTokens, type McpToken } from '@/entities/mcp/mcp.api'
import { mountKit } from '@/test/mount-kit'
import ConnectAiStep from './ConnectAiStep.vue'

const open = vi.fn()

vi.mock('@/entities/mcp/mcp.api', () => ({ listTokens: vi.fn() }))

const listTokensMock = vi.mocked(listTokens)
const token = (revoked_at: string | null): McpToken => ({ id: 1, name: 't', revoked_at } as unknown as McpToken)

vi.mock('@/entities/mcp/ui/McpTokenCreateModal.vue', () => ({
  default: defineComponent({
    name: 'McpTokenCreateModalStub',
    emits: ['token-created'],
    setup: (_, { expose, emit }) => {
      expose({ open })
      return () => h('button', { 'data-testid': 'stub-created', 'onClick': () => emit('token-created') })
    },
  }),
}))

async function mountStep (prepare?: () => void) {
  vi.stubGlobal('scrollTo', vi.fn())
  const pinia = createPinia()
  setActivePinia(pinia)
  prepare?.()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/wizard/connect-ai', component: ConnectAiStep },
      { path: '/wizard/summary', component: { template: '<div />' } },
    ],
  })
  await router.push('/wizard/connect-ai')
  await router.isReady()
  const wrapper = await mountKit(ConnectAiStep, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('ConnectAiStep', () => {
  beforeEach(() => {
    open.mockReset()
    listTokensMock.mockReset()
    listTokensMock.mockResolvedValue([])
  })

  it('opens the token modal from "Create token"', async () => {
    const { wrapper } = await mountStep()
    await wrapper.get('[data-testid=wizard-ai-create]').trigger('click')
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('shows the MCP server address and the link to the Connect AI guide', async () => {
    const { wrapper } = await mountStep()
    expect(wrapper.get('[data-testid=wizard-ai-address]').text()).toBe(mcpServerUrl())
    const link = wrapper.get('[data-testid=wizard-ai-link]')
    expect(link.attributes('href')).toBe('https://www.panelalpha.com/documentation/single-server/connect-ai')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener')
  })

  it('"Skip for now" leads to Summary', async () => {
    const { wrapper, router } = await mountStep()
    await wrapper.get('[data-testid=wizard-ai-skip]').trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/wizard/summary'))
  })

  it('an active token shows "Continue" without "Skip for now"', async () => {
    listTokensMock.mockResolvedValue([token(null)])
    const { wrapper } = await mountStep()
    expect(wrapper.find('[data-testid=wizard-next]').exists()).toBe(true)
    expect(wrapper.find('[data-testid=wizard-ai-skip]').exists()).toBe(false)
    expect(wrapper.find('[data-testid=wizard-ai-connected]').exists()).toBe(true)
    expect(wrapper.find('[data-testid=wizard-ai-later]').exists()).toBe(false)
  })

  it('without a token, the note says AI can be connected later', async () => {
    const { wrapper } = await mountStep()
    expect(wrapper.get('[data-testid=wizard-ai-later]').text()).toBe('You can connect your AI assistant later in Connect AI.')
  })

  it('a revoked token keeps "Skip for now"', async () => {
    listTokensMock.mockResolvedValue([token('2026-01-01')])
    const { wrapper } = await mountStep()
    expect(wrapper.find('[data-testid=wizard-ai-skip]').exists()).toBe(true)
    expect(wrapper.find('[data-testid=wizard-next]').exists()).toBe(false)
  })

  it('a token revoked since step 3 clears the flag of the store and brings back "Skip for now" (impl-review F1)', async () => {
    listTokensMock.mockResolvedValue([token('2026-01-01')])
    const { wrapper } = await mountStep(() => useWizardStore().setAiConnected(true))
    expect(useWizardStore().aiConnected).toBe(false)
    expect(wrapper.find('[data-testid=wizard-ai-skip]').exists()).toBe(true)
  })

  it('a failed GET keeps what the store knows', async () => {
    listTokensMock.mockRejectedValue(new Error('boom'))
    const { wrapper } = await mountStep(() => useWizardStore().setAiConnected(true))
    expect(wrapper.find('[data-testid=wizard-next]').exists()).toBe(true)
  })

  it('a failed GET keeps "Skip for now"', async () => {
    listTokensMock.mockRejectedValue(new Error('boom'))
    const { wrapper } = await mountStep()
    expect(wrapper.find('[data-testid=wizard-ai-skip]').exists()).toBe(true)
  })

  it('token-created marks AI as connected and shows "Continue"', async () => {
    const { wrapper } = await mountStep()
    await wrapper.get('[data-testid=stub-created]').trigger('click')
    expect(useWizardStore().aiConnected).toBe(true)
    expect(wrapper.find('[data-testid=wizard-next]').exists()).toBe(true)
    expect(wrapper.find('[data-testid=wizard-ai-skip]').exists()).toBe(false)
  })

  it('"Create token" is loading while the GET runs', async () => {
    let resolve: (value: McpToken[]) => void = () => {}
    listTokensMock.mockReturnValue(new Promise<McpToken[]>(r => {
      resolve = r
    }))
    const { wrapper } = await mountStep()
    expect(wrapper.get('[data-testid=wizard-ai-create]').classes()).toContain('v-btn--loading')
    resolve([])
    await flushPromises()
    expect(wrapper.get('[data-testid=wizard-ai-create]').classes()).not.toContain('v-btn--loading')
  })
})
