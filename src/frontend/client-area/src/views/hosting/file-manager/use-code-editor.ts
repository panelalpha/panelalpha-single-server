import type { ChangeSet, Text } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { onScopeDispose, ref, type Ref, watch } from 'vue'
import { editorLanguageFor } from './fm-editor-language'

export interface CodeEditorOptions {
  text: Ref<string>
  extension: Ref<string>
  /** Read at each build (not watched): a read-only editor cannot change its text. */
  readOnly?: Ref<boolean>
  /** The editor could not be built (a core or language chunk failed to load); the caller shows the failure. */
  onError?: (error: unknown) => void
}

export interface CodeEditor {
  /** The text differs from the loaded one (compared as text, not by the change event). */
  dirty: Ref<boolean>
  /** Current text; every line break keeps the separator it had in the loaded text (CRLF stays CRLF, LF stays LF). */
  getText: () => string
}

/** A line break of the editor document: its offset (in the LF document) and the separator the file had there. */
interface LineBreak {
  pos: number
  sep: string
}

/**
 * Splits the loaded text into the LF document the editor holds and the separator of each line break. A CR, LF or CRLF line break
 * becomes one LF, so CodeMirror sees one line break per line; the separators are restored on save.
 */
export function splitLineBreaks (text: string): { text: string, breaks: LineBreak[] } {
  const breaks: LineBreak[] = []
  let shift = 0
  for (const match of text.matchAll(/\r\n|\r|\n/g)) {
    breaks.push({ pos: (match.index ?? 0) - shift, sep: match[0] })
    // A CRLF is one character shorter in the LF document; a lone CR or LF is not.
    shift += match[0].length - 1
  }
  return { text: text.replace(/\r\n|\r/g, '\n'), breaks }
}

/** Puts the separators back into the LF document. A line break without a known separator (a new line) gets `fallback`. */
export function restoreLineBreaks (doc: string, breaks: readonly LineBreak[], fallback: string): string {
  const separators = new Map(breaks.map(breakLine => [breakLine.pos, breakLine.sep]))
  let result = ''
  let from = 0
  let pos = doc.indexOf('\n')
  while (pos !== -1) {
    result += doc.slice(from, pos) + (separators.get(pos) ?? fallback)
    from = pos + 1
    pos = doc.indexOf('\n', from)
  }
  return result + doc.slice(from)
}

/** Moves the known line breaks through an edit. A line break inside a removed range is gone; the others follow their text. */
function trackLineBreaks (breaks: readonly LineBreak[], changes: ChangeSet): LineBreak[] {
  const removed: Array<[number, number]> = []
  changes.iterChangedRanges((fromA, toA) => {
    removed.push([fromA, toA])
  })
  return breaks
    .filter(breakLine => !removed.some(([from, to]) => breakLine.pos >= from && breakLine.pos < to))
    .map(breakLine => ({ pos: changes.mapPos(breakLine.pos, 1), sep: breakLine.sep }))
}

/**
 * Surface of the editor: the legacy CodeMirror 5 `default` theme, the same in light and dark (tokens `--v-fm-editor-*`).
 * Kept as plain data so the core stays in its dynamic import; `build` turns it into `EditorView.theme`.
 */
export const fmEditorTheme: Record<string, Record<string, string>> = {
  '&': { backgroundColor: 'var(--v-fm-editor-bg)' },
  '.cm-content': { color: 'var(--v-fm-editor-text)' },
  '.cm-cursor': { borderLeftColor: 'var(--v-fm-editor-text)' },
  '.cm-gutters': {
    backgroundColor: 'var(--v-fm-editor-gutter-bg)',
    borderRight: '1px solid var(--v-fm-editor-gutter-border)',
    color: 'var(--v-fm-editor-line-number)',
  },
}

/**
 * Mounts a CodeMirror 6 editor in `host` for `options.text` (legacy line numbers and history, no wrapping, legacy surface in both themes).
 * The core and the language are imported dynamically, so they stay out of the File Manager chunk.
 * Every change of `host`, `text` or `extension` rebuilds the editor; the editor is destroyed with the scope.
 */
export function useCodeEditor (host: Ref<HTMLElement | null>, options: CodeEditorOptions): CodeEditor {
  const dirty = ref(false)
  let view: EditorView | null = null
  /** The loaded text as it was read: `dirty` compares against it. */
  let baseline = ''
  let breaks: LineBreak[] = []
  let fallback = '\n'
  let generation = 0
  /** The document as loaded (CodeMirror `Text`), compared with `eq` on every change. */
  let initialDoc: Text | null = null

  function getText (): string {
    return view ? restoreLineBreaks(view.state.doc.toString(), breaks, fallback) : baseline
  }

  function destroy (): void {
    view?.destroy()
    view = null
    initialDoc = null
    dirty.value = false
  }

  async function build (): Promise<void> {
    const token = ++generation
    destroy()
    const element = host.value
    if (!element) {
      return
    }
    const loaded = splitLineBreaks(options.text.value)
    const loader = editorLanguageFor(options.extension.value)
    const [{ EditorView, lineNumbers, keymap }, { EditorState }, { syntaxHighlighting, defaultHighlightStyle }, { defaultKeymap, history, historyKeymap }, language] = await Promise.all([
      import('@codemirror/view'),
      import('@codemirror/state'),
      import('@codemirror/language'),
      import('@codemirror/commands'),
      loader ? loader() : Promise.resolve(null),
    ])
    if (token !== generation || host.value !== element) {
      return
    }
    baseline = options.text.value
    breaks = loaded.breaks
    fallback = baseline.includes('\r\n') ? '\r\n' : '\n'
    const extensions = [
      EditorView.theme(fmEditorTheme, { dark: false }),
      lineNumbers(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      EditorState.readOnly.of(options.readOnly?.value === true),
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          breaks = trackLineBreaks(breaks, update.changes)
          // A different document is always a different text; only an equal one (typed and undone) needs the full text with its
          // line breaks. `Text#eq` stops at the length, so a keystroke no longer rebuilds the whole file.
          dirty.value = initialDoc && !update.state.doc.eq(initialDoc) ? true : getText() !== baseline
        }
      }),
    ]
    if (language) {
      extensions.push(language)
    }
    const state = EditorState.create({ doc: loaded.text, extensions })
    initialDoc = state.doc
    view = new EditorView({ parent: element, state })
  }

  watch([host, options.text, options.extension], () => {
    build().catch(error => options.onError?.(error))
  }, { immediate: true, flush: 'post' })

  onScopeDispose(() => {
    generation++
    destroy()
  })

  return { dirty, getText }
}
