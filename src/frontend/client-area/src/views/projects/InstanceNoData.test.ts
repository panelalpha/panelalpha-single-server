import i18next from 'i18next'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { on, resetAppEvents } from '@/shared/events/app-events'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import InstanceNoData from './InstanceNoData.vue'

async function mountNoData () {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  return { session, wrapper: await mountKit(InstanceNoData, { global: { plugins: [pinia] } }) }
}

describe('InstanceNoData', () => {
  beforeEach(() => {
    localStorage.clear()
    resetAppEvents()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('greets the user by name, with the adventurer fallback', async () => {
    const { session, wrapper } = await mountNoData()
    i18next.addResource('en', 'translation', 'general.greeting', 'Hello {{name}}')
    i18next.addResource('en', 'translation', 'general.adventurer', 'Adventurer')
    await wrapper.vm.$forceUpdate()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Hello Adventurer')
    session.hydrateHome({ app: {}, user: { name: 'Jane Doe' } })
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Hello Jane Doe')
    wrapper.unmount()
  })

  it('renders the legacy copy keys and the legacy classes', async () => {
    const { wrapper } = await mountNoData()
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['no-data', 'no-data--instances']))
    expect(wrapper.find('h1.nodata-container__title').text()).toBe('message.emptyTable.instances.title')
    expect(wrapper.find('.nodata-container__message').text()).toBe('No projects yet. Create one to get started.')
    expect(wrapper.find('button').text()).toContain('button.instance.create')
    expect(wrapper.find('.no-data--welcome').exists()).toBe(true)
    wrapper.unmount()
  })

  it('uses the dark background from localStorage.isDarkMode', async () => {
    const light = await mountNoData()
    const lightImage = (light.wrapper.element as HTMLElement).style.backgroundImage
    light.wrapper.unmount()

    localStorage.setItem('isDarkMode', 'true')
    const dark = await mountNoData()
    expect((dark.wrapper.element as HTMLElement).style.backgroundImage).not.toBe(lightImage)
    dark.wrapper.unmount()
  })

  it('Create loads /home, then emits start-installation-process', async () => {
    const { session, wrapper } = await mountNoData()
    const order: string[] = []
    vi.spyOn(session, 'refreshServices').mockImplementation(async () => {
      order.push('refreshServices')
    })
    on('start-installation-process', () => order.push('event'))

    await wrapper.find('button').trigger('click')
    await vi.waitFor(() => expect(order).toEqual(['refreshServices', 'event']))
    wrapper.unmount()
  })
})
