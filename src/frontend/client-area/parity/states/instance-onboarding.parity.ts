import type { ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { alertProbes, buttonFocusState, buttonHoverState } from './auth'
import { liteProject } from './instances'
import {
  chooseTemplateHandlers,
  chooseTemplateProbes,
  clickAddNew,
  clickCreate,
  clickFab,
  clickUseTheme,
  liteOnboardingHome,
  onboardingDialogProbes,
  onboardingService,
  onboardingState,
  templateThemes,
} from './onboarding'

// Instance onboarding (S-51a). Opened from the empty list's Create; the first step decides the modal.
// M-2 (S-72): every state is measured on the lite target (`/projects`, app-lite is the source of truth), so the states
// go through `onboardingState`, which sets `lite: true`.

export const onboardingZeroData: ParityState = {
  id: 'onboarding-zero-data',
  ...onboardingState({
    home: liteOnboardingHome([]),
    legacy: [clickCreate.legacy],
    next: [clickCreate.next],
    probes: onboardingDialogProbes('onboarding-zero-data-modal'),
  }),
}

export const onboardingZeroDataOrder: ParityState = {
  id: 'onboarding-zero-data-order',
  ...onboardingState({
    home: liteOnboardingHome([], { order_service_link: 'https://example.com/order' }),
    legacy: [clickCreate.legacy],
    next: [clickCreate.next],
    probes: onboardingDialogProbes('onboarding-zero-data-modal'),
  }),
}

export const onboardingNoType: ParityState = {
  id: 'onboarding-no-type',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({ id: 10 })]),
    legacy: [clickCreate.legacy],
    next: [clickCreate.next],
    probes: onboardingDialogProbes('onboarding-no-type-modal'),
  }),
}

// Installation type (lite target: legacy shows the inert "coming soon" `go` card, next hides it;
// the delta goes to `exceptions.json` at the next measurement) and creation type (WordPress with migrations).
// The cards carry several paragraphs, so the copy probe (`modal-info`) is left out for this step; title and action stay.
const installationTypeProbes = onboardingDialogProbes('onboarding-installation-type-modal').filter(probe => probe.key !== 'modal-info')
// The next app asks the service's domains on this step (legacy does not); an empty list answers it for both apps.
const installationTypeHandlers = { 'GET /services/10/domains': { json: { data: [] } } }

export const onboardingChooseInstallationType: ParityState = {
  id: 'onboarding-choose-installation-type',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({ id: 10, onboarding: { installation_type: { wordpress: true, git: true, files: true, go: true } } })]),
    legacy: [clickCreate.legacy],
    next: [clickCreate.next],
    handlers: installationTypeHandlers,
    probes: installationTypeProbes,
  }),
}

export const onboardingChooseCreationType: ParityState = {
  id: 'onboarding-choose-creation-type',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({ id: 10, onboarding: { installation_type: { wordpress: true, migrations: true } } })]),
    legacy: [clickCreate.legacy],
    next: [clickCreate.next],
    // Several paragraphs in the creation cards: the copy probe (`modal-info`) is ambiguous in legacy, as for installation type.
    probes: onboardingDialogProbes('onboarding-creation-type-modal').filter(probe => probe.key !== 'modal-info'),
  }),
}

// Service choice and limit (Phase 3). Two plain services give the choice; the first one is full in the limit variants.
const wordpressType = { installation_type: { wordpress: true } }
const fullService = onboardingService({ id: 10, instance_count: 5, instance_limit: 5, onboarding: wordpressType })
const freeService = onboardingService({ id: 11, plan_name: 'Pro', instance_count: 1, instance_limit: 5, onboarding: wordpressType })
const upgradeService = { plan_upgrade_link: 'https://example.com/upgrade' }

function serviceState (id: string, services: Record<string, unknown>[], target: string, user: Record<string, unknown> = {}): ParityState {
  return {
    id,
    ...onboardingState({
      home: liteOnboardingHome(services, user),
      legacy: [clickCreate.legacy],
      next: [clickCreate.next],
      probes: onboardingDialogProbes(target),
    }),
  }
}

export const onboardingChooseService = serviceState('onboarding-choose-service', [freeService, onboardingService({ id: 12, plan_name: 'Basic', onboarding: wordpressType })], 'onboarding-choose-service-modal')
export const onboardingChooseServiceLimit = serviceState('onboarding-choose-service-limit', [fullService, freeService], 'onboarding-choose-service-modal')
export const onboardingChooseServiceUpgrade = serviceState('onboarding-choose-service-upgrade', [{ ...fullService, ...upgradeService }, freeService], 'onboarding-choose-service-modal')
export const onboardingLimit = serviceState('onboarding-limit', [fullService], 'onboarding-limit-modal')
export const onboardingLimitUpgrade = serviceState('onboarding-limit-upgrade', [{ ...fullService, ...upgradeService }], 'onboarding-limit-modal')
export const onboardingLimitOrder = serviceState('onboarding-limit-order', [fullService], 'onboarding-limit-modal', { order_service_link: 'https://example.com/order' })

// Lite cascade coverage (Phase 11). The lite source (app-lite `src/components/onboarding/`):
// - choose-service limit warning `OnboardingChooseServiceModal.vue:86-93`, upgrade button `:100-105` (`plan_upgrade_link?paupgradeserviceid=<id>`, shown only when the selected service is full);
//   next `modals/OnboardingChooseServiceModal.vue:161-164`.
// - limit modal: order link `OnboardingInstallationLimitModal.vue:93` (`user.order_service_link`), upgrade link `:96-97`; next `modals/OnboardingLimitModal.vue:123,127`.
// - zero-data order link: `OnboardingInstallationZeroDataModal.vue:71`; next `modals/OnboardingZeroDataModal.vue:83`.
// The four `*-limit*` and `-choose-service-upgrade` states above are checked against these lines: same fixtures, same link precedence.

// Creation type skipped (Phase 11). WordPress without `migrations` on any service: lite `installationTypeSelected` skips the Create vs Import
// modal (`InstallationTypeMixin.js:46-56` canMigrateWordpress; next `onboarding-steps.ts:136`, `onboarding-flow.ts:211`) and Create opens the
// service choice. Same fixture as `onboarding-choose-service`: the id pins the skip point, so a regression that shows the creation-type modal
// fails this state even when the service choice still matches.
export const onboardingCreationTypeSkipped = serviceState('onboarding-creation-type-skipped', [freeService, onboardingService({ id: 12, plan_name: 'Basic', onboarding: wordpressType })], 'onboarding-choose-service-modal')

// Template chooser (Phase 4). One WordPress service on the advanced path: Create goes straight to the chooser.
const templateService = onboardingService({ id: 10, install_method: 'advanced', onboarding: { installation_type: { wordpress: true } } })
const templateHome = liteOnboardingHome([templateService])
const templateCard: Probe = {
  key: 'template-card',
  legacy: page => page.locator('.template-card').first(),
  next: page => page.locator('.template-card').first(),
}

export const onboardingChooseTemplate: ParityState = {
  id: 'onboarding-choose-template',
  ...onboardingState({
    home: templateHome,
    handlers: chooseTemplateHandlers(templateThemes),
    legacy: [clickCreate.legacy],
    next: [clickCreate.next],
    probes: chooseTemplateProbes('onboarding-choose-template-modal', templateCard),
  }),
}

// Loading: the themes request is held, so the modal shows the skeleton grid (the grid row, then one skeleton card in it).
// The grid row is `d-flex flex-wrap w-100` in both apps (legacy loading slot `OnboardingChooseTemplateModal.vue:133`, next `:131`).
export const onboardingChooseTemplateLoading: ParityState = {
  id: 'onboarding-choose-template-loading',
  ...onboardingState({
    home: templateHome,
    handlers: chooseTemplateHandlers(templateThemes, 'hold'),
    legacy: [clickCreate.legacy],
    next: [clickCreate.next],
    probes: chooseTemplateProbes(
      'onboarding-choose-template-modal',
      {
        key: 'skeleton-grid',
        legacy: page => page.locator('.v-dialog--active .d-flex.flex-wrap.w-100').first(),
        next: page => page.getByTestId('onboarding-choose-template-modal').locator('.d-flex.flex-wrap.w-100').first(),
      },
      {
        key: 'skeleton',
        legacy: page => page.locator('.v-dialog--active .v-skeleton-loader').first(),
        next: page => page.getByTestId('onboarding-choose-template-modal').locator('.v-skeleton-loader').first(),
      },
    ),
  }),
}

// Empty: no template for the list, so the no-data block with the illustration and its title (`message.emptyTable.chooseTheme.title`).
export const onboardingChooseTemplateEmpty: ParityState = {
  id: 'onboarding-choose-template-empty',
  ...onboardingState({
    home: templateHome,
    handlers: chooseTemplateHandlers([]),
    legacy: [clickCreate.legacy],
    next: [clickCreate.next],
    probes: chooseTemplateProbes(
      'onboarding-choose-template-modal',
      {
        key: 'no-data',
        legacy: page => page.locator('.no-data-container').first(),
        next: page => page.locator('.no-data-container').first(),
      },
      {
        key: 'no-data-title',
        legacy: page => page.locator('.no-data-container h4').first(),
        next: page => page.locator('.no-data-container h4').first(),
      },
    ),
  }),
}

// Preparing: "Use" on a template holds the instance options request, so the overlay shows its spinner (`Loader`) and its text.
// The overlay is the anchor; the spinner is the `v-progress-circular` inside it (the text is not probed: it is set per step).
export const onboardingTemplatePreparing: ParityState = {
  id: 'onboarding-template-preparing',
  ...onboardingState({
    home: templateHome,
    handlers: {
      ...chooseTemplateHandlers(templateThemes),
      'GET /services/10/instance-options': 'hold',
    },
    legacy: [clickCreate.legacy, clickUseTheme.legacy],
    next: [clickCreate.next, clickUseTheme.next],
    pointer: 'keep',
    probes: chooseTemplateProbes(
      'onboarding-choose-template-modal',
      {
        key: 'loading-overlay',
        legacy: page => page.locator('.onboarding-loading-overlay.v-overlay--active'),
        next: page => page.locator('.onboarding-loading-overlay.v-overlay--active'),
      },
      {
        key: 'loader',
        legacy: page => page.locator('.onboarding-loading-overlay.v-overlay--active .v-progress-circular'),
        next: page => page.locator('.onboarding-loading-overlay.v-overlay--active .v-progress-circular'),
      },
    ),
  }),
}

// Share access and user options (Phase 5). A simple-mode service skips the template; the reseller user gets share access, the
// other user goes to the options step after the instance options load (legacy `getInstanceOptions` holds 1.5 s).
const simpleService = { install_method: 'super_quick' }

export const onboardingShareAccess: ParityState = {
  id: 'onboarding-share-access',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({ id: 10, ...simpleService, onboarding: { ...wordpressType } })], { reseller_settings: {} }),
    handlers: {
      'GET /invitation-suggestions': { json: { data: [{ email: 'cara@example.com', name: 'Cara Fox' }] } },
    },
    legacy: [clickCreate.legacy],
    next: [clickCreate.next],
    probes: [
      {
        key: 'modal',
        legacy: page => page.locator('.v-dialog--active .v-card').first(),
        next: page => page.getByTestId('onboarding-share-access-modal').locator('.v-card').first(),
      },
      {
        key: 'modal-title',
        legacy: page => page.locator('.v-dialog--active .v-card__title h6'),
        next: page => page.getByTestId('onboarding-share-access-modal').locator('.v-card-title h6'),
      },
      {
        key: 'modal-action',
        legacy: page => page.locator('.v-dialog--active .v-card__actions .v-btn').last(),
        next: page => page.getByTestId('onboarding-share-access-modal').locator('.v-card-actions .v-btn').last(),
      },
    ],
  }),
}

export const onboardingUco: ParityState = {
  id: 'onboarding-uco',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({
      id: 10,
      ...simpleService,
      onboarding: { ...wordpressType, user_configurable_options: [{ name: 'region', type: 'select' }], account_config: {}, can_select_reseller_user: false },
    })]),
    handlers: {
      'GET /services/10/instance-options': {
        json: { data: { user_configurable_options: { region: [{ text: 'Europe', value: 'eu' }, { text: 'United States', value: 'us' }] } } },
      },
    },
    legacy: [clickCreate.legacy],
    next: [clickCreate.next],
    probes: [
      {
        key: 'modal',
        legacy: page => page.locator('.v-dialog--active .v-card').first(),
        next: page => page.getByTestId('onboarding-user-options-modal').locator('.v-card').first(),
      },
      {
        key: 'modal-title',
        legacy: page => page.locator('.v-dialog--active .v-card__text h6').first(),
        next: page => page.getByTestId('onboarding-user-options-modal').locator('.v-card-text h6').first(),
      },
      {
        key: 'modal-action',
        legacy: page => page.locator('.v-dialog--active .v-card__actions .v-btn').last(),
        next: page => page.getByTestId('onboarding-user-options-modal').locator('.v-card-actions .v-btn').last(),
      },
    ],
  }),
}

// Entry points (S-72): Add new on the navbar (desktop) and the FAB (mobile) open the same first step as Create. The list under the
// modal holds one project. Each state is skipped in the variants where its button is not rendered (`shell.ts`).
const viaAddNewHome = liteOnboardingHome([onboardingService({ id: 10, onboarding: { installation_type: { wordpress: true, git: true, files: true, go: true } } })])

export const onboardingViaAddNew: ParityState = {
  id: 'onboarding-via-add-new',
  ...onboardingState({
    items: [liteProject(1)],
    home: viaAddNewHome,
    legacy: [clickAddNew.legacy],
    next: [clickAddNew.next],
    handlers: installationTypeHandlers,
    probes: installationTypeProbes,
  }),
}

export const onboardingViaFabMobile: ParityState = {
  id: 'onboarding-via-fab-mobile',
  ...onboardingState({
    items: [liteProject(1)],
    home: viaAddNewHome,
    legacy: [clickFab.legacy],
    next: [clickFab.next],
    handlers: installationTypeHandlers,
    probes: installationTypeProbes,
  }),
}

// Hover and focus (Phase 7). The creation-type card is a `div` with a click handler and no tabindex in the legacy app (app-lite
// `CheckboxBig.vue`), so keyboard focus never reaches it there and this probe compares hover only. Hover paints the `::after` border primary; the
// pixel gate sees that overlay only near its threshold, so the probe reads the pseudo-element. The second card (Import) is hovered:
// the first one is already checked, so its hover looks the same as its default.
const creationTypeImportCard: Probe = {
  key: 'creation-type-card-import',
  legacy: page => page.locator('.v-dialog--active .checkbox-big').nth(1),
  next: page => page.getByTestId('onboarding-creation-type-modal').locator('.checkbox-big').nth(1),
  pseudo: { legacy: '::after', next: '::after' },
}

/** `base` with the pointer resting on the probed element and the probe added (the element hover of `buttonHoverState`). */
function elementHoverState (base: ParityState, id: string, probe: Probe): ParityState {
  const stillHovered = (locate: (page: Page) => Locator): StateAction => async page => {
    expect(await locate(page).evaluate(element => element.matches(':hover')), 'pointer on the card').toBe(true)
  }
  return {
    ...base,
    id,
    pointer: 'keep',
    actions: {
      legacy: [...base.actions.legacy, page => probe.legacy(page).hover()],
      next: [...base.actions.next, page => probe.next(page).hover()],
    },
    probes: [...base.probes, probe],
    afterCapture: {
      legacy: [...(base.afterCapture?.legacy ?? []), stillHovered(probe.legacy)],
      next: [...(base.afterCapture?.next ?? []), stillHovered(probe.next)],
    },
  }
}

export const onboardingCreationTypeHover = elementHoverState(onboardingChooseCreationType, 'onboarding-creation-type-hover', creationTypeImportCard)

// The primary button of the service step: the copy is `button.website.create` ("Create Site") for the single WordPress service
// the default base sends through the Create path (`serviceActionLabelKey`, the fallback). Focus is set programmatically after
// a key that moves no focus, as in `buttonFocusState` (auth).
export const onboardingChooseServiceHover = buttonHoverState(onboardingChooseService, 'onboarding-choose-service-hover', 'button.website.create', 'lite')
export const onboardingChooseServiceFocus = buttonFocusState(onboardingChooseService, 'onboarding-choose-service-focus', 'button.website.create', 'lite')

// Disabled primary button (Phase 8). The only disabled primary action of the service step is the limit
// (`hasSelectedServiceLimitReached()`: legacy `OnboardingChooseServiceModal.vue:116`, next `OnboardingChooseServiceModal.vue:101`).
// The app has no "continue without a selection" disabled state (N/A). The limit home makes the first service full, so the
// modal's first action is disabled; the assertion below checks that in both apps before the capture.
function primaryActionDisabled (locate: (page: Page) => Locator): StateAction {
  return async page => {
    await expect(locate(page), 'primary action disabled').toBeDisabled()
  }
}
export const onboardingChooseServiceDisabled: ParityState = {
  ...onboardingChooseServiceLimit,
  id: 'onboarding-choose-service-disabled',
  afterCapture: {
    legacy: [
      ...(onboardingChooseServiceLimit.afterCapture?.legacy ?? []),
      primaryActionDisabled(page => page.locator('.v-dialog--active .v-card__actions .v-btn').first()),
    ],
    next: [
      ...(onboardingChooseServiceLimit.afterCapture?.next ?? []),
      primaryActionDisabled(page => page.getByTestId('onboarding-choose-service-modal').locator('.v-card-actions .v-btn').first()),
    ],
  },
}

// Error (Phase 9): `GET /services/10/instance-options` answers 500 under the "preparing" overlay. Legacy `getInstanceOptions`
// (LITE `OnboardingModalWrapper.vue:1135-1153`, the catch shows the API message via `addAlert`) then holds the overlay 1500 ms
// (`:1555`) and goes on to the user-options step. The alert is the anchor, not the hold time. The service carries
// `user_configurable_options`, so the flow after the failure stays on the modal and sends no install request.
export const onboardingOptionsError: ParityState = {
  id: 'onboarding-options-error',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({
      id: 10,
      ...simpleService,
      onboarding: { ...wordpressType, user_configurable_options: ['region'], account_config: {}, can_select_reseller_user: false },
    })]),
    handlers: {
      'GET /services/10/instance-options': { status: 500, json: { message: 'Server error.' } },
    },
    legacy: [clickCreate.legacy],
    next: [clickCreate.next],
    probes: alertProbes(page => page.locator('.alert-manager .alert--error')),
  }),
}

const states: ParityState[] = [
  onboardingShareAccess,
  onboardingUco,
  onboardingChooseTemplate,
  onboardingChooseTemplateLoading,
  onboardingChooseTemplateEmpty,
  onboardingTemplatePreparing,
  onboardingChooseService,
  onboardingChooseServiceLimit,
  onboardingChooseServiceUpgrade,
  onboardingLimit,
  onboardingLimitUpgrade,
  onboardingLimitOrder,
  onboardingZeroData,
  onboardingZeroDataOrder,
  onboardingNoType,
  onboardingChooseInstallationType,
  onboardingChooseCreationType,
  onboardingCreationTypeSkipped,
  onboardingViaAddNew,
  onboardingViaFabMobile,
  onboardingCreationTypeHover,
  onboardingChooseServiceHover,
  onboardingChooseServiceFocus,
  onboardingChooseServiceDisabled,
  onboardingOptionsError,
]

// The FAB is rendered on mobile only and Add new on desktop only (`shell.ts`, `isMobile` / `isDesktop`).
const mobileOnly = new Set([onboardingViaFabMobile.id])
const desktopOnly = new Set([onboardingViaAddNew.id])

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    const isMobileVariant = testInfo.project.name.endsWith('mobile')
    test.skip(mobileOnly.has(state.id) && !isMobileVariant, 'the FAB is rendered on mobile only')
    test.skip(desktopOnly.has(state.id) && isMobileVariant, 'Add new is rendered on desktop only')
    await runState(browser, testInfo, state)
  })
}
