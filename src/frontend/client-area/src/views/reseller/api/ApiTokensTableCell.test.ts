import type { ResellerApiToken } from '@/views/reseller/reseller.api'
import { describe, expect, it } from 'vitest'
import { iconButtonsSnapshot } from '@/test/icon-buttons'
import { mountKit } from '@/test/mount-kit'
import ApiTokensTableCell from './ApiTokensTableCell.vue'

const header = { text: 'actions', value: 'actions' }
const token: ResellerApiToken = { id: 1, name: 'CI', last_used_at: null, created_at: '2026-10-01T10:00:00Z' }

function mountCell (isMobile = false) {
  return mountKit(ApiTokensTableCell, { props: { item: token, header, isMobile } })
}

// Characterization of the row actions: the markup, the tooltip text and its class stay as written by hand.
describe('ApiTokensTableCell actions', () => {
  it('renders the Delete icon on a desktop row with its tooltip unchanged', async () => {
    const wrapper = await mountCell()

    expect(await iconButtonsSnapshot(wrapper)).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text reseller-api-token-delete" aria-label="reseller.apiTokens.delete" data-testid="reseller-api-token-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>reseller.apiTokens.delete</span>",
          },
        },
      ]
    `)
    wrapper.unmount()
  })

  it('renders the Delete icon on a mobile card unchanged', async () => {
    const wrapper = await mountCell(true)

    expect(wrapper.classes()).not.toContain('actions-row')
    expect(await iconButtonsSnapshot(wrapper)).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text reseller-api-token-delete" aria-label="reseller.apiTokens.delete" data-testid="reseller-api-token-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>reseller.apiTokens.delete</span>",
          },
        },
      ]
    `)
    wrapper.unmount()
  })

  it('emits the token from Delete', async () => {
    const wrapper = await mountCell()

    await wrapper.get('[data-testid="reseller-api-token-delete"]').trigger('click')

    expect(wrapper.emitted('action-button-delete')).toEqual([[token]])
    wrapper.unmount()
  })
})
