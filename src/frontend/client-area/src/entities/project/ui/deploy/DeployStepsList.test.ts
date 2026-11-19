// Class contract, one line per assertion.
import { describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import DeployStepsList from './DeployStepsList.vue'

describe('DeployStepsList', () => {
  it('renders the three steps with the legacy classes (legacy :2-19)', async () => {
    const wrapper = await mountKit(DeployStepsList, { props: { stages: [], currentStage: 'preparing' } })
    expectLegacyClasses(wrapper.element, ['deploy-steps'])
    const steps = wrapper.findAll('.deploy-steps__step')
    expect(steps).toHaveLength(3)
    expectLegacyClasses(steps[0]!.element, ['deploy-steps__step', 'deploy-steps__step--progress'])
    expectLegacyClasses(steps[1]!.element, ['deploy-steps__step', 'deploy-steps__step--pending'])
    expect(steps[0]!.find('.deploy-steps__icon .deploy-steps__loader').exists()).toBe(true)
    expect(steps[1]!.find('.deploy-steps__icon .deploy-steps__dot').exists()).toBe(true)
    expectLegacyClasses(steps[0]!.get('.deploy-steps__body').element, ['deploy-steps__body'])
    expectLegacyClasses(steps[0]!.get('.deploy-steps__name').element, ['deploy-steps__name'])
    expectLegacyClasses(steps[0]!.get('.deploy-steps__meta').element, ['deploy-steps__meta'])
    wrapper.unmount()
  })

  it('renders the three steps as skeleton bones for the icon, the name and the state while loading', async () => {
    const wrapper = await mountKit(DeployStepsList, { props: { loading: true, currentStage: 'preparing' } })
    const steps = wrapper.findAll('.deploy-steps__step')
    expect(steps).toHaveLength(3)
    expect(steps.map(step => step.classes('deploy-steps__step--loading'))).toEqual([true, true, true])
    expect(wrapper.findAll('[data-testid="deploy-steps-name-skeleton"]')).toHaveLength(3)
    expect(wrapper.find('.deploy-steps__name').exists()).toBe(false)
    expect(wrapper.findAll('.deploy-steps__bone--icon')).toHaveLength(3)
    expect(wrapper.findAll('[data-testid="deploy-steps-meta-skeleton"]')).toHaveLength(3)
    expect(wrapper.find('.deploy-steps__loader').exists()).toBe(false)
    expect(wrapper.find('.deploy-steps__meta').exists()).toBe(false)
    wrapper.unmount()
  })

  it('falls back to the stage name and uses the legacy copy keys (legacy :80-99)', async () => {
    const wrapper = await mountKit(DeployStepsList, {
      props: {
        stages: [{ name: 'preparing', started_at: 10, finished_at: 22 }],
        currentStage: 'cloning',
        status: 'running',
      },
    })
    const steps = wrapper.findAll('.deploy-steps__step')
    // The test i18n returns the key for a missing translation, so the name falls back to the stage.
    expect(steps[0]!.get('.deploy-steps__name').text()).toBe('preparing')
    expect(steps[0]!.get('.deploy-steps__meta').text()).toBe('deployLogs.stepState.completed · 12s')
    expectLegacyClasses(steps[0]!.element, ['deploy-steps__step--done'])
    expect(steps[0]!.find('svg.deploy-steps__check').exists()).toBe(true)
    expect(steps[1]!.get('.deploy-steps__meta').text()).toBe('deployLogs.stepState.inProgress')
    expect(steps[2]!.get('.deploy-steps__meta').text()).toBe('deployLogs.stepState.waiting')
    wrapper.unmount()
  })

  it('shows a step the finished deploy never ran as skipped, with no time (legacy :80-99)', async () => {
    const wrapper = await mountKit(DeployStepsList, {
      props: {
        stages: [{ name: 'running', started_at: 100, finished_at: 147 }],
        currentStage: 'running',
        status: 'finished',
      },
    })
    const steps = wrapper.findAll('.deploy-steps__step')
    expect(steps[0]!.get('.deploy-steps__meta').text()).toBe('deployLogs.stepState.skipped')
    expect(steps[1]!.get('.deploy-steps__meta').text()).toBe('deployLogs.stepState.skipped')
    expect(steps[0]!.classes('deploy-steps__step--skipped')).toBe(true)
    expect(steps[1]!.classes('deploy-steps__step--skipped')).toBe(true)
    expect(steps[2]!.get('.deploy-steps__meta').text()).toBe('deployLogs.stepState.completed · 47s')
    expect(steps[2]!.classes('deploy-steps__step--done')).toBe(true)
    wrapper.unmount()
  })

  it('shows the steps a running redeploy went past as skipped, not waiting', async () => {
    const wrapper = await mountKit(DeployStepsList, {
      props: {
        stages: [{ name: 'running', started_at: 100 }],
        currentStage: 'running',
        status: 'running',
      },
    })
    const steps = wrapper.findAll('.deploy-steps__step')
    expect(steps[0]!.get('.deploy-steps__meta').text()).toBe('deployLogs.stepState.skipped')
    expect(steps[1]!.get('.deploy-steps__meta').text()).toBe('deployLogs.stepState.skipped')
    expect(steps[0]!.classes('deploy-steps__step--skipped')).toBe(true)
    expect(steps[1]!.classes('deploy-steps__step--skipped')).toBe(true)
    expect(steps[2]!.get('.deploy-steps__meta').text()).toBe('deployLogs.stepState.inProgress')
    expect(steps[2]!.classes('deploy-steps__step--progress')).toBe(true)
    wrapper.unmount()
  })

  it('error step shows the status copy and an icon (legacy :11,95-97)', async () => {
    const wrapper = await mountKit(DeployStepsList, {
      props: { stages: [{ name: 'preparing', started_at: 10 }], status: 'failed' },
    })
    const first = wrapper.findAll('.deploy-steps__step')[0]!
    expectLegacyClasses(first.element, ['deploy-steps__step--error'])
    expect(first.get('.deploy-steps__meta').text()).toBe('deployLogs.status.failed')
    expect(first.find('.v-icon').exists()).toBe(true)
    wrapper.unmount()
  })
})
