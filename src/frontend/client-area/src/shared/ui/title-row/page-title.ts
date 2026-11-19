// Variants and classes of the kit page title. The variant is where the title sits, not a look:
// `advanced` in the Advanced frame of a project (the frame gives the top offset), `project` right under the tab strip of a project (the
// global `.page-title` top margin of `_pageTitle.scss` gives it: Backups, Plugins, Monitoring), `section` under the h1 of a `PageFrame`
// (My server, Reseller Area, Connect AI, account pages). One look per variant: the classes below are the only ones a title gets.

export type PageTitleVariant = 'advanced' | 'project' | 'section'

export interface PageTitleClasses {
  container: string
  title: string
  heading: string
  filters: string
}

export function pageTitleClasses (variant: PageTitleVariant, mobile: boolean): PageTitleClasses {
  if (variant === 'section') {
    return {
      container: 'container px-0 py-3',
      title: 'd-flex align-center',
      heading: 'font-weight-light',
      filters: mobile ? 'page-title__filter-controls d-flex justify-end align-end pb-3' : 'page-title__filter-controls d-flex justify-end align-end',
    }
  }
  return {
    container: variant === 'advanced' ? 'page-title page-title--advanced py-3' : 'page-title py-3',
    title: 'page-title__title-box py-0',
    heading: 'page-title__title',
    filters: 'page-title__filter-controls pt-4 pt-lg-0 pb-0',
  }
}
