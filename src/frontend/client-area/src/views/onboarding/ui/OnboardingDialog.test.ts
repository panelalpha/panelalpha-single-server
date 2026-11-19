import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import { VDialog } from 'vuetify/components'
import OnboardingDialog from '@/views/onboarding/ui/OnboardingDialog.vue'
import { mountKit } from '@/test/mount-kit'

// kit-dialog-onboarding: the step shell is the dialog the steps wrote by hand (persistent, no scrim, no back button, the fade), and it
// holds the body lock while it is open.

const html = document.documentElement
const card = () => h('div', { 'class': 'card', 'data-testid': 'inner' }, 'card')

function overlayHtml (): string {
  return (document.body.querySelector('.v-overlay-container')?.innerHTML ?? '').replaceAll(/\b(v-overlay-|v-)\d+/g, '$1N').replaceAll('<!--v-if-->', '')
}

async function rendered (component: unknown, props: Record<string, unknown>): Promise<string> {
  const host = document.createElement('div')
  document.body.append(host)
  const wrapper = await mountKit(component as never, { props, attachTo: host, slots: { default: card as never } })
  await flushPromises()
  const result = overlayHtml()
  wrapper.unmount()
  host.remove()
  return result
}

describe('OnboardingDialog', () => {
  it('renders the markup of the hand-written step dialog', async () => {
    const expected = await rendered(VDialog, { modelValue: true, persistent: true, scrim: false, closeOnBack: false, transition: 'fade-transition' })
    const actual = await rendered(OnboardingDialog, { modelValue: true })
    expect(actual).toBe(expected)
  })

  it('sets the step props: persistent, no scrim, no back button, the fade, not fullscreen', async () => {
    const wrapper = await mountKit(OnboardingDialog, { props: { modelValue: false }, slots: { default: card as never } })
    const dialog = wrapper.findComponent(VDialog)
    expect(dialog.props('persistent')).toBe(true)
    expect(dialog.props('scrim')).toBe(false)
    expect(dialog.props('closeOnBack')).toBe(false)
    expect(dialog.props('transition')).toBe('fade-transition')
    expect(dialog.props('fullscreen')).toBe(false)
    wrapper.unmount()
  })

  it('turns the fade off, keeps the back button and goes fullscreen on request', async () => {
    const wrapper = await mountKit(OnboardingDialog, {
      props: { modelValue: false, animated: false, closeOnBack: true, fullscreen: true },
      slots: { default: card as never },
    })
    const dialog = wrapper.findComponent(VDialog)
    expect(dialog.props('transition')).toBe(false)
    expect(dialog.props('closeOnBack')).toBe(true)
    expect(dialog.props('fullscreen')).toBe(true)
    wrapper.unmount()
  })

  it('passes data-testid through to the dialog', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const wrapper = await mountKit(OnboardingDialog, {
      props: { modelValue: true },
      attrs: { 'data-testid': 'step' },
      attachTo: host,
      slots: { default: card as never },
    })
    await flushPromises()
    expect(document.body.querySelector('[data-testid="step"] [data-testid="inner"]')).not.toBeNull()
    wrapper.unmount()
    host.remove()
  })

  it('holds the body lock while open, and none with bodyLock false', async () => {
    const locked = await mountKit(OnboardingDialog, { props: { modelValue: true }, slots: { default: card as never } })
    expect(html.classList.contains('scrollLock')).toBe(true)
    await locked.setProps({ modelValue: false })
    expect(html.classList.contains('scrollLock')).toBe(false)
    locked.unmount()

    const free = await mountKit(OnboardingDialog, { props: { modelValue: true, bodyLock: false }, slots: { default: card as never } })
    expect(html.classList.contains('scrollLock')).toBe(false)
    free.unmount()
  })
})
