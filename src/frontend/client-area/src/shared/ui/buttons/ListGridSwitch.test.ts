import { describe, expect, it } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import ListGridSwitch from './ListGridSwitch.vue'

describe('ListGridSwitch', () => {
  it('marks the active style button and emits update:listStyle', async () => {
    const wrapper = await mountKit(ListGridSwitch, { props: { listStyle: 0 } })
    const [grid, list] = wrapper.findAll('button')
    expectLegacyClasses(grid!.element, ['ml-4', 'v-btn--icon', 'text-primary', 'v-btn--variant-outlined'])
    expectLegacyClasses(list!.element, ['ml-4', 'v-btn--icon', 'v-btn--variant-text'])
    expect(list!.classes()).not.toContain('text-primary')
    await list!.trigger('click')
    expect(wrapper.emitted('update:listStyle')?.[0]).toEqual([1])
    await grid!.trigger('click')
    expect(wrapper.emitted('update:listStyle')?.[1]).toEqual([0])
    wrapper.unmount()
  })

  it('adds button-disabled to both buttons when disabled and swaps the active one', async () => {
    const wrapper = await mountKit(ListGridSwitch, { props: { listStyle: 1, disabled: true } })
    const [grid, list] = wrapper.findAll('button')
    expect(grid!.classes()).toContain('button-disabled')
    expect(list!.classes()).toContain('button-disabled')
    expect(list!.classes()).toContain('text-primary')
    expect(grid!.classes()).not.toContain('text-primary')
    wrapper.unmount()
  })

  // Characterization of the markup: the DOM of both buttons stays as it was written by hand.
  it('renders both buttons with the legacy markup for each list style, on desktop and mobile, enabled and disabled', async () => {
    const width = window.innerWidth
    const markup: Record<string, string> = {}
    try {
      for (const mobile of [false, true]) {
        window.innerWidth = mobile ? 500 : 1600
        for (const listStyle of [0, 1]) {
          for (const disabled of [false, true]) {
            const wrapper = await mountKit(ListGridSwitch, { props: { listStyle, disabled } })
            const key = `${mobile ? 'mobile' : 'desktop'} listStyle=${listStyle} disabled=${disabled}`
            markup[key] = normalizeHtml(wrapper.html())
            wrapper.unmount()
          }
        }
      }
    } finally {
      window.innerWidth = width
    }
    expect(markup).toMatchInlineSnapshot(`
      {
        "desktop listStyle=0 disabled=false": "<div><button type="button" class="v-btn v-btn--icon v-theme--light text-primary v-btn--density-default v-btn--size-default v-btn--variant-outlined ml-4"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-default v-btn--variant-text ml-4"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div>",
        "desktop listStyle=0 disabled=true": "<div><button type="button" class="v-btn v-btn--icon v-theme--light text-primary v-btn--density-default v-btn--size-default v-btn--variant-outlined ml-4 button-disabled"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-default v-btn--variant-text ml-4 button-disabled"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div>",
        "desktop listStyle=1 disabled=false": "<div><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-default v-btn--variant-text ml-4"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light text-primary v-btn--density-default v-btn--size-default v-btn--variant-outlined ml-4"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div>",
        "desktop listStyle=1 disabled=true": "<div><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-default v-btn--variant-text ml-4 button-disabled"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light text-primary v-btn--density-default v-btn--size-default v-btn--variant-outlined ml-4 button-disabled"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div>",
        "mobile listStyle=0 disabled=false": "<div><button type="button" class="v-btn v-btn--icon v-theme--light text-primary v-btn--density-default v-btn--size-default v-btn--variant-outlined ml-2"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-default v-btn--variant-text ml-2"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div>",
        "mobile listStyle=0 disabled=true": "<div><button type="button" class="v-btn v-btn--icon v-theme--light text-primary v-btn--density-default v-btn--size-default v-btn--variant-outlined ml-2 button-disabled"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-default v-btn--variant-text ml-2 button-disabled"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div>",
        "mobile listStyle=1 disabled=false": "<div><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-default v-btn--variant-text ml-2"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light text-primary v-btn--density-default v-btn--size-default v-btn--variant-outlined ml-2"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div>",
        "mobile listStyle=1 disabled=true": "<div><button type="button" class="v-btn v-btn--icon v-theme--light v-btn--density-default v-btn--size-default v-btn--variant-text ml-2 button-disabled"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><div><svg></svg></div></i></span></button><button type="button" class="v-btn v-btn--icon v-theme--light text-primary v-btn--density-default v-btn--size-default v-btn--variant-outlined ml-2 button-disabled"><span class="v-btn__overlay"></span><span class="v-btn__underlay"></span><span class="v-btn__content" data-no-activator=""><i class="v-icon notranslate v-theme--light v-icon--size-default" aria-hidden="true"><svg></svg></i></span></button></div>",
      }
    `)
  })
})
