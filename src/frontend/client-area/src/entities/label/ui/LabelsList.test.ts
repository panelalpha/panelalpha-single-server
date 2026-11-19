import { describe, expect, it } from 'vitest'
import { toInstanceResource } from '@/entities/project/instance-resource'
import { mountKit } from '@/test/mount-kit'
import LabelsList from './LabelsList.vue'

const labels = [
  { title: 'Alpha', color: '#07C07E' },
  { title: 'Beta', color: '#2F80ED' },
  { title: 'Gamma', color: '#E71D1D' },
]

const instance = (privileges: string[]) => toInstanceResource({ id: 1, url: 'https://a.example.com', privileges })

describe('LabelsList', () => {
  it('shows up to maxLabelsDisplayed chips and the remaining count as a button', async () => {
    const wrapper = await mountKit(LabelsList, {
      props: { labels, chips: true, maxLabelsDisplayed: 2, remainingAsButton: true, instance: instance([]) },
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.label-chip').map(chip => chip.text())).toEqual(['Alpha', 'Beta'])
    const remaining = wrapper.get('.label-list__items-remaining')
    expect(remaining.text()).toBe('+1')
    await remaining.trigger('click')
    expect(wrapper.emitted('show-remaining')).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows the add button instead of a count with the manage-labels privilege', async () => {
    const wrapper = await mountKit(LabelsList, {
      props: { labels: labels.slice(0, 1), chips: true, maxLabelsDisplayed: 99, remainingAsButton: true, instance: instance(['general.manage_labels']) },
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.label-list__items-remaining--add').exists()).toBe(true)
    wrapper.unmount()

    const without = await mountKit(LabelsList, {
      props: { labels: labels.slice(0, 1), chips: true, maxLabelsDisplayed: 99, remainingAsButton: true, instance: instance([]) },
    })
    await without.vm.$nextTick()
    expect(without.find('.label-list__items-remaining').exists()).toBe(false)
    without.unmount()
  })

  it('fits the chips to maxWidth (title length * 7 + 24 each, 65px reserved)', async () => {
    const wrapper = await mountKit(LabelsList, {
      props: { labels, chips: true, maxLabelsDisplayed: 99, maxWidth: 65 + 5 * 7 + 24 + 4 * 7 + 24 + 1 },
    })
    await wrapper.vm.$nextTick()
    // Alpha (59) and Beta (52) fit; Gamma (59) does not.
    expect(wrapper.findAll('.label-chip').map(chip => chip.text())).toEqual(['Alpha', 'Beta'])
    wrapper.unmount()
  })

  it('re-emits a clicked chip as toggle-filter when filtering is active', async () => {
    const wrapper = await mountKit(LabelsList, {
      props: { labels: labels.slice(0, 1), chips: true, filtersActive: true, maxLabelsDisplayed: 99 },
    })
    await wrapper.vm.$nextTick()
    await wrapper.get('.label-chip').trigger('click')
    expect(wrapper.emitted('toggle-filter')?.[0]).toEqual([{ title: 'Alpha', color: '#07C07E' }])
    wrapper.unmount()
  })
})
