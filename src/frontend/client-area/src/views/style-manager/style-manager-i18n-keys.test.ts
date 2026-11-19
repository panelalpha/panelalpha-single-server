import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const parity = join(here, '../../../parity/fixtures')

type Tree = { [key: string]: Tree | string }

// The legacy translation files mix nested objects with dotted keys (`"style.update.success"` under `notification`).
function has (tree: Tree, path: string): boolean {
  if (typeof tree[path] === 'string') {
    return true
  }
  return Object.entries(tree).some(([key, value]) => typeof value === 'object' && path.startsWith(`${key}.`) && has(value, path.slice(key.length + 1)))
}

const sources = readdirSync(here).filter(file => /\.(?:vue|ts)$/.test(file) && !file.endsWith('.test.ts'))
const keys = [...new Set(sources.flatMap(file => {
  const text = readFileSync(join(here, file), 'utf8')
  return [...text.matchAll(/(?<=\bt\(')(?:heading|button|form|notification)\.[\w.]+(?=')/g)].map(match => match[0])
}))]// The drawer builds the tooLarge key through a shared helper in two components; it is also listed explicitly below.
const TOO_LARGE = 'notification.style.image.tooLarge'

describe('style manager legacy i18n keys', () => {
  it('collects the drawer keys from the sources', () => {
    expect(keys).toEqual(expect.arrayContaining([
      'heading.styleManager.title',
      'heading.styleManager.darkMode.allow',
      'button.saveChanges',
      'button.restoreDefault',
      'button.customize',
      'button.customizeResellerTheme',
      TOO_LARGE,
    ]))
  })

  it('has every key in the app translation fixture', () => {
    const en = JSON.parse(readFileSync(join(parity, 'translation.en.json'), 'utf8')) as Tree
    for (const key of [...keys, 'notification.style.update.success']) {
      expect({ key, found: has(en, key) }).toEqual({ key, found: true })
    }
  })

  // The tooLarge key (built through a shared helper in two components) is in the lite deploy since the 2026-10-25 fixture; the earlier fixture lacked it.
  it('has every key in the lite fixture', () => {
    const lite = JSON.parse(readFileSync(join(parity, 'lite/translation.en.json'), 'utf8')) as Tree
    const missing = [...keys, 'notification.style.update.success'].filter(key => !has(lite, key))
    expect(missing).toEqual([])
  })
})
