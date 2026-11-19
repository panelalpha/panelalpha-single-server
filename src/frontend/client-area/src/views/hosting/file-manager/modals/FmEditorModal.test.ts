import type { FmFile } from '@/views/hosting/file-manager/file-manager.types'
import { EditorView } from '@codemirror/view'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as fmApi from '@/views/hosting/file-manager/file-manager.api'
import { useFileManagerStore } from '@/views/hosting/file-manager/file-manager.store'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import Loader from '@/shared/ui/loader/Loader.vue'
import { mountKit } from '@/test/mount-kit'
import FmEditorModal from './FmEditorModal.vue'

vi.mock('@/views/hosting/file-manager/file-manager.api', () => ({
  initialize: vi.fn(),
  content: vi.fn(),
  downloadText: vi.fn(),
  updateFile: vi.fn(),
}))

const ok = { status: 'success' as const, messageKey: null, message: null }
const failure = { status: 'error' as const, messageKey: null, message: 'Cannot update file.' }

function file (name: string, extension: string): FmFile {
  return { type: 'file', path: `docs/${name}`, basename: name, dirname: 'docs', filename: name, extension, size: 1, timestamp: 0 }
}

function deferred<T> () {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

function footerButton (key: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.basic-modal .v-btn')).find(button => button.textContent?.includes(key))
}

/** The CodeMirror view of the modal (the editor mounts after its language is loaded). */
async function editorView (): Promise<EditorView> {
  let dom: HTMLElement | null = null
  await vi.waitFor(() => {
    dom = document.querySelector<HTMLElement>('.cm-editor')
    expect(dom).not.toBeNull()
  })
  const view = EditorView.findFromDOM(dom!)
  if (!view) {
    throw new Error('no view for the editor element')
  }
  return view
}

/** Types at the end of the document, as the user does. */
async function typeAtEnd (text: string): Promise<void> {
  const view = await editorView()
  view.dispatch({ changes: { from: view.state.doc.length, insert: text } })
  await flushPromises()
}

function blobText (blob: Blob): Promise<string> {
  return blob.text()
}

describe('FmEditorModal', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.mocked(fmApi.downloadText).mockReset()
    vi.mocked(fmApi.updateFile).mockReset()
  })

  function setup (name: string, extension: string) {
    const store = useFileManagerStore()
    store.accountId = 7
    store.path = 'docs'
    store.files = [file(name, extension)]
    store.select(file(name, extension))
    return store
  }

  it('shows the loader and no editor until the text is read', async () => {
    const store = setup('notes.txt', 'txt')
    const read = deferred<fmApi.FmTextResult>()
    vi.mocked(fmApi.downloadText).mockReturnValue(read.promise)

    const wrapper = await mountKit(FmEditorModal, { global: { plugins: [pinia] } })
    await flushPromises()

    expect(fmApi.downloadText).toHaveBeenCalledWith(7, 'docs/notes.txt')
    expect(wrapper.findComponent(Loader).exists()).toBe(true)
    expect(document.querySelector('[data-testid="fm-editor-host"]')).toBeNull()
    expect(document.querySelector('[data-testid="fm-editor-name"]')?.textContent).toContain('notes.txt')

    read.resolve({ ok: true, text: 'hello' })
    await flushPromises()

    expect(wrapper.findComponent(Loader).exists()).toBe(false)
    expect(document.querySelector('[data-testid="fm-editor-host"]')).not.toBeNull()
    expect(store.activeModal).toBeNull()
    wrapper.unmount()
  })

  it('keeps Submit disabled until the text differs from the loaded one', async () => {
    setup('notes.txt', 'txt')
    vi.mocked(fmApi.downloadText).mockResolvedValue({ ok: true, text: 'hello' })
    const wrapper = await mountKit(FmEditorModal, { global: { plugins: [pinia] } })
    await editorView()

    expect(footerButton('button.submit')?.disabled).toBe(true)

    await typeAtEnd('!')
    expect(footerButton('button.submit')?.disabled).toBe(false)
    wrapper.unmount()
  })

  it('saves the edited text with the file name and closes after success', async () => {
    const store = setup('notes.txt', 'txt')
    vi.mocked(fmApi.downloadText).mockResolvedValue({ ok: true, text: 'hello' })
    vi.mocked(fmApi.updateFile).mockResolvedValue({ result: ok, data: null })
    vi.mocked(fmApi.content).mockResolvedValue({ result: ok, data: { directories: [], files: [] } })
    const wrapper = await mountKit(FmEditorModal, { global: { plugins: [pinia] } })
    await typeAtEnd('!')

    footerButton('button.submit')?.click()
    await flushPromises()

    expect(fmApi.updateFile).toHaveBeenCalledTimes(1)
    const [accountId, write] = vi.mocked(fmApi.updateFile).mock.calls[0]!
    expect(accountId).toBe(7)
    expect(write.dir).toBe('docs')
    expect(write.name).toBe('notes.txt')
    expect(await blobText(write.blob)).toBe('hello!')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(store.fileSaving).toBe(false)
    wrapper.unmount()
  })

  it('calls the save once even on a double click', async () => {
    const store = setup('notes.txt', 'txt')
    vi.mocked(fmApi.downloadText).mockResolvedValue({ ok: true, text: 'hello' })
    const write = deferred<fmApi.FmCall<null>>()
    vi.mocked(fmApi.updateFile).mockReturnValue(write.promise)
    const saveFile = vi.spyOn(store, 'saveFile')
    const wrapper = await mountKit(FmEditorModal, { global: { plugins: [pinia] } })
    await typeAtEnd('!')

    footerButton('button.submit')?.click()
    footerButton('button.submit')?.click()
    await flushPromises()

    expect(saveFile).toHaveBeenCalledTimes(1)
    expect(fmApi.updateFile).toHaveBeenCalledTimes(1)

    write.resolve({ result: ok, data: null })
    await flushPromises()
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('keeps the modal open and shows the alert when the save answers 200 with an error', async () => {
    setup('notes.txt', 'txt')
    vi.mocked(fmApi.downloadText).mockResolvedValue({ ok: true, text: 'hello' })
    vi.mocked(fmApi.updateFile).mockResolvedValue({ result: failure, data: null })
    const wrapper = await mountKit(FmEditorModal, { global: { plugins: [pinia] } })
    await typeAtEnd('!')

    footerButton('button.submit')?.click()
    await flushPromises()

    expect(useAlertsStore().activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'Cannot update file.' })
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(footerButton('button.submit')?.disabled).toBe(false)
    wrapper.unmount()
  })

  it('shows the read failure as an alert and closes the modal', async () => {
    setup('notes.txt', 'txt')
    vi.mocked(fmApi.downloadText).mockResolvedValue({ ok: false, result: { status: 'error', messageKey: null, message: 'No access.' } })
    const wrapper = await mountKit(FmEditorModal, { global: { plugins: [pinia] } })
    await flushPromises()

    expect(useAlertsStore().activeAlerts.at(-1)).toMatchObject({ success: false, errorMessage: 'No access.' })
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('saves a JSON file byte for byte, without reformatting it', async () => {
    setup('data.json', 'json')
    const original = '{"name":"a",\n    "list": [1,  2],\n"ok":true}\n'
    vi.mocked(fmApi.downloadText).mockResolvedValue({ ok: true, text: original })
    vi.mocked(fmApi.updateFile).mockResolvedValue({ result: ok, data: null })
    const wrapper = await mountKit(FmEditorModal, { global: { plugins: [pinia] } })
    await editorView()

    // Nothing changed: Submit stays disabled, so nothing is written (and nothing is reformatted).
    expect(footerButton('button.submit')?.disabled).toBe(true)

    await typeAtEnd(' ')
    footerButton('button.submit')?.click()
    await flushPromises()

    const [, write] = vi.mocked(fmApi.updateFile).mock.calls[0]!
    expect(await blobText(write.blob)).toBe(`${original} `)
    wrapper.unmount()
  })

  it('opens a file that is not UTF-8 read-only, with an alert and Submit disabled', async () => {
    setup('legacy.txt', 'txt')
    vi.mocked(fmApi.downloadText).mockResolvedValue({ ok: true, text: 'caf�' })
    const wrapper = await mountKit(FmEditorModal, { global: { plugins: [pinia] } })
    const view = await editorView()

    expect(view.state.readOnly).toBe(true)
    expect(document.body.textContent).toContain('message.fileManager.error.read')
    expect(footerButton('button.submit')?.disabled).toBe(true)
    wrapper.unmount()
  })

  it('closes without asking when the text was changed (Cancel)', async () => {
    setup('notes.txt', 'txt')
    vi.mocked(fmApi.downloadText).mockResolvedValue({ ok: true, text: 'hello' })
    const wrapper = await mountKit(FmEditorModal, { global: { plugins: [pinia] } })
    await typeAtEnd('!')

    footerButton('button.cancel')?.click()
    await flushPromises()

    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(fmApi.updateFile).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
