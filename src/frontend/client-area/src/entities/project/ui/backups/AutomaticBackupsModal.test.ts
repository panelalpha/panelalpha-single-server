import { flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import AutomaticBackupsModal from '@/entities/project/ui/backups/AutomaticBackupsModal.vue'
import { mountKit } from '@/test/mount-kit'

/** Mounts the modal on the body (the dialog is teleported) so the label of a card activates its radio, as in the browser. */
async function mountModal () {
  const host = document.createElement('div')
  document.body.append(host)
  const wrapper = await mountKit(AutomaticBackupsModal, {
    props: { instanceId: 1, open: true, settings: { frequency: 'daily' } },
    attachTo: host,
    global: { plugins: [createPinia()] },
  })
  await flushPromises()
  return { wrapper, host }
}

function radiosOf (group: HTMLElement | null): HTMLInputElement[] {
  return [...(group?.querySelectorAll<HTMLInputElement>('input[type=radio]') ?? [])]
}

describe('AutomaticBackupsModal schedule choices', () => {
  it('offers the frequency as the radios of one named group, labelled by its field label', async () => {
    const { wrapper, host } = await mountModal()

    const group = document.body.querySelector<HTMLElement>('[aria-labelledby="automatic-backups-frequency-label"]')
    expect(group?.getAttribute('role')).toBe('radiogroup')
    expect(document.querySelector('#automatic-backups-frequency-label')?.textContent).toContain('form.label.howOften')

    const radios = radiosOf(group)
    expect(radios.map(radio => radio.value)).toEqual(['daily', 'weekly', 'monthly'])
    expect(new Set(radios.map(radio => radio.name))).toEqual(new Set(['automatic-backups-frequency']))
    expect(radios[0]?.checked).toBe(true)

    wrapper.unmount()
    host.remove()
  })

  it('selects a frequency from the radio and shows the weekday group as radios of its own name', async () => {
    const { wrapper, host } = await mountModal()

    // What Space or an arrow key does on a native radio group: activate the radio itself.
    radiosOf(document.body.querySelector('[aria-labelledby="automatic-backups-frequency-label"]'))[1]?.click()
    await flushPromises()

    const checked = [...document.body.querySelectorAll<HTMLElement>('.checkbox-big--checked')]
    expect(checked).toHaveLength(1)
    expect(checked[0]?.textContent).toContain('form.option.frequency.weekly')

    const days = document.body.querySelector<HTMLElement>('[aria-labelledby="automatic-backups-weekday-label"]')
    expect(days?.getAttribute('role')).toBe('radiogroup')
    const dayRadios = radiosOf(days)
    expect(dayRadios.map(radio => radio.value)).toEqual([
      'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    ])
    expect(new Set(dayRadios.map(radio => radio.name))).toEqual(new Set(['automatic-backups-weekday']))

    dayRadios[4]?.click()
    await flushPromises()
    const fridays = [...(days?.querySelectorAll<HTMLElement>('.checkbox-big--checked') ?? [])]
    expect(fridays).toHaveLength(1)
    expect(fridays[0]?.textContent).toContain('form.option.days.friday')

    wrapper.unmount()
    host.remove()
  })
})
