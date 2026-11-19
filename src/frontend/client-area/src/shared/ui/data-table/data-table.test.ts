import { describe, expect, it, vi } from 'vitest'
import { dataTableRowProps, footerPageCount, groupHeaderBefore, isCardWidth, isRowToggleTarget, rowMarkerClass, SKELETON_VARIANTS, toggleOnKeydown, toV4Headers } from './data-table'

describe('toV4Headers', () => {
  it('turns V2 headers into V4 columns and keeps the layout keys', () => {
    expect(toV4Headers([
      { text: 'Name', value: 'name', sortable: true, align: 'end', width: 100 },
      { text: 'Actions', value: 'actions' },
    ])).toEqual([
      { title: 'Name', key: 'name', sortable: true, align: 'end', width: 100 },
      { title: 'Actions', key: 'actions', sortable: undefined, align: undefined, width: undefined },
    ])
  })

  it('returns no columns for no headers', () => {
    expect(toV4Headers([])).toEqual([])
  })
})

describe('footerPageCount', () => {
  it('returns the page count of a list that has rows, in both modes', () => {
    expect(footerPageCount('filtered', 3, 25, 10)).toBe(3)
    expect(footerPageCount('page', 3, 25, 10)).toBe(3)
  })

  it('returns 0 pages for a search that matches nothing', () => {
    expect(footerPageCount('filtered', 1, 0, 0)).toBe(0)
    expect(footerPageCount('page', 1, 0, 0)).toBe(0)
  })

  it('counts the filtered list in filtered mode and the page rows in page mode', () => {
    // A page past the end has no rows while the filtered list has some: only `page` mode says 0.
    expect(footerPageCount('filtered', 2, 12, 0)).toBe(2)
    expect(footerPageCount('page', 2, 12, 0)).toBe(0)
  })
})

describe('dataTableRowProps', () => {
  it('returns no class key without an itemClass', () => {
    expect(dataTableRowProps({ id: 1 })).toEqual({})
  })

  it('returns no class key when the itemClass gives an empty or no value', () => {
    expect(dataTableRowProps({ id: 1 }, () => '')).toEqual({})
    expect(dataTableRowProps({ id: 1 }, () => undefined)).toEqual({})
  })

  it('returns the class of the row', () => {
    expect(dataTableRowProps({ id: 7 }, item => `row-${item.id}`)).toEqual({ class: 'row-7' })
  })

  it('adds the attributes of rowAttrs and leaves no class key without a class', () => {
    expect(dataTableRowProps({ id: 1 }, undefined, () => ({ 'data-testid': 'row' }))).toEqual({ 'data-testid': 'row' })
    expect(dataTableRowProps({ id: 1 }, () => '', () => ({ 'data-testid': 'row', 'class': '' }))).toEqual({ 'data-testid': 'row' })
  })

  it('joins the class of the itemClass with the one of rowAttrs', () => {
    expect(dataTableRowProps({ id: 1 }, () => 'a', () => ({ class: 'b', id: 'x' }))).toEqual({ class: 'a b', id: 'x' })
    expect(dataTableRowProps({ id: 1 }, undefined, () => ({ class: 'b' }))).toEqual({ class: 'b' })
  })
})

describe('rowMarkerClass', () => {
  it('returns no class without markers', () => {
    expect(rowMarkerClass(undefined, false)).toBeUndefined()
    expect(rowMarkerClass('green', false)).toBeUndefined()
  })

  it('returns the bar class without a colour', () => {
    expect(rowMarkerClass(undefined, true)).toBe('item-bordered')
  })

  it('returns the bar class with the colour', () => {
    expect(rowMarkerClass('green', true)).toBe('item-bordered item-bordered--green')
  })
})

describe('isCardWidth', () => {
  it('uses the cardBelow width when it is set', () => {
    expect(isCardWidth(1400, 1300, false)).toBe(true)
    expect(isCardWidth(1400, 1500, true)).toBe(false)
  })

  it('uses the mobile breakpoint without cardBelow', () => {
    expect(isCardWidth(undefined, 500, true)).toBe(true)
    expect(isCardWidth(undefined, 1300, false)).toBe(false)
  })
})

describe('SKELETON_VARIANTS', () => {
  it('shows the logs card for the plugin skeleton', () => {
    expect(SKELETON_VARIANTS.plugin.mobile).toBe('logs')
  })
})

describe('groupHeaderBefore', () => {
  const rows = [{ day: 'a' }, { day: 'a' }, { day: 'b' }, { day: undefined }, { day: 'b' }]
  const label = (item: Record<string, unknown>): string | undefined => item.day as string | undefined

  it('returns the label of the first row and of every row whose label differs from the one before', () => {
    expect(rows.map((_, index) => groupHeaderBefore(rows, index, label))).toEqual(['a', undefined, 'b', undefined, 'b'])
  })

  it('returns nothing without groupLabel, for a row without a label and for a missing row', () => {
    expect(groupHeaderBefore(rows, 0, undefined)).toBeUndefined()
    expect(groupHeaderBefore(rows, 3, label)).toBeUndefined()
    expect(groupHeaderBefore(rows, 9, label)).toBeUndefined()
  })
})

describe('isRowToggleTarget', () => {
  function clickOn (html: string, selector: string): boolean {
    const row = document.createElement('tr')
    row.innerHTML = html
    let result = false
    row.addEventListener('click', event => {
      result = isRowToggleTarget(event)
    })
    ;(selector ? row.querySelector(selector)! : row).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return result
  }

  it('toggles on the row and on plain content', () => {
    expect(clickOn('<td><span class="x">t</span></td>', '.x')).toBe(true)
    expect(clickOn('<td></td>', '')).toBe(true)
  })

  it('does not toggle on a link, a button, a field or a role=button, or on what is inside them', () => {
    expect(clickOn('<td><a href="#" class="x"><b class="y">t</b></a></td>', '.y')).toBe(false)
    expect(clickOn('<td><button class="x"><i class="y"></i></button></td>', '.y')).toBe(false)
    expect(clickOn('<td><input class="x"></td>', '.x')).toBe(false)
    expect(clickOn('<td><span role="button" class="x"></span></td>', '.x')).toBe(false)
  })

  it('does not toggle on a select, a textarea, a label, a summary or another interactive role', () => {
    expect(clickOn('<td><select class="x"></select></td>', '.x')).toBe(false)
    expect(clickOn('<td><textarea class="x"></textarea></td>', '.x')).toBe(false)
    expect(clickOn('<td><label class="x"><b class="y">t</b></label></td>', '.y')).toBe(false)
    expect(clickOn('<td><details><summary class="x">t</summary></details></td>', '.x')).toBe(false)
    for (const role of ['link', 'checkbox', 'switch', 'menuitem']) {
      expect(clickOn(`<td><span role="${role}" class="x"></span></td>`, '.x')).toBe(false)
    }
  })

  it('does not toggle on a click that ends a text selection', () => {
    const row = document.createElement('tr')
    row.innerHTML = '<td><span class="x">Deploy archive</span></td>'
    document.body.append(row)
    const range = document.createRange()
    range.selectNodeContents(row.querySelector('.x')!)
    globalThis.getSelection()!.removeAllRanges()
    globalThis.getSelection()!.addRange(range)
    try {
      expect(clickOn(row.innerHTML, '.x')).toBe(false)
    } finally {
      globalThis.getSelection()!.removeAllRanges()
      row.remove()
    }
    expect(clickOn('<td><span class="x">t</span></td>', '.x')).toBe(true)
  })
})

describe('toggleOnKeydown', () => {
  function press (key: string, onChild = false): { toggled: number, prevented: boolean } {
    const row = document.createElement('tr')
    row.innerHTML = '<td><span class="x"></span></td>'
    let toggled = 0
    let prevented = false
    row.addEventListener('keydown', event => {
      toggleOnKeydown(event, () => {
        toggled += 1
      })
      prevented = event.defaultPrevented
    })
    const target = onChild ? row.querySelector('.x')! : row
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    return { toggled, prevented }
  }

  it('toggles on Enter and Space of the row and stops the page scroll', () => {
    expect(press('Enter')).toEqual({ toggled: 1, prevented: true })
    expect(press(' ')).toEqual({ toggled: 1, prevented: true })
  })

  it('ignores other keys and keys pressed on something inside the row', () => {
    expect(press('a')).toEqual({ toggled: 0, prevented: false })
    expect(press('Enter', true)).toEqual({ toggled: 0, prevented: false })
  })
})

describe('dataTableRowProps of an expandable row', () => {
  it('makes the row a focusable toggle with aria-expanded and no aria-controls while closed', () => {
    const toggle = vi.fn()
    const attrs = dataTableRowProps({ id: 1 }, undefined, undefined, { open: false, controls: 'x-1', toggle })
    expect(attrs.tabindex).toBe('0')
    expect(attrs['aria-expanded']).toBe('false')
    expect(attrs['aria-controls']).toBeUndefined()
    expect(typeof attrs.onClick).toBe('function')
    expect(typeof attrs.onKeydown).toBe('function')
    expect(toggle).not.toHaveBeenCalled()
  })

  it('sets aria-controls only for the open row', () => {
    const attrs = dataTableRowProps({ id: 1 }, undefined, undefined, { open: true, controls: 'x-1', toggle: vi.fn() })
    expect(attrs['aria-expanded']).toBe('true')
    expect(attrs['aria-controls']).toBe('x-1')
  })

  it('keeps the class and the attributes of the row next to the toggle attributes', () => {
    const attrs = dataTableRowProps({ id: 1 }, () => 'c', () => ({ 'data-testid': 'r' }), { open: false, toggle: vi.fn() })
    expect(attrs.class).toBe('c')
    expect(attrs['data-testid']).toBe('r')
  })
})
