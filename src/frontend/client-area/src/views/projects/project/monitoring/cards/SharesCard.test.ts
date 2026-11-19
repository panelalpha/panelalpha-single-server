// The DB-IP attribution footer of the shares card: the link is shown on request, also while the card loads, and adds no heading.
import type { MonitoringItem } from '@/views/projects/project/monitoring/monitoring'
import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import SharesCard from './SharesCard.vue'
import SharesCardSkeleton from './SharesCardSkeleton.vue'

const DATA: MonitoringItem[] = [{ label: 'Poland', data: 5, img: 'img/flags/PL.png' }]

function mountCard (props: Partial<{ loading: boolean, attribution: 'dbip' }> = {}) {
  return mountKit(SharesCard, { props: { title: 'Country', data: DATA, loading: false, ...props } })
}

describe('SharesCard attribution footer', () => {
  it('renders the DB-IP link with its href, target and rel', async () => {
    const wrapper = await mountCard({ attribution: 'dbip' })

    const links = wrapper.findAll('a[href="https://db-ip.com"]')
    expect(links).toHaveLength(1)
    expect(links[0]?.text()).toBe('IP Geolocation by DB-IP')
    expect(links[0]?.attributes('target')).toBe('_blank')
    expect(links[0]?.attributes('rel')).toBe('noopener')
    wrapper.unmount()
  })

  it('keeps the link while the card shows its skeleton', async () => {
    const wrapper = await mountCard({ attribution: 'dbip', loading: true })

    expect(wrapper.findComponent(SharesCardSkeleton).exists()).toBe(true)
    expect(wrapper.find('li.item').exists()).toBe(false)
    expect(wrapper.findAll('a[href="https://db-ip.com"]')).toHaveLength(1)
    wrapper.unmount()
  })

  it('renders no link without the attribution prop', async () => {
    const wrapper = await mountCard()

    expect(wrapper.find('a[href="https://db-ip.com"]').exists()).toBe(false)
    expect(wrapper.find('.attribution').exists()).toBe(false)
    wrapper.unmount()
  })

  it('adds no heading for the footer, so the card keeps only its title as h6', async () => {
    const wrapper = await mountCard({ attribution: 'dbip' })

    expect(wrapper.findAll('h6')).toHaveLength(1)
    expect(wrapper.findAll('h1, h2, h3, h4, h5')).toHaveLength(0)
    wrapper.unmount()
  })
})
