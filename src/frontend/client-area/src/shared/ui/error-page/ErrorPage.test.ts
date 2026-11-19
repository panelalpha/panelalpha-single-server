import { describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import ErrorPage from './ErrorPage.vue'

describe('ErrorPage', () => {
  it('renders the legacy structure with the legacy i18n keys', async () => {
    // Legacy markup: div > v-container.mt-13 > v-row > v-col.d-flex.flex-column > h1 + span
    const wrapper = await mountKit(ErrorPage)
    expectLegacyClasses(wrapper.get('.v-container').element, ['v-container', 'mt-13'])
    expectLegacyClasses(wrapper.get('.v-col').element, ['v-col', 'd-flex', 'flex-column'])
    expect(wrapper.get('h1').text()).toBe('heading.errorPage.title')
    expect(wrapper.get('h1 + span').text()).toBe('heading.errorPage.subtitle')
    wrapper.unmount()
  })
})
