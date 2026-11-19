import type { VueWrapper } from '@vue/test-utils'

/**
 * One line per element, in document order, indented by depth: `tag.class-a.class-b[attr=value]`.
 * Classes are sorted and leave out the pattern's own `table-skeleton-*` variant class and the theme
 * class `v-theme--*`; attributes leave out `class` and `data-v-*`. Used by the characterisation tests
 * of the table skeleton presets (the DOM of a preset must not change when it moves onto the pattern).
 */
export function skeletonShape (wrapper: VueWrapper): string[] {
  const lines: string[] = []

  const visit = (element: Element, depth: number): void => {
    const classes = [...element.classList]
      .filter(name => !name.startsWith('table-skeleton-') && !name.startsWith('v-theme--'))
      .toSorted()
    const attrs = [...element.attributes]
      .filter(attr => attr.name !== 'class' && !attr.name.startsWith('data-v-'))
      .map(attr => `[${attr.name}=${attr.value}]`)
      .toSorted()
    lines.push(`${'  '.repeat(depth)}${element.tagName.toLowerCase()}${classes.map(name => `.${name}`).join('')}${attrs.join('')}`)
    for (const child of element.children) {
      visit(child, depth + 1)
    }
  }

  visit(wrapper.element, 0)
  return lines
}

const LOADER = '[aria-label=Loading...][aria-live=polite][role=alert]'

/**
 * Expected lines of one `v-skeleton-loader` (the root and its bones) in `skeletonShape` form: the root with `classes`
 * (sorted, written as `.a.b`) and an optional `width`, then `bones` bones of the loader `kind` (`text`, `avatar`, `button`).
 */
export function skeletonLoader (depth: number, options: { classes?: string, width?: string, bones?: number, kind?: string } = {}): string[] {
  const indent = '  '.repeat(depth)
  const style = options.width ? `[style=width: ${options.width};]` : ''
  const kind = options.kind ?? 'text'
  // class names are sorted (`__avatar` before `__bone`, `__bone` before `__button` and `__text`)
  const bone = ['v-skeleton-loader__bone', `v-skeleton-loader__${kind}`].toSorted().map(name => `.${name}`).join('')
  return [
    `${indent}div${options.classes ?? ''}.v-skeleton-loader${LOADER}${style}`,
    ...Array.from({ length: options.bones ?? 1 }, () => `${indent}  div${bone}`),
  ]
}
