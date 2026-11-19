import { EditorView } from '@codemirror/view'
import { describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { editorLanguageFor } from './fm-editor-language'
import { TEXT_EXTENSIONS } from './fm-file-type'
import { fmEditorTheme, restoreLineBreaks, splitLineBreaks, useCodeEditor } from './use-code-editor'

const PLAIN = ['htaccess', 'env', 'txt', 'log']
const WITH_LANGUAGE = TEXT_EXTENSIONS.filter(extension => editorLanguageFor(extension) !== null)

function mountHost (): HTMLElement {
  const element = document.createElement('div')
  document.body.append(element)
  return element
}

function viewOf (element: HTMLElement): EditorView {
  const dom = element.querySelector<HTMLElement>('.cm-editor')
  if (!dom) {
    throw new Error('editor is not mounted')
  }
  const view = EditorView.findFromDOM(dom)
  if (!view) {
    throw new Error('no view for the editor element')
  }
  return view
}

describe('splitLineBreaks and restoreLineBreaks', () => {
  it('turns every line break into LF and keeps each separator where it was', () => {
    const split = splitLineBreaks('a\r\nb\nc\rd')
    expect(split.text).toBe('a\nb\nc\nd')
    expect(restoreLineBreaks(split.text, split.breaks, '\r\n')).toBe('a\r\nb\nc\rd')
  })

  it('gives a new line break the fallback separator', () => {
    const split = splitLineBreaks('a\nb')
    expect(restoreLineBreaks('a\nx\nb', split.breaks, '\r\n')).toBe('a\nx\r\nb')
  })
})

describe('useCodeEditor', () => {
  it.each(WITH_LANGUAGE)('mounts and destroys the editor with the %s language', async extension => {
    const element = mountHost()
    const host = ref<HTMLElement | null>(element)
    const scope = effectScope()
    scope.run(() => useCodeEditor(host, { text: ref('line one\nline two'), extension: ref(extension) }))

    await vi.waitFor(() => expect(element.querySelector('.cm-editor')).not.toBeNull())
    scope.stop()
    expect(element.querySelector('.cm-editor')).toBeNull()
    element.remove()
  })

  it.each(PLAIN)('mounts a plain editor for %s', async extension => {
    const element = mountHost()
    const scope = effectScope()
    scope.run(() => useCodeEditor(ref(element), { text: ref('text'), extension: ref(extension) }))

    await vi.waitFor(() => expect(element.querySelector('.cm-editor')).not.toBeNull())
    scope.stop()
    element.remove()
  })

  it('reports dirty only after an edit, not after loading', async () => {
    const element = mountHost()
    const scope = effectScope()
    const text = ref('hello')
    const editor = scope.run(() => useCodeEditor(ref(element), { text, extension: ref('txt') }))!

    await vi.waitFor(() => expect(element.querySelector('.cm-editor')).not.toBeNull())
    expect(editor.dirty.value).toBe(false)

    viewOf(element).dispatch({ changes: { from: 5, insert: '!' } })
    expect(editor.dirty.value).toBe(true)
    expect(editor.getText()).toBe('hello!')

    viewOf(element).dispatch({ changes: { from: 5, to: 6 } })
    expect(editor.dirty.value).toBe(false)

    scope.stop()
    element.remove()
  })

  it('does not report dirty for a CRLF file without an edit and keeps CRLF in getText()', async () => {
    const element = mountHost()
    const scope = effectScope()
    const editor = scope.run(() => useCodeEditor(ref(element), { text: ref('{\r\n  "a": 1\r\n}\r\n'), extension: ref('json') }))!

    await vi.waitFor(() => expect(element.querySelector('.cm-editor')).not.toBeNull())
    expect(editor.dirty.value).toBe(false)
    expect(editor.getText()).toBe('{\r\n  "a": 1\r\n}\r\n')

    viewOf(element).dispatch({ changes: { from: 0, insert: ' ' } })
    expect(editor.dirty.value).toBe(true)
    expect(editor.getText()).toBe(' {\r\n  "a": 1\r\n}\r\n')
    expect(editor.getText()).toContain('\r\n')

    scope.stop()
    element.remove()
  })

  it('keeps the separator of every untouched line when the file mixes them', async () => {
    const element = mountHost()
    const scope = effectScope()
    const editor = scope.run(() => useCodeEditor(ref(element), { text: ref('a\r\nb\nc'), extension: ref('txt') }))!

    await vi.waitFor(() => expect(element.querySelector('.cm-editor')).not.toBeNull())
    expect(editor.getText()).toBe('a\r\nb\nc')

    // Insert "X" at the start and remove the CRLF after "a": "Xab" and "c" stay, the LF after "b" stays an LF.
    viewOf(element).dispatch({ changes: [{ from: 0, insert: 'X' }, { from: 1, to: 2 }] })
    expect(editor.dirty.value).toBe(true)
    expect(editor.getText()).toBe('Xab\nc')

    scope.stop()
    element.remove()
  })

  it('rebuilds on a new text without reporting dirty', async () => {
    const element = mountHost()
    const scope = effectScope()
    const text = ref('first')
    const editor = scope.run(() => useCodeEditor(ref(element), { text, extension: ref('md') }))!

    await vi.waitFor(() => expect(element.querySelector('.cm-editor')).not.toBeNull())
    viewOf(element).dispatch({ changes: { from: 0, insert: 'x' } })
    expect(editor.dirty.value).toBe(true)

    text.value = 'second'
    await vi.waitFor(() => expect(editor.getText()).toBe('second'))
    expect(editor.dirty.value).toBe(false)

    scope.stop()
    element.remove()
  })
})

describe('fmEditorTheme', () => {
  it('takes every colour from the editor tokens, not from literals', () => {
    const values = Object.values(fmEditorTheme).flatMap(rules => Object.values(rules))
    expect(values).toHaveLength(6)
    for (const value of values) {
      expect(value).toMatch(/var\(--v-fm-editor-[a-z-]+\)/)
    }
  })

  it('mounts the editor with the theme rules in the document', async () => {
    const element = mountHost()
    const scope = effectScope()
    scope.run(() => useCodeEditor(ref(element), { text: ref('text'), extension: ref('txt') }))

    await vi.waitFor(() => expect(element.querySelector('.cm-editor')).not.toBeNull())
    const css = Array.from(document.querySelectorAll('style')).map(style => style.textContent ?? '').join('\n')
    expect(css).toContain('var(--v-fm-editor-gutter-bg)')
    expect(css).toContain('var(--v-fm-editor-gutter-border)')

    scope.stop()
    element.remove()
  })
})
