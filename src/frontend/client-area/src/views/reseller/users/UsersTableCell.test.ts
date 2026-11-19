import type { ResellerUser } from '@/views/reseller/reseller.api'
import { describe, expect, it } from 'vitest'
import { iconButtonsSnapshot } from '@/test/icon-buttons'
import { mountKit } from '@/test/mount-kit'
import UsersTableCell from './UsersTableCell.vue'

const header = { text: 'actions', value: 'actions' }
const user: ResellerUser = { id: 3, name: 'Jan Kowalski', email: 'jan@example.com', instances_count: 2 }

function mountCell (isMobile = false) {
  return mountKit(UsersTableCell, { props: { item: user, header, isMobile } })
}

// Characterization of the row actions: the markup, the tooltip text and its class stay as written by hand.
describe('UsersTableCell actions', () => {
  it('renders the Delete icon on a desktop row with its tooltip unchanged', async () => {
    const wrapper = await mountCell()

    expect(await iconButtonsSnapshot(wrapper)).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text reseller-user-delete" aria-label="button.deleteUser" data-testid="reseller-user-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.deleteUser</span>",
          },
        },
      ]
    `)
    wrapper.unmount()
  })

  it('renders the Delete icon on a mobile card unchanged', async () => {
    const wrapper = await mountCell(true)

    expect(await iconButtonsSnapshot(wrapper)).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text reseller-user-delete" aria-label="button.deleteUser" data-testid="reseller-user-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.deleteUser</span>",
          },
        },
      ]
    `)
    wrapper.unmount()
  })

  it('emits the user from Delete', async () => {
    const wrapper = await mountCell()

    await wrapper.get('[data-testid="reseller-user-delete"]').trigger('click')

    expect(wrapper.emitted('action-button-delete')).toEqual([[user]])
    wrapper.unmount()
  })
})
