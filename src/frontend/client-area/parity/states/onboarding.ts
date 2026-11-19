import type { Handler, ParityState, Probe, StateAction } from './state'
import { readFileSync } from 'node:fs'
import { instancesState, liteShellHome } from './instances'
import { addNewProbeFor, fabProbe } from './shell'

type InstancesOptions = NonNullable<Parameters<typeof instancesState>[0]>

// Next asks the domains of every service on the onboarding steps (legacy does not); an empty list answers it for both apps.
const serviceDomainsHandlers = {
  'GET /services/10/domains': { json: { data: [] } },
  'GET /services/11/domains': { json: { data: [] } },
}

export function onboardingState (options: InstancesOptions): Omit<ParityState, 'id'> {
  return instancesState({
    ...options,
    handlers: { ...serviceDomainsHandlers, ...options.handlers },
    lite: true,
  })
}

/**
 * A `/home` service the onboarding reads (`onboarding-service.ts`). Active, empty, with no installation type unless the
 * patch enables one; the arrays and objects the modals index are always present, as the real `/home` sends them.
 */
export function onboardingService (patch: Record<string, unknown> & { id: number }): Record<string, unknown> {
  // `onboarding` is merged over the defaults: a patch that names only `installation_type` keeps `user_configurable_options`
  // (legacy `SelectedServiceMixin.hasSelectedServiceUserConfigurableOptions` reads its `.length`, so a missing array throws).
  const { onboarding, ...rest } = patch
  return {
    status: 'active',
    plan_name: 'Starter',
    instance_count: 0,
    instance_limit: 5,
    hosting_accounts: [],
    ...rest,
    onboarding: {
      installation_type: {},
      user_configurable_options: [],
      account_config: {},
      can_select_reseller_user: false,
      ...(onboarding as Record<string, unknown> | undefined),
    },
  }
}

/**
 * `home` of an onboarding state on the lite target (M-2): the single-server `/home` (`liteShellHome`, which keeps
 * `is_ss_default`) with the given services and user fields such as `order_service_link`.
 */
export function liteOnboardingHome (services: Record<string, unknown>[], user: Record<string, unknown> = {}): Record<string, unknown> {
  const home = liteShellHome()
  return { ...home, user: { ...(home.user as Record<string, unknown>), services, ...user } }
}

/** Create on the empty list (legacy `.no-data--instances`, next `instances-no-data-create`); opens the first onboarding modal. */
export const clickCreate: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.locator('.no-data--instances .v-btn').first().click({ timeout: 8000 })
  },
  next: async page => {
    await page.getByTestId('instances-no-data-create').click({ timeout: 8000 })
  },
}

/** Add new on the navbar (desktop): the lite button, clicked without scrolling (lesson S-76). */
export const clickAddNew: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await addNewProbeFor('lite').legacy(page).evaluate((el: HTMLElement) => el.click())
  },
  next: async page => {
    await addNewProbeFor('lite').next(page).evaluate((el: HTMLElement) => el.click())
  },
}

/** The FAB (mobile): both apps' floating button, clicked without scrolling. */
export const clickFab: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await fabProbe.legacy(page).evaluate((el: HTMLElement) => el.click())
  },
  next: async page => {
    await fabProbe.next(page).evaluate((el: HTMLElement) => el.click())
  },
}

/**
 * The card, title, copy and first action of an onboarding dialog. `testId` is the next `data-testid` of its `v-dialog`.
 * The card is the readiness anchor.
 */
export function onboardingDialogProbes (testId: string): Probe[] {
  return [
    {
      key: 'modal',
      legacy: page => page.locator('.v-dialog--active .v-card').first(),
      next: page => page.getByTestId(testId).locator('.v-card').first(),
    },
    {
      key: 'modal-title',
      // Legacy is Vuetify 2: `.v-card__text` / `.v-card__actions`; next (V4) has `.v-card-text` / `.v-card-actions`.
      legacy: page => page.locator('.v-dialog--active .v-card__text h4'),
      next: page => page.getByTestId(testId).locator('.v-card-text h4'),
    },
    {
      key: 'modal-info',
      legacy: page => page.locator('.v-dialog--active .v-card__text p'),
      next: page => page.getByTestId(testId).locator('.v-card-text p'),
    },
    {
      key: 'modal-action',
      legacy: page => page.locator('.v-dialog--active .v-card__actions .v-btn').first(),
      next: page => page.getByTestId(testId).locator('.v-card-actions .v-btn').first(),
    },
  ]
}

// --- Template chooser (S-51a Phase 4) ---------------------------------------------------------------------------------

const THEME_SCREENSHOT = readFileSync(new URL('../fixtures/screenshot.png', import.meta.url))

/** `/instances/onboarding/theme-categories`: a gap at order 2 gives the sidebar its divider (legacy `addDividersToThemeCategories`). */
export const themeCategoryFixtures = {
  data: [
    { id: 1, name: 'Blog', order: 1 },
    { id: 2, name: 'Shop', order: 3 },
  ],
}

/** Custom templates: the screenshot comes from the API (`/instances/onboarding/theme/{id}/screenshot`); the first one has a preview. */
export const templateThemes: Record<string, unknown>[] = [
  { id: 101, name: 'Corporate', slug: 'corporate', type: 'custom', preview_url: 'https://example.com/preview/corporate' },
  { id: 102, name: 'Portfolio', slug: 'portfolio', type: 'custom' },
  { id: 103, name: 'Studio', slug: 'studio', type: 'custom' },
]

/** Page 1 answers the list and its total; later pages are empty, so the infinite scroll stops after one extra request. */
function themesHandler (themes: Record<string, unknown>[]): Handler {
  return ({ query }) => ({
    json: { data: query.get('page') === '1' ? themes : [], meta: { total: themes.length } },
  })
}

/** The handlers a chooser state needs: categories, the themes (or `hold`) and the screenshot of every custom theme. */
export function chooseTemplateHandlers (themes: Record<string, unknown>[], themesAnswer: Handler = themesHandler(themes)): Record<string, Handler> {
  const handlers: Record<string, Handler> = {
    'GET /instances/onboarding/theme-categories': { json: themeCategoryFixtures },
    'GET /instances/onboarding/themes': themesAnswer,
    // Next rewrites `/instances` to `/projects` under single server (`shared/api/client.ts`); legacy keeps `/instances`.
    'GET /projects/onboarding/theme-categories': { json: themeCategoryFixtures },
    'GET /projects/onboarding/themes': themesAnswer,
  }
  for (const theme of themes) {
    if (theme.type === 'custom') {
      handlers[`GET /instances/onboarding/theme/${theme.id}/screenshot`] = { headers: { 'content-type': 'image/png' }, body: THEME_SCREENSHOT }
    }
  }
  return handlers
}

/**
 * Click "Use" on the first template card. The card buttons are revealed on hover (opacity), so a plain click waits on the
 * hover; the element is clicked in the DOM like the add-new and FAB helpers above (the same button in both apps).
 */
export const clickUseTheme: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.locator('.template-card .v-btn').first().evaluate((el: HTMLElement) => el.click())
  },
  next: async page => {
    await page.locator('.template-card .v-btn').first().evaluate((el: HTMLElement) => el.click())
  },
}

/**
 * The card and title of the chooser, then the content probes (a template card, the skeleton grid and its skeleton, or the
 * empty block with its title). The content probes follow the title in the given order.
 */
export function chooseTemplateProbes (testId: string, ...content: Probe[]): Probe[] {
  return [
    {
      key: 'modal',
      legacy: page => page.locator('.v-dialog--active .v-card').first(),
      next: page => page.getByTestId(testId).locator('.v-card').first(),
    },
    {
      key: 'modal-title',
      legacy: page => page.locator('.v-dialog--active .v-card h1'),
      next: page => page.getByTestId(testId).locator('h1'),
    },
    ...content,
  ]
}
