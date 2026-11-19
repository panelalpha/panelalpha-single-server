import type { FmDirectory, FmFile } from '@/views/hosting/file-manager/file-manager.types'
import { flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { formatBytes } from '@/shared/format/format-bytes'
import { formatDate } from '@/shared/time/date-format'
import { mountKit } from '@/test/mount-kit'
import FmPropertiesModal from './FmPropertiesModal.vue'

const notes: FmFile = {
  type: 'file',
  path: 'docs/notes.txt',
  basename: 'notes.txt',
  dirname: 'docs',
  filename: 'notes',
  extension: 'txt',
  size: 2048,
  timestamp: 1_700_000_000,
}

const folder: FmDirectory = { type: 'dir', path: 'docs', basename: 'docs', dirname: '', timestamp: 1_700_000_000 }

function field (key: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-testid="fm-properties-${CSS.escape(key)}"]`)
}

describe('FmPropertiesModal', () => {
  it('shows the name, the path, the size and the date of a file', async () => {
    const wrapper = await mountKit(FmPropertiesModal, { props: { item: notes }, global: { plugins: [createPinia()] } })
    await flushPromises()

    expect(field('name')?.textContent).toContain('notes.txt')
    expect(field('path')?.textContent).toContain('docs/notes.txt')
    expect(field('size')?.textContent).toContain(formatBytes(2048))
    expect(field('modified')?.textContent).toContain(formatDate(1_700_000_000_000, { time: true }))
    wrapper.unmount()
  })

  it('leaves out the size of a folder', async () => {
    const wrapper = await mountKit(FmPropertiesModal, { props: { item: folder }, global: { plugins: [createPinia()] } })
    await flushPromises()

    expect(field('name')?.textContent).toContain('docs')
    expect(field('size')).toBeNull()
    expect(field('modified')).not.toBeNull()
    wrapper.unmount()
  })
})
