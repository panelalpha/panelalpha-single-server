import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import ProgressChart from './ProgressChart.vue'

describe('ProgressChart', () => {
  it('computes percent as ceil(value / maxValue * 100)', async () => {
    const wrapper = await mountKit(ProgressChart, {
      props: { value: 33, maxValue: 100, color: '#83CC80' },
    })
    // Legacy CSS says `height: 6px`, but V2 sets `height: 4px` inline on the bar and that wins: measured 4px on the
    // deployed legacy (Summary rows). V4 sets height inline from the prop.
    expect((wrapper.get('.v-progress-linear').element as HTMLElement).style.height).toBe('4px')
    expect(wrapper.get('.v-progress-linear').attributes('aria-valuenow')).toBe('33')
    // 33/100*100 = 33
    expect((wrapper.vm as unknown as { percent: number }).percent).toBe(33)
    wrapper.unmount()
  })

  it('takes the track and the default colour from the theme tokens', async () => {
    // The legacy track is `#E5E5F0` and the default `#83CC80` (= `--v-chart-pie-1`): no literal is left in the kit.
    const wrapper = await mountKit(ProgressChart, { props: { value: 10 } })
    const bar = wrapper.get('.v-progress-linear').element as HTMLElement
    expect(bar.innerHTML).toContain('var(--v-chart-progress-track)')
    expect(bar.innerHTML).toContain('var(--v-chart-pie-1)')
    wrapper.unmount()
  })

  it('ceils fractional percents', async () => {
    const wrapper = await mountKit(ProgressChart, {
      props: { value: 1, maxValue: 3 },
    })
    expect((wrapper.vm as unknown as { percent: number }).percent).toBe(34)
    wrapper.unmount()
  })

  it('gives an empty bar, not NaN, when the maximum is 0', async () => {
    const wrapper = await mountKit(ProgressChart, { props: { value: 0, maxValue: 0 } })
    expect((wrapper.vm as unknown as { percent: number }).percent).toBe(0)
    expect(wrapper.get('.v-progress-linear').attributes('aria-valuenow')).toBe('0')
    wrapper.unmount()
  })
})
