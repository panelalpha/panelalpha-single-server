// kit-dialog-onboarding: the dialog shell of every onboarding step, read on the closed dialog (no content, no request), before and after
// the move to `OnboardingDialog`. The expected props are the ones the steps set by hand before the change.
import type { Component } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OnboardingChooseCreationTypeModal from '@/views/onboarding/modals/OnboardingChooseCreationTypeModal.vue'
import OnboardingChooseDomainModal from '@/views/onboarding/modals/OnboardingChooseDomainModal.vue'
import OnboardingChooseImportMethodModal from '@/views/onboarding/modals/OnboardingChooseImportMethodModal.vue'
import OnboardingChooseInstallationTypeModal from '@/views/onboarding/modals/OnboardingChooseInstallationTypeModal.vue'
import OnboardingChooseOnboardingProcessModal from '@/views/onboarding/modals/OnboardingChooseOnboardingProcessModal.vue'
import OnboardingChooseServiceModal from '@/views/onboarding/modals/OnboardingChooseServiceModal.vue'
import OnboardingChooseSiteNameModal from '@/views/onboarding/modals/OnboardingChooseSiteNameModal.vue'
import OnboardingChooseTemplateModal from '@/views/onboarding/modals/OnboardingChooseTemplateModal.vue'
import OnboardingChooseUserConfigurableOptionsModal from '@/views/onboarding/modals/OnboardingChooseUserConfigurableOptionsModal.vue'
import OnboardingDeployFromGitModal from '@/views/onboarding/modals/OnboardingDeployFromGitModal.vue'
import OnboardingDeployFromZipModal from '@/views/onboarding/modals/OnboardingDeployFromZipModal.vue'
import OnboardingDomainInstantVerificationModal from '@/views/onboarding/modals/OnboardingDomainInstantVerificationModal.vue'
import OnboardingDomainTransferModal from '@/views/onboarding/modals/OnboardingDomainTransferModal.vue'
import OnboardingEnvVarsModal from '@/views/onboarding/modals/OnboardingEnvVarsModal.vue'
import OnboardingImportAdvancedMethodModal from '@/views/onboarding/modals/OnboardingImportAdvancedMethodModal.vue'
import OnboardingImportInstanceSetupCompleteModal from '@/views/onboarding/modals/OnboardingImportInstanceSetupCompleteModal.vue'
import OnboardingImportSimpleMethodModal from '@/views/onboarding/modals/OnboardingImportSimpleMethodModal.vue'
import OnboardingImportUrlModal from '@/views/onboarding/modals/OnboardingImportUrlModal.vue'
import OnboardingInstallationInProgressModal from '@/views/onboarding/modals/OnboardingInstallationInProgressModal.vue'
import OnboardingLimitModal from '@/views/onboarding/modals/OnboardingLimitModal.vue'
import OnboardingNoInstallationTypeModal from '@/views/onboarding/modals/OnboardingNoInstallationTypeModal.vue'
import OnboardingShareAccessModal from '@/views/onboarding/modals/OnboardingShareAccessModal.vue'
import OnboardingStandardFormModal from '@/views/onboarding/modals/OnboardingStandardFormModal.vue'
import OnboardingSuperQuickInstallationProgressModal from '@/views/onboarding/modals/OnboardingSuperQuickInstallationProgressModal.vue'
import OnboardingSyncInstancesProgressModal from '@/views/onboarding/modals/OnboardingSyncInstancesProgressModal.vue'
import OnboardingZeroDataModal from '@/views/onboarding/modals/OnboardingZeroDataModal.vue'
import { shellProps } from '@/views/onboarding/onboarding-dialog.fixtures'
import { mountKit } from '@/test/mount-kit'

vi.mock('@/views/onboarding/onboarding.api')
vi.mock('@/entities/project/instance-deploy-logs.api')
vi.mock('@/shared/realtime/echo-client', () => ({ echoClient: { connection: null } }))

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

const STEP = { persistent: true, scrim: false, closeOnBack: false, transition: 'fade-transition', fullscreen: false }
const INSTANT = { ...STEP, transition: false }
const SCREEN = { ...STEP, fullscreen: true }
const SCREEN_BACK = { ...SCREEN, closeOnBack: true }

const CASES: Array<[string, Component, Record<string, unknown>, typeof STEP | typeof INSTANT]> = [
  ['zero data', OnboardingZeroDataModal, { modelValue: false }, STEP],
  ['no installation type', OnboardingNoInstallationTypeModal, { modelValue: false }, STEP],
  ['installation type', OnboardingChooseInstallationTypeModal, { modelValue: false, available: [], selected: null }, STEP],
  ['onboarding process', OnboardingChooseOnboardingProcessModal, { modelValue: false }, SCREEN_BACK],
  ['creation type', OnboardingChooseCreationTypeModal, { modelValue: false }, STEP],
  ['import url', OnboardingImportUrlModal, { isOpen: false }, STEP],
  ['import method', OnboardingChooseImportMethodModal, { modelValue: false }, STEP],
  ['import simple', OnboardingImportSimpleMethodModal, { isOpen: false }, STEP],
  ['import advanced', OnboardingImportAdvancedMethodModal, { isOpen: false }, STEP],
  ['deploy git', OnboardingDeployFromGitModal, { isOpen: false }, STEP],
  ['env vars', OnboardingEnvVarsModal, { isOpen: false }, { ...STEP, closeOnBack: true }],
  ['deploy zip', OnboardingDeployFromZipModal, { isOpen: false }, STEP],
  ['import setup complete', OnboardingImportInstanceSetupCompleteModal, { isOpen: false }, SCREEN_BACK],
  ['service', OnboardingChooseServiceModal, { modelValue: false, services: [], selectedService: null, actionKey: 'button.continue' }, INSTANT],
  ['limit', OnboardingLimitModal, { modelValue: false, selectedService: null }, STEP],
  ['template', OnboardingChooseTemplateModal, { modelValue: false, service: null }, SCREEN],
  ['share access', OnboardingShareAccessModal, { modelValue: false, service: null, services: [] }, INSTANT],
  ['user options', OnboardingChooseUserConfigurableOptionsModal, { modelValue: false, service: null, services: [] }, INSTANT],
  ['domain', OnboardingChooseDomainModal, { modelValue: false, service: null, services: [] }, INSTANT],
  ['domain transfer', OnboardingDomainTransferModal, { modelValue: false, service: null, services: [], domain: null }, INSTANT],
  ['dns verify', OnboardingDomainInstantVerificationModal, { modelValue: false, service: null, domain: null, newDomain: null }, INSTANT],
  ['site name', OnboardingChooseSiteNameModal, { modelValue: false, service: null, services: [], theme: null }, INSTANT],
  ['standard form', OnboardingStandardFormModal, { modelValue: false, service: null }, INSTANT],
  ['install progress', OnboardingInstallationInProgressModal, { modelValue: false, theme: null }, SCREEN_BACK],
  ['super quick progress', OnboardingSuperQuickInstallationProgressModal, { modelValue: false }, SCREEN_BACK],
  ['sync progress', OnboardingSyncInstancesProgressModal, { modelValue: false }, SCREEN_BACK],
]

describe('onboarding dialog shell (kit-dialog-onboarding)', () => {
  it('covers the 26 steps', () => {
    expect(CASES).toHaveLength(26)
  })

  it.each(CASES)('%s: persistent, no scrim, its back button, transition and fullscreen', async (_name, component, props, expected) => {
    const wrapper = await mountStep(component, props)

    expect(shellProps(wrapper)).toEqual(expected)
    wrapper.unmount()
  })
})
