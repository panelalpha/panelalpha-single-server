import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import SecretValue from '@/entities/project/ui/secrets/SecretValue.vue'
import { mountKit } from '@/test/mount-kit'
import InstallationDetailsCard from './InstallationDetailsCard.vue'

const details = {
  directory: '/home/site/public_html',
  database_name: 'site_wp',
  // What the API answers now: a mask, never the database user.
  database_user: '********',
  // What the API answers now: a mask, never the password.
  database_password: '********',
  database_host: 'db',
  redis_host: null,
  redis_port: null,
  redis_password: null,
}

async function mountCard (installationDetails: Record<string, unknown> = details) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = await mountKit(InstallationDetailsCard, {
    props: { instanceId: 7, loading: false, installationDetails },
    global: { plugins: [pinia] },
  })
  await flushPromises()
  return wrapper
}

describe('InstallationDetailsCard', () => {
  it('shows the database password through the reveal, never as a plain value', async () => {
    const wrapper = await mountCard()

    const secrets = wrapper.findAllComponents(SecretValue)
    expect(secrets.find(secret => secret.props('secret') === 'DB_PASSWORD')?.props()).toMatchObject({ instanceId: 7 })
    expect(wrapper.text()).toContain('********')
    expect(wrapper.text()).not.toContain('db-secret-1')
    wrapper.unmount()
  })

  it('shows the database login through the reveal, never as a plain value', async () => {
    // The login a cached or older answer may still carry never reaches the page.
    const wrapper = await mountCard({ ...details, database_user: 'site_login' })

    const secrets = wrapper.findAllComponents(SecretValue)
    expect(secrets.map(secret => secret.props('secret'))).toEqual(['DB_USER', 'DB_PASSWORD'])
    expect(secrets[0].props('instanceId')).toBe(7)
    expect(wrapper.get('[data-testid="secret-DB_USER"] .secret-value__text').text()).toBe('********')
    expect(wrapper.text()).not.toContain('site_login')
    wrapper.unmount()
  })

  it('keeps the empty marker when the project has no database user or password', async () => {
    const wrapper = await mountCard({ ...details, database_user: null, database_password: null })

    expect(wrapper.findAllComponents(SecretValue)).toHaveLength(0)
    wrapper.unmount()
  })
})
