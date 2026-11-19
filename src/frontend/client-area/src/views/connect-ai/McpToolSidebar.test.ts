import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import { MANAGE_KEYS, TOOL_KEYS } from './connect-ai-tools'
import McpToolSidebar from './McpToolSidebar.vue'

const width = window.innerWidth

async function mountSidebar (innerWidth: number) {
  window.innerWidth = innerWidth
  const wrapper = await mountKit(McpToolSidebar, {
    props: { activeView: 'cursor' },
  })
  await flushPromises()
  return wrapper
}

describe('McpToolSidebar', () => {
  beforeEach(() => {
    window.innerWidth = width
  })

  afterEach(() => {
    window.innerWidth = width
  })

  it('lista od 1200 px: dwie grupy, aktywna pozycja, klik emituje select', async () => {
    const wrapper = await mountSidebar(1500)

    expect(wrapper.get('[data-testid="connect-ai-sidebar"]').exists()).toBe(true)
    expect(wrapper.findAll('.v-list-subheader').map(item => item.text()))
      .toEqual(['heading.connectAi.tool.yourTool', 'heading.connectAi.section.manage'])
    expect(wrapper.findAll('.v-list-item').map(item => item.attributes('data-testid')))
      .toEqual([...TOOL_KEYS, ...MANAGE_KEYS].map(key => `connect-ai-sidebar-${key}`))
    expect(wrapper.get('[data-testid="connect-ai-sidebar-cursor"]').classes()).toContain('v-list-item--active')

    await wrapper.get('[data-testid="connect-ai-sidebar-tokens"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['tokens']])
    wrapper.unmount()
  })

  it('zakładki poniżej 1200 px: zaznaczenie z activeView, klik emituje select', async () => {
    const wrapper = await mountSidebar(500)

    expect(wrapper.get('[data-testid="connect-ai-tabs"]').exists()).toBe(true)
    expect(wrapper.findAll('.v-tab').map(tab => tab.attributes('data-testid')))
      .toEqual([...TOOL_KEYS, ...MANAGE_KEYS].map(key => `connect-ai-tab-${key}`))
    expect(wrapper.get('[data-testid="connect-ai-tab-cursor"]').classes()).toContain('v-tab--selected')

    await wrapper.get('[data-testid="connect-ai-tab-capabilities"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['capabilities']])
    wrapper.unmount()
  })
})
