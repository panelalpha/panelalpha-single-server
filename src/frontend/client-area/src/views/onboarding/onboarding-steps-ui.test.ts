// kit-dialog-onboarding: the step chrome that moves to the kit (the X, the body lock, the step footer, the option cards, the progress
// screen), checked on steps without requests, before and after the move. Copy keys are the text in tests.
import type { Component } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import OnboardingChooseCreationTypeModal from '@/views/onboarding/modals/OnboardingChooseCreationTypeModal.vue'
import OnboardingChooseImportMethodModal from '@/views/onboarding/modals/OnboardingChooseImportMethodModal.vue'
import OnboardingChooseInstallationTypeModal from '@/views/onboarding/modals/OnboardingChooseInstallationTypeModal.vue'
import OnboardingChooseOnboardingProcessModal from '@/views/onboarding/modals/OnboardingChooseOnboardingProcessModal.vue'
import OnboardingChooseServiceModal from '@/views/onboarding/modals/OnboardingChooseServiceModal.vue'
import OnboardingSyncInstancesProgressModal from '@/views/onboarding/modals/OnboardingSyncInstancesProgressModal.vue'
import OnboardingZeroDataModal from '@/views/onboarding/modals/OnboardingZeroDataModal.vue'
import { buttonWith, choiceCards, clickOn, closeButton } from '@/views/onboarding/onboarding-dialog.fixtures'
import StepIndicator from '@/shared/ui/step-indicator/StepIndicator.vue'
import { mountKit } from '@/test/mount-kit'

const html = document.documentElement

/** Mounts a step on the body (the dialog is teleported) with a fresh store. */
async function mountStep (component: Component, props: Record<string, unknown>) {
  const host = document.createElement('div')
  document.body.append(host)
  const wrapper = await mountKit(component as never, { props, attachTo: host, global: { plugins: [createPinia()] } })
  await flushPromises()
  return wrapper
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('onboarding step chrome (kit-dialog-onboarding)', () => {
  it('zero data: the X closes the step and the body lock holds only while it is open', async () => {
    const wrapper = await mountStep(OnboardingZeroDataModal, { modelValue: true })
    expect(html.classList.contains('scrollLock')).toBe(true)

    await clickOn(closeButton())
    expect(wrapper.emitted('remove-modal')).toHaveLength(1)

    await wrapper.setProps({ modelValue: false })
    expect(html.classList.contains('scrollLock')).toBe(false)
    wrapper.unmount()
  })

  it('service: the X waits while the step loads', async () => {
    const wrapper = await mountStep(OnboardingChooseServiceModal, {
      modelValue: true, loading: true, services: [], selectedService: null, actionKey: 'button.continue',
    })

    expect(closeButton()?.disabled).toBe(true)
    wrapper.unmount()
  })

  it('import method: the footer shows the step, Continue sends the picked card, Cancel and the X close the step', async () => {
    const wrapper = await mountStep(OnboardingChooseImportMethodModal, { modelValue: true, maxSteps: 4 })
    const indicator = wrapper.findComponent(StepIndicator)
    expect(indicator.props('currentStep')).toBe(3)
    expect(indicator.props('maxSteps')).toBe(4)

    await clickOn(buttonWith('button.continue'))
    expect(wrapper.emitted('import-method-selected')?.[0]).toEqual(['plugin'])

    expect(choiceCards()).toHaveLength(2)
    await clickOn(choiceCards()[1])
    await clickOn(buttonWith('button.continue'))
    expect(wrapper.emitted('import-method-selected')?.[1]).toEqual(['ftp'])

    await clickOn(buttonWith('button.cancel'))
    await clickOn(closeButton())
    expect(wrapper.emitted('remove-modal')).toHaveLength(2)
    wrapper.unmount()
  })

  it('creation type: Continue spins while loading, Cancel stays enabled, two option cards', async () => {
    const wrapper = await mountStep(OnboardingChooseCreationTypeModal, { modelValue: true, loading: true })

    expect(buttonWith('button.continue')?.classList.contains('v-btn--loading')).toBe(true)
    expect(buttonWith('button.cancel')?.disabled).toBe(false)
    expect(choiceCards()).toHaveLength(2)
    wrapper.unmount()
  })

  it('installation type: a card picks its type and Continue sends the selected one', async () => {
    const wrapper = await mountStep(OnboardingChooseInstallationTypeModal, {
      modelValue: true, available: ['wordpress', 'git'], selected: 'wordpress',
    })

    expect(choiceCards().length).toBe(2)
    await clickOn(choiceCards()[1])
    expect(wrapper.emitted('update:selected')?.[0]).toEqual(['git'])

    await wrapper.setProps({ selected: 'git' })
    await clickOn(buttonWith('button.continue'))
    expect(wrapper.emitted('next')?.[0]).toEqual(['git'])
    wrapper.unmount()
  })

  it('installation type: the cards are the radios of one named group, and a keyboard pick reaches Continue', async () => {
    const wrapper = await mountStep(OnboardingChooseInstallationTypeModal, {
      modelValue: true, available: ['wordpress', 'git', 'files'], selected: 'wordpress',
    })

    const group = document.body.querySelector<HTMLElement>('.selection-box')
    expect(group?.getAttribute('role')).toBe('radiogroup')
    expect(group?.getAttribute('aria-labelledby')).toBe('onboarding-installation-type-title')
    expect(document.querySelector('#onboarding-installation-type-title')?.textContent)
      .toContain('heading.onboarding.instanceSource.title')

    const radios = [...document.body.querySelectorAll<HTMLInputElement>('.selection-box input[type=radio]')]
    expect(radios.map(radio => radio.value)).toEqual(['wordpress', 'git', 'files'])
    expect(new Set(radios.map(radio => radio.name))).toEqual(new Set(['onboarding-installation-type']))
    expect(radios.map(radio => radio.tabIndex)).toEqual([0, 0, 0])
    expect(radios[0]?.checked).toBe(true)

    // What Space (and an arrow key on a native radio group) does: activating the radio itself.
    radios[1]?.click()
    await flushPromises()
    expect(wrapper.emitted('update:selected')?.at(-1)).toEqual(['git'])

    await wrapper.setProps({ selected: 'git' })
    expect(document.body.querySelectorAll('.checkbox-big--checked')).toHaveLength(1)
    expect(document.body.querySelector('.checkbox-big--checked')?.textContent).toContain('heading.onboarding.instanceSource.git.title')

    await clickOn(buttonWith('button.continue'))
    expect(wrapper.emitted('next')?.[0]).toEqual(['git'])
    wrapper.unmount()
  })

  it('onboarding process: the X shows only when the shell is ready, closes the screen, two option cards', async () => {
    const hidden = await mountStep(OnboardingChooseOnboardingProcessModal, { modelValue: true, readyToRender: false })
    expect(closeButton()).toBeNull()
    hidden.unmount()
    document.body.innerHTML = ''

    const wrapper = await mountStep(OnboardingChooseOnboardingProcessModal, { modelValue: true })
    expect(choiceCards()).toHaveLength(2)
    await clickOn(closeButton())
    expect(wrapper.emitted('remove-modal')).toHaveLength(1)
    wrapper.unmount()
  })

  it('sync progress: the progress screen shows the running copy', async () => {
    const wrapper = await mountStep(OnboardingSyncInstancesProgressModal, { modelValue: true })

    expect(document.body.querySelector('.installation-card')?.textContent).toContain('heading.onboarding.syncInstances.subtitle.inProgress')
    wrapper.unmount()
  })
})
