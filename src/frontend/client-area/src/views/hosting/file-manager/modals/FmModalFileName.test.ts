import { describe, expect, it } from 'vitest'
import { mountKit } from '@/test/mount-kit'
import FmModalFileName from './FmModalFileName.vue'

describe('FmModalFileName', () => {
  it('renders the file name as text, not as markup', async () => {
    const wrapper = await mountKit(FmModalFileName, { props: { name: '<b>notes.txt</b>' } })

    expect(wrapper.element.tagName).toBe('P')
    expect(wrapper.text()).toContain('<b>notes.txt</b>')
    expect(wrapper.find('b').exists()).toBe(false)
    wrapper.unmount()
  })

  it('passes attributes such as data-testid to its root', async () => {
    const wrapper = await mountKit(FmModalFileName, {
      props: { name: 'movie.mp4' },
      attrs: { 'class': 'fm-editor__name', 'data-testid': 'fm-editor-name' },
    })

    expect(wrapper.attributes('data-testid')).toBe('fm-editor-name')
    expect(wrapper.classes()).toContain('fm-editor__name')
    expect(wrapper.classes()).toContain('fm-modal-file-name')
    wrapper.unmount()
  })
})
