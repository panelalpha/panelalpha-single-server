// kit-dialog-onboarding: the closing window of a Git or env vars step inside `OnboardingModals`, with the
// 26 step modals stubbed. It is not persistent, keeps the browser back button, is 480px wide, and Esc or a click outside closes the flow.
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { VDialog } from 'vuetify/components'
import { useOnboardingStore } from '@/views/onboarding/onboarding.store'
import OnboardingModals from '@/views/onboarding/OnboardingModals.vue'
import { mountKit } from '@/test/mount-kit'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), resolve: vi.fn() }),
  useRoute: () => ({ path: '/', query: {}, params: {} }),
}))

const STEP_MODALS = [
  'OnboardingChooseCreationTypeModal', 'OnboardingChooseDomainModal', 'OnboardingChooseImportMethodModal',
  'OnboardingChooseInstallationTypeModal', 'OnboardingChooseOnboardingProcessModal', 'OnboardingChooseServiceModal',
  'OnboardingChooseSiteNameModal', 'OnboardingChooseTemplateModal', 'OnboardingChooseUserConfigurableOptionsModal',
  'OnboardingDeployFromGitModal', 'OnboardingDeployFromZipModal', 'OnboardingDomainInstantVerificationModal',
  'OnboardingDomainTransferModal', 'OnboardingEnvVarsModal', 'OnboardingImportAdvancedMethodModal',
  'OnboardingImportInstanceSetupCompleteModal', 'OnboardingImportSimpleMethodModal', 'OnboardingImportUrlModal',
  'OnboardingInstallationInProgressModal', 'OnboardingLimitModal', 'OnboardingNoInstallationTypeModal',
  'OnboardingShareAccessModal', 'OnboardingStandardFormModal', 'OnboardingSuperQuickInstallationProgressModal',
  'OnboardingSyncInstancesProgressModal', 'OnboardingZeroDataModal',
]

async function mountModals () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const host = document.createElement('div')
  document.body.append(host)
  const wrapper = await mountKit(OnboardingModals, {
    props: { readyToRender: true },
    attachTo: host,
    global: { plugins: [pinia], stubs: Object.fromEntries(STEP_MODALS.map(name => [name, true])) },
  })
  await flushPromises()
  return wrapper
}

describe('OnboardingModals ssh closing window (kit-dialog-onboarding)', () => {
  it('opens over the scrim, closable, 480px, without the back button, and Esc or a click outside closes the flow', async () => {
    const wrapper = await mountModals()
    const onboarding = useOnboardingStore()
    onboarding.sshClosingOpen = true
    await flushPromises()

    const dialog = wrapper.findComponent(VDialog)
    expect(dialog.props('modelValue')).toBe(true)
    expect(dialog.props('persistent')).toBe(false)
    expect(dialog.props('closeOnBack')).toBe(false)
    expect(String(dialog.props('maxWidth'))).toBe('480')
    expect(document.body.querySelector('[data-testid="onboarding-ssh-closing-modal"] .ssh-closing-card')).not.toBeNull()

    dialog.vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(onboarding.sshClosingOpen).toBe(false)
    wrapper.unmount()
  })
})

describe('OnboardingModals deploy progress source', () => {
  it('names the live deploy steps after the flow source: a files deploy has no repository to clone', async () => {
    const Progress = { name: 'OnboardingInstallationInProgressModal', props: ['source', 'customDeploy'], template: '<div />' }
    const pinia = createPinia()
    setActivePinia(pinia)
    const stubs = Object.fromEntries(STEP_MODALS.map(name => [name, true]))
    const wrapper = await mountKit(OnboardingModals, {
      props: { readyToRender: true },
      global: { plugins: [pinia], stubs: { ...stubs, OnboardingInstallationInProgressModal: Progress } },
    })
    const onboarding = useOnboardingStore()
    onboarding.step = 'install-progress'

    onboarding.selectedInstallationType = 'files'
    await flushPromises()
    expect(wrapper.findComponent(Progress).props('source')).toBe('files')

    onboarding.selectedInstallationType = 'git'
    await flushPromises()
    expect(wrapper.findComponent(Progress).props('source')).toBe('git')

    onboarding.selectedInstallationType = 'wordpress'
    await flushPromises()
    expect(wrapper.findComponent(Progress).props('source')).toBeNull()
    wrapper.unmount()
  })
})
