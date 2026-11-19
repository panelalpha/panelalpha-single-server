import type { AtRule, Container, Document, Node, Plugin, Rule } from 'postcss'

/**
 * PostCSS plugin giving Vuetify 4 utilities the strength of Vuetify 2 ones (F-11).
 * V4 puts them in `@layer vuetify-utilities.*` with a bare selector and no `!important`, so any unlayered rule
 * (the legacy layer, scoped SFC styles) beats them. V2 utilities were unlayered, `!important` and `.v-application .x`.
 * Used by vite.config.ts. PostCSS plugins from the Vite config are loaded once, so changing this file needs a dev server restart (no HMR).
 */
const UTILITIES_LAYER = 'vuetify-utilities'
const PREFIX = ':is(.v-application, .v-overlay-container) '
const LOCALE_SELECTOR = '.v-locale--is-'
const UNIMPORTANT_TYPOGRAPHY_PROPS = new Set(['font-weight', 'line-height'])

function asLayer (node: Node | Document | undefined): AtRule | undefined {
  return node?.type === 'atrule' && (node as AtRule).name === 'layer' ? node as AtRule : undefined
}

function isUtilitiesLayer (path: string): boolean {
  return path === UTILITIES_LAYER || path.startsWith(`${UTILITIES_LAYER}.`)
}

function prefixSelector (selector: string): string {
  const trimmed = selector.trim()
  return trimmed.startsWith(LOCALE_SELECTOR) ? trimmed : `${PREFIX}${trimmed}`
}

function isInsideKeyframes (rule: Rule): boolean {
  const parent = rule.parent
  return parent?.type === 'atrule' && (parent as AtRule).name.endsWith('keyframes')
}

/** `font-weight` and `line-height` of V2 typography classes were not `!important` (`unimportant` in V2 `_utilities.scss`). */
function isInTypographyLayer (rule: Rule): boolean {
  for (let parent: Node | Document | undefined = rule.parent; parent; parent = parent.parent) {
    const name = asLayer(parent)?.params.trim()
    if (name === 'typography' || name?.endsWith('.typography')) {
      return true
    }
  }
  return false
}

/** `:root` / `html` selectors (and their compounds) must stay as they are: `:is(...) :root` would never match. */
function isRootSelector (selector: string): boolean {
  return /^(?::root|html)(?![\w-])/.test(selector.trim())
}

function strengthen (rule: Rule): void {
  if (isInsideKeyframes(rule)) {
    return
  }
  // A natively nested rule (`.a { &:hover {} }`) inherits the strengthened parent selector; a prefix would break `&`.
  if (rule.parent?.type !== 'rule') {
    rule.selectors = rule.selectors.map(selector => isRootSelector(selector) ? selector : prefixSelector(selector))
  }
  const typography = isInTypographyLayer(rule)
  rule.each(node => {
    if (node.type !== 'decl' || node.prop.startsWith('--')) {
      return
    }
    if (typography && UNIMPORTANT_TYPOGRAPHY_PROPS.has(node.prop)) {
      return
    }
    node.important = true
  })
}

/** Replaces `layer` with its children; an order statement (`@layer a, b;`) has none and is dropped. */
function unlayer (layer: AtRule): void {
  if (layer.nodes) {
    layer.replaceWith(layer.nodes)
  } else {
    layer.remove()
  }
}

/** Moves the rules of `layer` (and of the layers nested in it) out of every layer, in place and in order. */
function unwrap (layer: AtRule): void {
  layer.walkRules(strengthen)
  const nested: AtRule[] = []
  layer.walkAtRules('layer', node => {
    nested.push(node)
  })
  // The walk is pre-order, so reversing it unwraps the deepest layers first and every level is reached.
  for (const node of nested.toReversed()) {
    unlayer(node)
  }
  unlayer(layer)
}

function visit (container: Container, parentPath: string): void {
  container.each(child => {
    const layer = asLayer(child)
    if (layer) {
      const names = layer.params.split(',').map(name => name.trim())
      const path = parentPath ? `${parentPath}.${names[0]}` : names[0]
      if (names.length !== 1) {
        return
      }
      if (isUtilitiesLayer(path)) {
        unwrap(layer)
      } else if (layer.nodes) {
        visit(layer, path)
      }
    } else if (child.type === 'atrule' && child.nodes) {
      visit(child, parentPath)
    }
  })
}

export function vuetifyV2Utilities (): Plugin {
  return {
    postcssPlugin: 'vuetify-v2-utilities',
    Once (root) {
      visit(root, '')
    },
  }
}
