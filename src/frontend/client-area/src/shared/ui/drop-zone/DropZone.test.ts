import { describe, expect, it, vi } from 'vitest'
import { expectLegacyClasses } from '@/test/legacy-classes'
import { mountKit } from '@/test/mount-kit'
import DropZone from './DropZone.vue'

const base = { accept: '.zip,.tar.gz', title: 'Drop title', hint: 'Drop hint' }

function file (name: string): File {
  return new File(['x'], name)
}

describe('DropZone', () => {
  it('renders the empty zone with the hidden picker', async () => {
    const wrapper = await mountKit(DropZone, { props: base })
    expect(wrapper.classes()).toEqual(['drop-zone'])
    const input = wrapper.get('input[type=file]')
    expect(input.attributes('accept')).toBe('.zip,.tar.gz')
    expect(input.attributes('multiple')).toBeUndefined()
    expectLegacyClasses(input.element, ['d-none'])
    expectLegacyClasses(wrapper.get('.drop-zone__title').element, ['p-2', 'font-weight-medium', 'mb-1'])
    expect(wrapper.get('.drop-zone__title').text()).toBe('Drop title')
    expectLegacyClasses(wrapper.get('.drop-zone__hint').element, ['caption', 'text-gray-darken-1', 'mb-0', 'text-center'])
    expect(wrapper.get('.drop-zone__hint').text()).toBe('Drop hint')
    expect(wrapper.find('.selection-list').exists()).toBe(false)
    expect(wrapper.find('.v-progress-circular').exists()).toBe(false)
  })

  it('opens the picker on a click and emits the picked files after clearing the input', async () => {
    const wrapper = await mountKit(DropZone, { props: base })
    const input = wrapper.get('input[type=file]').element as HTMLInputElement
    const click = vi.spyOn(input, 'click').mockReturnValue(undefined)
    const setValue = vi.fn()
    Object.defineProperty(input, 'value', { configurable: true, get: () => '', set: setValue })

    await wrapper.trigger('click')
    expect(click).toHaveBeenCalledTimes(1)

    const zip = file('a.zip')
    Object.defineProperty(input, 'files', { value: [zip], configurable: true })
    await wrapper.get('input[type=file]').trigger('change')
    expect(wrapper.emitted('files')).toEqual([[[zip], null]])
    expect(setValue).toHaveBeenCalledWith('')

    Object.defineProperty(input, 'files', { value: [], configurable: true })
    await wrapper.get('input[type=file]').trigger('change')
    expect(wrapper.emitted('files')).toHaveLength(1)
  })

  it('does not reach the zone with a click of its own input', async () => {
    const wrapper = await mountKit(DropZone, { props: base })
    const input = wrapper.get('input[type=file]')
    const click = vi.spyOn(input.element as HTMLInputElement, 'click').mockReturnValue(undefined)
    await input.trigger('click')
    expect(click).not.toHaveBeenCalled()
  })

  it('keeps the highlight across child nodes and emits a drop with its transfer', async () => {
    const wrapper = await mountKit(DropZone, { props: base })
    await wrapper.trigger('dragenter')
    await wrapper.trigger('dragenter')
    await wrapper.trigger('dragleave')
    expect(wrapper.classes()).toContain('drop-zone--active')
    expect(wrapper.get('.v-icon').classes()).toContain('text-primary')
    await wrapper.trigger('dragleave')
    expect(wrapper.classes()).not.toContain('drop-zone--active')

    await wrapper.trigger('dragover')
    const zip = file('a.zip')
    const transfer = { files: [zip] }
    await wrapper.trigger('drop', { dataTransfer: transfer })
    expect(wrapper.classes()).not.toContain('drop-zone--active')
    expect(wrapper.emitted('files')).toEqual([[[zip], transfer]])
  })

  it('disabled: no picker, no highlight, no drop, and --disabled on the empty zone', async () => {
    const wrapper = await mountKit(DropZone, { props: { ...base, disabled: true } })
    const click = vi.spyOn(wrapper.get('input[type=file]').element as HTMLInputElement, 'click').mockReturnValue(undefined)
    expect(wrapper.classes()).toEqual(['drop-zone', 'drop-zone--disabled'])
    await wrapper.trigger('click')
    await wrapper.trigger('dragenter')
    await wrapper.trigger('drop', { dataTransfer: { files: [file('a.zip')] } })
    expect(click).not.toHaveBeenCalled()
    expect(wrapper.classes()).not.toContain('drop-zone--active')
    expect(wrapper.emitted('files')).toBeUndefined()
  })

  it('reading an empty zone shows the spinner instead of the title', async () => {
    const wrapper = await mountKit(DropZone, { props: { ...base, reading: true } })
    expect(wrapper.classes()).toContain('drop-zone--reading')
    expect(wrapper.find('.v-progress-circular').exists()).toBe(true)
    expect(wrapper.find('.drop-zone__title').exists()).toBe(false)
  })

  it('one file: the row with its label and remove button; a row click does not open the picker', async () => {
    const wrapper = await mountKit(DropZone, {
      props: { ...base, items: [{ id: 'file', label: 'site.zip' }], labelTestid: 'name', removeTestid: 'clear' },
    })
    const click = vi.spyOn(wrapper.get('input[type=file]').element as HTMLInputElement, 'click').mockReturnValue(undefined)
    expect(wrapper.classes()).toEqual(['drop-zone', 'drop-zone--filled'])
    const row = wrapper.get('.selection-list .drop-zone__file')
    expectLegacyClasses(row.element, ['d-flex', 'align-center'])
    expect(wrapper.find('.selection-list__item').exists()).toBe(false)
    expect(wrapper.get('[data-testid="name"]').text()).toBe('site.zip')
    expect(wrapper.find('.drop-zone__add-more').exists()).toBe(false)
    await row.trigger('click')
    expect(click).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="clear"]').trigger('click')
    expect(wrapper.emitted('remove')).toEqual([['file']])
    expect(click).not.toHaveBeenCalled()
  })

  it('many files: rows, add-more opens the picker, disabled and removeDisabled lock the buttons', async () => {
    const items = [{ id: 's1', label: 'site', icon: '$folder' }, { id: 's2', label: 'db.sql' }]
    const wrapper = await mountKit(DropZone, { props: { ...base, items, multiple: true, addMoreLabel: 'Add more' } })
    const click = vi.spyOn(wrapper.get('input[type=file]').element as HTMLInputElement, 'click').mockReturnValue(undefined)
    expect(wrapper.get('input[type=file]').attributes('multiple')).toBeDefined()
    expect(wrapper.findAll('.selection-list__item').map(row => row.text())).toEqual(['site', 'db.sql'])
    expect(wrapper.find('.drop-zone__file').exists()).toBe(false)
    await wrapper.get('.drop-zone__add-more').trigger('click')
    expect(click).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ disabled: true, removeDisabled: true, reading: true })
    expect(wrapper.classes()).not.toContain('drop-zone--disabled')
    expect((wrapper.get('.drop-zone__add-more').element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.find('.drop-zone__add-more .v-progress-circular').exists()).toBe(true)
    expect(wrapper.findAll('.selection-list__item button').every(button => (button.element as HTMLButtonElement).disabled)).toBe(true)

    await wrapper.setProps({ addMoreLabel: undefined })
    expect(wrapper.find('.drop-zone__add-more').exists()).toBe(false)
  })
})
