import type { FreeTaskProject } from './tasks.api'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import TaskProjectCell from './TaskProjectCell.vue'

async function mountCell (props: { project: FreeTaskProject | null }) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().hydrateHome({ app: { single_server: { active: true } }, user: {} } as never)
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { render: () => h('div') } }] })
  await router.push('/')
  return mountKit(TaskProjectCell, { props, attachTo: document.body, global: { plugins: [pinia, router] } })
}

describe('TaskProjectCell', () => {
  it('renders the name as a link to the project and the domain below it', async () => {
    const wrapper = await mountCell({ project: { id: 7, name: 'Shop', domain: 'shop.example.com' } })

    const link = wrapper.get('a.tasks-project__link')
    expect(link.attributes('href')).toBe('/projects/7/general')
    expect(link.text()).toBe('Shop')
    expect(wrapper.get('.tasks-project__domain').text()).toBe('shop.example.com')
    wrapper.unmount()
  })

  it('omits the domain line when the project has none', async () => {
    const wrapper = await mountCell({ project: { id: 7, name: 'Shop', domain: null } })

    expect(wrapper.find('.tasks-project__domain').exists()).toBe(false)
    wrapper.unmount()
  })

  it('opens no hover card over a linked project', async () => {
    const wrapper = await mountCell({ project: { id: 7, name: 'Shop', domain: 'shop.example.com' } })

    await wrapper.get('[data-testid="tasks-project"]').trigger('mouseenter')
    await new Promise(resolve => setTimeout(resolve, 300))

    expect(document.body.querySelector('.v-overlay--active')).toBeNull()
    expect(wrapper.find('[aria-haspopup]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows a dash without a project', async () => {
    const wrapper = await mountCell({ project: null })

    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.get('[data-testid="tasks-no-project"]').text()).toBe('—')
    expect(wrapper.find('i').exists()).toBe(false)
    wrapper.unmount()
  })
})
