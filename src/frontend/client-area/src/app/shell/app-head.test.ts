import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyBodyThemeClass, injectCustomCode } from './app-head'

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.className = ''
  document.body.innerHTML = ''
})

afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('applyBodyThemeClass', () => {
  it('sets is-dark and drops is-light', () => {
    document.body.classList.add('is-light')
    applyBodyThemeClass(true)
    expect(document.body.classList.contains('is-dark')).toBe(true)
    expect(document.body.classList.contains('is-light')).toBe(false)
  })

  it('sets is-light and drops is-dark', () => {
    document.body.classList.add('is-dark')
    applyBodyThemeClass(false)
    expect(document.body.classList.contains('is-light')).toBe(true)
    expect(document.body.classList.contains('is-dark')).toBe(false)
  })

  it('keeps other body classes', () => {
    document.body.classList.add('custom')
    applyBodyThemeClass(true)
    expect(document.body.classList.contains('custom')).toBe(true)
  })
})

describe('injectCustomCode', () => {
  it('puts the header script and the CSS in the head and the footer script in the body', () => {
    injectCustomCode({ custom_js_header: 'window.a = 1', custom_css: '.x { color: red }', custom_js_footer: 'window.b = 2' })

    const headScripts = document.head.querySelectorAll('script')
    expect(headScripts).toHaveLength(1)
    expect(headScripts[0]!.textContent).toBe('window.a = 1')
    expect(document.head.querySelector('style')?.textContent).toBe('.x { color: red }')
    expect(document.body.querySelector('script')?.textContent).toBe('window.b = 2')
  })

  it('injects nothing for empty or missing fields', () => {
    injectCustomCode({ custom_js_header: '', custom_css: null })
    injectCustomCode(undefined)
    expect(document.head.children).toHaveLength(0)
    expect(document.body.children).toHaveLength(0)
  })
})
