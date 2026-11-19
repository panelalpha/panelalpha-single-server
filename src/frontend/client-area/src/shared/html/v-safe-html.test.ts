import type { SafeHtmlValue } from './v-safe-html'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, ref } from 'vue'
import { vSafeHtml } from './v-safe-html'

function host (initial: SafeHtmlValue, directive = 'v-safe-html') {
  const value = ref<SafeHtmlValue>(initial)
  const component = defineComponent({
    directives: { safeHtml: vSafeHtml },
    setup: () => ({ value }),
    template: `<div class="host" ${directive}="value" />`,
  })
  return { wrapper: mount(component), value }
}

describe('v-safe-html', () => {
  it('renders the markup the copy carries', () => {
    const { wrapper } = host('Use <strong>this</strong> and <code class="mcp-path">that</code>')
    expect(wrapper.find('div.host').html()).toBe('<div class="host">Use <strong>this</strong> and <code class="mcp-path">that</code></div>')
  })

  it('removes script and handlers', () => {
    const { wrapper } = host('<img src=x onerror=alert(1)><script>alert(1)</script><b>ok</b>')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.find('b').text()).toBe('ok')
  })

  it('updates when the value changes', async () => {
    const { wrapper, value } = host('<b>one</b>')
    value.value = '<i>two</i><script>alert(1)</script>'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('div.host').html()).toBe('<div class="host"><i>two</i></div>')
  })

  it('renders nothing for null, undefined and empty values', async () => {
    const { wrapper, value } = host('<b>x</b>')
    for (const empty of [null, undefined, '']) {
      value.value = empty
      await wrapper.vm.$nextTick()
      expect(wrapper.find('div.host').element.innerHTML).toBe('')
    }
  })

  it('uses the profile named by the argument', () => {
    const html = '<p class="font-weight-bold" style="color: red">text <a href="https://ok.test">link</a></p>'
    const external = host(html, 'v-safe-html:external').wrapper
    expect(external.find('p').attributes('class')).toBeUndefined()
    expect(external.find('p').attributes('style')).toBeUndefined()
    expect(external.find('a').exists()).toBe(true)
    const copy = host(html).wrapper
    expect(copy.find('p').classes()).toContain('font-weight-bold')
    expect(copy.find('p').attributes('style')).toBe('color: red')
  })

  it('keeps tables with the rich profile only', () => {
    const html = '<table><tbody><tr><td>cell</td></tr></tbody></table>'
    expect(host(html, 'v-safe-html:rich').wrapper.find('td').exists()).toBe(true)
    expect(host(html).wrapper.find('td').exists()).toBe(false)
  })

  it('renders an SVG with the svg profile and drops its script', () => {
    const { wrapper } = host('<svg viewBox="0 0 1 1"><rect width="1" height="1"></rect><script>alert(1)</script></svg>', 'v-safe-html:svg')
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.find('rect').exists()).toBe(true)
    expect(wrapper.find('script').exists()).toBe(false)
  })

  it('treats an unknown profile as the strictest one', () => {
    const { wrapper } = host('<b class="x" style="color: red">t</b>', 'v-safe-html:extrnal')
    expect(wrapper.find('b').attributes('class')).toBeUndefined()
    expect(wrapper.find('b').attributes('style')).toBeUndefined()
  })

  it('leaves the classes and attributes of the element itself alone', () => {
    const component = defineComponent({
      directives: { safeHtml: vSafeHtml },
      template: '<span id="own" class="p-4 own" v-safe-html="\'<b>x</b>\'" />',
    })
    const wrapper = mount(component)
    expect(wrapper.find('#own').classes()).toEqual(['p-4', 'own'])
    expect(wrapper.find('#own').html()).toBe('<span id="own" class="p-4 own"><b>x</b></span>')
  })

  it('does not rewrite the element when the result is the same', async () => {
    const { wrapper, value } = host('<b>same</b>')
    const first = wrapper.find('b').element
    value.value = '<b>same</b>'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('b').element).toBe(first)
  })

  it('does not rewrite a tag-less text the browser re-serializes', async () => {
    // `innerHTML` returns `©` for `&copy;`, so a comparison with the element would differ on every update.
    const { wrapper, value } = host('a&nbsp;b &copy; &lt;')
    const element = wrapper.find('div.host').element
    const text = element.firstChild
    value.value = 'a&nbsp;b &copy; &lt;'
    await wrapper.vm.$nextTick()
    expect(element.firstChild).toBe(text)
  })

  it('does not sanitize again when the value and the profile did not change', async () => {
    const { wrapper, value } = host('<b>one</b>')
    const first = wrapper.find('b').element
    wrapper.vm.$forceUpdate()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('b').element).toBe(first)
    value.value = '<b>two</b>'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('b').text()).toBe('two')
  })

  it('writes again after the profile changes', async () => {
    const arg = ref('copy')
    const component = defineComponent({
      directives: { safeHtml: vSafeHtml },
      setup: () => ({ arg }),
      template: '<div class="host" v-safe-html:[arg]="\'<b class=&quot;font-weight-bold&quot;>x</b>\'" />',
    })
    const wrapper = mount(component)
    expect(wrapper.find('b').classes()).toContain('font-weight-bold')
    arg.value = 'external'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('b').attributes('class')).toBeUndefined()
  })
})
