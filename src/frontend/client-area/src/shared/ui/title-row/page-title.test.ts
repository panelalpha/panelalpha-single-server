import { describe, expect, it } from 'vitest'
import { pageTitleClasses } from './page-title'

describe('pageTitleClasses', () => {
  it('gives the Advanced frame the legacy page-title classes and the utilities of the one look', () => {
    expect(pageTitleClasses('advanced', false)).toEqual({
      container: 'page-title page-title--advanced py-3',
      title: 'page-title__title-box py-0',
      heading: 'page-title__title',
      filters: 'page-title__filter-controls pt-4 pt-lg-0 pb-0',
    })
    expect(pageTitleClasses('advanced', true)).toEqual(pageTitleClasses('advanced', false))
  })

  it('drops only the advanced modifier for a project page', () => {
    expect(pageTitleClasses('project', false)).toEqual({ ...pageTitleClasses('advanced', false), container: 'page-title py-3' })
  })

  it('gives a section the container of the title row and a right-aligned filter column, with pb-3 on mobile', () => {
    expect(pageTitleClasses('section', false)).toEqual({
      container: 'container px-0 py-3',
      title: 'd-flex align-center',
      heading: 'font-weight-light',
      filters: 'page-title__filter-controls d-flex justify-end align-end',
    })
    expect(pageTitleClasses('section', true).filters).toBe('page-title__filter-controls d-flex justify-end align-end pb-3')
  })
})
