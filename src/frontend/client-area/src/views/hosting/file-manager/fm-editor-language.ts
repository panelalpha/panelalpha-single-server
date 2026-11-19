// Language of the text editor by extension. The 27 keys with a loader are the same list as
// `TEXT_EXTENSIONS` in `fm-file-type.ts`.
// Each loader imports its CodeMirror 6 package lazily, so the languages stay out of the File Manager chunk.
// `null` means the file is edited as plain text (txt, env, log, htaccess).

import type { StreamParser } from '@codemirror/language'
import type { Extension } from '@codemirror/state'

export type EditorLanguageLoader = () => Promise<Extension>

function legacy (load: () => Promise<StreamParser<unknown>>): EditorLanguageLoader {
  return async () => {
    const { LanguageSupport, StreamLanguage } = await import('@codemirror/language')
    return new LanguageSupport(StreamLanguage.define(await load()))
  }
}

const vue: EditorLanguageLoader = async () => {
  try {
    return (await import('@codemirror/lang-vue')).vue()
  } catch {
    return (await import('@codemirror/lang-html')).html()
  }
}

const LOADERS = new Map<string, EditorLanguageLoader | null>([
  ['sh', legacy(async () => (await import('@codemirror/legacy-modes/mode/shell')).shell)],
  ['css', () => import('@codemirror/lang-css').then(m => m.css())],
  ['less', () => import('@codemirror/lang-less').then(m => m.less())],
  ['sass', () => import('@codemirror/lang-sass').then(m => m.sass({ indented: true }))],
  ['scss', () => import('@codemirror/lang-sass').then(m => m.sass())],
  ['html', () => import('@codemirror/lang-html').then(m => m.html())],
  ['js', () => import('@codemirror/lang-javascript').then(m => m.javascript())],
  ['ts', () => import('@codemirror/lang-javascript').then(m => m.javascript({ typescript: true }))],
  ['vue', vue],
  ['htaccess', null],
  ['env', null],
  ['txt', null],
  ['log', null],
  ['ini', legacy(async () => (await import('@codemirror/legacy-modes/mode/properties')).properties)],
  ['xml', () => import('@codemirror/lang-xml').then(m => m.xml())],
  ['md', () => import('@codemirror/lang-markdown').then(m => m.markdown())],
  ['java', () => import('@codemirror/lang-java').then(m => m.java())],
  ['c', legacy(async () => (await import('@codemirror/legacy-modes/mode/clike')).c)],
  ['cpp', () => import('@codemirror/lang-cpp').then(m => m.cpp())],
  ['cs', legacy(async () => (await import('@codemirror/legacy-modes/mode/clike')).csharp)],
  ['scl', legacy(async () => (await import('@codemirror/legacy-modes/mode/clike')).scala)],
  ['php', () => import('@codemirror/lang-php').then(m => m.php())],
  ['sql', () => import('@codemirror/lang-sql').then(m => m.sql())],
  ['pl', legacy(async () => (await import('@codemirror/legacy-modes/mode/perl')).perl)],
  ['py', () => import('@codemirror/lang-python').then(m => m.python())],
  ['lua', legacy(async () => (await import('@codemirror/legacy-modes/mode/lua')).lua)],
  ['swift', legacy(async () => (await import('@codemirror/legacy-modes/mode/swift')).swift)],
  ['rb', legacy(async () => (await import('@codemirror/legacy-modes/mode/ruby')).ruby)],
  ['go', () => import('@codemirror/lang-go').then(m => m.go())],
  ['yaml', () => import('@codemirror/lang-yaml').then(m => m.yaml())],
  ['json', legacy(async () => (await import('@codemirror/legacy-modes/mode/javascript')).json)],
])

export function editorLanguageFor (extension: string): EditorLanguageLoader | null {
  return LOADERS.get(extension.toLowerCase()) ?? null
}
