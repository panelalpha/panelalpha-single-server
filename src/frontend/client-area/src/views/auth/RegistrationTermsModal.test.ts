import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import RegistrationTermsModal from './RegistrationTermsModal.vue'

// The terms modal before and after it moves to `AppDialog` + `BasicModal` (the terms come from `/home`).
async function mountModal () {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().hydrateHome({ app: { registration_tos: '<p>Our terms</p>' } } as never)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: defineComponent({ render: () => null }) }] })
  await router.push('/')
  await router.isReady()
  const wrapper = await mountKit(RegistrationTermsModal, { global: { plugins: [pinia, router] } })
  await wrapper.get('[data-testid="auth-terms-link"]').trigger('click')
  await flushPromises()
  return wrapper
}

function openDialog (): HTMLElement {
  return document.body.querySelector<HTMLElement>('.v-overlay--active .v-overlay__content')!
}

function isOpen (wrapper: Awaited<ReturnType<typeof mountModal>>): boolean {
  return wrapper.getComponent({ name: 'VDialog' }).props('modelValue') as boolean
}

describe('RegistrationTermsModal', () => {
  it('opens from the link with the title and the terms from /home', async () => {
    const wrapper = await mountModal()

    expect(isOpen(wrapper)).toBe(true)
    expect(openDialog().textContent).toContain('heading.registerPage.termsOfService')
    expect(openDialog().querySelector('.well')!.innerHTML).toContain('<p>Our terms</p>')
    wrapper.unmount()
  })

  it('closes from the Close button', async () => {
    const wrapper = await mountModal()

    const close = [...openDialog().querySelectorAll<HTMLElement>('.v-btn')].find(button => button.textContent?.includes('button.close'))!
    close.click()
    await flushPromises()

    expect(isOpen(wrapper)).toBe(false)
    wrapper.unmount()
  })

  it('closes from the X of the kit card (kit-dialog-account-reseller)', async () => {
    const wrapper = await mountModal()

    openDialog().querySelector<HTMLElement>('.modal-close-button')!.click()
    await flushPromises()

    expect(isOpen(wrapper)).toBe(false)
    wrapper.unmount()
  })
})
