import type { FmClipboard, FmConfig, FmContent, FmDirectory, FmFile, FmItemRef, FmModal, FmSelection, FmTreeNode, FmView } from './file-manager.types'
import type { FmResult } from './fm-response'
import type { FmSort, FmSortField } from './fm-sort'
import i18next from 'i18next'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { useAlertsStore } from '@/shared/alerts/alerts.store'
import * as fmApi from './file-manager.api'
import { joinPath, normalizePath, ROOT_PATH } from './fm-path'
import { fmAlertPayload, fmResultText } from './fm-response'
import { DEFAULT_SORT, nextSort, sortEntries } from './fm-sort'
import { clearThumbnailCache } from './fm-thumbnail-cache'

function translate (key: string): string {
  return String(i18next.t(key))
}

/**
 * State of the native File Manager (replaces the Vuex `fm` module of legacy). One instance per open File Manager page.
 * Every navigation fetches the folder again (no response cache). Responses of an older account are dropped.
 */
export const useFileManagerStore = defineStore('fileManager', () => {
  const accountId = ref<number | null>(null)
  const config = ref<FmConfig | null>(null)
  const path = ref(ROOT_PATH)
  const history = ref<string[]>([ROOT_PATH])
  const historyPointer = ref(0)
  // Whole lists replaced on every load, items never edited in place: no deep proxies for folders with thousands of entries.
  const directories = shallowRef<FmDirectory[]>([])
  const files = shallowRef<FmFile[]>([])
  const selection = ref<FmSelection>({ directories: [], files: [] })
  const sort = ref<FmSort>({ ...DEFAULT_SORT })
  const view = ref<FmView>('table')
  const showHidden = ref(true)
  /** Name filter of the current folder (case-insensitive, no API). A new folder clears it, a new term clears the selection. */
  const searchTerm = ref('')
  const clipboard = ref<FmClipboard | null>(null)
  const errors = ref<string[]>([])
  /** The text of the last failed folder change, so the modal that stays open on it shows the reason next to its fields. */
  const actionError = ref<string | null>(null)
  const loading = ref(0)
  const tree = ref<Record<string, FmTreeNode>>({})
  /** The open modal, or null. Modals are mounted by the screen only while open. */
  const activeModal = ref<FmModal | null>(null)
  /** True while `saveFile` writes; a second save is rejected meanwhile. */
  const fileSaving = ref(false)

  /** Bumped by `reset`: a response that started before the reset is ignored. */
  let generation = 0
  /** Bumped by every navigation (`goTo`, `back`, `forward`): only the response of the latest one is applied; a `refresh` started earlier is dropped too. */
  let navigation = 0

  /** A dot-file is hidden when `showHidden` is off. */
  const visibleDirectories = computed(() => {
    const list = filterEntries(directories.value)
    return sortEntries(list, [], sort.value).directories
  })
  const visibleFiles = computed(() => {
    const list = filterEntries(files.value)
    return sortEntries([], list, sort.value).files
  })

  /** Hidden-file filter and name search, one pass over the list. */
  function filterEntries<T extends { basename: string }> (list: T[]): T[] {
    const needle = searchTerm.value.trim().toLowerCase()
    if (showHidden.value && needle === '') {
      return list
    }
    return list.filter(item => (showHidden.value || !item.basename.startsWith('.'))
      && (needle === '' || item.basename.toLowerCase().includes(needle)))
  }

  // One lookup per row instead of `Array.includes` over the whole selection.
  const selectedDirectoryPaths = computed(() => new Set(selection.value.directories))
  const selectedFilePaths = computed(() => new Set(selection.value.files))

  function isSelected (item: FmDirectory | FmFile): boolean {
    return item.type === 'dir' ? selectedDirectoryPaths.value.has(item.path) : selectedFilePaths.value.has(item.path)
  }

  /** The selected folders, then the selected files. */
  const selectedItems = computed<(FmDirectory | FmFile)[]>(() => [
    ...directories.value.filter(item => selection.value.directories.includes(item.path)),
    ...files.value.filter(item => selection.value.files.includes(item.path)),
  ])

  function pushError (result: FmResult): void {
    const text = fmResultText(result, translate)
    if (text !== null) {
      errors.value = [...errors.value, text]
    }
  }

  /**
   * Result of an action: the text becomes an alert, and an error is also kept in `errors` for the status.
   */
  function notify (result: FmResult): void {
    const payload = fmAlertPayload(result, translate)
    if (payload !== null) {
      useAlertsStore().addAlert(payload)
    }
    if (result.status === 'error') {
      pushError(result)
    }
  }

  async function track<T> (run: () => Promise<T>): Promise<T> {
    loading.value += 1
    try {
      return await run()
    } finally {
      loading.value -= 1
    }
  }

  /** The content of one folder, or null when the request failed or the account changed meanwhile. */
  async function fetchContent (target: string): Promise<FmContent | null> {
    const id = accountId.value
    if (id === null) {
      return null
    }
    const token = generation
    const response = await track(() => fmApi.content(id, target))
    if (token !== generation) {
      return null
    }
    if (response.result.status === 'error') {
      notify(response.result)
      return null
    }
    return response.data
  }

  function applyContent (target: string, content: FmContent): void {
    if (target !== path.value) {
      searchTerm.value = ''
    }
    path.value = target
    directories.value = content.directories
    files.value = content.files
    selection.value = { directories: [], files: [] }
    sort.value = { ...DEFAULT_SORT }
  }

  /** Sets the children of one folder in the tree. The root is expanded; other folders keep their state. */
  function applyTree (target: string, content: FmContent, expanded?: boolean): void {
    const previous = tree.value[target]
    tree.value = {
      ...tree.value,
      [target]: {
        children: content.directories,
        expanded: expanded ?? previous?.expanded ?? target === ROOT_PATH,
        loaded: true,
      },
    }
  }

  /** Reloads the children of one folder in the tree. */
  async function loadTree (target: string, expanded?: boolean): Promise<void> {
    const token = generation
    const content = await fetchContent(target)
    if (token !== generation || content === null) {
      return
    }
    applyTree(target, content, expanded)
  }

  /**
   * Opens the File Manager of one account: reset, `initialize`, the home folder and the root of the tree.
   */
  async function open (id: number): Promise<void> {
    reset()
    accountId.value = id
    const token = generation
    const response = await track(() => fmApi.initialize(id))
    if (token !== generation) {
      return
    }
    if (response.result.status === 'error') {
      notify(response.result)
      return
    }
    config.value = response.data?.config ?? null
    await goTo(ROOT_PATH, { history: false })
    await loadTree(ROOT_PATH, true)
  }

  /** Opens a folder. `history: true` records it after the current entry and drops the forward entries. */
  async function goTo (target: string, { history: record = true }: { history?: boolean } = {}): Promise<void> {
    const normalized = normalizePath(target)
    navigation += 1
    const request = navigation
    const content = await fetchContent(normalized)
    if (content === null || request !== navigation) {
      return
    }
    applyContent(normalized, content)
    if (record) {
      history.value = [...history.value.slice(0, historyPointer.value + 1), normalized]
      historyPointer.value = history.value.length - 1
    }
  }

  /** Moves the history pointer to `index` and opens that entry; the pointer is set from the entry that was requested, not read after the `await`. */
  async function goToHistory (index: number): Promise<void> {
    const target = history.value[index] ?? ROOT_PATH
    navigation += 1
    const request = navigation
    const content = await fetchContent(target)
    if (content === null || request !== navigation) {
      return
    }
    applyContent(target, content)
    historyPointer.value = index
  }

  async function back (): Promise<void> {
    if (historyPointer.value <= 0) {
      return
    }
    await goToHistory(historyPointer.value - 1)
  }

  async function forward (): Promise<void> {
    if (historyPointer.value >= history.value.length - 1) {
      return
    }
    await goToHistory(historyPointer.value + 1)
  }

  /**
   * Reloads the current folder and its branch in the tree (after an upload, delete, paste, rename or create). The response of one request
   * serves both; it is not applied to the list when a navigation started meanwhile.
   */
  async function refresh (): Promise<void> {
    const current = path.value
    const request = navigation
    const content = await fetchContent(current)
    if (content === null) {
      return
    }
    if (request === navigation) {
      applyContent(current, content)
    }
    if (tree.value[current]?.loaded) {
      applyTree(current, content)
    }
  }

  async function toggleTree (target: string): Promise<void> {
    const node = tree.value[target]
    if (node?.loaded) {
      tree.value = { ...tree.value, [target]: { ...node, expanded: !node.expanded } }
      return
    }
    await loadTree(target, true)
  }

  function toggleHidden (): void {
    showHidden.value = !showHidden.value
  }

  function setSearchTerm (value: string): void {
    if (value === searchTerm.value) {
      return
    }
    searchTerm.value = value
    selection.value = { directories: [], files: [] }
  }

  function setView (next: FmView): void {
    view.value = next
  }

  function sortBy (field: FmSortField): void {
    sort.value = nextSort(sort.value, field)
  }

  /**
   * Selection: with `additive` (Ctrl or Cmd) the item is toggled; without it a new item replaces the selection,
   * and an item that is already selected keeps the whole selection.
   */
  function select (item: FmItemRef, additive = false): void {
    const key = item.type === 'dir' ? 'directories' : 'files'
    const list = selection.value[key]
    const isSelected = list.includes(item.path)
    if (additive) {
      selection.value = {
        ...selection.value,
        [key]: isSelected ? list.filter(selected => selected !== item.path) : [...list, item.path],
      }
      return
    }
    if (!isSelected) {
      selection.value = { directories: [], files: [], [key]: [item.path] }
    }
  }

  /** Copies or cuts the selection; an empty selection leaves the clipboard unchanged. */
  function setClipboard (type: 'copy' | 'cut'): void {
    const count = selection.value.directories.length + selection.value.files.length
    if (count === 0) {
      return
    }
    clipboard.value = {
      type,
      directories: [...selection.value.directories],
      files: [...selection.value.files],
    }
  }

  function clearClipboard (): void {
    clipboard.value = null
  }

  /** Removes one item; an empty clipboard becomes null (no paste). */
  function removeFromClipboard (type: keyof FmSelection, path: string): void {
    const current = clipboard.value
    if (current === null) {
      return
    }
    const next: FmClipboard = type === 'directories'
      ? { ...current, directories: current.directories.filter(item => item !== path) }
      : { ...current, files: current.files.filter(item => item !== path) }
    clipboard.value = next.directories.length + next.files.length > 0 ? next : null
  }

  /**
   * Copies or moves the clipboard into the current folder. A success refreshes the folder and the tree;
   * a cut clears the clipboard after a success (not after a failure, as legacy).
   */
  async function paste (): Promise<void> {
    const id = accountId.value
    const current = clipboard.value
    if (id === null || current === null) {
      return
    }
    const token = generation
    const response = await track(() => fmApi.paste(id, path.value, current))
    if (token !== generation) {
      return
    }
    notify(response.result)
    if (response.result.status !== 'success') {
      return
    }
    await refresh()
    if (current.type === 'cut') {
      clearClipboard()
    }
  }

  /**
   * Shared path of the actions that change the open folder (create, rename, delete, zip, unzip): the request goes to the folder that is open
   * now. The result is an alert. A success refreshes the folder and its branch of the tree, but only while the
   * same folder is open. Returns true when the request succeeded (the modal closes).
   */
  async function runAction (run: (id: number, dir: string) => Promise<fmApi.FmCall<unknown>>): Promise<boolean> {
    const id = accountId.value
    if (id === null) {
      return false
    }
    const dir = path.value
    const token = generation
    actionError.value = null
    const response = await track(() => run(id, dir))
    if (token !== generation) {
      return false
    }
    notify(response.result)
    if (response.result.status !== 'success') {
      actionError.value = fmResultText(response.result, translate)
      return false
    }
    if (path.value === dir) {
      await refresh()
    }
    return true
  }

  /**
   * Writes a file of the open folder (the text editor, the image crop; it always overwrites). A second call while one
   * is running is rejected (returns false, no request): a double submit must not write twice. Returns true on success; the folder is refreshed
   * by `runAction`, the response `file` is not used.
   */
  async function saveFile (name: string, blob: Blob): Promise<boolean> {
    if (fileSaving.value) {
      return false
    }
    fileSaving.value = true
    try {
      return await runAction((id, dir) => fmApi.updateFile(id, { dir, name, blob }))
    } finally {
      fileSaving.value = false
    }
  }

  function createFile (name: string): Promise<boolean> {
    return runAction((id, dir) => fmApi.createFile(id, dir, name))
  }

  function createDirectory (name: string): Promise<boolean> {
    return runAction((id, dir) => fmApi.createDirectory(id, dir, name))
  }

  /**
   * A `warning` (some files were not uploaded) gives the alert and refreshes the folder, but the modal stays open
   * (only a success closes it, as in legacy). A failed request gives the alert and returns false; it never throws.
   */
  async function upload (files: readonly File[], overwrite: boolean): Promise<boolean> {
    const id = accountId.value
    if (id === null) {
      return false
    }
    const dir = path.value
    const token = generation
    const response = await track(() => fmApi.upload(id, dir, files, overwrite))
    if (token !== generation) {
      return false
    }
    notify(response.result)
    if (response.result.status !== 'error' && path.value === dir) {
      await refresh()
    }
    return response.result.status === 'success'
  }

  /**
   * `oldName` and `newName` are full paths, the name typed in the modal is only the basename. A failed rename keeps the
   * modal open (the alert shows the reason).
   */
  function renameItem (item: FmDirectory | FmFile, name: string): Promise<boolean> {
    return runAction(id => fmApi.rename(id, item, joinPath(item.dirname, name)))
  }

  /**
   * The selected folders, then the selected files, each as `{ type, path }`. A success clears the selection.
   */
  async function deleteSelected (): Promise<boolean> {
    const items: FmItemRef[] = selectedItems.value.map(item => ({ type: item.type, path: item.path }))
    if (items.length === 0) {
      return false
    }
    const done = await runAction(id => fmApi.deleteItems(id, items))
    if (done) {
      selection.value = { directories: [], files: [] }
    }
    return done
  }

  /** An archive `fileName` (with `.zip`) in the open folder, from the selected paths. */
  function zipSelected (fileName: string): Promise<boolean> {
    const elements: FmSelection = { directories: [...selection.value.directories], files: [...selection.value.files] }
    return runAction((id, dir) => fmApi.zip(id, dir, fileName, elements))
  }

  /**
   * Extracts the selected archive into its own folder (`folder` null), or into a new folder `folder` next to it.
   * The archive is the first selected item.
   */
  async function unzipSelected (folder: string | null): Promise<boolean> {
    const archive = selectedItems.value[0]
    if (archive === undefined || archive.type !== 'file') {
      return false
    }
    return runAction(id => fmApi.unzip(id, archive.path, folder))
  }

  function openModal (name: FmModal): void {
    actionError.value = null
    activeModal.value = name
  }

  function closeModal (): void {
    activeModal.value = null
  }

  function clearErrors (): void {
    errors.value = []
  }

  /** Empties the state: on leaving the page, on opening another account, and at the start of `open`. */
  function reset (): void {
    generation += 1
    navigation += 1
    clearThumbnailCache()
    activeModal.value = null
    accountId.value = null
    config.value = null
    path.value = ROOT_PATH
    history.value = [ROOT_PATH]
    historyPointer.value = 0
    directories.value = []
    files.value = []
    selection.value = { directories: [], files: [] }
    sort.value = { ...DEFAULT_SORT }
    view.value = 'table'
    showHidden.value = true
    searchTerm.value = ''
    clipboard.value = null
    errors.value = []
    actionError.value = null
    tree.value = {}
  }

  return {
    accountId,
    config,
    path,
    history,
    historyPointer,
    directories,
    files,
    visibleDirectories,
    visibleFiles,
    selectedItems,
    isSelected,
    selection,
    sort,
    view,
    showHidden,
    searchTerm,
    clipboard,
    errors,
    actionError,
    loading,
    tree,
    open,
    goTo,
    back,
    forward,
    refresh,
    toggleTree,
    toggleHidden,
    setSearchTerm,
    setView,
    sortBy,
    select,
    setClipboard,
    clearClipboard,
    removeFromClipboard,
    paste,
    createFile,
    createDirectory,
    saveFile,
    fileSaving,
    upload,
    renameItem,
    deleteSelected,
    zipSelected,
    unzipSelected,
    activeModal,
    openModal,
    closeModal,
    clearErrors,
    reset,
  }
})
