import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { expectLegacyClasses } from './legacy-classes'
import { mountKit } from './mount-kit'

describe('mountKit', () => {
  let host: HTMLDivElement | undefined

  afterEach(() => {
    host?.remove()
    host = undefined
  })

  it('mounts with Vuetify and identity i18n', async () => {
    const WithT = defineComponent({
      template: '<div class="kit-smoke d-flex">{{ $t("tooltip.copy") }}</div>',
    })
    const wrapper = await mountKit(WithT)
    expectLegacyClasses(wrapper.element, ['kit-smoke', 'd-flex'])
    expect(wrapper.text()).toBe('tooltip.copy')
    wrapper.unmount()
  })

  it('opens a v-menu and finds teleported content with attachTo', async () => {
    host = document.createElement('div')
    document.body.append(host)

    const MenuSmoke = defineComponent({
      template: `
        <v-menu>
          <template #activator="{ props: menuProps }">
            <button type="button" v-bind="menuProps">Open</button>
          </template>
          <div class="menu-smoke-content">teleported-kit</div>
        </v-menu>
      `,
    })

    const wrapper = await mountKit(MenuSmoke, { attachTo: host })
    await wrapper.get('button').trigger('click')
    await nextTick()

    const teleported = document.body.querySelector('.menu-smoke-content')
    expect(teleported).not.toBeNull()
    expect(teleported?.textContent).toContain('teleported-kit')

    wrapper.unmount()
  })

  // The next two tests run in order: the first leaves its wrapper mounted, as a test whose
  // assertion threw before `unmount()` would; the second proves the afterEach cleaned it up.
  it('leaves a wrapper mounted in document.body', async () => {
    const Leaky = defineComponent({ template: '<div class="leaky-kit">leak</div>' })
    await mountKit(Leaky, { attachTo: document.body })
    expect(document.body.querySelector('.leaky-kit')).not.toBeNull()
  })

  it('auto-unmounts wrappers a test left mounted', () => {
    expect(document.body.querySelector('.leaky-kit')).toBeNull()
  })
})
