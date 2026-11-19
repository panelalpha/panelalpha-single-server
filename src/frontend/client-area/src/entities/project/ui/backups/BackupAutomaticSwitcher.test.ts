import type { AutomaticBackupSettings } from '@/entities/project/instance-backups.api'
import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises, RouterLinkStub } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import { displayTime } from './automatic-backup'
import AutomaticBackupsModal from './AutomaticBackupsModal.vue'
import BackupAutomaticSwitcher from './BackupAutomaticSwitcher.vue'
import TimePicker from './TimePicker.vue'

vi.mock('@/entities/project/instance-backups.api', () => ({
  saveAutomaticBackupSettings: vi.fn(),
}))

function makeInstance (usesOwn = false): InstanceResource {
  return {
    id: 9,
    server_settings: { uses_own_backup_system: usesOwn },
    automatic_backups_editable: true,
    hasManageAutoBackupPrivilege: () => true,
  } as unknown as InstanceResource
}

async function mountSwitcher (settings: AutomaticBackupSettings, { free = false, usesOwn = false, storeHint = true } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mountKit(BackupAutomaticSwitcher, {
    props: { instance: makeInstance(usesOwn), settings, editable: true, freePanel: free, storeHint },
    global: { plugins: [pinia], stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('BackupAutomaticSwitcher store_configured', () => {
  it('says Unavailable (warning), not Disabled, when no store is set and backups are off', async () => {
    const wrapper = await mountSwitcher({ frequency: 'never', store_configured: false })
    const status = wrapper.find('[data-testid="backup-store-unavailable"]')
    expect(status.classes()).toContain('text-warning')
    expect(status.text()).toBe('Unavailable')
    expect(wrapper.text()).not.toContain('message.status.disabled')
  })

  it('puts the reason on its own line with a link to the Backups settings tab and no switch on a Free panel', async () => {
    const wrapper = await mountSwitcher({ frequency: 'never', store_configured: false }, { free: true })
    const hint = wrapper.find('p.configure-store')
    expect(hint.classes()).toContain('gray-text')
    expect(hint.text()).toContain('No backup store is set up.')
    const link = hint.findComponent(RouterLinkStub)
    expect(link.props('to')).toEqual({ path: '/settings', query: { tab: 'backups' } })
    expect(link.text()).toBe('Set up store')
    expect(wrapper.find('.v-switch').exists()).toBe(false)
  })

  it('gives the reason without a link when the panel is not Free', async () => {
    const wrapper = await mountSwitcher({ frequency: 'never', store_configured: false })
    expect(wrapper.findComponent(RouterLinkStub).exists()).toBe(false)
    expect(wrapper.find('p.configure-store').text()).toBe('No backup store is set up.')
    expect(wrapper.find('.v-switch').exists()).toBe(false)
  })

  it('leaves the reason out with storeHint off (the Backups page notice says it)', async () => {
    const wrapper = await mountSwitcher({ frequency: 'never', store_configured: false }, { free: true, storeHint: false })
    expect(wrapper.find('[data-testid="backup-store-unavailable"]').exists()).toBe(true)
    expect(wrapper.find('.configure-store').exists()).toBe(false)
  })

  it('keeps the switch when backups are enabled even without a store', async () => {
    const wrapper = await mountSwitcher({ frequency: 'daily', store_configured: false }, { free: true })
    expect(wrapper.find('.v-switch').exists()).toBe(true)
    expect(wrapper.find('.configure-store').exists()).toBe(false)
  })

  it('changes nothing when store_configured is undefined', async () => {
    const wrapper = await mountSwitcher({ frequency: 'never' }, { free: true })
    expect(wrapper.find('.v-switch').exists()).toBe(true)
    expect(wrapper.find('.configure-store').exists()).toBe(false)
  })

  it('marks the automatic backups modal with the 560px width class and no inline style', async () => {
    const wrapper = await mountSwitcher({ frequency: 'never', store_configured: true })

    wrapper.findAllComponents({ name: 'VDialog' }).at(-1)!.vm.$emit('update:modelValue', true)
    await flushPromises()

    const modal = wrapper.findComponent(AutomaticBackupsModal)
    expect(modal.classes()).toContain('automatic-backups-modal')
    expect(modal.attributes('style')).toBeUndefined()
  })

  it('shows no link when the instance uses its own backup system', async () => {
    const wrapper = await mountSwitcher({ frequency: 'never', store_configured: false }, { free: true, usesOwn: true })
    expect(wrapper.find('.configure-store').exists()).toBe(false)
  })

  it('offers the project\'s own minute in the automatic backups dialog', async () => {
    const settings = { frequency: 'daily', cron_hour: 3, cron_minute: 42, store_configured: true }
    const wrapper = await mountSwitcher(settings)

    wrapper.findAllComponents({ name: 'VDialog' }).at(-1)!.vm.$emit('update:modelValue', true)
    await flushPromises()

    expect(wrapper.findComponent(TimePicker).props('keep')).toBe(displayTime(settings, (key: string) => key))
  })
})

// The schedule text wraps like in legacy (no `text-no-wrap`), and the root keeps the `backup-switcher` class whose `min-width` stops
// the box from going under its title plus the switch (the switch overlapped the search field on 768 and 375 px).
describe('BackupAutomaticSwitcher layout', () => {
  it('lets the schedule text wrap and marks the root for the min-width rule', async () => {
    const wrapper = await mountSwitcher({ frequency: 'daily', store_configured: true })
    const root = wrapper.find('[data-testid="automatic-backup-switcher"]')
    expect(root.classes()).toContain('backup-switcher')
    expect(root.find('p.line-16').classes()).not.toContain('text-no-wrap')
    expect(root.find('.flex-column').classes()).not.toContain('text-no-wrap')
    wrapper.unmount()
  })
})

// Characterization of the DOM: written on the code with a raw `v-switch`, kept unchanged after it moved to `AppSwitch`.
describe('BackupAutomaticSwitcher switch DOM', () => {
  const dom = (html: string) => normalizeHtml(html).replace(/ id="switch-v-\d+"/g, '')

  it('keeps the switch container with backups on', async () => {
    const wrapper = await mountSwitcher({ frequency: 'daily', store_configured: true })
    expect(dom(wrapper.find('.switch-container').html())).toMatchInlineSnapshot(`"<div class="switch-container pl-1 d-flex justify-center ml-2 flex-shrink-0" aria-haspopup="menu" aria-expanded="false" aria-owns="v-menu-v-0"><div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-switch v-switch--flat v-switch--size-default mt-0 pt-0"><div class="v-input__control"><div class="v-selection-control v-selection-control--dirty v-selection-control--density-default"><div class="v-selection-control__wrapper text-primary"><div class="v-switch__track bg-primary"></div><div class="v-selection-control__input"><input checked="" aria-disabled="false" type="checkbox" value="true"><div class="v-switch__thumb" style="background-color: var(--v-white-base);"><transition-stub name="scale-transition" appear="false" persisted="false" css="true"></transition-stub></div></div></div></div></div></div></div>"`)
    wrapper.unmount()
  })

  it('keeps the switch container with backups off', async () => {
    const wrapper = await mountSwitcher({ frequency: 'never', store_configured: true })
    expect(dom(wrapper.find('.switch-container').html())).toMatchInlineSnapshot(`"<div class="switch-container pl-1 d-flex justify-center ml-2 flex-shrink-0" aria-haspopup="menu" aria-expanded="false" aria-owns="v-menu-v-0"><div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-switch v-switch--flat v-switch--size-default mt-0 pt-0"><div class="v-input__control"><div class="v-selection-control v-selection-control--density-default"><div class="v-selection-control__wrapper"><div class="v-switch__track"></div><div class="v-selection-control__input"><input aria-disabled="false" type="checkbox" value="true"><div class="v-switch__thumb"><transition-stub name="scale-transition" appear="false" persisted="false" css="true"></transition-stub></div></div></div></div></div></div></div>"`)
    wrapper.unmount()
  })
})
