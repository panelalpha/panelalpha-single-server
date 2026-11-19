import type { DnsRecord } from './hosting.types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COPY_RESET_DELAY } from '@/shared/ui/buttons/use-copy-text'
import { mountKit } from '@/test/mount-kit'
import RecordConfiguration from './RecordConfiguration.vue'

const spfRecords: DnsRecord[] = [{ name: 'example.com', type: 'TXT', value: 'v=spf1 -all' }]
const dkimRecords: DnsRecord[] = [{ name: 'default._domainkey.example.com', type: 'TXT', value: 'v=DKIM1; p=KEY' }]

describe('RecordConfiguration', () => {
  const writeText = vi.fn<(text: string) => Promise<void>>()

  beforeEach(() => {
    writeText.mockReset()
    writeText.mockResolvedValue(undefined)
    // Only the clipboard: Vuetify reads the rest of `navigator` when it is created.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('renders the SPF and DKIM boxes with their records and verdict labels', async () => {
    const wrapper = await mountKit(RecordConfiguration, {
      props: { spfRecords, dkimRecords, spfConfigured: true, dkimConfigured: false },
    })
    expect(wrapper.get('.record-configuration-modal').exists()).toBe(true)
    expect(wrapper.get('h6').text()).toContain('heading.hosting.emailAddress.modal.show.spfdkimConfig')

    const boxes = wrapper.findAll('.record-box')
    expect(boxes).toHaveLength(2)
    expect(boxes[0]!.get('.record-label').classes()).toContain('configured')
    expect(boxes[1]!.get('.record-label').classes()).toContain('failed')
    expect(boxes[1]!.get('.record-box-list').text()).toContain('v=DKIM1; p=KEY')
    expect(boxes[1]!.get('.record-box-list').text()).toContain('general.name')
    wrapper.unmount()
  })

  it('shows the no-records text for an empty list', async () => {
    const wrapper = await mountKit(RecordConfiguration, {
      props: { spfRecords: [], dkimRecords: [], spfConfigured: true, dkimConfigured: true },
    })
    const empty = wrapper.findAll('.well')
    expect(empty).toHaveLength(2)
    expect(empty[0]!.text()).toBe('message.emptyTable.noRecords')
    expect(empty[1]!.text()).toBe('message.emptyTable.noRecords')
    expect(wrapper.find('.record-box-list').exists()).toBe(false)
    wrapper.unmount()
  })

  it('copies the value of a record on click', async () => {
    const wrapper = await mountKit(RecordConfiguration, {
      props: { spfRecords, dkimRecords, spfConfigured: true, dkimConfigured: true },
    })
    // The SPF record lists name, type and value: the third item is the value.
    await wrapper.findAll('.record-box-list-item')[2]!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(writeText).toHaveBeenCalledWith('v=spf1 -all')
    wrapper.unmount()
  })

  it('emits close from the close button and from Cancel', async () => {
    vi.useFakeTimers()
    const wrapper = await mountKit(RecordConfiguration, {
      props: { spfRecords, dkimRecords, spfConfigured: true, dkimConfigured: true },
    })
    const buttons = wrapper.findAll('button')
    await buttons[0]!.trigger('click')
    await buttons.at(-1)!.trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(2)
    vi.advanceTimersByTime(COPY_RESET_DELAY)
    wrapper.unmount()
  })
})
