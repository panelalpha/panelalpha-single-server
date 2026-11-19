import { describe, expect, it } from 'vitest'
import {
  addVariable,
  findDuplicateKey,
  importVariables,
  isValidEnvKey,
  listVariables,
  parseEnvText,
  quoteIfNeeded,
  removeVariable,
  splitEnvLines,
  unquoteValue,
  updateVariable,
} from './env-vars'

describe('EnvFileUtil', () => {
  describe('parseEnvText', () => {
    it('parses a simple variable', () => {
      const rows = parseEnvText('FOO=bar')
      expect(rows).toEqual([{ type: 'variable', key: 'FOO', value: 'bar' }])
    })

    it('treats blank lines as blank rows', () => {
      const rows = parseEnvText('FOO=bar\n\nBAZ=qux')
      expect(rows[1]).toEqual({ type: 'blank' })
    })

    it('treats comment lines as comment rows', () => {
      const rows = parseEnvText('# comment\nFOO=bar')
      expect(rows[0]).toEqual({ type: 'comment', text: '# comment' })
    })

    it('unquotes double-quoted values', () => {
      const rows = parseEnvText('FOO="hello world"')
      expect(rows[0]).toMatchObject({ value: 'hello world' })
    })

    it('unquotes single-quoted values', () => {
      const rows = parseEnvText('FOO=\'hello world\'')
      expect(rows[0]).toMatchObject({ value: 'hello world' })
    })

    it('strips inline comments for unquoted values', () => {
      const rows = parseEnvText('FOO=bar # trailing')
      expect(rows[0]).toMatchObject({ value: 'bar' })
    })

    it('preserves inline hashes inside quoted values', () => {
      const rows = parseEnvText('FOO="bar # not a comment"')
      expect(rows[0]).toMatchObject({ value: 'bar # not a comment' })
    })

    it('handles export prefix', () => {
      const rows = parseEnvText('export FOO=bar')
      expect(rows[0]).toEqual({ type: 'variable', key: 'FOO', value: 'bar' })
    })

    it('returns an empty array for empty input', () => {
      expect(parseEnvText('')).toEqual([])
      expect(parseEnvText(null)).toEqual([])
    })

    it('ignores a single trailing blank line', () => {
      const rows = parseEnvText('FOO=bar\n')
      expect(rows).toEqual([{ type: 'variable', key: 'FOO', value: 'bar' }])
    })
  })

  describe('unquoteValue', () => {
    it('returns the input when there are no quotes', () => {
      expect(unquoteValue('plain')).toBe('plain')
    })

    it('strips double quotes and decodes escapes', () => {
      expect(unquoteValue(String.raw`"a\nb"`)).toBe('a\nb')
    })

    it('strips single quotes without decoding escapes', () => {
      expect(unquoteValue(String.raw`'a\nb'`)).toBe(String.raw`a\nb`)
    })

    it('strips trailing inline comments only for unquoted values', () => {
      expect(unquoteValue('foo # comment')).toBe('foo')
    })
  })

  describe('quoteIfNeeded', () => {
    it('returns empty string for empty input', () => {
      expect(quoteIfNeeded('')).toBe('')
    })

    it('returns plain values unchanged', () => {
      expect(quoteIfNeeded('foo')).toBe('foo')
    })

    it('quotes values that contain spaces', () => {
      expect(quoteIfNeeded('hello world')).toBe('"hello world"')
    })

    it('escapes embedded double quotes', () => {
      expect(quoteIfNeeded('a"b')).toBe(String.raw`"a\"b"`)
    })

    it('escapes backslashes', () => {
      expect(quoteIfNeeded(String.raw`a\b`)).toBe(String.raw`"a\\b"`)
    })

    it('quotes values that start with a quote', () => {
      expect(quoteIfNeeded('"foo')).toBe(String.raw`"\"foo"`)
    })
  })

  describe('splitEnvLines', () => {
    it('detects LF and trailing newline', () => {
      expect(splitEnvLines('A=1\nB=2\n')).toEqual({
        lines: ['A=1', 'B=2'],
        eol: '\n',
        trailingNewline: true,
      })
    })

    it('detects CRLF and missing trailing newline', () => {
      expect(splitEnvLines('A=1\r\nB=2')).toEqual({
        lines: ['A=1', 'B=2'],
        eol: '\r\n',
        trailingNewline: false,
      })
    })

    it('handles empty text', () => {
      expect(splitEnvLines('')).toEqual({
        lines: [],
        eol: '\n',
        trailingNewline: false,
      })
    })
  })

  describe('listVariables', () => {
    it('returns variables with line index and export flag', () => {
      const text = '# c\n\nexport A=1\nB=\'x y\'\nnot a var\n'
      expect(listVariables(text)).toEqual([
        { line: 2, key: 'A', value: '1', exported: true },
        { line: 3, key: 'B', value: 'x y', exported: false },
      ])
    })

    it('returns empty array for empty text', () => {
      expect(listVariables('')).toEqual([])
    })
  })

  describe('isValidEnvKey', () => {
    it('accepts valid keys', () => {
      expect(isValidEnvKey('A')).toBe(true)
      expect(isValidEnvKey('_a1_B')).toBe(true)
    })

    it('rejects invalid keys', () => {
      expect(isValidEnvKey('1A')).toBe(false)
      expect(isValidEnvKey('A-B')).toBe(false)
      expect(isValidEnvKey('')).toBe(false)
    })
  })

  describe('addVariable', () => {
    it('appends as the last line and keeps comments and blanks', () => {
      expect(addVariable('# c\n\nA=1\n', 'B', '2')).toBe('# c\n\nA=1\nB=2\n')
    })

    it('adds a line ending only before the appended line', () => {
      expect(addVariable('A=1', 'B', '2')).toBe('A=1\nB=2')
    })

    it('keeps CRLF', () => {
      expect(addVariable('A=1\r\n', 'B', '2')).toBe('A=1\r\nB=2\r\n')
      expect(addVariable('A=1', 'B', '2')).toBe('A=1\nB=2')
      expect(addVariable('A=1\r\nC=3', 'B', '2')).toBe('A=1\r\nC=3\r\nB=2')
    })

    it('adds to empty text', () => {
      expect(addVariable('', 'A', '1')).toBe('A=1\n')
    })

    it('quotes values via quoteIfNeeded', () => {
      expect(addVariable('', 'A', 'hello world')).toBe('A="hello world"\n')
      expect(addVariable('', 'A', 'a#b')).toBe('A="a#b"\n')
      expect(addVariable('', 'A', 'a"b')).toBe('A="a\\"b"\n')
    })
  })

  describe('updateVariable', () => {
    const text
      = '# header\n\nexport A=1\nB=\'single q\'\nC="dq" \nD=x # note\nE=5\n'

    it('keeps export prefix on edit', () => {
      expect(updateVariable('export A=1\n', 0, 'A', '2')).toBe('export A=2\n')
    })

    it('leaves every other line byte for byte', () => {
      const out = updateVariable(text, 6, 'E', '6')
      expect(out).toBe(text.replace('E=5', 'E=6'))
    })

    it('renames the key', () => {
      expect(updateVariable('A=1\nB=2\n', 1, 'C', '3')).toBe('A=1\nC=3\n')
    })

    it('quotes the value', () => {
      expect(updateVariable('A=1\n', 0, 'A', 'x y')).toBe('A="x y"\n')
    })

    it('keeps CRLF and missing trailing newline', () => {
      expect(updateVariable('# c\r\nA=1\r\nB=2', 2, 'B', '3')).toBe(
        '# c\r\nA=1\r\nB=3',
      )
    })
  })

  describe('removeVariable', () => {
    it('drops only the line', () => {
      expect(removeVariable('# c\n\nA=1\nB=2\n', 2)).toBe('# c\n\nB=2\n')
    })

    it('keeps CRLF', () => {
      expect(removeVariable('A=1\r\nB=2\r\n', 0)).toBe('B=2\r\n')
    })

    it('keeps missing trailing newline', () => {
      expect(removeVariable('A=1\nB=2', 0)).toBe('B=2')
    })

    it('returns empty text when the last line is removed', () => {
      expect(removeVariable('A=1\n', 0)).toBe('')
    })
  })

  describe('findDuplicateKey', () => {
    const text = 'A=1\nB=2\n'

    it('detects an existing key', () => {
      expect(findDuplicateKey(text, 'A')).toBe(true)
      expect(findDuplicateKey(text, 'Z')).toBe(false)
    })

    it('excludes the edited line', () => {
      expect(findDuplicateKey(text, 'A', 0)).toBe(false)
      expect(findDuplicateKey(text, 'A', 1)).toBe(true)
    })
  })

  describe('importVariables', () => {
    it('appends to empty text', () => {
      expect(importVariables('', 'A=1\nB=2', { overwrite: false })).toEqual({
        text: 'A=1\nB=2\n',
        added: 2,
        updated: 0,
        skipped: 0,
      })
    })

    it('appends to non-empty text and keeps other lines', () => {
      const out = importVariables('# c\n\nA=1\n', 'B=2\nC=3\n', {
        overwrite: false,
      })
      expect(out.text).toBe('# c\n\nA=1\nB=2\nC=3\n')
      expect(out.added).toBe(2)
    })

    it('adds a line ending before the appended lines when missing', () => {
      expect(importVariables('A=1', 'B=2', { overwrite: false }).text).toBe(
        'A=1\nB=2',
      )
    })

    it('keeps CRLF', () => {
      expect(
        importVariables('A=1\r\n', 'B=2\nC=3', { overwrite: false }).text,
      ).toBe('A=1\r\nB=2\r\nC=3\r\n')
    })

    it('ignores comments, blanks and invalid lines in the pasted text', () => {
      const out = importVariables('', '# note\n\nnot a var\n1A=x\nA=1\n', {
        overwrite: false,
      })
      expect(out).toEqual({ text: 'A=1\n', added: 1, updated: 0, skipped: 0 })
    })

    it('counts a key repeated in the pasted text once, last value wins', () => {
      const out = importVariables('', 'A=1\nA=2', { overwrite: false })
      expect(out).toEqual({ text: 'A=2\n', added: 1, updated: 0, skipped: 0 })
    })

    it('skips existing keys without overwrite', () => {
      const text = 'A=1\nB=2\n'
      const out = importVariables(text, 'A=9\nC=3', { overwrite: false })
      expect(out).toEqual({
        text: 'A=1\nB=2\nC=3\n',
        added: 1,
        updated: 0,
        skipped: 1,
      })
    })

    it('rewrites the last line holding an existing key with overwrite', () => {
      const text = 'A=1\n# c\nA=2\nB=2\n'
      const out = importVariables(text, 'A=9\nC=3', { overwrite: true })
      expect(out).toEqual({
        text: 'A=1\n# c\nA=9\nB=2\nC=3\n',
        added: 1,
        updated: 1,
        skipped: 0,
      })
    })

    it('keeps the export prefix on overwrite', () => {
      expect(
        importVariables('export A=1\n', 'A=2', { overwrite: true }).text,
      ).toBe('export A=2\n')
    })

    it('quotes values with spaces or #', () => {
      expect(
        importVariables('', 'A="x y"\nB="a#b"', { overwrite: false }).text,
      ).toBe('A="x y"\nB="a#b"\n')
    })

    it('leaves the text unchanged when nothing valid is pasted', () => {
      const text = 'A=1\n'
      const out = importVariables(text, '# only\n\nnope', { overwrite: true })
      expect(out).toEqual({ text, added: 0, updated: 0, skipped: 0 })
    })
  })

  describe('quoting round-trip', () => {
    it('decodes double-quoted escapes in one pass', () => {
      expect(unquoteValue(String.raw`"C:\\new"`)).toBe(String.raw`C:\new`)
      expect(unquoteValue(String.raw`"a\"b"`)).toBe('a"b')
    })

    it('allows an inline comment after a closing quote', () => {
      expect(unquoteValue('"secret" # note')).toBe('secret')
      expect(unquoteValue('\'x\' # c')).toBe('x')
    })

    it('escapes newlines and tabs when double-quoting', () => {
      expect(quoteIfNeeded('a\nb\tc')).toBe(String.raw`"a\nb\tc"`)
    })

    it('uses single quotes on request when the value allows it', () => {
      expect(quoteIfNeeded('p${X}', { single: true })).toBe('\'p${X}\'')
      expect(quoteIfNeeded('it\'s', { single: true })).toBe('"it\'s"')
    })

    it.each([
      'K="a\\nb"\n',
      'P="C:\\\\new"\n',
      'S=\'p${X}\'\n',
      'export T=\'a b\'\r\nU=1\r\n',
    ])('an unchanged edit keeps %j byte for byte', text => {
      const [variable] = listVariables(text)
      expect(variable).toBeDefined()
      expect(updateVariable(text, 0, variable?.key ?? '', variable?.value ?? '')).toBe(text)
    })

    it('keeps the value of a quoted line with an inline comment', () => {
      const text = 'A="secret" # note\n'
      const [variable] = listVariables(text)
      expect(variable?.value).toBe('secret')
      expect(listVariables(updateVariable(text, 0, 'A', variable?.value ?? ''))[0]?.value).toBe(
        'secret',
      )
    })

    it('keeps single quotes from the pasted line on import', () => {
      expect(importVariables('', 'S=\'p${X}\'\nD="a\\nb"').text).toBe(
        'S=\'p${X}\'\nD="a\\nb"\n',
      )
      expect(
        importVariables('S=old\n', 'S=\'p${X}\'', { overwrite: true }).text,
      ).toBe('S=\'p${X}\'\n')
    })
  })

  describe('multi-line quoted values', () => {
    const text = 'A=1\nM="multi\nB=inside\nline"\nC=2\n'

    it('lists them once as readonly and skips their inner lines', () => {
      expect(listVariables(text)).toEqual([
        { line: 0, key: 'A', value: '1', exported: false },
        { line: 1, key: 'M', value: 'multi\nB=inside\nline', exported: false, readonly: true },
        { line: 4, key: 'C', value: '2', exported: false },
      ])
    })

    it('refuses to edit or delete them', () => {
      expect(updateVariable(text, 1, 'M', 'x')).toBe(text)
      expect(removeVariable(text, 1)).toBe(text)
    })

    it('still edits the lines around them', () => {
      expect(removeVariable(text, 4)).toBe('A=1\nM="multi\nB=inside\nline"\n')
    })

    it('skips them on an overwriting import', () => {
      const out = importVariables(text, 'M=new', { overwrite: true })
      expect(out).toEqual({ text, added: 0, updated: 0, skipped: 1 })
    })

    it('treats a quote that never closes as a single line', () => {
      expect(listVariables('A="open\nB=1\n')).toEqual([
        { line: 0, key: 'A', value: '"open', exported: false },
        { line: 1, key: 'B', value: '1', exported: false },
      ])
    })
  })

  describe('edited line details and mixed line endings', () => {
    it('keeps indentation, export and an inline comment on edit', () => {
      expect(updateVariable('  export A=1 # note\n', 0, 'A', '2')).toBe(
        '  export A=2 # note\n',
      )
      expect(updateVariable('A="x"   # c\n', 0, 'A', 'y z')).toBe('A="y z"   # c\n')
      expect(updateVariable('A=1 # c\n', 0, 'A', '')).toBe('A= # c\n')
    })

    it('keeps each untouched line\'s own terminator', () => {
      const text = 'A=1\nB=2\r\nC=3\n'
      expect(updateVariable(text, 2, 'C', '9')).toBe('A=1\nB=2\r\nC=9\n')
      expect(removeVariable(text, 0)).toBe('B=2\r\nC=3\n')
      expect(addVariable(text, 'D', '4')).toBe('A=1\nB=2\r\nC=3\nD=4\n')
    })

    it('drops the terminator of the new last line when an unterminated last line is removed', () => {
      expect(removeVariable('A=1\nB=2', 1)).toBe('A=1')
    })
  })
})
