// Class contract, one line per assertion.
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import DeployLogsConsole from './DeployLogsConsole.vue'

function setGeometry (el: HTMLElement, geometry: { scrollHeight: number, clientHeight: number, scrollTop: number }) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: geometry.scrollHeight })
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: geometry.clientHeight })
  el.scrollTop = geometry.scrollTop
}

describe('DeployLogsConsole', () => {
  it('renders lines with the level modifier, dim by default (legacy :2-9)', async () => {
    const wrapper = await mountKit(DeployLogsConsole, {
      props: { lines: [{ msg: 'a', level: 'ok' }, { msg: 'b' }, { msg: '' }] },
    })
    expectLegacyClasses(wrapper.element, ['deploy-console'])
    expectLegacyClasses(wrapper.get('.deploy-console__lines').element, ['deploy-console__lines'])
    const lines = wrapper.findAll('.deploy-console__line')
    expectLegacyClasses(lines[0]!.element, ['deploy-console__line', 'deploy-console__line--ok'])
    expectLegacyClasses(lines[1]!.element, ['deploy-console__line--dim'])
    expect(lines[2]!.text()).toBe('')
    expect(lines[2]!.element.textContent).toBe(' ')
    wrapper.unmount()
  })

  it('shows the dim empty text and the blinking cursor only while live (legacy :10-13)', async () => {
    const wrapper = await mountKit(DeployLogsConsole, { props: { lines: [], emptyText: 'wait' } })
    expectLegacyClasses(wrapper.get('.deploy-console__line').element, ['deploy-console__line--dim'])
    expect(wrapper.get('.deploy-console__line').text()).toBe('wait')
    expect(wrapper.find('.deploy-console__cursor').exists()).toBe(false)
    await wrapper.setProps({ live: true })
    expect(wrapper.find('.deploy-console__cursor').exists()).toBe(true)
    wrapper.unmount()
  })

  it('sticks to the bottom within 40px (legacy :41-52)', async () => {
    const wrapper = await mountKit(DeployLogsConsole, { props: { lines: [{ msg: 'a' }] } })
    const el = wrapper.element as HTMLElement
    setGeometry(el, { scrollHeight: 1000, clientHeight: 300, scrollTop: 700 })
    await wrapper.trigger('scroll')
    await wrapper.setProps({ lines: [{ msg: 'a' }, { msg: 'b' }] })
    await nextTick()
    expect(el.scrollTop).toBe(1000)

    setGeometry(el, { scrollHeight: 1000, clientHeight: 300, scrollTop: 659 })
    await wrapper.trigger('scroll')
    await wrapper.setProps({ lines: [{ msg: 'a' }, { msg: 'b' }, { msg: 'c' }] })
    await nextTick()
    expect(el.scrollTop).toBe(659)
    wrapper.unmount()
  })
})
