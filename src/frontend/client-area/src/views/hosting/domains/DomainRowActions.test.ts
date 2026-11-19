import type { HostingDomain } from './domains.types'
import { describe, expect, it } from 'vitest'
import { makeService } from '@/views/hosting/hosting.fixtures'
import { iconButtonsSnapshot } from '@/test/icon-buttons'
import { mountKit } from '@/test/mount-kit'
import DomainRowActions from './DomainRowActions.vue'

const service = makeService({ privileges: ['hosting.manage_domains', 'hosting.manage_ssl'] })

function row (overrides: Partial<HostingDomain> = {}): HostingDomain {
  return {
    domain: 'a.test',
    type: 'addon',
    capabilities: { can_set_as_primary: true, can_manage_ssl: true, can_redirect: true },
    nsStatus: 'ok',
    sslStatusLoading: false,
    sslInstalledCert: null,
    sslDetectedCert: null,
    type_text: 'Addon',
    updated_at_text: '',
    editSslButtonLoading: false,
    serverAccountId: 11,
    ...overrides,
  }
}

function mountActions (item: HostingDomain, mobile = false) {
  return mountKit(DomainRowActions, { props: { item, service, mobile } })
}

// Characterization of the row actions: the markup, the tooltip text and its class stay as written by hand.
describe('DomainRowActions', () => {
  it('renders set-primary, SSL, Edit and Delete of an addon domain with their tooltips', async () => {
    const wrapper = await mountActions(row())

    // The SSL tooltip sits on the wrapper `span` (a disabled button gets no pointer events), so it is read from there.
    expect(await iconButtonsSnapshot(wrapper, 'span.d-inline-block')).toMatchInlineSnapshot(`
      [
        {
          "html": "<span class="d-inline-block"><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.ssl.edit" data-testid="domains-row-action-ssl-edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button></span>",
          "tooltip": {
            "className": "v-overlay__content domain-ssl-tooltip",
            "html": "<span>button.ssl.edit</span>",
          },
        },
      ]
    `)
    expect(await iconButtonsSnapshot(wrapper)).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.setAsPrimaryDomain" data-testid="domains-row-action-set-primary"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.setAsPrimaryDomain</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.domain.edit" data-testid="domains-row-action-edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.domain.edit</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.domain.delete" data-testid="domains-row-action-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.domain.delete</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.ssl.edit" data-testid="domains-row-action-ssl-edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button>",
          "tooltip": null,
        },
      ]
    `)
    wrapper.unmount()
  })

  it('renders the disabled star of the main domain without Delete', async () => {
    const wrapper = await mountActions(row({ type: 'main' }))

    expect(await iconButtonsSnapshot(wrapper)).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--disabled v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text bgcolor-transparent" disabled="" aria-label="button.setAsPrimaryDomain" data-testid="domains-row-action-set-primary"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": null,
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.domain.edit" data-testid="domains-row-action-edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.domain.edit</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.ssl.edit" data-testid="domains-row-action-ssl-edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button>",
          "tooltip": null,
        },
      ]
    `)
    wrapper.unmount()
  })

  it('renders the disabled SSL button with the pending tooltip while an order is in flight', async () => {
    const wrapper = await mountActions(row({ ssl_order_status: 'pending' }))

    expect(await iconButtonsSnapshot(wrapper, 'span.d-inline-block')).toMatchInlineSnapshot(`
      [
        {
          "html": "<span class="d-inline-block"><button type="button" class="v-btn v-btn--disabled v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" disabled="" aria-label="tooltip.hosting.dns.status.pending.alert" data-testid="domains-row-action-ssl-edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button></span>",
          "tooltip": {
            "className": "v-overlay__content domain-ssl-tooltip",
            "html": "<span>tooltip.hosting.dns.status.pending.alert</span>",
          },
        },
      ]
    `)
    wrapper.unmount()
  })

  it('renders the mobile row with the SSL button of a domain without can_manage_ssl', async () => {
    const wrapper = await mountActions(row({ capabilities: { can_redirect: true } }), true)

    expect(await iconButtonsSnapshot(wrapper)).toMatchInlineSnapshot(`
      [
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.domain.edit" data-testid="domains-row-action-edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.domain.edit</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.domain.delete" data-testid="domains-row-action-delete"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button>",
          "tooltip": {
            "className": "v-overlay__content",
            "html": "<span>button.domain.delete</span>",
          },
        },
        {
          "html": "<button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-small v-btn--variant-text" aria-label="button.ssl.edit" data-testid="domains-row-action-ssl-edit"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button>",
          "tooltip": null,
        },
      ]
    `)
    wrapper.unmount()
  })

  it('labels the set-primary and SSL icons with the text of their tooltips (AGENTS.md rule 1 exception, kit-button-icon)', async () => {
    const wrapper = await mountActions(row())

    expect(wrapper.get('[data-testid="domains-row-action-set-primary"]').attributes('aria-label')).toBe('button.setAsPrimaryDomain')
    expect(wrapper.get('[data-testid="domains-row-action-ssl-edit"]').attributes('aria-label')).toBe('button.ssl.edit')
    wrapper.unmount()

    const pending = await mountActions(row({ ssl_order_status: 'pending' }))
    expect(pending.get('[data-testid="domains-row-action-ssl-edit"]').attributes('aria-label')).toBe('tooltip.hosting.dns.status.pending.alert')
    pending.unmount()
  })

  it('emits the row actions on click', async () => {
    const item = row()
    const wrapper = await mountActions(item)

    await wrapper.get('[data-testid="domains-row-action-set-primary"]').trigger('click')
    await wrapper.get('[data-testid="domains-row-action-edit"]').trigger('click')
    await wrapper.get('[data-testid="domains-row-action-delete"]').trigger('click')
    await wrapper.get('[data-testid="domains-row-action-ssl-edit"]').trigger('click')

    expect(wrapper.emitted('set-primary')).toEqual([[item]])
    expect(wrapper.emitted('edit')).toEqual([[item]])
    expect(wrapper.emitted('delete')).toEqual([[item]])
    expect(wrapper.emitted('ssl-edit')).toEqual([[item]])
    wrapper.unmount()
  })
})
