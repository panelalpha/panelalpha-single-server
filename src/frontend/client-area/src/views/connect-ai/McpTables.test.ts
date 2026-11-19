import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as connectAiApi from '@/entities/mcp/mcp.api'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import McpActivityLog from './McpActivityLog.vue'
import McpTokensSection from './McpTokensSection.vue'

vi.mock('@/entities/mcp/mcp.api', () => ({
  listTokens: vi.fn(),
  listActivityLogs: vi.fn(),
}))

const TOKENS = [
  { id: 1, name: 'Cursor', last_used_at: '2026-10-24T09:00:00Z', revoked_at: null, created_at: '2026-10-01T10:00:00Z' },
  { id: 2, name: 'Old', last_used_at: null, revoked_at: '2026-10-10T10:00:00Z', created_at: '2026-09-01T10:00:00Z' },
]

const LOGS = [
  { id: 1, created_at: '2026-10-24T10:00:00Z', token_name: 'Cursor', tool_name: 'list_sites', status: 'success' },
]

const width = window.innerWidth

describe('MCP tables on mobile', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 })
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-24T10:05:00Z') })
  })

  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
  })

  // Characterization of the card markup: the DOM of a row stays as it was written by hand.
  it('renders the mobile cards of an active and of a revoked token with the legacy markup', async () => {
    vi.mocked(connectAiApi.listTokens).mockResolvedValue(TOKENS)
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = await mountKit(McpTokensSection, { global: { plugins: [pinia] } })
    await flushPromises()

    const rows = wrapper.findAll('tbody tr')
    expect(normalizeHtml(rows[0]!.html())).toMatchInlineSnapshot(`"<tr class=""><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.name</div><div class="mobile-table-item__value"><div><span class="font-weight-600" data-testid="connect-ai-token-name">Cursor</span></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.token</div><div class="mobile-table-item__value"><div class="d-flex align-center"><span class="p-3 mcp-token-value">••••••••••••••••</span></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.last_used_at</div><div class="mobile-table-item__value"><div><span class="mb-0 text--gray-darken1">an hour ago</span></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.created_at</div><div class="mobile-table-item__value"><div><span class="mb-0 text--gray-darken1">23 days ago</span></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.status</div><div class="mobile-table-item__value"><div><span class="v-chip v-chip--label v-theme--light v-chip--density-default v-chip--size-small v-chip--variant-flat status-label status-label--success" draggable="false"><span class="v-chip__underlay"></span><div class="v-chip__content" data-no-activator=""><span class="status-label__text">heading.connectAi.statusActive</span></div></span></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.actions</div><div class="mobile-table-item__value"><div class="d-flex"><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.connectAi.revoke" data-testid="connect-ai-token-revoke"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.connectAi.delete" data-testid="connect-ai-token-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div></div></div></div></div></td></tr>"`)
    expect(normalizeHtml(rows[1]!.html())).toMatchInlineSnapshot(`"<tr class="revoked-token-row"><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.name</div><div class="mobile-table-item__value"><div><span class="text-gray" data-testid="connect-ai-token-name">Old</span></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.token</div><div class="mobile-table-item__value"><div class="d-flex align-center"><span class="p-3 mcp-token-value">••••••••••••••••</span></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.last_used_at</div><div class="mobile-table-item__value"><div><span class="text-disabled font-italic">general.never</span></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.created_at</div><div class="mobile-table-item__value"><div><span class="mb-0 text--gray-darken1">2 months ago</span></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.status</div><div class="mobile-table-item__value"><div><span class="v-chip v-chip--label v-theme--light v-chip--density-default v-chip--size-small v-chip--variant-flat status-label status-label--gray" draggable="false"><span class="v-chip__underlay"></span><div class="v-chip__content" data-no-activator=""><span class="status-label__text">heading.connectAi.statusRevoked</span></div></span></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.actions</div><div class="mobile-table-item__value"><div class="d-flex"><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.connectAi.delete" data-testid="connect-ai-token-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div></div></div></div></div></td></tr>"`)
    wrapper.unmount()
  })

  it('renders the mobile card of an activity log with the legacy markup', async () => {
    vi.mocked(connectAiApi.listTokens).mockResolvedValue(TOKENS)
    vi.mocked(connectAiApi.listActivityLogs).mockResolvedValue({ data: LOGS, total: 1, last_page: 1, current_page: 1, per_page: 20 })
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = await mountKit(McpActivityLog, { global: { plugins: [pinia] } })
    await flushPromises()

    expect(normalizeHtml(wrapper.get('tbody tr').html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item"><div class="mobile-table-item__values"><div class="mobile-table-item__row"><div class="mobile-table-item__header">heading.connectAi.logTime</div><div class="mobile-table-item__value"><div><span class="mb-0 text--gray-darken1">5 minutes ago</span></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">heading.connectAi.logToken</div><div class="mobile-table-item__value"><div><span>Cursor</span></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">heading.connectAi.logTool</div><div class="mobile-table-item__value"><div><span class="font-weight-600">list_sites</span></div></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">heading.connectAi.logStatus.title</div><div class="mobile-table-item__value"><div class=""><span class="v-chip v-chip--label v-theme--light v-chip--density-default v-chip--size-small v-chip--variant-flat status-label status-label--success" draggable="false"><span class="v-chip__underlay"></span><div class="v-chip__content" data-no-activator=""><span class="status-label__text">heading.connectAi.logStatus.success</span></div></span></div></div></div></div></div></td></tr>"`)
    wrapper.unmount()
  })
})
