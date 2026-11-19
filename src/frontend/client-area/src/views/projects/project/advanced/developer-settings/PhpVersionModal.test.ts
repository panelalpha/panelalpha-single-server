import type { PhpVersion } from './developer-settings.api'
import type { InstanceResource } from '@/entities/project/instance-resource'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VBtn } from 'vuetify/components'
import { mountKit } from '@/test/mount-kit'
import { updatePhpVersion } from './developer-settings.api'
import PhpVersionModal from './PhpVersionModal.vue'

vi.mock('./developer-settings.api', () => ({
  updatePhpVersion: vi.fn(),
  clearPhpVersionCache: vi.fn(),
}))

const PHP_8_2: PhpVersion = { label: 'PHP 8.2', value: '8.2' }
const PHP_8_3: PhpVersion = { label: 'PHP 8.3', value: '8.3' }

function instance (): InstanceResource {
  return { hostingId: 11, domain: 'a.test' } as unknown as InstanceResource
}

// The select takes the current version when the modal opens (`watch(open)`), so the modal is mounted closed and then opened.
async function mountModal (currentVersion: PhpVersion | null = PHP_8_2): Promise<VueWrapper> {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(PhpVersionModal, {
    props: { open: false, instance: instance(), currentVersion, versions: [PHP_8_2, PHP_8_3] },
    global: { plugins: [pinia] },
  })
  await wrapper.setProps({ open: true })
  await flushPromises()
  return wrapper
}

/** The open card, read from the document (the dialog is teleported to the body). */
function card (): HTMLElement {
  const element = document.body.querySelector<HTMLElement>('.v-overlay--active [data-testid="php-version-modal"]')
  expect(element).not.toBeNull()
  return element!
}

function buttonByText (wrapper: VueWrapper, text: string) {
  const button = wrapper.findAllComponents(VBtn).find(item => item.text() === text)
  if (!button) {
    throw new Error(`no button ${text}`)
  }
  return button
}

// The card of the PHP version modal (title, X, Save, Cancel) before and after it moves onto `BasicModal`.
describe('PhpVersionModal dialog card (kit-dialog-advanced)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(updatePhpVersion).mockResolvedValue(undefined)
  })

  it('shows the title and the domain, and closes from the X in the title', async () => {
    const wrapper = await mountModal()

    expect(card().textContent).toContain('heading.instance.advanced.modal.phpVersion.title')
    expect(card().textContent).toContain('a.test')

    card().querySelector<HTMLElement>('.v-card-title button')!.click()
    await flushPromises()

    expect(wrapper.emitted('update:open')).toContainEqual([false])
    expect(updatePhpVersion).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps Save disabled without a version', async () => {
    const wrapper = await mountModal(null)

    expect(buttonByText(wrapper, 'button.saveChanges').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('closes from Cancel without a request', async () => {
    const wrapper = await mountModal()

    await buttonByText(wrapper, 'button.cancel').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('update:open')).toContainEqual([false])
    expect(updatePhpVersion).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('hides the X, disables Cancel and spins Save while the request runs', async () => {
    vi.mocked(updatePhpVersion).mockReturnValue(new Promise(() => {}))
    const wrapper = await mountModal()

    await buttonByText(wrapper, 'button.saveChanges').trigger('click')
    await flushPromises()

    expect(updatePhpVersion).toHaveBeenCalledTimes(1)
    expect(card().querySelector('.v-card-title button')).toBeNull()
    expect(buttonByText(wrapper, 'button.cancel').attributes('disabled')).toBeDefined()
    expect(buttonByText(wrapper, 'button.saveChanges').classes()).toContain('v-btn--loading')
    wrapper.unmount()
  })
})
