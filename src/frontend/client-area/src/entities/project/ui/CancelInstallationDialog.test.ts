import type { RawInstance } from '@/entities/project/instance-resource'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { toInstanceResource } from '@/entities/project/instance-resource'
import { mountKit } from '@/test/mount-kit'
import CancelInstallationDialog from './CancelInstallationDialog.vue'

function raw (overrides: Partial<RawInstance> = {}): RawInstance {
  return {
    id: 7,
    type: 'wordpress',
    name: 'Acme',
    url: 'https://acme.example.com',
    domain: 'acme.example.com',
    service_status: 'active',
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    async_status: { installation: 'failed' },
    import_details: null,
    labels: [],
    privileges: [],
    shared_access: [],
    staging_apps: [],
    details: {},
    server_settings: {},
    ...overrides,
  }
}

const bodyQuery = (selector: string) => document.body.querySelector<HTMLElement>(selector)

async function mountDialog (props: { instance?: RawInstance, loading?: boolean, modelValue?: boolean } = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const wrapper = await mountKit(CancelInstallationDialog, {
    props: { instance: toInstanceResource(props.instance ?? raw()), loading: props.loading ?? false, modelValue: props.modelValue ?? true },
    attachTo: host,
  })
  await flushPromises()
  return wrapper
}

describe('CancelInstallationDialog', () => {
  beforeEach(() => {
    for (const node of document.body.querySelectorAll('.v-overlay-container')) {
      node.remove()
    }
  })

  it('asks for the installation: its title, text, checkbox and buttons', async () => {
    const wrapper = await mountDialog()
    const card = bodyQuery('[data-testid="cancel-install-dialog"]')!

    expect(card.textContent).toContain('heading.instance.modal.cancelInstanceInstallation.title')
    expect(card.textContent).toContain('heading.instance.modal.cancelInstanceInstallation.desc')
    expect(card.textContent).toContain('heading.instance.modal.cancelInstanceInstallation.checkbox')
    expect(bodyQuery('[data-testid="cancel-install-submit"]')!.textContent).toContain('button.installation.cancel')
    expect(bodyQuery('[data-testid="cancel-install-resume"]')!.textContent).toContain('button.installation.resume')
    wrapper.unmount()
  })

  it('uses the import copy for an import', async () => {
    const wrapper = await mountDialog({ instance: raw({ import_details: { steps: {} } }) })
    const card = bodyQuery('[data-testid="cancel-install-dialog"]')!

    expect(card.textContent).toContain('heading.instance.modal.cancelInstanceImport.title')
    expect(bodyQuery('[data-testid="cancel-install-submit"]')!.textContent).toContain('button.import.cancel')
    expect(bodyQuery('[data-testid="cancel-install-resume"]')!.textContent).toContain('button.import.resume')
    wrapper.unmount()
  })

  it('keeps the red button disabled until the checkbox is checked, then emits confirm', async () => {
    const wrapper = await mountDialog()
    const submit = () => bodyQuery('[data-testid="cancel-install-submit"]') as HTMLButtonElement
    expect(submit().disabled).toBe(true)

    bodyQuery('[data-testid="cancel-install-confirm"] input')!.click()
    await flushPromises()
    expect(submit().disabled).toBe(false)

    submit().click()
    await flushPromises()
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    wrapper.unmount()
  })

  it('closes from the resume button and starts unchecked on the next open', async () => {
    const wrapper = await mountDialog()
    bodyQuery('[data-testid="cancel-install-confirm"] input')!.click()
    await flushPromises()

    bodyQuery('[data-testid="cancel-install-resume"]')!.click()
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    expect(wrapper.emitted('close')).toHaveLength(1)

    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    expect((bodyQuery('[data-testid="cancel-install-submit"]') as HTMLButtonElement).disabled).toBe(true)
    wrapper.unmount()
  })

  it('locks both buttons and the X while the request runs, and ignores a close', async () => {
    const wrapper = await mountDialog({ loading: true })

    expect((bodyQuery('[data-testid="cancel-install-submit"]') as HTMLButtonElement).disabled).toBe(true)
    expect((bodyQuery('[data-testid="cancel-install-resume"]') as HTMLButtonElement).disabled).toBe(true)
    expect((bodyQuery('[data-testid="cancel-install-close"]') as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })
})
