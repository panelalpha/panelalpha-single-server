import { describe, expect, it } from 'vitest'
import Checkbox from '@/shared/ui/form/Checkbox.vue'
import { mountKit } from '@/test/mount-kit'
import DeploySteps from './DeploySteps.vue'

const STEPS = {
  dependencies: { commands: ['composer install --no-dev'], skippable: true },
  build: { commands: [], skippable: true },
  migrations: { commands: ['php artisan migrate --force'], skippable: false },
}

describe('DeploySteps', () => {
  it('shows only categories with commands and a checkbox only for skippable ones (legacy DeploySteps.vue:1-34)', async () => {
    const wrapper = await mountKit(DeploySteps, { props: { steps: STEPS, modelValue: [] } })
    expect(wrapper.find('.deploy-steps').exists()).toBe(true)
    expect(wrapper.find('[data-step="build"]').exists()).toBe(false)
    expect(wrapper.find('[data-step="dependencies"]').findComponent(Checkbox).exists()).toBe(true)
    expect(wrapper.find('[data-step="migrations"]').findComponent(Checkbox).exists()).toBe(false)
    expect(wrapper.text()).toContain('composer install --no-dev')
    expect(wrapper.text()).toContain('php artisan migrate --force')
    wrapper.unmount()
  })

  it('is hidden when there are no visible steps (legacy v-if)', async () => {
    const wrapper = await mountKit(DeploySteps, { props: { steps: null, modelValue: [] } })
    expect(wrapper.find('.deploy-steps').exists()).toBe(false)
    wrapper.unmount()
  })

  it('is hidden when every category has no commands (no steps to switch off)', async () => {
    const wrapper = await mountKit(DeploySteps, {
      props: {
        steps: {
          dependencies: { commands: [], skippable: true },
          build: { commands: [], skippable: true },
          migrations: { commands: [], skippable: false },
        },
        modelValue: [],
      },
    })
    expect(wrapper.find('.deploy-steps').exists()).toBe(false)
    expect(wrapper.find('[data-step]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('checks skippable steps unless they are in the model (checked = step runs)', async () => {
    const wrapper = await mountKit(DeploySteps, { props: { steps: STEPS, modelValue: ['dependencies'] } })
    const box = wrapper.findComponent(Checkbox)
    expect(box.props('modelValue')).toBe(false)
    wrapper.unmount()

    const checked = await mountKit(DeploySteps, { props: { steps: STEPS, modelValue: [] } })
    expect(checked.findComponent(Checkbox).props('modelValue')).toBe(true)
    checked.unmount()
  })

  it('emits the skipped list when a checkbox changes', async () => {
    const wrapper = await mountKit(DeploySteps, { props: { steps: STEPS, modelValue: [] } })
    wrapper.findComponent(Checkbox).vm.$emit('update:modelValue', false)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['dependencies']])
    wrapper.unmount()
  })

  it('disables every step checkbox while the deploy is submitting (disabled prop of the kit, legacy DeploySteps.vue)', async () => {
    const wrapper = await mountKit(DeploySteps, { props: { steps: STEPS, modelValue: [], disabled: true } })
    expect(wrapper.findComponent(Checkbox).props('disabled')).toBe(true)
    wrapper.unmount()

    const enabled = await mountKit(DeploySteps, { props: { steps: STEPS, modelValue: [] } })
    expect(enabled.findComponent(Checkbox).props('disabled')).toBe(false)
    enabled.unmount()
  })

  it('renders the note when given', async () => {
    const wrapper = await mountKit(DeploySteps, { props: { steps: STEPS, modelValue: [], note: 'Based on current' } })
    expect(wrapper.text()).toContain('Based on current')
    wrapper.unmount()
  })
})
