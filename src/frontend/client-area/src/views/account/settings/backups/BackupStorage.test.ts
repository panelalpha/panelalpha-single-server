import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import BackupStorage from './BackupStorage.vue'
import BackupStoreRemoveModal from './BackupStoreRemoveModal.vue'

const BASE = { drivers: ['local', 's3'], defaultLocalLocation: '/opt/panelalpha/backups' }

describe('BackupStorage', () => {
  // The store modal inside uses the alerts store.
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders the two-column skeleton while loading', async () => {
    const wrapper = await mountKit(BackupStorage, { props: { ...BASE, loading: true, loaded: false } })

    expect(wrapper.findAll('.v-skeleton-loader')).toHaveLength(2)
    expect(wrapper.find('.backup-error').exists()).toBe(false)
    expect(wrapper.find('.backup-store-summary').exists()).toBe(false)
  })

  it('shows the errors and Retry emits retry when the load failed', async () => {
    const wrapper = await mountKit(BackupStorage, { props: { ...BASE, loaded: false, errors: ['Engine is down.', 'Try later.'] } })

    expect(wrapper.find('.backup-error').text()).toContain('Engine is down. Try later.')
    expect(wrapper.find('.backup-no-store').exists()).toBe(false)
    expect(wrapper.find('.backup-store-button').exists()).toBe(false)
    await wrapper.find('.backup-retry').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('says there is no store and offers Configure when loaded without one', async () => {
    const wrapper = await mountKit(BackupStorage, { props: { ...BASE, store: null } })

    expect(wrapper.find('.backup-no-store').text()).toBe('settings.backups.noStore')
    expect(wrapper.find('.backup-store-button').text()).toBe('settings.backups.configureStore')
    expect(wrapper.find('.backup-store-button').attributes('type')).toBe('button')
    expect(wrapper.find('.backup-store-icon').exists()).toBe(false)
  })

  it('shows the driver icon, label and truncated location with a title, and offers Change', async () => {
    const location = 's3://bucket/a-very-long-path/to/the/backups'
    const wrapper = await mountKit(BackupStorage, {
      props: { ...BASE, store: { id: 1, name: 'Store', driver: 's3', location } },
    })

    expect(wrapper.find('.backup-store-driver').text()).toBe('settings.backups.drivers.s3')
    const place = wrapper.find('.backup-store-location')
    expect(place.text()).toBe(location)
    expect(place.attributes('title')).toBe(location)
    expect(place.classes()).toContain('text-truncate')
    expect(wrapper.find('.backup-store-icon svg').exists()).toBe(true)
    expect(wrapper.find('.backup-store-button').text()).toBe('settings.backups.changeStore')
    expect(wrapper.find('.backup-no-store').exists()).toBe(false)
    expect(wrapper.find('.backup-store-remove').exists()).toBe(false)
  })

  it('offers Remove for the store the owner chose, opening the confirm with what happens to it', async () => {
    const wrapper = await mountKit(BackupStorage, {
      props: { ...BASE, store: { id: 1, name: 'Store', driver: 'local', location: '/opt/b' }, storeSelected: true, storeCreated: true },
    })

    const remove = wrapper.find('.backup-store-remove')
    expect(remove.text()).toBe('settings.backups.removeStore')
    expect(remove.attributes('type')).toBe('button')
    expect(wrapper.findComponent(BackupStoreRemoveModal).props('storeCreated')).toBe(true)

    await remove.trigger('click')
    expect((wrapper.vm as unknown as { removeModalOpen: boolean }).removeModalOpen).toBe(true)
  })

  it('offers Remove for a store set up elsewhere too, and the confirm says it stays', async () => {
    const wrapper = await mountKit(BackupStorage, {
      props: { ...BASE, store: { id: 1, name: 'Store', driver: 'local', location: '/opt/b' }, storeSelected: true, storeCreated: false },
    })

    expect(wrapper.find('.backup-store-remove').exists()).toBe(true)
    expect(wrapper.findComponent(BackupStoreRemoveModal).props('storeCreated')).toBe(false)
  })
})
