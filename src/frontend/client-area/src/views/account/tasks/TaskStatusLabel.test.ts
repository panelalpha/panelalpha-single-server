import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import { taskStatusStyle } from './tasks-table'
import TaskStatusLabel from './TaskStatusLabel.vue'

describe('TaskStatusLabel', () => {
  it.each([
    ['queued', 'orange', '$clock', 'tasks.status.queued'],
    ['running', 'blue', '$loader', 'tasks.status.running'],
    ['completed', 'green', '$check', 'tasks.status.completed'],
    ['failed', 'error', '$close', 'tasks.status.failed'],
    ['cancelled', 'error', '$close', 'tasks.status.cancelled'],
  ])('maps %s to its colour modifier, icon and text', async (status, modifier, icon, text) => {
    const wrapper = await mountKit(TaskStatusLabel, { props: { status } })

    const chip = wrapper.get('.v-chip')
    expect(chip.classes()).toContain('task-status-label')
    expect(chip.classes()).toContain(`task-status-label--${modifier}`)
    expect(taskStatusStyle(status).icon).toBe(icon)
    expect(wrapper.find('.v-icon').exists()).toBe(true)
    expect(wrapper.get('.status-label__text').text()).toBe(text)
    wrapper.unmount()
  })

  it('shows the raw value of an unknown status in gray without an icon', async () => {
    const wrapper = await mountKit(TaskStatusLabel, { props: { status: 'weird' } })

    expect(wrapper.text()).toBe('weird')
    expect(wrapper.find('.v-icon').exists()).toBe(false)
    expect(wrapper.get('.v-chip').classes()).toContain('task-status-label--gray')
    wrapper.unmount()
  })

  it('has no tooltip and is not focusable, also for a failed task (the error is in the details row)', async () => {
    const wrapper = await mountKit(TaskStatusLabel, {
      props: { status: 'failed' },
      attachTo: document.body,
    })

    const chip = wrapper.get('.v-chip')
    expect(chip.attributes('tabindex')).toBeUndefined()
    await chip.trigger('mouseenter')
    await new Promise(resolve => setTimeout(resolve, 300))
    await flushPromises()

    expect(document.body.querySelector('.v-overlay--active')).toBeNull()
    wrapper.unmount()
  })
})
