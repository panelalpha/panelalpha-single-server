import type { Device } from './account.api'
import { describe, expect, it } from 'vitest'
import { iconButtonsSnapshot } from '@/test/icon-buttons'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import DevicesTableResponsiveItem from './DevicesTableResponsiveItem.vue'

const headers = [
  { text: 'select', value: 'select' },
  { text: 'ip', value: 'ip_address', sortable: true },
  { text: 'browser', value: 'browser', sortable: true },
  { text: 'device', value: 'device', sortable: true },
  { text: 'lastLogin', value: 'last_login', sortable: true },
  { text: 'actions', value: 'actions' },
]

function device (overrides: Partial<Device> = {}): Device {
  return {
    ip_address: '10.0.0.1',
    browser: 'Chrome',
    device: 'Linux',
    last_login: '2026-10-20 10:00',
    current_device: false,
    session_id: 'session-1',
    device_id: 'device-1',
    ...overrides,
  }
}

async function mountItem (item: Device, checked = false) {
  return mountKit(DevicesTableResponsiveItem, {
    props: { headers, item, itemDevice: 'linux', itemBrowser: 'chrome', checked },
  })
}

describe('DevicesTableResponsiveItem', () => {
  // Characterization of the card markup: the DOM of a card stays as it was written by hand.
  it('renders the card of a device with the legacy markup', async () => {
    const other = await mountItem(device())
    expect(normalizeHtml(other.html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item" data-testid="account-device-mobile-item"><div class="mobile-table-item__select"><div class="checkbox"><div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-checkbox"><div class="v-input__control"><div class="v-selection-control v-selection-control--density-default v-checkbox-btn"><div class="v-selection-control__wrapper"><div class="v-selection-control__input"><i class="mdi-checkbox-blank-outline mdi v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"></i><input id="checkbox-v-0" aria-disabled="false" type="checkbox" value="true"></div></div><label class="v-label v-label--clickable" for="checkbox-v-0"><span></span></label></div></div></div></div></div><div class="mobile-table-item__values"><div class="mobile-table-item__group"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.ip</div><div class="mobile-table-item__value"><span class="bold p-3">10.0.0.1</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.browser</div><div class="mobile-table-item__value"><span class="p-3"><div class="d-flex align-center"><i class="v-icon notranslate v-theme--light mr-2" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"></i> Chrome</div></span></div></div></div><div class="mobile-table-item__group"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.device</div><div class="mobile-table-item__value"><span class="p-3"><i class="v-icon notranslate v-theme--light mr-2" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"></i> Linux </span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.lastLogin</div><div class="mobile-table-item__value">2026-10-20 10:00</div></div></div><div class="mobile-table-item__group"><div class="mobile-table-item__actions"><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.device.forget" data-testid="account-device-forget"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.device.logout" data-testid="account-device-logout"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button></div></div></div></div></td></tr>"`)
    other.unmount()

    const current = await mountItem(device({ current_device: true, session_id: null }), true)
    expect(normalizeHtml(current.html())).toMatchInlineSnapshot(`"<tr><td class="w-100"><div class="mobile-table-item" data-testid="account-device-mobile-item"><div class="mobile-table-item__select"><div class="checkbox"><div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-checkbox active"><div class="v-input__control"><div class="v-selection-control v-selection-control--dirty v-selection-control--density-default v-checkbox-btn"><div class="v-selection-control__wrapper"><div class="v-selection-control__input"><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i><input checked="" id="checkbox-v-0" aria-disabled="false" type="checkbox" value="true"></div></div><label class="v-label v-label--clickable" for="checkbox-v-0"><span></span></label></div></div></div></div></div><div class="mobile-table-item__values"><div class="mobile-table-item__group"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.ip</div><div class="mobile-table-item__value"><span class="bold p-3">10.0.0.1</span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.browser</div><div class="mobile-table-item__value"><span class="p-3"><div class="d-flex align-center"><i class="v-icon notranslate v-theme--light mr-2" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"></i> Chrome</div></span></div></div></div><div class="mobile-table-item__group"><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.device</div><div class="mobile-table-item__value"><span class="p-3"><i class="v-icon notranslate v-theme--light mr-2" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"></i> Linux <span class="v-chip v-chip--label v-theme--light v-chip--density-default v-chip--size-small v-chip--variant-flat status-label status-label--primary ml-2" draggable="false"><span class="v-chip__underlay"></span><div class="v-chip__content" data-no-activator=""><span class="status-label__text">message.status.device.current</span></div></span></span></div></div><div class="mobile-table-item__row"><div class="mobile-table-item__header">table.header.lastLogin</div><div class="mobile-table-item__value">2026-10-20 10:00</div></div></div><div class="mobile-table-item__group"><div class="mobile-table-item__actions"><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.device.forget" data-testid="account-device-forget"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button></div></div></div></div></td></tr>"`)
    current.unmount()
  })

  // Characterization of the row actions: the markup, the tooltip text and its class stay as written by hand.
  it('renders Forget and Log out of the card with their tooltips unchanged', async () => {
    const wrapper = await mountItem(device())

    expect(await iconButtonsSnapshot(wrapper)).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.device.forget" data-testid="account-device-forget"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.device.forget</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.device.logout" data-testid="account-device-logout"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light" style="font-size: 24px; height: 24px; width: 24px;" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.device.logout</span>",
          },
        },
      ]
    `)
    wrapper.unmount()
  })

  it('emits the sort header of a label and the device actions', async () => {
    const wrapper = await mountItem(device())

    await wrapper.findAll('.mobile-table-item__header')[0]!.trigger('click')
    expect(wrapper.emitted('update:sort-by')?.[0]?.[0]).toMatchObject({ value: 'ip_address' })
    await wrapper.get('[data-testid="account-device-forget"]').trigger('click')
    expect(wrapper.emitted('forget-device')).toHaveLength(1)
    wrapper.unmount()
  })
})
