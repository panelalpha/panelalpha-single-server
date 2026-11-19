export type SelectLabelOptions = {
  /** Items passed to the select; used to resolve a primitive model value to its item. */
  items: readonly unknown[]
  /** Legacy `itemValue` prop, used as-is (undefined stays undefined, so a primitive never matches). */
  itemValue?: string
  rawItemText?: boolean
  placeholder?: string
  t: (key: string) => string
}

function isRecord (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Label of one select item. A primitive resolves to its item first, an object shows
 * `form.option.<text>` (or the raw `text`), and an object without `text` is returned as is
 * (the template then renders it like Vue does, as JSON; legacy behaviour).
 */
export function getItemLabel (item: unknown, options: SelectLabelOptions): unknown {
  if (item === null || item === undefined) {
    return ''
  }
  if (!isRecord(item)) {
    const match = options.items.find(entry => (
      isRecord(entry) && options.itemValue !== undefined
        ? entry[options.itemValue] === item
        : false
    ))
    if (match !== undefined) {
      return getItemLabel(match, options)
    }
    return item
  }
  const text = item.text
  if (options.rawItemText) {
    return text || ''
  }
  return text ? options.t(`form.option.${String(text)}`) : item
}

/** Label of the selected value: the placeholder while nothing is selected. */
export function getSelectionLabel (item: unknown, options: SelectLabelOptions): unknown {
  if ([null, undefined, ''].includes(item as null)) {
    return options.placeholder || ''
  }
  return getItemLabel(item, options)
}
