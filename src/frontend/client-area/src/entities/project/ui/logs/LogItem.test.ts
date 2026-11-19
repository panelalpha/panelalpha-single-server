import type { InstanceLogRow } from '@/entities/project/instance-logs.api'
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import LogItem from './LogItem.vue'

function row (overrides: Partial<InstanceLogRow>): InstanceLogRow {
  return {
    user: { email: 'a@b.c' },
    action: 'user.instance.plugin.install',
    request_method: 'POST',
    payload: { PluginResource: { title: 'Akismet' } },
    date: '2026-10-01',
    ...overrides,
  }
}

describe('LogItem', () => {
  it('renders the action chip with the POST colour modifier', async () => {
    const wrapper = await mountKit(LogItem, { props: { action: row({}) } })
    const chip = wrapper.get('.action-name')
    expect(chip.classes()).toContain('action-name--post')
    expect(chip.text()).toBe('User Instance Plugin Install')
    wrapper.unmount()
  })

  it('maps DELETE and other methods to their modifiers', async () => {
    const deleted = await mountKit(LogItem, { props: { action: row({ request_method: 'DELETE' }) } })
    expect(deleted.get('.action-name').classes()).toContain('action-name--delete')
    deleted.unmount()

    const other = await mountKit(LogItem, { props: { action: row({ request_method: 'PUT' }) } })
    expect(other.get('.action-name').classes()).toContain('action-name--other')
    other.unmount()
  })

  it('renders the information as HTML with the bold title', async () => {
    const wrapper = await mountKit(LogItem, { props: { action: row({}) } })
    const information = wrapper.get('.information')
    expect(information.html()).toContain('<b>Akismet</b>')
    wrapper.unmount()
  })

  it('does not run markup a payload value carries (sec-html-sanitize)', async () => {
    const title = 'Evil<img src=x onerror=alert(1)><script>alert(1)</script>'
    const wrapper = await mountKit(LogItem, { props: { action: row({ payload: { PluginResource: { title } } }) } })
    const information = wrapper.get('.information')
    expect(information.find('img').exists()).toBe(false)
    expect(information.find('script').exists()).toBe(false)
    expect(information.html()).not.toContain('onerror')
    expect(information.get('b').text()).toBe('Evil')
    wrapper.unmount()
  })

  it('does not render the information span for an empty payload', async () => {
    const wrapper = await mountKit(LogItem, { props: { action: row({ payload: [] }) } })
    expect(wrapper.find('.information').exists()).toBe(false)
    expect(wrapper.get('.action-name').exists()).toBe(true)
    wrapper.unmount()
  })

  it('keeps the chip and empty information for an unknown action (D2)', async () => {
    const wrapper = await mountKit(LogItem, { props: { action: row({ action: 'user.instance.unknown' }) } })
    expect(wrapper.get('.action-name').exists()).toBe(true)
    expect(wrapper.get('.information').text()).toBe('')
    wrapper.unmount()
  })
})
