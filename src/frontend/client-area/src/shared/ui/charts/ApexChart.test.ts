import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import ApexChart from './ApexChart.vue'

// jsdom has no SVG layout, so the library is replaced by a probe that records the props it receives.
vi.mock('vue3-apexcharts', () => ({
  default: defineComponent({
    props: ['type', 'height', 'options', 'series'],
    setup (props) {
      return () => h('div', { 'class': 'probe', 'data-series': JSON.stringify(props.series), 'data-height': props.height, 'data-type': props.type })
    },
  }),
}))

describe('ApexChart', () => {
  it('passes type, height, options and series through and follows their changes', async () => {
    const wrapper = mount(ApexChart, {
      props: { type: 'line', height: 319, options: {}, series: [{ name: 'a', data: [1] }] },
    })
    const probe = wrapper.get('.probe')
    expect(probe.attributes('data-type')).toBe('line')
    expect(probe.attributes('data-height')).toBe('319')
    expect(probe.attributes('data-series')).toBe('[{"name":"a","data":[1]}]')

    await wrapper.setProps({ series: [{ name: 'a', data: [1, 2] }] })
    expect(wrapper.get('.probe').attributes('data-series')).toBe('[{"name":"a","data":[1,2]}]')
  })
})
