import type { Handler, ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { tr } from './auth'
import { allHostingPrivileges } from './hosting'
import { INSTANCE_PAGE_PRIVILEGES, instancePageRaw } from './instance'
import { ADVANCED_PROJECT_ID, advancedActiveItemProbe, advancedFrameHandlers } from './instance-advanced-frame'
import { liteShellHome } from './instances'
import { isDesktop } from './shell'

// S-98 ui-instance-users: the Users page of a project on app-lite (`/projects/:id/advanced/users`, `target: 'lite'`; app has no such page).
// Not a spec file (testMatch is `*.parity.ts`). States: `instance-users.parity.ts`. Plan: context/changes/ui-instance-users/plan.md.

/** The single-server `/home` without the `admin` key: the style manager drawer would widen the full-page shot (as the Plugins states do). */
const { admin: _styleManagerAdmin, ...liteHomeWithoutAdmin } = liteShellHome()
export const USERS_HOME: Record<string, unknown> = liteHomeWithoutAdmin

/** The page path of the states (project 41 as the Advanced frame states). */
export const USERS_PATH = `/projects/${ADVANCED_PROJECT_ID}/advanced/users`

/**
 * The Advanced frame privileges (`ADVANCED_PRIVILEGES` of `instance-advanced-frame.ts` is not exported) plus `general.manage_users`: without it
 * the "Users" item is missing from the sidebar and the active item probe has nothing to measure.
 */
const USERS_PRIVILEGES = [...INSTANCE_PAGE_PRIVILEGES, 'wordpress.view_installation_details', ...allHostingPrivileges, 'general.manage_users']

/** The `GET /projects/41` body: a WordPress project as in the frame states, with the Users privilege. */
const usersInstance = instancePageRaw(ADVANCED_PROJECT_ID, { type: 'wordpress', app_type: 'wordpress', privileges: USERS_PRIVILEGES })

type UserRow = Record<string, unknown>

function user (id: string | number, username: string, email: string, role: string): UserRow {
  return { id, username, email, role }
}

/**
 * Ten users of the page (2 pages of 8). The ids are strings (the engine contract) and none is `"1"`; the default sort is the id descending as
 * text, so page 1 starts with `"7"` and page 2 holds `"11"` and `"10"`. One long e-mail shows the ellipsis.
 */
export const usersRows: UserRow[] = [
  user('2', 'bob', 'bob@example.com', 'editor'),
  user('3', 'carol', 'carol@example.com', 'subscriber'),
  user('5', 'dave', 'dave.with.a.really.long.mailbox.name.for.ellipsis@subdomain.example-company-name.com', 'editor'),
  user('7', 'grace', 'grace@example.com', 'administrator'),
  user('10', 'heidi', 'heidi@example.com', 'subscriber'),
  user('11', 'ivan', 'ivan@example.com', 'editor'),
  user('12', 'judy', 'judy@example.com', 'subscriber'),
  user('14', 'mallory', 'mallory@example.com', 'administrator'),
  user('20', 'niaj', 'niaj@example.com', 'subscriber'),
  user('21', 'olivia', 'olivia@example.com', 'editor'),
]

/** The email of the first row of page 1 (the readiness anchor): the id `"7"` sorts first as text. */
export const FIRST_ROW_EMAIL = 'grace@example.com'

/** `GET /projects/41/users-roles`. */
export const rolesRows = ['administrator', 'editor', 'author', 'subscriber']

/** The `GET …/users` handler: `{ data: rows }`. */
export const usersList = (rows: UserRow[] = usersRows): Handler => ({ json: { data: rows } })

/**
 * Every request the Advanced frame, the shell and the Users page make on project 41. `GET /projects/41/users` is also the SSO modal's list in
 * `advancedFrameHandlers`, so the page's rows replace it here. `overrides` replace any key.
 */
export function usersHandlers (overrides: Record<string, Handler> = {}): Record<string, Handler> {
  return advancedFrameHandlers({
    [`GET /projects/${ADVANCED_PROJECT_ID}`]: { json: { data: usersInstance } },
    [`GET /projects/${ADVANCED_PROJECT_ID}/users`]: usersList(),
    [`GET /projects/${ADVANCED_PROJECT_ID}/users-roles`]: { json: { data: rolesRows } },
    ...overrides,
  })
}

// ---------------------------------------------------------------------------------------------
// Probes. The title is the readiness anchor (first probe), then "Create User", the table card, the sort header row (desktop), the first row
// and the pagination footer. Legacy and next keep the same classes (`page-title__title`, `add-new-button`, `data-table`, `custom-sort`).
// ---------------------------------------------------------------------------------------------

export const usersTitleProbe: Probe = {
  key: 'users-title',
  legacy: page => page.locator('.page-title__title'),
  next: page => page.locator('.page-title__title'),
}

export const usersAddProbe: Probe = {
  key: 'users-add',
  legacy: page => page.locator('.add-new-button').first(),
  next: page => page.locator('.add-new-button').first(),
}

export const usersCardProbe: Probe = {
  key: 'users-card',
  legacy: page => page.locator('.v-card.data-table').first(),
  next: page => page.locator('.v-card.data-table').first(),
}

/** The sort header row (`TableCustomSort`), desktop only: on mobile the labels sit in each card. */
export const usersSortRowProbe: Probe = {
  key: 'users-sort-row',
  when: isDesktop,
  legacy: page => page.locator('tr.custom-sort').first(),
  next: page => page.locator('tr.custom-sort').first(),
}

/** The first data row: a table row on desktop, a `.mobile-table-item` card below 1400 px (the skeleton rows are not `tbody tr:not(.skeleton)`). */
export const usersFirstRowProbe: Probe = {
  key: 'users-first-row',
  legacy: page => page.locator('tbody tr:not(.skeleton), .mobile-table-item').first(),
  next: page => page.locator('tbody tr:not(.skeleton), .mobile-table-item').first(),
}

export const usersFooterProbe: Probe = {
  key: 'users-footer',
  legacy: page => page.locator('.data-iterator-footer').first(),
  next: page => page.locator('.data-iterator-footer').first(),
}

/** The probes of the default state, the title first. */
export const usersProbes: Probe[] = [
  usersTitleProbe,
  usersAddProbe,
  usersCardProbe,
  usersSortRowProbe,
  usersFirstRowProbe,
  usersFooterProbe,
  advancedActiveItemProbe,
]

// ---------------------------------------------------------------------------------------------
// Actions and probes of the list states (phase 6 onwards).
// ---------------------------------------------------------------------------------------------

/** The table switches to cards below 1400 px (legacy `$vuetify.breakpoint.width >= 1400`): the data rows differ per layout. */
function dataRows (page: Page) {
  return (page.viewportSize()?.width ?? 1440) >= 1400 ? page.locator('tbody tr:not(.skeleton)') : page.locator('.mobile-table-item')
}

/** The "Next page" button of the footer, then the wait for the two rows of page 2 (`"11"` and `"10"`). */
export const goToSecondPage: { legacy: StateAction, next: StateAction } = (() => {
  const action: StateAction = async page => {
    await page.locator('.data-iterator-footer').getByRole('button', { name: 'Next page' }).click()
    await expect(dataRows(page)).toHaveCount(2)
  }
  return { legacy: action, next: action }
})()

const isWide = (page: Page) => (page.viewportSize()?.width ?? 1440) >= 1400

/**
 * The reset and delete icon of the first row. Legacy icons have no accessible name: the desktop row keeps them in `.actions-row`, the mobile
 * card in `.mobile-table-item__actions` (reset first, delete second). Next names them after the tooltip keys (phase 4).
 */
function legacyRowIcon (page: Page, index: number): Locator {
  return page.locator(isWide(page) ? 'tbody tr .actions-row' : '.mobile-table-item__actions').first().locator('button').nth(index)
}

export const firstResetIcon: { legacy: (page: Page) => Locator, next: (page: Page) => Locator } = {
  legacy: page => legacyRowIcon(page, 0),
  next: page => page.getByRole('button', { name: tr('button.resetPassword', 'lite'), exact: true }).first(),
}

export const firstDeleteIcon: { legacy: (page: Page) => Locator, next: (page: Page) => Locator } = {
  legacy: page => legacyRowIcon(page, 1),
  next: page => page.getByRole('button', { name: tr('button.user.delete', 'lite'), exact: true }).first(),
}

/** The open "Reset password" tooltip (legacy `.menuable__content__active`, next the teleported `.v-overlay__content`; the page holds other, closed tooltips). */
const resetTooltip: { legacy: (page: Page) => Locator, next: (page: Page) => Locator } = {
  legacy: page => page.locator('.menuable__content__active').filter({ hasText: tr('button.resetPassword', 'lite') }),
  // Each row keeps a rendered tooltip: only the open one is visible.
  next: page => page.locator('.v-tooltip .v-overlay__content').filter({ hasText: tr('button.resetPassword', 'lite') }).filter({ visible: true }),
}

/** Hover on the first row's reset icon (desktop): the tooltip opens after its 150 ms delay and the icon's overlay shows. */
export const hoverFirstResetIcon: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await firstResetIcon.legacy(page).hover()
    await expect(resetTooltip.legacy(page)).toBeVisible()
  },
  next: async page => {
    await firstResetIcon.next(page).hover()
    await expect(resetTooltip.next(page)).toBeVisible()
  },
}

export const resetIconOverlayProbe: Probe = {
  key: 'reset-icon-overlay',
  legacy: page => firstResetIcon.legacy(page),
  next: page => firstResetIcon.next(page).locator('.v-btn__overlay'),
  pseudo: { legacy: '::before' },
  internal: true,
}

export const rowTooltipProbe: Probe = {
  key: 'reset-tooltip',
  legacy: page => resetTooltip.legacy(page),
  next: page => resetTooltip.next(page),
  internal: true,
}

/** The pointer is still on the icon after the capture (the full-page resize can drop `:hover`). */
export const resetIconStillHovered: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    expect(await firstResetIcon.legacy(page).evaluate(node => node.matches(':hover')), 'pointer on the reset icon').toBe(true)
  },
  next: async page => {
    expect(await firstResetIcon.next(page).evaluate(node => node.matches(':hover')), 'pointer on the reset icon').toBe(true)
  },
}

// ---------------------------------------------------------------------------------------------
// Phases 9-11: disabled Delete (`id: 1`), empty, search without results, loading.
// ---------------------------------------------------------------------------------------------

/**
 * Six users, the last row (id `1`, a number as in legacy's `item.id === 1`) has its Delete disabled. The ids sort as text descending, so `1` is
 * the last row of the only page. Desktop only: the mobile card does not disable Delete in legacy.
 */
export const protectedRows: UserRow[] = [
  user('2', 'bob', 'bob@example.com', 'editor'),
  user('3', 'carol', 'carol@example.com', 'subscriber'),
  user('5', 'dave', 'dave@example.com', 'editor'),
  user('7', 'grace', 'grace@example.com', 'administrator'),
  user('20', 'niaj', 'niaj@example.com', 'subscriber'),
  user(1, 'admin', 'admin@example.com', 'administrator'),
]

/** The Delete icon of the last row (id `1`): the second icon of its `.actions-row` in legacy, the named button in next. */
export const protectedDeleteProbe: Probe = {
  key: 'delete-disabled',
  legacy: page => page.locator('tbody tr').last().locator('.actions-row button').last(),
  next: page => page.locator('tbody tr').last().getByRole('button', { name: tr('button.user.delete', 'lite'), exact: true }),
}

export const protectedDeleteDisabled: { legacy: StateAction, next: StateAction } = (() => {
  const check = (locator: (page: Page) => Locator): StateAction => async page => {
    await expect(locator(page), 'Delete of the user with id 1').toBeDisabled()
  }
  return { legacy: check(protectedDeleteProbe.legacy), next: check(protectedDeleteProbe.next) }
})()

/** The empty list: `TableFullScreenMessage` ("No Users Were Found") with the plugins illustration. */
export const emptyProbes: Probe[] = [
  usersTitleProbe,
  usersAddProbe,
  usersCardProbe,
  { key: 'users-empty', legacy: page => page.locator('.no-data'), next: page => page.locator('.no-data') },
  { key: 'users-empty-title', legacy: page => page.locator('.no-data__title'), next: page => page.locator('.no-data__title') },
  { key: 'users-empty-image', legacy: page => page.locator('.no-data__img'), next: page => page.locator('.no-data__img') },
  usersFooterProbe,
  advancedActiveItemProbe,
]

/** The search without results: `DataIteratorNoResultsContainer` with "clear filters". */
export const searchEmptyProbes: Probe[] = [
  usersTitleProbe,
  usersAddProbe,
  usersCardProbe,
  { key: 'users-no-results', legacy: page => page.locator('.no-results-container'), next: page => page.locator('.no-results-container') },
  usersFooterProbe,
  advancedActiveItemProbe,
]

/** The loading list: the skeleton rows (desktop sort row + item, mobile five cards), the first probe is the card. */
export const loadingProbes: Probe[] = [
  usersTitleProbe,
  usersAddProbe,
  usersCardProbe,
  { key: 'users-skeleton', legacy: page => page.locator('.v-card.data-table .v-skeleton-loader').first(), next: page => page.locator('.v-card.data-table .v-skeleton-loader').first() },
  advancedActiveItemProbe,
]

/** Clicks "Create User" (the roles request is held, so the button stays loading); `evaluate` because the layout can move under the pointer. */
export const clickCreate: { legacy: StateAction, next: StateAction } = (() => {
  const action: StateAction = async page => {
    await page.mouse.move(0, 0)
    await page.locator('.add-new-button').first().evaluate(node => (node as HTMLElement).click())
  }
  return { legacy: action, next: action }
})()

/** The loading button of "Create User": the spinner is infinite, so it is masked (the button box, the label and the colour are measured). */
export const createLoadingProbe: Probe = {
  key: 'users-add-loading',
  legacy: page => page.locator('.add-new-button').first(),
  next: page => page.locator('.add-new-button').first(),
}

// ---------------------------------------------------------------------------------------------
// Phases 12-15: the Create, Reset password and Delete modals. Legacy `.v-dialog--active .basic-modal`, next the view's `users-modal`.
// ---------------------------------------------------------------------------------------------

type PageLocator = (page: Page) => Locator

const legacyModal: PageLocator = page => page.locator('.v-dialog--active .basic-modal')
const nextModal: PageLocator = page => page.getByTestId('users-modal')

/** A probe on something inside the modal (`selector` is shared by both apps: the kit keeps the V2 class names). */
function modalProbe (key: string, selector?: string): Probe {
  return {
    key,
    legacy: page => selector ? legacyModal(page).locator(selector).first() : legacyModal(page),
    next: page => selector ? nextModal(page).locator(selector).first() : nextModal(page),
  }
}

function modalButtonProbe (key: string, label: string): Probe {
  return {
    key,
    legacy: page => legacyModal(page).getByRole('button', { name: tr(label, 'lite'), exact: true }),
    next: page => nextModal(page).getByRole('button', { name: tr(label, 'lite'), exact: true }),
  }
}

const modalOpened: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await expect(legacyModal(page)).toBeVisible()
  },
  next: async page => {
    await expect(nextModal(page)).toBeVisible()
  },
}

/** "Create User" opened (the roles request answers at once). */
export const openCreate: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await clickCreate.legacy(page)
    await modalOpened.legacy(page)
  },
  next: async page => {
    await clickCreate.next(page)
    await modalOpened.next(page)
  },
}

const createFormProbes: Probe[] = [
  modalProbe('create-modal'),
  modalProbe('create-modal-title', 'h6'),
  ...[0, 1, 2, 3].map((index): Probe => ({
    key: `create-field-${index}`,
    legacy: page => legacyModal(page).locator('.v-input').nth(index),
    next: page => nextModal(page).locator('.v-input').nth(index),
  })),
  ...[0, 1, 2].map((index): Probe => ({
    key: `create-label-${index}`,
    legacy: page => legacyModal(page).locator('label.base--text').nth(index),
    next: page => nextModal(page).locator('label.base--text').nth(index),
  })),
  modalButtonProbe('create-submit', 'button.create'),
  modalButtonProbe('create-cancel', 'button.cancel'),
]

export const createModalProbes: Probe[] = [...usersProbes, ...createFormProbes]

/** Create with every field empty: the required messages show under the fields (legacy `validate-on-blur`, the button validates the form). */
export const submitEmptyCreate: { legacy: StateAction, next: StateAction } = (() => {
  const action = (modal: PageLocator): StateAction => async page => {
    await modal(page).getByRole('button', { name: tr('button.create', 'lite'), exact: true }).evaluate(node => (node as HTMLElement).click())
    await expect(modal(page).locator('.v-messages__message').first()).toBeVisible()
  }
  return { legacy: action(legacyModal), next: action(nextModal) }
})()

export const createInvalidProbes: Probe[] = [
  ...createModalProbes,
  modalProbe('create-message', '.v-messages__message'),
]

/** The valid form of the error and submitting states: the text fields, the password and the first role of the list. */
export const fillCreateForm: { legacy: StateAction, next: StateAction } = (() => {
  const action = (modal: PageLocator, optionList: string): StateAction => async page => {
    const box = modal(page)
    await box.getByPlaceholder(tr('form.placeholder.username', 'lite')).fill('newuser')
    await box.getByPlaceholder(tr('form.placeholder.email', 'lite')).fill('new.user@example.com')
    await box.locator('input[type="password"]').fill('password123')
    await box.locator('.v-select').click()
    await page.locator(optionList).filter({ hasText: 'editor' }).first().click()
    await expect(box.locator('.v-select')).toContainText('editor')
    // The select keeps its focus colour in legacy (V2 focus state); the states measure the filled form at rest, so the focus is dropped in both.
    await box.locator('h6').click()
    await expect(box.locator('.v-select')).not.toHaveClass(/v-input--is-focused|v-field--focused/)
  }
  return {
    legacy: action(legacyModal, '.menuable__content__active .v-list-item'),
    next: action(nextModal, '.v-overlay__content .v-list-item'),
  }
})()

/** Presses the primary button of the create modal (the click is an `evaluate`, the layout under the pointer can move). */
export const submitCreate: { legacy: StateAction, next: StateAction } = (() => {
  const action = (modal: PageLocator): StateAction => async page => {
    await page.mouse.move(0, 0)
    await modal(page).getByRole('button', { name: tr('button.create', 'lite'), exact: true }).evaluate(node => (node as HTMLElement).click())
  }
  return { legacy: action(legacyModal), next: action(nextModal) }
})()

export const CREATE_REFUSED = 'The email has already been taken.'

/** `POST /projects/41/users` refused (422 with `message`): the alert shows it, the modal stays open (legacy `.catch` leaves `open`). */
export const createRefusedHandler: Record<string, Handler> = {
  [`POST /projects/${ADVANCED_PROJECT_ID}/users`]: { status: 422, json: { message: CREATE_REFUSED } },
}

export const createSubmittingHandler: Record<string, Handler> = {
  [`POST /projects/${ADVANCED_PROJECT_ID}/users`]: 'hold',
}

export const alertErrorProbe: Probe = {
  key: 'alerts',
  legacy: page => page.locator('.alert-manager'),
  next: page => page.getByTestId('shell-alert-manager'),
}

/** The refused create: the error alert is on the page and the modal is still open. */
export const refusedCreateShown: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await expect(page.locator('.alert-manager').getByText(CREATE_REFUSED)).toBeVisible()
    await expect(legacyModal(page)).toBeVisible()
  },
  next: async page => {
    await expect(page.getByTestId('shell-alert-manager').getByText(CREATE_REFUSED)).toBeVisible()
    await expect(nextModal(page)).toBeVisible()
  },
}

export const errorProbes: Probe[] = [...createModalProbes, alertErrorProbe]

/** While submitting the modal is persistent, the close cross is gone and the primary button loads (the spinner is masked). */
export const submittingProbes: Probe[] = [
  ...createModalProbes,
  modalProbe('create-close', '.v-card-title .v-btn, .v-card__title .v-btn'),
]

export const modalLoaderMasks: NonNullable<ParityState['masks']> = {
  legacy: [page => legacyModal(page).locator('.v-btn__loader')],
  next: [page => nextModal(page).locator('.v-btn__loader')],
}

/** The reset modal of the first row: one password field ("New password"), the warning icon, the reset button. */
export const openReset: { legacy: StateAction, next: StateAction } = (() => {
  const action = (icon: PageLocator, modal: PageLocator): StateAction => async page => {
    await page.mouse.move(0, 0)
    await icon(page).evaluate(node => (node as HTMLElement).click())
    await expect(modal(page)).toBeVisible()
  }
  return { legacy: action(firstResetIcon.legacy, legacyModal), next: action(firstResetIcon.next, nextModal) }
})()

export const resetModalProbes: Probe[] = [
  ...usersProbes,
  modalProbe('reset-modal'),
  modalProbe('reset-modal-title', 'h6'),
  modalProbe('reset-modal-icon', '.v-icon'),
  modalProbe('reset-field', '.v-input'),
  modalProbe('reset-label', 'label.base--text'),
  modalButtonProbe('reset-submit', 'button.resetPassword'),
  modalButtonProbe('reset-cancel', 'button.cancel'),
]

/** The delete modal of the first row (id `"7"`): the message with the e-mail, the unchecked confirmation and Delete disabled. */
export const openDelete: { legacy: StateAction, next: StateAction } = (() => {
  const action = (icon: PageLocator, modal: PageLocator): StateAction => async page => {
    await page.mouse.move(0, 0)
    await icon(page).evaluate(node => (node as HTMLElement).click())
    await expect(modal(page)).toBeVisible()
  }
  return { legacy: action(firstDeleteIcon.legacy, legacyModal), next: action(firstDeleteIcon.next, nextModal) }
})()

export const deleteModalProbes: Probe[] = [
  ...usersProbes,
  modalProbe('delete-modal'),
  modalProbe('delete-modal-title', 'h6'),
  modalProbe('delete-modal-message', 'p'),
  modalProbe('delete-confirm', '.v-input--checkbox, .v-input'),
  modalButtonProbe('delete-submit', 'button.delete'),
  modalButtonProbe('delete-cancel', 'button.cancel'),
]

/** Ticks the confirmation and presses Delete (the request is held). */
export const confirmAndDelete: { legacy: StateAction, next: StateAction } = (() => {
  const action = (modal: PageLocator): StateAction => async page => {
    await modal(page).locator('input[type="checkbox"]').first().evaluate(node => (node as HTMLElement).click())
    const button = modal(page).getByRole('button', { name: tr('button.delete', 'lite'), exact: true })
    await expect(button).toBeEnabled()
    await button.evaluate(node => (node as HTMLElement).click())
  }
  return { legacy: action(legacyModal), next: action(nextModal) }
})()

export const deleteHeldHandler: Record<string, Handler> = {
  [`DELETE /projects/${ADVANCED_PROJECT_ID}/users/7`]: 'hold',
}
