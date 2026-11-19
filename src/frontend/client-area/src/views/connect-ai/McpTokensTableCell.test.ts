import type { McpToken } from '@/entities/mcp/mcp.api'
import { describe, expect, it } from 'vitest'
import { iconButtonsSnapshot } from '@/test/icon-buttons'
import { mountKit } from '@/test/mount-kit'
import McpTokensTableCell from './McpTokensTableCell.vue'

const header = { text: 'actions', value: 'actions' }
const active: McpToken = { id: 1, name: 'Cursor', last_used_at: null, revoked_at: null, created_at: '2026-10-01T10:00:00Z' }
const revoked: McpToken = { ...active, id: 2, revoked_at: '2026-10-05T10:00:00Z' }

function mountCell (item: McpToken, isMobile = false) {
  return mountKit(McpTokensTableCell, { props: { item, header, isMobile } })
}

// Characterization of the row actions: the markup, the tooltip text and its class stay as written by hand.
describe('McpTokensTableCell actions', () => {
  it('renders Revoke and Delete of an active token with their tooltips unchanged', async () => {
    const wrapper = await mountCell(active)

    expect(await iconButtonsSnapshot(wrapper)).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.connectAi.revoke" data-testid="connect-ai-token-revoke"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.connectAi.revoke</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.connectAi.delete" data-testid="connect-ai-token-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.connectAi.delete</span>",
          },
        },
      ]
    `)
    wrapper.unmount()
  })

  it('renders only Delete of a revoked token on a mobile layout', async () => {
    const wrapper = await mountCell(revoked, true)

    expect(await iconButtonsSnapshot(wrapper)).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.connectAi.delete" data-testid="connect-ai-token-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.connectAi.delete</span>",
          },
        },
      ]
    `)
    wrapper.unmount()
  })

  it('emits the token from Revoke and Delete', async () => {
    const wrapper = await mountCell(active)

    await wrapper.get('[data-testid="connect-ai-token-revoke"]').trigger('click')
    await wrapper.get('[data-testid="connect-ai-token-delete"]').trigger('click')

    expect(wrapper.emitted('action-button-revoke')).toEqual([[active]])
    expect(wrapper.emitted('action-button-delete')).toEqual([[active]])
    wrapper.unmount()
  })

  // An icon button has no text of its own: without the label a screen reader announces only "button", and the
  // tooltip is a description, not a name.
  it('names the Revoke and Delete buttons for a screen reader', async () => {
    const wrapper = await mountCell(active)

    expect(wrapper.get('[data-testid="connect-ai-token-revoke"]').attributes('aria-label')).toBe('button.connectAi.revoke')
    expect(wrapper.get('[data-testid="connect-ai-token-delete"]').attributes('aria-label')).toBe('button.connectAi.delete')
    wrapper.unmount()
  })

  it('names the Delete button of a revoked token on a mobile layout', async () => {
    const wrapper = await mountCell(revoked, true)

    expect(wrapper.get('[data-testid="connect-ai-token-delete"]').attributes('aria-label')).toBe('button.connectAi.delete')
    wrapper.unmount()
  })
})
