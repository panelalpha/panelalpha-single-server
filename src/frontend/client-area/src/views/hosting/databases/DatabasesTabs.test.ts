import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import { DATABASES, PHPMYADMIN, USERS } from './databases-tabs'
import DatabasesTabs from './DatabasesTabs.vue'

function mountTabs (props: { canManageMysql: boolean, canPhpmyadminSso: boolean }, modelValue = DATABASES) {
  return mountKit(DatabasesTabs, { props: { modelValue, ...props } })
}

function tabIds (wrapper: Awaited<ReturnType<typeof mountTabs>>) {
  return wrapper.findAll('[data-testid^="databases-tab-"]').map(tab => tab.attributes('data-testid'))
}

describe('DatabasesTabs', () => {
  it('keeps the legacy tab indexes (the slot of `data[tab]`)', () => {
    expect([DATABASES, USERS, PHPMYADMIN]).toEqual([0, 1, 2])
  })

  it('shows Databases and Users for the MySQL privilege and PHPMyAdmin for the SSO privilege', async () => {
    expect(tabIds(await mountTabs({ canManageMysql: true, canPhpmyadminSso: true })))
      .toEqual(['databases-tab-databases', 'databases-tab-users', 'databases-tab-phpmyadmin'])
    expect(tabIds(await mountTabs({ canManageMysql: true, canPhpmyadminSso: false })))
      .toEqual(['databases-tab-databases', 'databases-tab-users'])
    expect(tabIds(await mountTabs({ canManageMysql: false, canPhpmyadminSso: true })))
      .toEqual(['databases-tab-phpmyadmin'])
  })

  it('emits the index of the clicked tab', async () => {
    const wrapper = await mountTabs({ canManageMysql: true, canPhpmyadminSso: true })
    await wrapper.get('[data-testid="databases-tab-users"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([USERS])
  })
})
