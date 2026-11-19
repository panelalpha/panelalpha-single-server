import { describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import ProgressCard from './ProgressCard.vue'

describe('ProgressCard', () => {
  it('renders the legacy image box and working state by default', async () => {
    // `installation-card__image` + `--working` of the app-lite installation modal
    const wrapper = await mountKit(ProgressCard)
    expectLegacyClasses(wrapper.get('.progress-card__image').element, ['progress-card__image', 'progress-card__image--working', 'mt-8'])
    expect(wrapper.get('.progress-card__image .v-progress-circular').classes()).toContain('v-progress-circular--indeterminate')
    expect(wrapper.find('.progress-card__actions').exists()).toBe(false)
    wrapper.unmount()
  })

  it('maps the bar status to the success and error modifiers', async () => {
    const success = await mountKit(ProgressCard, { props: { status: 'success' } })
    expect(success.get('.progress-card__image').classes()).toContain('progress-card__image--success')
    expect(success.get('.progress-card__image .v-progress-circular').classes()).not.toContain('v-progress-circular--indeterminate')
    success.unmount()

    const failed = await mountKit(ProgressCard, { props: { status: 'failed' } })
    expect(failed.get('.progress-card__image').classes()).toContain('progress-card__image--error')
    expect(failed.get('.progress-card__image').classes()).not.toContain('progress-card__image--success')
    failed.unmount()
  })

  it('places title, subtitle, logo, bar content, media and actions in their slots', async () => {
    const wrapper = await mountKit(ProgressCard, {
      props: { status: 'in-progress' },
      slots: {
        logo: '<span class="logo-slot">L</span>',
        title: '<span class="title-slot">Creating</span>',
        subtitle: '<span class="subtitle-slot">Live hint</span>',
        default: '<span class="bar-slot">B</span>',
        media: '<span class="media-slot">M</span>',
        actions: '<button class="action-slot">Back</button>',
      },
    })
    expectLegacyClasses(wrapper.get('.progress-card__logo').element, ['progress-card__logo', 'd-flex', 'justify-center'])
    expect(wrapper.get('h1.progress-card__title .title-slot').text()).toBe('Creating')
    expect(wrapper.get('.progress-card__subtitle .subtitle-slot').text()).toBe('Live hint')
    expect(wrapper.get('.progress-card__image .loader .bar-slot').text()).toBe('B')
    expect(wrapper.get('.progress-card__image > .media-slot').text()).toBe('M')
    expect(wrapper.get('.progress-card__actions .action-slot').text()).toBe('Back')
    wrapper.unmount()
  })

  it('applies the brand, bare and generic-title variants and hides the bar box on request', async () => {
    // The app-lite setup-complete import modal: no `.installation-card__image` rules, generic h1, bar hidden on success.
    const variants = await mountKit(ProgressCard, { props: { barTone: 'brand', bare: true, genericTitle: true } })
    const image = variants.get('.progress-card__image').classes()
    expect(image).toContain('progress-card__image--brand')
    expect(image).toContain('progress-card__image--bare')
    expect(variants.get('h1').classes()).toContain('progress-card__title--h1')
    expect(variants.get('h1').classes()).not.toContain('progress-card__title')
    variants.unmount()

    const hidden = await mountKit(ProgressCard, { props: { showImage: false } })
    expect(hidden.find('.progress-card__image').exists()).toBe(false)
    hidden.unmount()
  })

  it('omits the logo wrapper when no logo slot is given', async () => {
    const wrapper = await mountKit(ProgressCard)
    expect(wrapper.find('.progress-card__logo').exists()).toBe(false)
    wrapper.unmount()
  })
})
