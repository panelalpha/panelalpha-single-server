import { flushPromises } from '@vue/test-utils'
import i18next from 'i18next'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/shared/session/session.store'
import { mountKit } from '@/test/mount-kit'
import OnboardingDeployFromZipModal from './OnboardingDeployFromZipModal.vue'

let host: HTMLDivElement
const translationCalls: Array<{ key: string, options?: Record<string, unknown> }> = []

/** The kit's `t` returns the key, so a `{{size}}` in the copy is proven by the call and its parameter. */
function recordTranslations (): void {
  const fixedT = i18next.getFixedT.bind(i18next)
  vi.spyOn(i18next, 'getFixedT').mockImplementation(((...args: unknown[]) => {
    const translate = fixedT(...(args as [never])) as unknown as (key: string, options?: Record<string, unknown>) => string
    return (key: string, options?: Record<string, unknown>) => {
      translationCalls.push({ key, options })
      return translate(key, options)
    }
  }) as never)
}

/** The parameters the modal passed for a key (the rendered text of the kit is the key itself). */
function translationOptions (key: string): Record<string, unknown> | undefined {
  return translationCalls.find(call => call.key === key)?.options
}

async function mountModal (props: Record<string, unknown> = {}, uploadMaxBytes?: number) {
  const pinia = createPinia()
  setActivePinia(pinia)
  if (uploadMaxBytes !== undefined) {
    useSessionStore().home = { app: { upload_max_bytes: uploadMaxBytes } } as never
  }
  host = document.createElement('div')
  document.body.append(host)
  return mountKit(OnboardingDeployFromZipModal, {
    props: { isOpen: true, ...props },
    attachTo: host,
    global: { plugins: [pinia] },
  })
}

function file (name: string): File {
  return new File(['x'], name)
}

function fileEntry (name: string): FileSystemEntry {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (resolve: (value: File) => void) => resolve(file(name)),
  } as unknown as FileSystemEntry
}

function directoryEntry (name: string, children: FileSystemEntry[]): FileSystemEntry {
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
      // Two batches, then the empty one that ends the read (as the browser does).
      const batches = [children, []]
      return { readEntries: (callback: (batch: FileSystemEntry[]) => void) => callback(batches.shift() ?? []) }
    },
  } as unknown as FileSystemEntry
}

/** A drop on the zone, carrying the entries a folder-aware browser offers. */
function dropOn (entries: FileSystemEntry[]): void {
  const zone = document.querySelector<HTMLElement>('[data-testid="onboarding-deploy-zip-drop-zone"]')
  if (!zone) {
    throw new Error('drop zone not found')
  }
  const event = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: ['Files'], files: [], items: entries.map(entry => ({ webkitGetAsEntry: () => entry })) },
  })
  zone.dispatchEvent(event)
}

/** A pick in the file input, as the picker hands it over. */
function pick (files: File[]): void {
  const input = document.querySelector<HTMLInputElement>('[data-testid="onboarding-deploy-zip-input"]')
  if (!input) {
    throw new Error('file input not found')
  }
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  input.dispatchEvent(new Event('change'))
}

function zoneElement (): HTMLElement {
  const zone = document.querySelector<HTMLElement>('[data-testid="onboarding-deploy-zip-drop-zone"]')
  if (!zone) {
    throw new Error('drop zone not found')
  }
  return zone
}

function inputElement (): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('[data-testid="onboarding-deploy-zip-input"]')
  if (!input) {
    throw new Error('file input not found')
  }
  return input
}

function dragEvent (type: 'dragenter' | 'dragleave' | 'dragover'): void {
  zoneElement().dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
}

/** A file entry whose read waits until `release()`: the zone stays in its reading state until then. */
function pendingFileEntry (name: string): { entry: FileSystemEntry, release: () => void } {
  const pending: { resolve?: (value: File) => void } = {}
  const entry = {
    isFile: true,
    isDirectory: false,
    name,
    file: (resolve: (value: File) => void) => {
      pending.resolve = resolve
    },
  } as unknown as FileSystemEntry
  return { entry, release: () => pending.resolve?.(file(name)) }
}

function continueButton (): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('button.continue'))
  if (!button) {
    throw new Error('continue button not found')
  }
  return button
}

function selectionLabels (): string[] {
  return [...document.querySelectorAll('.drop-zone__file span.text-truncate')].map(span => span.textContent?.trim() ?? '')
}

/** The error box is on screen. Its copy is a slot of the translation, which the test translation does not render. */
function errorBox (): Element | null {
  return document.querySelector('[data-testid="onboarding-deploy-zip-error"]')
}

/** The error key the modal shows (the component state; the box renders it through the translation slot). */
function errorKey (m: { vm: object }): string | null {
  return (m.vm as unknown as { errorMessage: string | null }).errorMessage
}

afterEach(() => {
  host?.remove()
  translationCalls.length = 0
  vi.restoreAllMocks()
})

describe('OnboardingDeployFromZipModal', () => {
  it('empty state: the drop zone, the what-can-upload hints and a disabled continue', async () => {
    await mountModal()

    expect(document.querySelector('[data-testid="onboarding-deploy-zip-drop-zone"]')?.textContent).toContain('heading.onboarding.zipDeploy.dropZone.title')
    expect(document.querySelector('.what-can-upload')?.textContent).toContain('heading.onboarding.zipDeploy.whatCanIUpload.title')
    expect(document.querySelectorAll('.what-can-upload__row')).toHaveLength(1)
    expect(document.querySelector('.selection-list')).toBeNull()
    expect(continueButton().disabled).toBe(true)
  })

  it('names the panel\'s upload limit before a file is picked, in the zone and in what-can-upload', async () => {
    recordTranslations()
    await mountModal()

    expect(translationOptions('heading.onboarding.zipDeploy.dropZone.hint')).toEqual({ size: '256 MB' })
    expect(translationOptions('heading.onboarding.zipDeploy.whatCanIUpload.backup.description')).toEqual({ size: '256 MB' })
  })

  it('names the limit the panel serves, not a fixed 256 MB', async () => {
    recordTranslations()
    await mountModal({}, 5 * 1024 * 1024)

    expect(translationOptions('heading.onboarding.zipDeploy.dropZone.hint')).toEqual({ size: '5 MB' })
  })

  it('filled state: the picked archive is listed, no add-more, continue is enabled', async () => {
    await mountModal()

    pick([file('site.zip')])
    await flushPromises()

    expect(selectionLabels()).toEqual(['site.zip'])
    expect(document.querySelector('.drop-zone__add-more')).toBeNull()
    expect(continueButton().disabled).toBe(false)
  })

  it('the picker takes archives only, one at a time', async () => {
    await mountModal()

    expect(inputElement().accept).toBe('.zip,.tar.gz,application/zip,application/x-zip-compressed,application/gzip,application/x-gzip')
    expect(inputElement().multiple).toBe(false)
  })

  it('limit reached: the hints go away and a second archive is refused', async () => {
    const m = await mountModal()

    pick([file('one.tar.gz')])
    await flushPromises()

    expect(document.querySelector('.what-can-upload')).toBeNull()

    pick([file('extra.zip')])
    await flushPromises()

    expect(selectionLabels()).toEqual(['one.tar.gz'])
    expect(errorKey(m)).toBe('heading.onboarding.zipDeploy.file.maxSelections')
  })

  it('a picked database file or other type is refused with the invalid-type error and adds nothing', async () => {
    const m = await mountModal()

    for (const name of ['notes.txt', 'dump.sql', 'dump.sql.gz', 'data.sqlite', 'data.db']) {
      pick([file(name)])
      await flushPromises()

      expect(selectionLabels()).toEqual([])
      expect(errorBox()).not.toBeNull()
      expect(errorKey(m)).toBe('heading.onboarding.zipDeploy.file.invalidType')
    }
    expect(continueButton().disabled).toBe(true)
  })

  it('a batch of two archives is refused with the max-selections error and adds nothing', async () => {
    const m = await mountModal()

    pick([file('a.zip'), file('b.zip')])
    await flushPromises()

    expect(selectionLabels()).toEqual([])
    expect(errorKey(m)).toBe('heading.onboarding.zipDeploy.file.maxSelections')
  })

  it('a dropped folder is refused with the invalid-type error and nothing is read from it', async () => {
    const m = await mountModal()

    dropOn([directoryEntry('site', [fileEntry('index.php')])])
    await flushPromises()

    expect(errorBox()).not.toBeNull()
    expect(errorKey(m)).toBe('heading.onboarding.zipDeploy.file.invalidType')
    expect(selectionLabels()).toEqual([])
    expect(continueButton().disabled).toBe(true)
  })

  it('emits the one archive', async () => {
    const m = await mountModal()

    pick([file('site.zip')])
    await flushPromises()
    continueButton().click()
    await flushPromises()

    const payload = m.emitted('next')?.[0]?.[0] as { uploadItems: File[] }
    expect(payload.uploadItems.map(item => item.name)).toEqual(['site.zip'])
    expect(payload.uploadItems.every(item => item instanceof File)).toBe(true)
  })

  it('removing the selection empties the list and disables continue', async () => {
    const m = await mountModal()

    pick([file('a.zip')])
    await flushPromises()
    document.querySelector<HTMLButtonElement>('.drop-zone__file button')?.click()
    await flushPromises()

    expect(selectionLabels()).toEqual([])
    expect(continueButton().disabled).toBe(true)
    expect(m.emitted('next')).toBeUndefined()
  })

  it('highlights the zone while a drag is over it, across child nodes', async () => {
    await mountModal()

    dragEvent('dragenter')
    dragEvent('dragenter')
    dragEvent('dragleave')
    await flushPromises()
    expect(zoneElement().classList.contains('drop-zone--active')).toBe(true)

    dragEvent('dragleave')
    await flushPromises()
    expect(zoneElement().classList.contains('drop-zone--active')).toBe(false)
  })

  it('loading: the empty zone is disabled and ignores clicks, drags and drops', async () => {
    await mountModal({ loading: true })
    const click = vi.spyOn(inputElement(), 'click').mockReturnValue(undefined)

    expect(zoneElement().classList.contains('drop-zone--disabled')).toBe(true)
    zoneElement().click()
    dragEvent('dragenter')
    dropOn([fileEntry('site.zip')])
    await flushPromises()

    expect(click).not.toHaveBeenCalled()
    expect(zoneElement().classList.contains('drop-zone--active')).toBe(false)
    expect(selectionLabels()).toEqual([])
  })

  it('loading with files: the remove button waits', async () => {
    const m = await mountModal()
    pick([file('a.zip')])
    await flushPromises()
    await m.setProps({ loading: true })

    expect([...document.querySelectorAll<HTMLButtonElement>('.drop-zone__file button')].every(button => button.disabled)).toBe(true)
  })

  it('reading a drop: the spinner and the reading class stay until the entries are read', async () => {
    await mountModal()
    const pending = pendingFileEntry('site.zip')

    dropOn([pending.entry])
    await flushPromises()
    expect(zoneElement().classList.contains('drop-zone--reading')).toBe(true)
    expect(zoneElement().querySelector('.v-progress-circular')).not.toBeNull()

    pending.release()
    await flushPromises()
    expect(zoneElement().classList.contains('drop-zone--reading')).toBe(false)
    expect(selectionLabels()).toEqual(['site.zip'])
  })
})
