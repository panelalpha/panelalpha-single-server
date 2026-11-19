import type { HomeResponse } from '@/shared/session/session.api'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { injectCustomCode } from './app-head'
import { onFirstHomeHydration } from './first-hydration'

const home = (app: Record<string, unknown>) => ({ app }) as HomeResponse

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('onFirstHomeHydration', () => {
  function setup (handler: (value: HomeResponse) => void) {
    const source = ref<HomeResponse | null>(null)
    mount(defineComponent({
      setup () {
        onFirstHomeHydration(source, handler)
        return () => null
      },
    }))
    return source
  }

  it('does not run while home is missing and runs once for the first home with app', async () => {
    const handler = vi.fn()
    const source = setup(handler)
    expect(handler).not.toHaveBeenCalled()

    source.value = home({ name: 'first' })
    await nextTick()
    source.value = home({ name: 'second' })
    await nextTick()

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0]![0].app.name).toBe('first')
  })

  it('ignores a home without app and survives a logout in between', async () => {
    const handler = vi.fn()
    const source = setup(handler)

    source.value = {} as HomeResponse
    await nextTick()
    expect(handler).not.toHaveBeenCalled()

    source.value = home({})
    await nextTick()
    source.value = null
    await nextTick()
    source.value = home({})
    await nextTick()

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('injects custom code on the first hydration only (second hydration runs nothing)', async () => {
    const source = setup(value => injectCustomCode(value.app))

    source.value = home({ custom_css: '.a { color: red }', custom_js_footer: 'window.first = 1' })
    await nextTick()
    source.value = home({ custom_css: '.b { color: blue }', custom_js_footer: 'window.second = 1' })
    await nextTick()

    expect(document.head.querySelectorAll('style')).toHaveLength(1)
    expect(document.head.querySelector('style')?.textContent).toBe('.a { color: red }')
    expect(document.body.querySelectorAll('script')).toHaveLength(1)
  })

  it('runs immediately when home is already loaded at setup', () => {
    const handler = vi.fn()
    mount(defineComponent({
      setup () {
        onFirstHomeHydration(() => home({}), handler)
        return () => null
      },
    }))
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
