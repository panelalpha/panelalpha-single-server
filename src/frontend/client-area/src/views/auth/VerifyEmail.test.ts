import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import VerifyEmail from './VerifyEmail.vue'

async function mountVerify (app: Record<string, unknown> = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().home = { app } as never
  const wrapper = await mountKit(VerifyEmail, {
    props: { email: 'jane@example.com', registering: false },
    global: { plugins: [pinia] },
  })
  await flushPromises()
  return wrapper
}

describe('VerifyEmail card (kit-auth-card)', () => {
  it('has one h2 title and the e-mail in the info line', async () => {
    const wrapper = await mountVerify()

    const title = wrapper.get('[data-testid="auth-card"] [data-testid="auth-title"]')
    expect(title.element.tagName).toBe('H2')
    expect(title.text()).toBe('heading.loginPage.emailVerification.title')
    expect(wrapper.get('[data-testid="auth-card"] b').text()).toBe('jane@example.com')
    wrapper.unmount()
  })

  it('links the bottom box to the support page in a new tab', async () => {
    const wrapper = await mountVerify({ support_link: 'https://support.example.test' })

    const box = wrapper.get('[data-testid="auth-card"] [data-testid="auth-bottom-box"]')
    expect(box.text()).toContain('heading.loginPage.emailVerification.questions.title')
    const link = box.get('[data-testid="auth-bottom-link"]')
    expect(link.attributes('href')).toBe('https://support.example.test')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
    expect(link.text()).toBe('heading.loginPage.emailVerification.questions.link')
    wrapper.unmount()
  })

  it('keeps the submit disabled until the four digits are typed', async () => {
    const wrapper = await mountVerify()

    const cells = wrapper.findAll('[data-testid="auth-code-cells"] input')
    expect(cells).toHaveLength(4)
    expect(wrapper.get('[data-testid="auth-submit"]').attributes('disabled')).toBeDefined()
    for (const cell of cells) {
      await cell.setValue('1')
    }
    await flushPromises()
    expect(wrapper.get('[data-testid="auth-submit"]').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })
})
