import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import InvoiceStatusLabel from './InvoiceStatusLabel.vue'

async function mountLabel (status: string) {
  const wrapper = await mountKit(InvoiceStatusLabel, { props: { status } })
  return wrapper.find('.v-chip')
}

describe('InvoiceStatusLabel', () => {
  it('uses the success text modifier for a paid invoice, without an inline style', async () => {
    const text = await mountLabel('paid')

    expect(text.classes()).toContain('invoice-status__text--paid')
    expect(text.attributes('style')).toBeUndefined()
  })

  it('uses the error text modifier for an unpaid invoice, without an inline style', async () => {
    const text = await mountLabel('unpaid')

    expect(text.classes()).toContain('invoice-status__text--unpaid')
    expect(text.attributes('style')).toBeUndefined()
  })

  it('uses the neutral text modifier for any other status, without an inline style', async () => {
    const text = await mountLabel('cancelled')

    expect(text.classes()).toContain('invoice-status__text--other')
    expect(text.attributes('style')).toBeUndefined()
  })
})
