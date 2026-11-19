import { afterEach, describe, expect, it } from 'vitest'
import { hideRecaptchaBadge } from './recaptcha'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('hideRecaptchaBadge', () => {
  it('sets display none on the Google badge', () => {
    document.body.innerHTML = '<div class="grecaptcha-badge" style="display: block"></div>'

    hideRecaptchaBadge()

    expect(document.querySelector<HTMLElement>('.grecaptcha-badge')?.style.display).toBe('none')
  })

  it('does nothing when the badge is not on the page', () => {
    expect(() => hideRecaptchaBadge()).not.toThrow()
  })
})
