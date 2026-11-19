import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'settings.scss'), 'utf8')
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('settings.scss', () => {
  it.each([
    ['$input-control-height', '46px'],
    ['$field-control-height', '46px'],
    ['$field-control-underlined-height', '46px'],
    ['$button-height', '40px'],
    ['$button-font-weight', '700'],
    ['$card-text-padding', '24px'],
    ['$card-subtitle-padding', '24px'],
  ])('assigns %s: %s', (name, value) => {
    const escaped = name.replace('$', String.raw`\$`)
    expect(code).toMatch(new RegExp(String.raw`${escaped}:\s*${value}\b`))
  })

  it.each(['$size-scales', '$button-font-size', '$typography'])(
    'does not assign %s',
    name => {
      const escaped = name.replace('$', String.raw`\$`)
      expect(code).not.toMatch(new RegExp(String.raw`${escaped}\s*:`))
    },
  )
})
