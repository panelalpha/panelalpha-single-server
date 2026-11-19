import type { VueWrapper } from '@vue/test-utils'
import type * as Vuetify from 'vuetify'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import QuickActionsButton from './QuickActionsButton.vue'

// The viewport is the only thing the button reads from the display: each test sets the small-screen flag before mounting.
const mockDisplay = { smAndDown: false }

vi.mock('vuetify', async importOriginal => {
  const actual = await importOriginal<typeof Vuetify>()
  return {
    ...actual,
    useDisplay: () => ({ ...actual.useDisplay(), smAndDown: mockDisplay.smAndDown }),
  }
})

const actions = [
  { id: 'disconnect', title: 'button.disconnect.all', icon: '$logout', iconSize: '20' },
  { id: 'access', title: 'button.manageSshAccess', icon: '$settings', iconSize: '20' },
]

let wrapper: VueWrapper | undefined

async function mountButton (props: { smallScreen: boolean, mobileIcon?: string }) {
  mockDisplay.smAndDown = props.smallScreen
  wrapper = await mountKit(QuickActionsButton, {
    props: { actions, label: 'button.actions', icon: false, mobileIcon: props.mobileIcon ?? 'settings', testId: 'sftp-actions' },
    attachTo: document.body,
  })
  return wrapper
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('QuickActionsButton', () => {
  it('shows the label on desktop', async () => {
    const button = await mountButton({ smallScreen: false })

    expect(button.get('[data-testid="sftp-actions-button"]').text()).toBe('button.actions')
  })

  it('shows only the mobile icon on small screens, without the label', async () => {
    const button = await mountButton({ smallScreen: true })

    expect(button.get('[data-testid="sftp-actions-button"]').text()).toBe('')
    expect(button.get('[data-testid="sftp-actions-button"] .v-icon').classes()).toContain('me-0')
  })

  it('emits select with the id of the item that was clicked', async () => {
    const button = await mountButton({ smallScreen: false })

    await button.get('[data-testid="sftp-actions-button"]').trigger('click')
    await flushPromises()

    const items = document.querySelectorAll<HTMLElement>('[data-testid="sftp-actions-item"]')
    expect(items).toHaveLength(2)

    items[1]!.click()
    await flushPromises()

    expect(button.emitted('select')).toEqual([['access']])
  })
  it('names the Actions button with the button.actions key, also on small screens without the label', async () => {
    // Legacy has no aria-label; the icon-only mobile button needs a name.
    const desktop = await mountButton({ smallScreen: false })
    expect(desktop.get('[data-testid="sftp-actions-button"]').attributes('aria-label')).toBe('button.actions')
    desktop.unmount()
    wrapper = undefined

    const mobile = await mountButton({ smallScreen: true })
    expect(mobile.get('[data-testid="sftp-actions-button"]').attributes('aria-label')).toBe('button.actions')
  })

  it('passes loading and disabled to the button', async () => {
    mockDisplay.smAndDown = false
    wrapper = await mountKit(QuickActionsButton, {
      props: { actions, label: 'button.actions', loading: true, disabled: true, testId: 'sftp-actions' },
      attachTo: document.body,
    })

    const button = wrapper.get('[data-testid="sftp-actions-button"]')
    expect(button.find('.v-progress-circular').exists()).toBe(true)
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('adds the hover class of the item colour to the item and its icon', async () => {
    mockDisplay.smAndDown = false
    const coloured = [
      { id: 'delete', title: 'button.delete', icon: '$trash', iconSize: '20', color: 'error' },
      { id: 'share', title: 'button.share', icon: '$share', iconSize: '20', color: 'sand' },
    ]
    wrapper = await mountKit(QuickActionsButton, {
      props: { actions: coloured, label: 'button.actions', testId: 'sftp-actions' },
      attachTo: document.body,
    })

    await wrapper.get('[data-testid="sftp-actions-button"]').trigger('click')
    await flushPromises()

    const items = document.querySelectorAll<HTMLElement>('[data-testid="sftp-actions-item"]')
    expect(items[0]!.classList).toContain('error-on-hover')
    expect(items[0]!.querySelector('.quick-actions-item-icon')!.classList).toContain('error-on-hover')
    expect(items[1]!.classList).toContain('sand-on-hover')
  })

  it('renders the green page-title button with the legacy classes, flat (elevation 0) and large on desktop', async () => {
    const button = await mountButton({ smallScreen: false })
    const el = button.get('[data-testid="sftp-actions-button"]')

    expect(el.element.tagName).toBe('BUTTON')
    for (const cls of ['p-2', 'add-new-button', 'page-title__add-button', 'bg-primary', 'v-btn--size-large']) {
      expect(el.classes()).toContain(cls)
    }
    expect(el.classes()).toContain('v-btn--variant-elevated')
    expect(el.classes()).toContain('elevation-0')
  })

  it('drops the large size on small screens', async () => {
    const button = await mountButton({ smallScreen: true })
    const el = button.get('[data-testid="sftp-actions-button"]')

    expect(el.classes()).not.toContain('v-btn--size-large')
    expect(el.classes()).toContain('v-btn--size-default')
    expect(el.classes()).toContain('page-title__add-button')
  })

  it('puts aria-expanded and aria-haspopup of the menu on the button', async () => {
    const button = await mountButton({ smallScreen: false })
    const el = button.get('[data-testid="sftp-actions-button"]')

    expect(el.attributes('aria-haspopup')).toBe('menu')
    expect(el.attributes('aria-expanded')).toBe('false')

    await el.trigger('click')
    await flushPromises()

    expect(el.attributes('aria-expanded')).toBe('true')
  })

  it('uses the quick-actions prefix for the test ids when testId is not given', async () => {
    mockDisplay.smAndDown = false
    wrapper = await mountKit(QuickActionsButton, {
      props: { actions, label: 'button.actions' },
      attachTo: document.body,
    })

    expect(wrapper.find('[data-testid="quick-actions-button"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sftp-actions-button"]').exists()).toBe(false)
  })
})
