import type { ModalButton } from './basic-modal-buttons'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import { VTextField } from 'vuetify/components'
import AppButton from '@/shared/ui/buttons/AppButton.vue'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import BasicModal from './BasicModal.vue'

const buttons: ModalButton[] = [
  { id: 'submit', label: 'Save', color: 'primary', loading: true },
  { id: 'cancel', label: 'Cancel', color: 'normal', type: 'cancel', customClass: 'cancel-btn' },
]

describe('BasicModal', () => {
  it('renders the plain card class contract', async () => {
    const wrapper = await mountKit(BasicModal, { props: { title: 'Edit <b>site</b>', buttons } })
    expectLegacyClasses(wrapper.element, ['v-card', 'basic-modal'])
    expectLegacyClasses(wrapper.get('.v-card-title').element, ['d-flex', 'justify-space-between'])
    expectLegacyClasses(wrapper.get('.v-card-title h6').element, ['heading--text', 'd-flex', 'align-center'])
    expect(wrapper.get('.v-card-title h6 span').html()).toContain('<b>site</b>')
    expect(wrapper.find('.v-card-title h6 .v-icon').exists()).toBe(false)
    expect(wrapper.find('pre').text()).toBe('')
    expect(wrapper.find('.v-card-text').exists()).toBe(true)
    expectLegacyClasses(wrapper.get('.v-card-actions').element, ['d-flex', 'flex-wrap', 'pb-4'])
    const rows = wrapper.findAll('.v-card-actions > div')
    expect(rows).toHaveLength(2)
    expectLegacyClasses(rows[0]!.element, ['w-100', 'pb-2'])
    expectLegacyClasses(rows[1]!.element, ['w-100', 'pb-2', 'cancel-btn'])
    expect(rows[0]!.get('.v-btn').classes()).toContain('bg-primary')
    expect(rows[0]!.get('.v-btn span.p-2').classes()).toContain('font-weight-600')
    expect(rows[1]!.get('.v-btn').classes()).toContain('v-btn--variant-text')
    expectLegacyClasses(rows[1]!.get('.v-btn span.p-2').element, ['font-weight-bold', 'text--gray-darken1'])
    expect(wrapper.find('form').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders the item box with the kit star before the rating (#25, legacy `$starIcon` and `b.p-4`)', async () => {
    const wrapper = await mountKit(BasicModal, { props: { title: 'Install', targetRatingBox: { labelHtml: 'Akismet', rating: '4.4', percent: 0.5 } } })
    const box = wrapper.get('.basic-modal-target .target-item-box')
    expectLegacyClasses(box.element, ['target-item-box', 'target-item-box--rated'])
    expect(box.classes()).not.toContain('target-item-box--flat')
    expect(box.text()).toContain('Akismet')
    // The name is the legacy `gray--text text--darken-1` span (its colour is `.target-item-name` in `BasicModal.scss`); the rating is not.
    expect(box.get('.target-item-name').text()).toBe('Akismet')
    expect(box.get('.target-item-name').element.closest('[data-testid="target-item-rating"]')).toBeNull()
    const rating = wrapper.get('[data-testid="target-item-rating"]')
    expectLegacyClasses(rating.element, ['target-item-rating', 'ml-auto'])
    expect(rating.find('.v-icon svg').exists()).toBe(true)
    // `percent` 0.5: the grey part of the star starts at x = 10 (legacy `rating / 100`).
    expect(rating.get('rect').attributes('x')).toBe('10')
    expect(rating.get('b').classes()).toContain('p-4')
    expect(rating.get('b').text()).toBe('4.4')
    wrapper.unmount()
  })

  it('takes the themes look of the rating box (flat, darker border)', async () => {
    const wrapper = await mountKit(BasicModal, { props: { title: 'Install', targetRatingBox: { labelHtml: 'Astra', rating: '4.5', border: 'gray-lighten2', flat: true } } })
    expect(wrapper.get('.target-item-box').classes()).toEqual(expect.arrayContaining(['target-item-box--flat', 'target-item-box--border-darker']))
    wrapper.unmount()
  })

  it('renders the plain target box HTML when there is no rating box', async () => {
    const wrapper = await mountKit(BasicModal, { props: { title: 'Delete', targetBox: '<span class="target-item-box">Akismet</span>' } })
    expect(wrapper.find('[data-testid="target-item-rating"]').exists()).toBe(false)
    expect(wrapper.get('.basic-modal-target').text()).toBe('Akismet')
    wrapper.unmount()
  })

  it('renders the icon, message titles, html messages and the alert', async () => {
    const wrapper = await mountKit(BasicModal, {
      props: {
        title: 'T',
        icon: '$alertcircle',
        color: 'error',
        customClass: 'hide-cancel',
        messageTitle: 'Sure <i>?</i>',
        messageTitleClass: 'extra-title',
        message: 'Body <b>text</b>',
        messageClass: 'extra-message',
        alert: 'Careful',
        actionsClasses: 'pt-4',
      },
    })
    expectLegacyClasses(wrapper.element, ['basic-modal', 'hide-cancel'])
    expectLegacyClasses(wrapper.get('.v-card-title h6 .v-icon').element, ['mr-4', 'text-error'])
    expectLegacyClasses(wrapper.get('.v-card-text p.h6').element, ['mb-2', 'extra-title'])
    expect(wrapper.get('.v-card-text p.h6').html()).toContain('<i>?</i>')
    expectLegacyClasses(wrapper.get('.v-card-text p.p-2').element, ['mb-4', 'extra-message'])
    expect(wrapper.get('.v-card-text p.p-2').html()).toContain('<b>text</b>')
    const alert = wrapper.get('.app-message--warning')
    expectLegacyClasses(alert.element, ['my-5'])
    expect(alert.get('.v-icon').classes()).toContain('text-warning')
    expect(alert.get('.app-message__text > span').text()).toBe('Careful')
    expectLegacyClasses(wrapper.get('.v-card-actions').element, ['pt-4'])
    wrapper.unmount()
  })

  it('strips script and handlers from the html title, message title and message (sec-html-sanitize)', async () => {
    const wrapper = await mountKit(BasicModal, {
      props: {
        title: 'T<img src=x onerror=alert(1)>',
        messageTitle: '<b>Bold</b><script>alert(1)</script>',
        message: '<a href="javascript:alert(1)" onclick="alert(1)">x</a><span style="display: none; position: fixed">y</span>',
        buttons,
      },
    })
    const html = wrapper.html()
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('script').exists()).toBe(false)
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('<b>Bold</b>')
    expect(html).toContain('style="display: none"')
    wrapper.unmount()
  })

  it('defaults the icon colour to primary', async () => {
    const wrapper = await mountKit(BasicModal, { props: { title: 'T', icon: '$alertcircle' } })
    expect(wrapper.get('.v-card-title h6 .v-icon').classes()).toContain('text-primary')
    wrapper.unmount()
  })

  it('shows the progress log and the message loader', async () => {
    const wrapper = await mountKit(BasicModal, {
      props: { title: 'T', submittingProgressLog: 'step 1\nstep 2', messageLoader: true },
    })
    expect(wrapper.get('pre').text()).toBe('step 1\nstep 2')
    const loader = wrapper.get('.v-card-text .mb-7.text-center .loader')
    expect(loader.find('.v-icon').exists()).toBe(true)
    wrapper.unmount()
  })

  it('renders an internal affix link as router-link and an external one as a', async () => {
    const internal = await mountKit(BasicModal, {
      props: { title: 'T', affixLink: { url: '/help', message: 'Help' } },
    })
    const link = internal.get('.v-card-text router-link-stub, .v-card-text router-link')
    expectLegacyClasses(link.element, ['text-info'])
    expect(link.attributes('to')).toBe('/help')
    expect(link.text()).toBe('Help')
    internal.unmount()

    const external = await mountKit(BasicModal, {
      props: { title: 'T', affixLink: { external: true, url: 'https://example.com', message: 'Docs' } },
    })
    const anchor = external.get('.v-card-text a')
    expectLegacyClasses(anchor.element, ['text-info'])
    expect(anchor.attributes('href')).toBe('https://example.com')
    external.unmount()

    const hidden = await mountKit(BasicModal, {
      props: { title: 'T', affixLink: { external: true, hidden: true, url: 'https://example.com', message: 'Docs' } },
    })
    expect(hidden.find('.v-card-text a').exists()).toBe(false)
    hidden.unmount()
  })

  it('wraps the default slot in a d-flex flex-column form and renders the custom slot before it', async () => {
    const wrapper = await mountKit(BasicModal, {
      props: { title: 'T' },
      slots: {
        custom: '<div class="custom-part">custom</div>',
        default: '<div class="field-part">field</div>',
      },
    })
    const form = wrapper.get('form.v-form')
    expectLegacyClasses(form.element, ['d-flex', 'flex-column'])
    expect(form.find('.field-part').exists()).toBe(true)
    const html = wrapper.get('.v-card-text').html()
    expect(html.indexOf('custom-part')).toBeLessThan(html.indexOf('<form'))
    wrapper.unmount()
  })

  it('emits modal-close from the X button, which is hidden while submitting', async () => {
    const wrapper = await mountKit(BasicModal, { props: { title: 'T' } })
    await wrapper.get('.v-card-title .v-btn').trigger('click')
    expect(wrapper.emitted('modal-close')).toHaveLength(1)
    await wrapper.setProps({ submitting: true })
    expect(wrapper.find('.v-card-title .v-btn').exists()).toBe(false)
    wrapper.unmount()
  })

  it('emits button-click with the id, and not while submitting or for a disabled button', async () => {
    const wrapper = await mountKit(BasicModal, {
      props: { title: 'T', buttons: [...buttons, { id: 'off', label: 'Off', color: 'error', disabled: true }] },
    })
    const clicks = wrapper.findAll('.v-card-actions .v-btn')
    await clicks[0]!.trigger('click')
    await clicks[1]!.trigger('click')
    await clicks[2]!.trigger('click')
    expect(wrapper.emitted('button-click')).toEqual([['submit'], ['cancel']])
    await wrapper.setProps({ submitting: true, loadingMode: undefined })
    await clicks[1]!.trigger('click')
    expect(wrapper.emitted('button-click')).toHaveLength(2)
    wrapper.unmount()
  })

  it('shows the submitting state on the buttons (default mode)', async () => {
    const wrapper = await mountKit(BasicModal, { props: { title: 'T', buttons, submitting: true } })
    const [submit, cancel] = wrapper.findAll('.v-card-actions .v-btn')
    expectLegacyClasses(submit!.element, ['v-btn--loading'])
    expect(submit!.find('.loader').exists()).toBe(true)
    expect(cancel!.classes()).not.toContain('v-btn--loading')
    expect(cancel!.classes()).not.toContain('v-btn--disabled')
    wrapper.unmount()
  })

  it('shows the submitting state on the buttons (active mode)', async () => {
    const wrapper = await mountKit(BasicModal, {
      props: { title: 'T', buttons, submitting: true, loadingMode: 'active' },
    })
    const [submit, cancel] = wrapper.findAll('.v-card-actions .v-btn')
    expectLegacyClasses(submit!.element, ['v-btn--loading'])
    expectLegacyClasses(cancel!.element, ['v-btn--disabled'])
    wrapper.unmount()
  })

  it('disables the confirm-gated buttons until confirmed', async () => {
    const wrapper = await mountKit(BasicModal, { props: { title: 'T', buttons, confirmRequired: true } })
    const [submit, cancel] = wrapper.findAll('.v-card-actions .v-btn')
    expectLegacyClasses(submit!.element, ['v-btn--disabled'])
    expect(cancel!.classes()).not.toContain('v-btn--disabled')
    await wrapper.setProps({ confirmed: true })
    expect(submit!.classes()).not.toContain('v-btn--disabled')
    wrapper.unmount()
  })

  it('exposes validate() of the inner form and gives it to the default slot', async () => {
    // `$refs.form.validate()` of the legacy modal
    let slotValidate: (() => Promise<{ valid: boolean }>) | undefined
    const wrapper = await mountKit(BasicModal, {
      props: { title: 'T' },
      slots: {
        default: (slotProps: { validate: () => Promise<{ valid: boolean }> }) => {
          slotValidate = slotProps.validate
          return h(VTextField, { modelValue: '', rules: [(value: string) => !!value || 'required'] })
        },
      },
    })
    const exposed = wrapper.vm as unknown as { validate: () => Promise<{ valid: boolean }> }
    expect((await exposed.validate()).valid).toBe(false)
    expect((await slotValidate!()).valid).toBe(false)
    wrapper.unmount()

    const empty = await mountKit(BasicModal, { props: { title: 'T' } })
    expect((await (empty.vm as unknown as { validate: () => Promise<{ valid: boolean }> }).validate()).valid).toBe(true)
    empty.unmount()
  })

  it('keeps the DOM of the X button: an icon text button, not pushed right, with a 24px close icon after the heading', async () => {
    const wrapper = await mountKit(BasicModal, { props: { title: 'T' } })
    const title = wrapper.get('.v-card-title')
    const close = title.get('.v-btn')

    expect(close.classes()).toEqual(expect.arrayContaining(['v-btn--icon', 'v-btn--size-x-small', 'v-btn--variant-text']))
    expect(close.classes()).not.toContain('ml-auto')
    expect(title.element.lastElementChild).toBe(close.element)
    expect(title.element.firstElementChild!.tagName).toBe('H6')
    expect(close.find('.v-icon').attributes('style')).toContain('24px')
    // New with the kit dialog: the X is the kit `ModalCloseButton`, which labels it with `button.close`.
    expect(close.attributes('aria-label')).toBe('button.close')
    wrapper.unmount()
  })

  it('renders the title-append slot after the heading and before the close button (kit-dialog-hosting)', async () => {
    const wrapper = await mountKit(BasicModal, {
      props: { title: 'Logs', buttons },
      slots: { 'title-append': () => h('button', { class: 'refresh-probe' }, 'R') },
    })
    const children = [...wrapper.get('.v-card-title').element.children]
    const probe = wrapper.get('.v-card-title .refresh-probe').element
    expect(children.indexOf(probe)).toBe(1)
    expect(children[0]!.tagName).toBe('H6')
    expect(wrapper.get('.v-card-title').findAll('button')[0]!.classes()).toContain('refresh-probe')
    // The heading takes the free space, so the action stays at the right edge next to the X (as the Logs Refresh did before).
    expect(wrapper.get('.v-card-title h6').classes()).toContain('me-auto')
    wrapper.unmount()
  })

  it('renders only the heading and the close button in the title without the slot (kit-dialog-hosting)', async () => {
    const wrapper = await mountKit(BasicModal, { props: { title: 'Logs', buttons } })
    expect(wrapper.get('.v-card-title').element.children).toHaveLength(2)
    expect(wrapper.get('.v-card-title h6').classes()).not.toContain('me-auto')
    wrapper.unmount()
  })

  it('renders the footer buttons and the X with the kit AppButton (kit-dialog-account-reseller)', async () => {
    const wrapper = await mountKit(BasicModal, { props: { title: 'T', buttons } })
    // Two footer buttons and the X (`ModalCloseButton` is a preset over `AppButton`).
    expect(wrapper.findAllComponents(AppButton)).toHaveLength(3)
    wrapper.unmount()
  })

  it('renders the button hooks: test id, class, append icon, loading label and href (kit-dialog-account-reseller)', async () => {
    const wrapper = await mountKit(BasicModal, {
      props: {
        title: 'T',
        loading: true,
        buttons: [
          { id: 'go', label: 'Go', color: 'primary', testId: 'go-btn', buttonClass: 'go-hook', appendIcon: '$arrowright', loadingLabel: 'Going' },
          { id: 'link', label: 'Link', color: 'error', href: 'https://example.test/' },
        ],
      },
    })
    const go = wrapper.get('[data-testid="go-btn"]')
    expect(go.classes()).toEqual(expect.arrayContaining(['go-hook', 'v-btn--loading']))
    expect(go.get('.v-btn__loader').text()).toContain('Going')
    expect(go.get('.v-btn__loader .v-progress-circular').attributes('style')).toContain('width: 20px')
    expect(go.find('.v-btn__content .v-icon').exists()).toBe(true)
    const link = wrapper.get('a.v-btn')
    expect(link.attributes('href')).toBe('https://example.test/')
    expect(link.find('.v-btn__content .v-icon').exists()).toBe(false)
    wrapper.unmount()
  })

  it('sets the hooks of the X and the heading, and hides the X with closeVisible false (kit-dialog-account-reseller)', async () => {
    const wrapper = await mountKit(BasicModal, {
      props: { title: 'T', closeClass: { 'x-locked': true }, closeTestid: 'x-close', titleTestid: 'x-title' },
    })
    const close = wrapper.get('[data-testid="x-close"]')
    expect(close.classes()).toEqual(expect.arrayContaining(['modal-close-button', 'x-locked']))
    expect(wrapper.get('[data-testid="x-title"]').text()).toBe('T')
    await wrapper.setProps({ closeVisible: false })
    expect(wrapper.find('.modal-close-button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders the actions slot after the buttons (kit-dialog-account-reseller)', async () => {
    const wrapper = await mountKit(BasicModal, {
      props: { title: 'T', buttons },
      slots: { actions: () => h('button', { class: 'free-action' }, 'A') },
    })
    expect(wrapper.get('.v-card-actions').element.lastElementChild!.classList.contains('free-action')).toBe(true)
    expect(wrapper.findAll('.v-card-actions > div')).toHaveLength(2)
    wrapper.unmount()
  })
})

describe('BasicModal.scss, the title wraps between words', () => {
  const scss = readFileSync(join(import.meta.dirname, 'BasicModal.scss'), 'utf8')
  const block = /:deep\(\.v-card-title\)\s*\{([\s\S]*?)\.text-break-long\s*\{/.exec(scss)?.[1] ?? ''

  it('breaks a title between its words, inside one only when the word is longer than the line', () => {
    expect(block).toMatch(/word-break:\s*normal/)
    expect(block).toMatch(/overflow-wrap:\s*anywhere/)
    expect(block).not.toMatch(/word-break:\s*break-all/)
  })
})

describe('BasicModal.scss, name in the title (`text-break-long`, GitLab #8)', () => {
  const scss = readFileSync(join(import.meta.dirname, 'BasicModal.scss'), 'utf8')
  const block = /\.text-break-long\s*\{([^}]*)\}/.exec(scss)?.[1] ?? ''

  it('keeps the name one box: it moves whole to the next line and breaks only when longer than the line', () => {
    expect(block).toMatch(/display:\s*inline-block/)
    expect(block).toMatch(/max-width:\s*100%/)
    expect(block).toMatch(/overflow-wrap:\s*anywhere/)
  })
})

describe('BasicModal.scss, name in the item box (legacy `gray--text text--darken-1`)', () => {
  const scss = readFileSync(join(import.meta.dirname, 'BasicModal.scss'), 'utf8')

  it('paints the name of the rating box in gray darken1', () => {
    const block = /\.target-item-name\s*\{([^}]*)\}/.exec(scss)?.[1] ?? ''
    expect(block).toMatch(/color:\s*var\(--v-gray-darken1\)/)
  })
})
