import type { PhpSettingRow, SuggestedDirective } from './developer-settings.api'
import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import i18next from 'i18next'
import { createPinia, setActivePinia } from 'pinia'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, toRaw } from 'vue'
import { VBtn, VCombobox, VIcon, VSelect, VTextField } from 'vuetify/components'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import FormHelpIcon from '@/shared/ui/form/FormHelpIcon.vue'
import { mountKit } from '@/test/mount-kit'
import { updatePhpSettings } from './developer-settings.api'
import PhpSettingsModal from './PhpSettingsModal.vue'

vi.mock('./developer-settings.api', () => ({
  updatePhpSettings: vi.fn(),
}))

const HOSTING_ID = 11
const DOMAIN = 'a.test'

const SUGGESTED: SuggestedDirective[] = [
  { directive: 'session.save_handler', type: 'select', options: ['files', 'redis'] },
  { directive: 'memory_limit' },
]

function instance (): InstanceResource {
  return { hostingId: HOSTING_ID, domain: DOMAIN } as unknown as InstanceResource
}

function row (overrides: Partial<PhpSettingRow>): PhpSettingRow {
  return { directive: 'memory_limit', value: '256M', editing: false, ...overrides }
}

interface MountOptions {
  rows: PhpSettingRow[]
  custom?: boolean
  modifiable?: boolean
  open?: boolean
}

async function mountModal ({ rows, custom = false, modifiable = true, open = true }: MountOptions): Promise<VueWrapper> {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(PhpSettingsModal, {
    props: {
      open,
      instance: instance(),
      phpSettings: rows,
      custom,
      suggestedDirectives: SUGGESTED,
      modifiableDirectivesList: modifiable,
    },
    global: { plugins: [pinia] },
  })
  await flushPromises()
  return wrapper
}

/** The modal is teleported to the body, so its table rows are read from the document. */
function tableRows (): Element[] {
  return Array.from(document.querySelectorAll('[data-testid="php-settings-modal"] tbody tr'))
}

function buttonsByIcon (wrapper: VueWrapper, icon: string) {
  return wrapper.findAllComponents(VBtn).filter(btn => btn.findAllComponents(VIcon).some(item => item.props('icon') === icon))
}

function buttonByText (wrapper: VueWrapper, text: string) {
  const button = wrapper.findAllComponents(VBtn).find(item => item.text() === text)
  if (!button) {
    throw new Error(`no button ${text}`)
  }
  return button
}

describe('PhpSettingsModal', () => {
  beforeAll(async () => {
    // The first mount initialises i18next (mount-kit does it once); the tooltip key is added after that.
    await mountKit(FormHelpIcon, { props: { text: 'warm up' } })
    i18next.addResource('en', 'translation', 'tooltip.instance.phpSetting.memory_limit', 'Memory help')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(updatePhpSettings).mockResolvedValue(undefined)
  })

  describe('non-custom directives', () => {
    it('shows no Delete and no Add directive, and Edit opens a text field', async () => {
      const wrapper = await mountModal({ rows: [row({ directive: 'memory_limit', value: '256M' })] })

      expect(buttonsByIcon(wrapper, '$thrash')).toHaveLength(0)
      expect(buttonByText(wrapper, 'button.cancel')).toBeDefined()
      expect(wrapper.findAllComponents(VBtn).some(btn => btn.text() === 'button.addDirective')).toBe(false)

      await buttonsByIcon(wrapper, '$edit2')[0]!.trigger('click')

      expect(wrapper.findComponent(VTextField).exists()).toBe(true)
      expect(wrapper.findComponent(VSelect).exists()).toBe(false)
    })

    it('shows a select for a value of type select', async () => {
      const wrapper = await mountModal({
        rows: [row({ directive: 'session.save_handler', value: 'files', type: 'select', options: ['files', 'redis'] })],
      })

      await buttonsByIcon(wrapper, '$edit2')[0]!.trigger('click')

      expect(wrapper.findComponent(VSelect).props('items')).toEqual(['files', 'redis'])
      // V4 VSelect renders its own VTextField, so the plain value field is told apart by its placeholder.
      expect(wrapper.findAllComponents(VTextField).some(field => field.props('placeholder') === 'table.header.value')).toBe(false)
    })
  })

  describe('custom directives', () => {
    it('Add directive appends an editing row and Delete removes a row', async () => {
      const wrapper = await mountModal({ rows: [row({ directive: 'memory_limit', value: '256M' })], custom: true })
      expect(tableRows()).toHaveLength(1)

      await buttonByText(wrapper, 'button.addDirective').trigger('click')
      await nextTick()

      expect(tableRows()).toHaveLength(2)
      expect(wrapper.findComponent(VCombobox).exists()).toBe(true)

      await buttonsByIcon(wrapper, '$thrash')[0]!.trigger('click')
      await nextTick()

      expect(tableRows()).toHaveLength(1)
    })

    it('blur without a name change keeps the value of a select row outside its options', async () => {
      const wrapper = await mountModal({
        rows: [row({ directive: 'session.save_handler', value: 'memcached', editing: true, type: 'select', options: ['files', 'redis'] })],
        custom: true,
      })
      const combobox = wrapper.findComponent(VCombobox)

      combobox.vm.$emit('update:focused', true)
      combobox.vm.$emit('update:focused', false)
      await nextTick()

      expect(wrapper.findComponent(VSelect).props('modelValue')).toBe('memcached')
    })

    it('picking a suggested select directive from the menu clears a value outside its options', async () => {
      const wrapper = await mountModal({
        rows: [row({ directive: 'custom.other', value: 'memcached', editing: true, type: 'text', options: [] })],
        custom: true,
      })

      wrapper.findComponent(VCombobox).vm.$emit('update:modelValue', 'session.save_handler')
      await nextTick()

      expect(wrapper.findComponent(VSelect).props('modelValue')).toBe('')
    })

    it('a directive select without modifiable list commits on every change', async () => {
      const wrapper = await mountModal({
        rows: [row({ directive: 'custom.other', value: '', editing: true })],
        custom: true,
        modifiable: false,
      })

      expect(wrapper.findComponent(VCombobox).exists()).toBe(false)
      wrapper.findAllComponents(VSelect)[0]!.vm.$emit('update:modelValue', 'memory_limit')
      await nextTick()

      expect(wrapper.findAllComponents(VSelect)[0]!.props('modelValue')).toBe('memory_limit')
    })
  })

  describe('save', () => {
    it('refuses an empty directive with a message and sends no PUT', async () => {
      const wrapper = await mountModal({ rows: [], custom: true })

      await buttonByText(wrapper, 'button.addDirective').trigger('click')
      await buttonByText(wrapper, 'button.saveChanges').trigger('click')
      await flushPromises()

      expect(updatePhpSettings).not.toHaveBeenCalled()
      expect(wrapper.emitted('saved')).toBeUndefined()
      expect(document.querySelector('[data-testid="php-settings-modal"] .v-messages__message')?.textContent)
        .toBe('form.validation.required')
    })

    it('saves a cleared value and leaves the row out of the saved state', async () => {
      let sent: unknown
      vi.mocked(updatePhpSettings).mockImplementation(async (_id, _domain, rows) => {
        sent = structuredClone(toRaw(rows))
      })
      const wrapper = await mountModal({ rows: [row({ directive: 'memory_limit', value: '256M' })] })

      await buttonsByIcon(wrapper, '$edit2')[0]!.trigger('click')
      await wrapper.findComponent(VTextField).find('input').setValue('')
      await buttonByText(wrapper, 'button.saveChanges').trigger('click')
      await flushPromises()

      expect(sent).toEqual([{ directive: 'memory_limit', value: '', editing: true }])
      // No override: the server's PHP configuration applies, so the card keeps no row.
      expect(wrapper.emitted('saved')![0]![0]).toEqual([])
      expect(wrapper.emitted('update:open')).toContainEqual([false])
    })

    it('sends the edited rows, emits them as saved and closes', async () => {
      let sent: unknown
      vi.mocked(updatePhpSettings).mockImplementation(async (_id, _domain, rows) => {
        // Snapshot at call time: the modal mutates these rows after the PUT resolves.
        sent = structuredClone(toRaw(rows))
      })
      const wrapper = await mountModal({
        rows: [
          row({ directive: 'memory_limit', value: '256M' }),
          row({ directive: 'session.save_handler', value: 'files', type: 'select', options: ['files', 'redis'] }),
        ],
      })
      const alerts = useAlertsStore()
      const addAlert = vi.spyOn(alerts, 'addAlert')

      await buttonsByIcon(wrapper, '$edit2')[0]!.trigger('click')
      await wrapper.findComponent(VTextField).find('input').setValue('512M')
      await buttonByText(wrapper, 'button.saveChanges').trigger('click')
      await flushPromises()

      expect(updatePhpSettings).toHaveBeenCalledWith(HOSTING_ID, DOMAIN, expect.any(Array))
      expect(sent).toEqual([
        { directive: 'memory_limit', value: '512M', editing: true },
        { directive: 'session.save_handler', value: 'files', editing: false, type: 'select', options: ['files', 'redis'] },
      ])

      const saved = wrapper.emitted('saved')![0]![0] as PhpSettingRow[]
      expect(saved).toEqual([
        { directive: 'memory_limit', value: '512M', editing: false },
        { directive: 'session.save_handler', value: 'files', editing: false, type: 'select', options: ['files', 'redis'] },
      ])
      expect(wrapper.emitted('update:open')).toContainEqual([false])
      expect(addAlert).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })

    it('sends a cleared value, which the panel takes as a removed setting', async () => {
      let sent: unknown
      vi.mocked(updatePhpSettings).mockImplementation(async (_id, _domain, rows) => {
        sent = structuredClone(toRaw(rows))
      })
      const wrapper = await mountModal({ rows: [row({ directive: 'max_execution_time', value: '120' })] })

      await buttonsByIcon(wrapper, '$edit2')[0]!.trigger('click')
      await wrapper.findComponent(VTextField).find('input').setValue('')
      await buttonByText(wrapper, 'button.saveChanges').trigger('click')
      await flushPromises()

      expect(updatePhpSettings).toHaveBeenCalledWith(HOSTING_ID, DOMAIN, expect.any(Array))
      expect(sent).toEqual([{ directive: 'max_execution_time', value: '', editing: true }])
      expect(wrapper.emitted('update:open')).toContainEqual([false])
    })

    it('says what an empty value does', async () => {
      await mountModal({ rows: [row({ directive: 'max_execution_time', value: '120' })] })

      expect(document.querySelector('[data-testid="php-settings-modal"]')?.textContent)
        .toContain('heading.instance.advanced.modal.phpSettings.emptyValue')
    })

    it('keeps the modal open and emits nothing when the PUT fails', async () => {
      vi.mocked(updatePhpSettings).mockRejectedValue(new Error('boom'))
      const wrapper = await mountModal({ rows: [row({ directive: 'memory_limit', value: '256M' })] })
      const addAlert = vi.spyOn(useAlertsStore(), 'addAlert')

      await buttonsByIcon(wrapper, '$edit2')[0]!.trigger('click')
      await buttonByText(wrapper, 'button.saveChanges').trigger('click')
      await flushPromises()

      expect(updatePhpSettings).toHaveBeenCalledTimes(1)
      expect(wrapper.emitted('saved')).toBeUndefined()
      expect(wrapper.emitted('update:open')).toBeUndefined()
      expect(addAlert).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
    })
  })

  describe('cancel', () => {
    it('discards the working copy: no emit, and reopening shows the original values', async () => {
      const wrapper = await mountModal({ rows: [row({ directive: 'memory_limit', value: '256M' })] })

      await buttonsByIcon(wrapper, '$edit2')[0]!.trigger('click')
      await wrapper.findComponent(VTextField).find('input').setValue('512M')
      await buttonByText(wrapper, 'button.cancel').trigger('click')
      await flushPromises()

      expect(wrapper.emitted('saved')).toBeUndefined()
      expect(wrapper.emitted('update:open')).toContainEqual([false])

      await wrapper.setProps({ open: false })
      await wrapper.setProps({ open: true })
      await flushPromises()

      const text = document.querySelector('[data-testid="php-settings-modal"]')?.textContent ?? ''
      expect(text).toContain('256M')
      expect(text).not.toContain('512M')
    })
  })

  describe('tooltip', () => {
    it('shows the help icon only for a directive whose tooltip key exists', async () => {
      const wrapper = await mountModal({
        rows: [
          row({ directive: 'memory_limit', value: '256M' }),
          row({ directive: 'no.such.directive', value: '1' }),
        ],
      })

      const icons = wrapper.findAllComponents(FormHelpIcon)
      expect(icons).toHaveLength(1)
      expect(icons[0]!.props('text')).toBe('Memory help')
    })
  })

  // The X and the buttons of the card before and after it moves onto `BasicModal`.
  describe('dialog card (kit-dialog-advanced)', () => {
    const titleButton = () => document.body.querySelector<HTMLElement>('.v-overlay--active [data-testid="php-settings-modal"] .v-card-title button')

    it('closes from the X in the title without a request', async () => {
      const wrapper = await mountModal({ rows: [row({ directive: 'memory_limit', value: '256M' })] })

      expect(document.body.querySelector('.v-overlay--active [data-testid="php-settings-modal"]')?.textContent)
        .toContain('heading.instance.advanced.modal.phpSettings.title')
      titleButton()!.click()
      await flushPromises()

      expect(wrapper.emitted('update:open')).toContainEqual([false])
      expect(updatePhpSettings).not.toHaveBeenCalled()
    })

    it('hides the X, disables Cancel and spins Save while the request runs', async () => {
      vi.mocked(updatePhpSettings).mockReturnValue(new Promise(() => {}))
      const wrapper = await mountModal({ rows: [row({ directive: 'memory_limit', value: '256M' })] })

      await buttonByText(wrapper, 'button.saveChanges').trigger('click')
      await flushPromises()

      expect(updatePhpSettings).toHaveBeenCalledTimes(1)
      expect(titleButton()).toBeNull()
      expect(buttonByText(wrapper, 'button.cancel').attributes('disabled')).toBeDefined()
      expect(buttonByText(wrapper, 'button.saveChanges').classes()).toContain('v-btn--loading')
    })
  })
})
