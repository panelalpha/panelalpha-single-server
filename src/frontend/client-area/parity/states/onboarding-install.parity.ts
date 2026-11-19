import type { Handler, ParityState, Probe, StateAction } from './state'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { runState } from '../driver/run-state'
import { alertProbes, buttonFocusState, buttonHoverState, settled, tr } from './auth'
import { deployLiveHandlers } from './instances'
import {
  chooseTemplateHandlers,
  clickCreate,
  clickUseTheme,
  liteOnboardingHome,
  onboardingDialogProbes,
  onboardingService,
  onboardingState,
  templateThemes,
} from './onboarding'

// Instance onboarding, install / import / deploy lite (S-73 `ui-onboarding-install`). Same entry as S-72: Create on the empty
// list, measured on the lite target (`/projects`, app-lite is the source of truth). Phase 1 covers the two base states that
// the frame and the modal chrome depend on; Phase 11 adds the install domain steps (domain, transfer, DNS, site name).

const DOMAIN = 'example.test'
const DOMAIN_MODAL = 'onboarding-domain-modal'

// The service answers of the domain steps (`onboarding-service.ts`, `onboarding.api.ts:130-145,230`, `domain-verification.api.ts`).
// Both apps call `/services/{id}/…` (the lite rewrite only touches `instances`), so one key set serves both.
const instanceOptions = { 'GET /services/10/instance-options': { json: { data: { user_configurable_options: {} } } } }
const domainAnswers = {
  'GET /services/10/domains/validate': { json: {} },
  'POST /services/10/domains': { json: { data: { id: 501, domain: DOMAIN } } },
  'GET /services/10/domains/resolve': { json: { data: { is_resolved: false } } },
}
// `verify` is the body itself (no `data` wrapper): the transfer step reads `verification_required` and `verification_record`.
const transferRequired = {
  'GET /services/10/domains/verify': {
    json: {
      verification_allowed: true,
      verification_required: true,
      verification_record: { name: 'panelalpha-verify', type: 'TXT', content: 'panelalpha-verification=3f9c2a' },
    },
  },
}

// Install path with the domain step: Create → domain modal. Super-quick mode, the same entry as `onboarding-domain` (Phase 1).
function domainService (onboarding: Record<string, unknown> = {}): Record<string, unknown> {
  return onboardingService({
    id: 10,
    install_method: 'super_quick',
    ask_for_domain: true,
    onboarding: { installation_type: { wordpress: true }, ...onboarding },
  })
}

// Typing the domain into the combobox and leaving it (Tab): both apps validate the domain on blur, and the continue button stays
// disabled until that validation ends. Next renders a hidden input before the combobox's text input, so it is skipped.
const typeDomain: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    const input = page.locator('.v-dialog--active .v-card input').first()
    await input.fill(DOMAIN)
    await input.press('Tab')
  },
  next: async page => {
    const input = page.getByTestId('onboarding-domain-modal').locator('input:not([type="hidden"])').first()
    await input.fill(DOMAIN)
    await input.press('Tab')
  },
}
const submitDomain: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.locator('.v-dialog--active .v-card__actions .v-btn').first().click({ timeout: 8000 })
  },
  next: async page => {
    await page.getByTestId('onboarding-domain-modal').locator('.v-card-actions .v-btn').first().click({ timeout: 8000 })
  },
}

/** Modal card (readiness anchor), its title (`h4` or `h6`, as the modal writes it) and the state's extra probes. */
function dialogProbes (testId: string, titleTag: 'h4' | 'h6', ...rest: Probe[]): Probe[] {
  return [
    onboardingDialogProbes(testId)[0]!,
    {
      key: 'modal-title',
      legacy: page => page.locator(`.v-dialog--active .v-card ${titleTag}`).first(),
      next: page => page.getByTestId(testId).locator(titleTag).first(),
    },
    ...rest,
  ]
}

/** A button of the modal, found by its visible name (`tr` reads the lite copy). */
function buttonProbe (key: string, testId: string, copyKey: string): Probe {
  return {
    key,
    legacy: page => page.locator('.v-dialog--active .v-card').getByRole('button', { name: tr(copyKey, 'lite'), exact: true }),
    next: page => page.getByTestId(testId).getByRole('button', { name: tr(copyKey, 'lite'), exact: true }),
  }
}

/** The box and the native input of the modal's text field (site name). */
function fieldProbes (key: string, testId: string): Probe[] {
  return [
    {
      key: `${key}-field`,
      legacy: page => page.locator('.v-dialog--active .v-card .v-input__slot').first(),
      next: page => page.getByTestId(testId).locator('.v-field').first(),
      part: 'box',
      internal: true,
    },
    {
      key: `${key}-input`,
      legacy: page => page.locator('.v-dialog--active .v-card input').first(),
      next: page => page.getByTestId(testId).locator('input').first(),
      part: 'input',
      internal: true,
    },
  ]
}

// Domain step (Phase 1 base). The domain answers are added so the step can be driven; its variants come in later phases.
export const onboardingDomain: ParityState = {
  id: 'onboarding-domain',
  ...onboardingState({
    home: liteOnboardingHome([domainService()]),
    handlers: { ...instanceOptions, ...domainAnswers },
    legacy: [clickCreate.legacy],
    next: [clickCreate.next],
    probes: onboardingDialogProbes('onboarding-domain-modal'),
  }),
}

// Domain step with free subdomains (`onboarding.subdomain_bases`, LITE `OnboardingChooseDomainModal.vue:41-141`): two bordered
// panels with a radio circle in the header (`::before` ring, `::after` dot), the first one open.
const SUBDOMAIN_BASES = ['free.example.com']

function domainPanelProbes (): Probe[] {
  const panel = (index: number) => ({
    legacy: (page: Page) => page.locator('.v-dialog--active .onboarding-domain-panels .v-expansion-panel').nth(index),
    next: (page: Page) => page.getByTestId('onboarding-domain-modal').locator('.onboarding-domain-panels .v-expansion-panel').nth(index),
  })
  const header = (index: number) => ({
    legacy: (page: Page) => page.locator('.v-dialog--active .onboarding-domain-panels .v-expansion-panel-header').nth(index),
    next: (page: Page) => page.getByTestId('onboarding-domain-modal').locator('.onboarding-domain-panels .v-expansion-panel-title').nth(index),
  })
  return [
    ...onboardingDialogProbes('onboarding-domain-modal'),
    { key: 'panel-open', ...panel(0) },
    { key: 'panel-closed', ...panel(1) },
    { key: 'header-open', ...header(0) },
    { key: 'header-closed', ...header(1) },
    { key: 'header-open-ring', ...header(0), pseudo: { legacy: '::before', next: '::before' } },
    { key: 'header-open-dot', ...header(0), pseudo: { legacy: '::after', next: '::after' } },
    { key: 'header-closed-ring', ...header(1), pseudo: { legacy: '::before', next: '::before' } },
    { key: 'header-closed-dot', ...header(1), pseudo: { legacy: '::after', next: '::after' } },
    {
      key: 'secondary-label',
      legacy: page => page.locator('.v-dialog--active .v-card__actions .v-btn').nth(1).locator('span span').first(),
      next: page => page.getByTestId('onboarding-domain-secondary').locator('.v-btn__content > span').first(),
    },
    {
      key: 'free-affix',
      legacy: page => page.locator('.v-dialog--active .onboarding-domain-panels .v-select .v-input__slot').first(),
      next: page => page.getByTestId('onboarding-domain-modal').locator('.onboarding-domain-panels .v-select .v-field').first(),
      part: 'box',
      internal: true,
    },
    {
      key: 'domain-field',
      legacy: page => page.locator('.v-dialog--active .onboarding-domain-panels .v-input__slot').first(),
      next: page => page.getByTestId('onboarding-domain-modal').locator('.onboarding-domain-panels .v-field').first(),
      part: 'box',
      internal: true,
    },
  ]
}

export const onboardingDomainSubdomains: ParityState = {
  id: 'onboarding-domain-subdomains',
  ...onboardingState({
    home: liteOnboardingHome([domainService({ subdomain_bases: SUBDOMAIN_BASES })]),
    handlers: { ...instanceOptions, ...domainAnswers },
    legacy: [clickCreate.legacy],
    next: [clickCreate.next],
    probes: domainPanelProbes(),
  }),
}

// The same step with the free subdomain panel open (click on its header): the subdomain field, the dot and the base select.
export const onboardingDomainSubdomainsFree: ParityState = {
  id: 'onboarding-domain-subdomains-free',
  ...onboardingState({
    home: liteOnboardingHome([domainService({ subdomain_bases: SUBDOMAIN_BASES })]),
    handlers: { ...instanceOptions, ...domainAnswers },
    legacy: [clickCreate.legacy, async page => {
      await page.locator('.v-dialog--active .onboarding-domain-panels .v-expansion-panel-header').nth(1).click()
      await page.waitForTimeout(400)
    }],
    next: [clickCreate.next, async page => {
      await page.getByTestId('onboarding-domain-modal').locator('.onboarding-domain-panels .v-expansion-panel-title').nth(1).click()
      await page.waitForTimeout(400)
    }],
    probes: domainPanelProbes(),
  }),
}

// Domain transfer: the server allows transfers and the domain needs a DNS record first (`runAfterDomain`, LITE `:1356-1407`).
// The domain is typed and confirmed; the verify answer opens the transfer modal (`OnboardingDomainTransferModal.vue`).
export const onboardingDomainTransfer: ParityState = {
  id: 'onboarding-domain-transfer',
  ...onboardingState({
    home: liteOnboardingHome([domainService({ server_allow_domain_transfer: true, domain_transfer_enabled: true })]),
    handlers: { ...instanceOptions, ...domainAnswers, ...transferRequired },
    legacy: [clickCreate.legacy, typeDomain.legacy, submitDomain.legacy],
    next: [clickCreate.next, typeDomain.next, submitDomain.next],
    probes: dialogProbes('onboarding-domain-transfer-modal', 'h4', buttonProbe('transfer-now', 'onboarding-domain-transfer-modal', 'button.transferNow')),
  }),
}

// DNS verify: the domain is created and does not resolve yet, so the eager check opens the DNS step (`afterDomainCreated`,
// `install-sequence.ts`). The check itself (2000 ms wait) is the loading state of Phase 20; here the step is the default.
export const onboardingDnsVerify: ParityState = {
  id: 'onboarding-dns-verify',
  ...onboardingState({
    // The eager check resolves the domain by the configured methods (`verifyDomainResolving`: none = resolved at once), so one A
    // record check is configured; `example.test` never resolves (DoH answers nothing), so the DNS step opens in both apps.
    home: liteOnboardingHome([{
      ...domainService({
        eager_domain_dns_verification_enabled: true,
        dns_settings: { verification_methods: ['resolve_a_record'], verification_mode: 'any' },
      }),
      dns_server: { enabled: false, nameservers: [] },
      hosting_server: { ip_v4_addresses: ['203.0.113.10'] },
    }]),
    handlers: { ...instanceOptions, ...domainAnswers },
    legacy: [clickCreate.legacy, typeDomain.legacy, submitDomain.legacy],
    next: [clickCreate.next, typeDomain.next, submitDomain.next],
    probes: dialogProbes(
      'onboarding-domain-dns-modal',
      'h4',
      buttonProbe('verify-domain', 'onboarding-domain-dns-modal', 'button.verifyDomain'),
      buttonProbe('skip', 'onboarding-domain-dns-modal', 'button.skip'),
    ),
  }),
}

// Site name (no domain step): the service asks for a site name after the installation type (`resolveInstallTail`, `asksForSiteName`).
export const onboardingSiteName: ParityState = {
  id: 'onboarding-site-name',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({
      id: 10,
      install_method: 'super_quick',
      ask_for_site_name: true,
      onboarding: { installation_type: { wordpress: true } },
    })]),
    handlers: instanceOptions,
    legacy: [clickCreate.legacy],
    next: [clickCreate.next],
    probes: dialogProbes(
      'onboarding-site-name-modal',
      'h6',
      ...fieldProbes('site-name', 'onboarding-site-name-modal'),
      buttonProbe('modal-action', 'onboarding-site-name-modal', 'button.website.create'),
    ),
  }),
}

// Git deploy (lite only): the single installation type `git` goes straight to the deploy step (`resolveAfterService`, next
// `onboarding-steps.ts:192-193`; legacy `OnboardingDeployFromGitModal.vue`). No share access, no domain.
export const onboardingDeployGit: ParityState = {
  id: 'onboarding-deploy-git',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({
      id: 10,
      onboarding: { installation_type: { git: true } },
    })]),
    legacy: [clickCreate.legacy],
    next: [clickCreate.next],
    probes: [
      ...onboardingDialogProbes('onboarding-deploy-git-modal'),
      // The fixed note above the repo url (LITE `OnboardingDeployFromGitModal.vue:37-39`), shown in every state of the modal.
      {
        key: 'protocol-info',
        legacy: page => page.locator('.v-dialog--active .v-card').getByText(tr('heading.onboarding.gitDeploy.repoUrl.protocolInfo', 'lite'), { exact: true }),
        next: page => page.getByTestId('onboarding-deploy-git-modal').getByText(tr('heading.onboarding.gitDeploy.repoUrl.protocolInfo', 'lite'), { exact: true }),
      },
    ],
  }),
}

// --- Phase 12: default states of the install path (form, progress, super-quick, sync, demo, forced install) ----------------

const DEMO_EMAIL = 'demo@panelalpha.com'

// The `after-login` event runs only after a login, never on a plain `/projects` load (LITE `Login.vue:500-505`, next
// `LoginView.vue:794-798`). Opening `/login` with a `/home` that already holds a user makes both apps' `remoteAuthCheck`
// succeed, which emits `after-login` (so the `-redirect` key and the forced install act) and then redirects to `/projects`.
// The fixed clock of the list states is dropped: legacy `_.debounce` (the import URL check) reads `Date.now()`, so under a fixed
// time its trailing call never fires and the continue button stays disabled.
const afterLoginEntry = { path: '/login', signedIn: false, clock: undefined } as const

// The install answers: legacy posts `/instances/install`, next `/projects/install` (the rewrite of `client.ts`), so both keys.
const installAnswers = {
  'POST /instances/install': { json: { data: { id: 501, name: 'example' } } },
  'POST /projects/install': { json: { data: { id: 501, name: 'example' } } },
}

/** The progress card (`ProgressCard` in next, `.installation-card` in legacy): the card and its title (`h1`) plus extra probes. */
function progressProbes (testId: string, ...rest: Probe[]): Probe[] {
  return [
    onboardingDialogProbes(testId)[0]!,
    {
      key: 'modal-title',
      legacy: page => page.locator('.v-dialog--active .v-card h1').first(),
      next: page => page.getByTestId(testId).locator('h1').first(),
    },
    ...rest,
  ]
}

/**
 * Masks of a progress modal: its `Loader` (`.loader`), the `DotLoader` (`.dot-loader`) and, for the demo, the success
 * alert whose text names the installed site (`handleDemoInstallation`, LITE `OnboardingModalWrapper.vue:1630-1640`).
 */
function progressMasks (testId: string, withAlert = false): NonNullable<ParityState['masks']> {
  const legacy: Array<(page: Page) => Locator> = [
    page => page.locator('.v-dialog--active .loader'),
    page => page.locator('.v-dialog--active .dot-loader'),
  ]
  const next: Array<(page: Page) => Locator> = [
    page => page.getByTestId(testId).locator('.loader'),
    page => page.getByTestId(testId).locator('.dot-loader'),
  ]
  if (withAlert) {
    legacy.push(page => page.locator('.alert-manager .alert--success'))
    next.push(page => page.locator('.alert-manager .alert--success'))
  }
  return { legacy, next }
}

/**
 * Waits until the template chooser is gone after "Use": its dialog stays `.v-dialog--active` while it closes, and its (readonly)
 * sort input would be the first input a site-name `fill` finds.
 */
const themeChosen: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await expect(page.locator('.v-dialog--active .template-card')).toHaveCount(0)
  },
  next: async page => {
    await expect(page.getByTestId('onboarding-choose-template-modal')).toBeHidden()
  },
}

/** The site name typed into the site-name modal (legacy `legacy_quick` asks for it, `hasSelectedServiceAskForSiteName`). */
const typeSiteName: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.locator('.v-dialog--active .v-card input').first().fill('example-site')
  },
  next: async page => {
    await page.getByTestId('onboarding-site-name-modal').locator('input').first().fill('example-site')
  },
}
const submitSiteName: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.locator('.v-dialog--active .v-card').getByRole('button', { name: tr('button.website.create', 'lite'), exact: true }).click({ timeout: 8000 })
  },
  next: async page => {
    await page.getByTestId('onboarding-site-name-modal').getByRole('button', { name: tr('button.website.create', 'lite'), exact: true }).click({ timeout: 8000 })
  },
}

/** The "Try It Out!" button of the process chooser (demo account only; it opens the quick template chooser by default). */
const tryItOut: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.locator('.v-dialog--active .v-card').getByRole('button', { name: /Try It Out!/ }).click({ timeout: 8000 })
  },
  next: async page => {
    await page.getByTestId('onboarding-choose-onboarding-process-modal').getByRole('button', { name: /Try It Out!/ }).click({ timeout: 8000 })
  },
}

// The standard form reads the WordPress versions, the instances (clone tab) and the templates (template tab) when it opens;
// both apps call `/projects/...` (lite). `GET /projects` (the clone list) is answered by `instancesState`.
const standardFormAnswers = {
  'GET /projects/wordpress-versions': { json: { data: ['6.8.1', '6.7.2'] } },
  'GET /projects/wordpress-templates': { json: { data: [] } },
}

// Standard form (advanced mode): Create → template chooser → "Use" answers the instance options → the form (Basic tab).
// The admin password is generated on mount (`generatePassword`) and sits on the Advanced tab; it is masked anyway.
export const onboardingStandardForm: ParityState = {
  id: 'onboarding-standard-form',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({
      id: 10,
      install_method: 'advanced',
      onboarding: { installation_type: { wordpress: true } },
    })]),
    handlers: { ...chooseTemplateHandlers(templateThemes), ...instanceOptions, ...standardFormAnswers },
    legacy: [clickCreate.legacy, clickUseTheme.legacy],
    next: [clickCreate.next, clickUseTheme.next],
    masks: {
      legacy: [page => page.locator('.v-dialog--active .v-card input[autocomplete="new-password"]')],
      next: [page => page.getByTestId('onboarding-standard-form-modal').locator('input[autocomplete="new-password"]')],
    },
    probes: [
      ...dialogProbes('onboarding-standard-form-modal', 'h4'),
      {
        key: 'tabs',
        legacy: page => page.locator('.v-dialog--active .v-card .v-tabs').first(),
        next: page => page.getByTestId('onboarding-standard-form-modal').locator('.v-tabs').first(),
      },
    ],
  }),
}

// Install progress (standard card, in-progress): `legacy_quick` asks for the site name, then creates the domain and posts the
// install. The answer keeps the card in progress (Echo is off), so the card shows its in-progress state.
export const onboardingInstallProgress: ParityState = {
  id: 'onboarding-install-progress',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({
      id: 10,
      onboarding_mode: 'legacy_quick',
      onboarding: { installation_type: { wordpress: true } },
    })]),
    handlers: { ...chooseTemplateHandlers(templateThemes), ...instanceOptions, ...domainAnswers, ...installAnswers },
    legacy: [clickCreate.legacy, clickUseTheme.legacy, themeChosen.legacy, typeSiteName.legacy, submitSiteName.legacy],
    next: [clickCreate.next, clickUseTheme.next, themeChosen.next, typeSiteName.next, submitSiteName.next],
    masks: progressMasks('onboarding-installation-progress-modal'),
    probes: progressProbes('onboarding-installation-progress-modal'),
  }),
}

// Super-quick (simple mode): the install opens the super-quick card in progress; "Start Creating" waits for the completion.
export const onboardingSuperQuick: ParityState = {
  id: 'onboarding-super-quick',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({
      id: 10,
      install_method: 'super_quick',
      onboarding: { installation_type: { wordpress: true } },
    })]),
    handlers: { ...instanceOptions, ...domainAnswers, ...installAnswers },
    legacy: [clickCreate.legacy],
    next: [clickCreate.next],
    masks: progressMasks('onboarding-super-quick-progress-modal'),
    probes: progressProbes(
      'onboarding-super-quick-progress-modal',
      buttonProbe('start-creating', 'onboarding-super-quick-progress-modal', 'button.startCreating'),
    ),
  }),
}

// Sync (`control-panel-upgrade`): the login redirect key opens the sync card on load (`after-login.ts`, LITE `App.vue:159-164`).
export const onboardingSync: ParityState = {
  id: 'onboarding-sync',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({ id: 10 })]),
    handlers: instanceOptions,
    masks: progressMasks('onboarding-sync-progress-modal'),
    probes: progressProbes('onboarding-sync-progress-modal'),
  }),
  ...afterLoginEntry,
  localStorage: { '{origin}-redirect': 'control-panel-upgrade' },
}

// Demo choose (demo account): Create opens the process chooser, the demo's first choice (quick, "Try It Out!").
export const onboardingDemoChooseProcess: ParityState = {
  id: 'onboarding-demo-choose-process',
  ...onboardingState({
    // `startInstallation` stops at "no installation type" before the demo check of `newInstanceSelected` (LITE `:419-449`, `:1058`),
    // so the service offers WordPress.
    home: liteOnboardingHome([onboardingService({ id: 10, onboarding: { installation_type: { wordpress: true } } })], { email: DEMO_EMAIL }),
    legacy: [clickCreate.legacy],
    next: [clickCreate.next],
    probes: [
      onboardingDialogProbes('onboarding-choose-onboarding-process-modal')[0]!,
      {
        key: 'modal-title',
        legacy: page => page.locator('.v-dialog--active .v-card h1').first(),
        next: page => page.getByTestId('onboarding-choose-onboarding-process-modal').locator('h1').first(),
      },
      {
        key: 'try-it-out',
        legacy: page => page.locator('.v-dialog--active .v-card').getByRole('button', { name: /Try It Out!/ }),
        next: page => page.getByTestId('onboarding-choose-onboarding-process-modal').getByRole('button', { name: /Try It Out!/ }),
      },
    ],
  }),
}

// Demo completed: the demo install skips the API, the card shows "completed" after 3 s and an alert names the site. The
// first probe waits for the completed title (the readiness anchor), the alert is masked.
export const onboardingDemoCompleted: ParityState = {
  id: 'onboarding-demo-completed',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({
      id: 10,
      install_method: 'super_quick',
      onboarding: { installation_type: { wordpress: true } },
    })], { email: DEMO_EMAIL }),
    handlers: { ...chooseTemplateHandlers(templateThemes), ...instanceOptions },
    legacy: [clickCreate.legacy, tryItOut.legacy, clickUseTheme.legacy],
    next: [clickCreate.next, tryItOut.next, clickUseTheme.next],
    masks: progressMasks('onboarding-installation-progress-modal', true),
    probes: [
      {
        key: 'completed-title',
        legacy: page => page.locator('.v-dialog--active .v-card h1').filter({ hasText: tr('heading.onboarding.installation.title.completed', 'lite') }),
        next: page => page.getByTestId('onboarding-installation-progress-modal').locator('h1').filter({ hasText: tr('heading.onboarding.installation.title.completed', 'lite') }),
      },
      ...progressProbes('onboarding-installation-progress-modal'),
    ],
  }),
}

// Forced install (`force_install` and no instance, after login, no redirect key): `creationTypeSelected(0, { source: 'after-login' })`
// installs at once (LITE `OnboardingModalWrapper.vue:1111-1120`, next `after-login.ts`), so the card that opens is the (simple mode)
// super-quick progress card, in progress (Echo is off). No installation type chooser opens in either app.
export const onboardingForceInstall: ParityState = {
  id: 'onboarding-force-install',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({
      id: 10,
      force_install: true,
      onboarding: { installation_type: { wordpress: true, git: true, files: true, go: true } },
    })]),
    handlers: { ...instanceOptions, ...domainAnswers, ...installAnswers },
    legacy: [],
    next: [],
    masks: progressMasks('onboarding-super-quick-progress-modal'),
    probes: progressProbes('onboarding-super-quick-progress-modal'),
  }),
  ...afterLoginEntry,
}

// --- Phase 13: default states of the import path (URL, method, plugin form, advanced form, setup complete) ---------------

// The import path opens from the `new-import` `-redirect` key (after login, LITE `App.vue`; next `after-login.ts:59`), the same
// entry the sync state uses, instead of the Create cascade. The key is read on load, so the state depends on this key only (no
// account flag). Echo is off: the setup-complete result is the answer of `POST import/import` (success here; the in-progress
// state is the held answer of Phase 21, the failed one is Phase 18).
const importRedirect = { '{origin}-redirect': 'new-import' }

const IMPORT_SITE = `https://${DOMAIN}`

// The URL test answers WordPress as found. Next rewrites `/instances` to `/projects` under single server, so both keys.
const importUrlAnswers = {
  'GET /instances/import/test-wordpress-url': { json: { wordpress_detected: true } },
  'GET /projects/import/test-wordpress-url': { json: { wordpress_detected: true } },
}

// Plugin form success, then the domain and the import (`importInstanceStarted`, next `onboarding-flow.ts:603-641`).
const connectionOk = { success: true, message: 'ok', import_details: { url: IMPORT_SITE } }
const importedOk = { data: { id: 502, url: IMPORT_SITE }, meta: { nameservers: ['ns1.example.test', 'ns2.example.test'] } }
const importCompleteAnswers = {
  'POST /instances/import/test-wordpress-connection': { json: connectionOk },
  'POST /projects/import/test-wordpress-connection': { json: connectionOk },
  'POST /instances/import/domain': { json: { data: { id: 502, domain: DOMAIN } } },
  'POST /projects/import/domain': { json: { data: { id: 502, domain: DOMAIN } } },
  'POST /instances/import/import': { json: importedOk },
  'POST /projects/import/import': { json: importedOk },
}

const IMPORT_URL_MODAL = 'onboarding-import-url-modal'
const IMPORT_METHOD_MODAL = 'onboarding-import-method-modal'
const IMPORT_SIMPLE_MODAL = 'onboarding-import-simple-modal'
const IMPORT_ADVANCED_MODAL = 'onboarding-import-advanced-modal'
const IMPORT_COMPLETE_MODAL = 'onboarding-import-setup-complete-modal'

/** Types into the `index`-th input of the modal (both apps keep the form's DOM order). */
function fillInput (testId: string, index: number, value: string): { legacy: StateAction, next: StateAction } {
  return {
    legacy: async page => {
      await page.locator('.v-dialog--active .v-card input').nth(index).fill(value)
    },
    next: async page => {
      await page.getByTestId(testId).locator('input').nth(index).fill(value)
    },
  }
}

/** Clicks a modal button by its visible copy. The click waits for the button to be enabled (the URL test ends first). */
function clickModalButton (testId: string, copyKey: string): { legacy: StateAction, next: StateAction } {
  return {
    legacy: async page => {
      await page.locator('.v-dialog--active .v-card').getByRole('button', { name: tr(copyKey, 'lite'), exact: true }).click({ timeout: 8000 })
    },
    next: async page => {
      await page.getByTestId(testId).getByRole('button', { name: tr(copyKey, 'lite'), exact: true }).click({ timeout: 8000 })
    },
  }
}

/** The "Advanced Method" card of the method step (its heading; the card takes the click). */
const chooseAdvancedMethod: { legacy: StateAction, next: StateAction } = {
  // The card (`.checkbox-big`) takes the click; its overlay covers the heading, so the heading itself is not clickable.
  legacy: async page => {
    await page.locator('.v-dialog--active .v-card .checkbox-big').filter({ hasText: tr('heading.onboarding.chooseImportMethod.advanced.title', 'lite') }).click({ timeout: 8000 })
  },
  next: async page => {
    await page.getByTestId(IMPORT_METHOD_MODAL).locator('.checkbox-big').filter({ hasText: tr('heading.onboarding.chooseImportMethod.advanced.title', 'lite') }).click({ timeout: 8000 })
  },
}

/** Runs several actions in order: the legacy and the next lists, each in the same order. */
function sequence (...pairs: Array<{ legacy: StateAction, next: StateAction }>): { legacy: StateAction[], next: StateAction[] } {
  return { legacy: pairs.map(pair => pair.legacy), next: pairs.map(pair => pair.next) }
}

// URL step: the redirect opens it empty (the continue button is disabled until the URL test answers).
// The modal opens while `/login` redirects to `/projects` and the list loads, and that reset clears the field (legacy `isOpen`
// watcher `resetData`), so the URL is typed only after the empty list under the modal has rendered.
const urlFill = fillInput(IMPORT_URL_MODAL, 0, DOMAIN)
const urlEntered: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.waitForURL(/\/projects/)
    await expect(page.locator('.no-data--instances')).toBeVisible()
    await urlFill.legacy(page)
  },
  next: async page => {
    await page.waitForURL(/\/projects/)
    await expect(page.getByTestId('instances-no-data-create')).toBeVisible()
    await urlFill.next(page)
  },
}
const urlSubmitted = clickModalButton(IMPORT_URL_MODAL, 'button.continue')
// Method step: the URL is typed and continued; the method step opens with the plugin card selected.
const methodContinue = clickModalButton(IMPORT_METHOD_MODAL, 'button.continue')
const toMethodStep = sequence(urlEntered, urlSubmitted)
// Plugin form: the URL, username and password of the admin login (inputs 0-2 of the panel).
const simpleFilled = sequence(
  fillInput(IMPORT_SIMPLE_MODAL, 0, DOMAIN),
  fillInput(IMPORT_SIMPLE_MODAL, 1, 'admin'),
  fillInput(IMPORT_SIMPLE_MODAL, 2, 'secret-pass'),
)

export const onboardingImportUrl: ParityState = {
  id: 'onboarding-import-url',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({ id: 10 })]),
    handlers: instanceOptions,
    legacy: [],
    next: [],
    probes: [
      ...dialogProbes(IMPORT_URL_MODAL, 'h4'),
      ...fieldProbes('import-url', IMPORT_URL_MODAL),
    ],
  }),
  ...afterLoginEntry,
  localStorage: importRedirect,
}

export const onboardingImportMethod: ParityState = {
  id: 'onboarding-import-method',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({ id: 10 })]),
    handlers: { ...instanceOptions, ...importUrlAnswers },
    legacy: toMethodStep.legacy,
    next: toMethodStep.next,
    probes: dialogProbes(IMPORT_METHOD_MODAL, 'h4'),
  }),
  ...afterLoginEntry,
  localStorage: importRedirect,
}

export const onboardingImportSimple: ParityState = {
  id: 'onboarding-import-simple',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({ id: 10 })]),
    handlers: { ...instanceOptions, ...importUrlAnswers },
    legacy: [...toMethodStep.legacy, methodContinue.legacy],
    next: [...toMethodStep.next, methodContinue.next],
    probes: [
      ...dialogProbes(IMPORT_SIMPLE_MODAL, 'h4'),
      ...fieldProbes('import-simple-url', IMPORT_SIMPLE_MODAL),
    ],
  }),
  ...afterLoginEntry,
  localStorage: importRedirect,
}

export const onboardingImportAdvanced: ParityState = {
  id: 'onboarding-import-advanced',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({ id: 10 })]),
    handlers: { ...instanceOptions, ...importUrlAnswers },
    legacy: [...toMethodStep.legacy, chooseAdvancedMethod.legacy, methodContinue.legacy],
    next: [...toMethodStep.next, chooseAdvancedMethod.next, methodContinue.next],
    probes: dialogProbes(IMPORT_ADVANCED_MODAL, 'h4'),
  }),
  ...afterLoginEntry,
  localStorage: importRedirect,
}

// Setup complete (success): the plugin form's connection test answers success, then the domain and the import answer.
// The "Return To Dashboard" button only exists in the completed state, so it is the readiness anchor.
export const onboardingImportComplete: ParityState = {
  id: 'onboarding-import-complete',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({ id: 10 })]),
    handlers: { ...instanceOptions, ...importUrlAnswers, ...importCompleteAnswers },
    legacy: [
      ...toMethodStep.legacy,
      methodContinue.legacy,
      ...simpleFilled.legacy,
      clickModalButton(IMPORT_SIMPLE_MODAL, 'button.continue').legacy,
    ],
    next: [
      ...toMethodStep.next,
      methodContinue.next,
      ...simpleFilled.next,
      clickModalButton(IMPORT_SIMPLE_MODAL, 'button.continue').next,
    ],
    masks: progressMasks(IMPORT_COMPLETE_MODAL),
    probes: [
      buttonProbe('return-to-dashboard', IMPORT_COMPLETE_MODAL, 'button.returnToDashboard'),
      ...progressProbes(IMPORT_COMPLETE_MODAL),
    ],
  }),
  ...afterLoginEntry,
  localStorage: importRedirect,
}

// --- Phase 14: default states of the deploy lite path (git, env vars, zip, custom progress, files drop) ---------------------

const REPO_URL = 'https://github.com/example/site.git'
const GIT_MODAL = 'onboarding-deploy-git-modal'
const ENV_MODAL = 'onboarding-env-vars-modal'
const ZIP_MODAL = 'onboarding-deploy-zip-modal'
const PROGRESS_MODAL = 'onboarding-installation-progress-modal'
const CHOOSE_SERVICE_MODAL = 'onboarding-choose-service-modal'
const ZIP_FILE = { name: 'shop-site.zip', mimeType: 'application/zip', buffer: Buffer.from('x') }

// Git service (single type `git`: Create opens the repo form directly) and a files service (single type `files`: Create opens the zip).
function gitService (): Record<string, unknown> {
  return onboardingService({ id: 10, onboarding: { installation_type: { git: true } } })
}
function filesService (id: number): Record<string, unknown> {
  return onboardingService({ id, onboarding: { installation_type: { files: true } } })
}

// The git answers, both keys (`/instances/...` legacy, `/projects/...` next). The branch answer names two branches, so the env
// step shows the branch select (`showBranchSelect`, branches > 1). The env preview answers the body itself (`EnvExamplePreview`).
const gitAnswers = {
  'POST /instances/test-git-url': { json: { success: true } },
  'POST /projects/test-git-url': { json: { success: true } },
  'POST /instances/git-branches': { json: { success: true, branches: ['main', 'develop'], default_branch: 'main' } },
  'POST /projects/git-branches': { json: { success: true, branches: ['main', 'develop'], default_branch: 'main' } },
  'POST /instances/preview-env-example': { json: { has_example: true, variables: [{ key: 'APP_ENV', value: 'production' }, { key: 'APP_DEBUG', value: 'false' }] } },
  'POST /projects/preview-env-example': { json: { has_example: true, variables: [{ key: 'APP_ENV', value: 'production' }, { key: 'APP_DEBUG', value: 'false' }] } },
}

// The deploy answer carries the instance id the progress follows; the live log endpoint is polled under both prefixes.
const deployAnswers = {
  'POST /instances/deploy': { json: { data: { id: 501, name: 'example' } } },
  'POST /projects/deploy': { json: { data: { id: 501, name: 'example' } } },
}
function liveLogAnswers (id: number): ReturnType<typeof deployLiveHandlers> {
  // Two fresh handler sets: a sequence handler keeps its own position, so the two prefixes must not share one.
  const projects = deployLiveHandlers(id)
  const instances = deployLiveHandlers(id)
  return {
    ...projects,
    [`GET /instances/${id}/deploy-logs/live`]: instances[`GET /projects/${id}/deploy-logs/live`]!,
  }
}

/** Toggles the private switch of the git modal (the only checkbox of the modal; `evaluate` click as the other helpers do). */
const togglePrivate: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.locator('.v-dialog--active .v-card input[type="checkbox"]').first().evaluate((el: HTMLElement) => el.click())
  },
  next: async page => {
    await page.getByTestId(GIT_MODAL).locator('input[type="checkbox"]').first().evaluate((el: HTMLElement) => el.click())
  },
}

/** The token field of a private repo, found by its placeholder (the copy of `heading.onboarding.gitDeploy.auth.pat.placeholder`). */
function tokenProbe (testId: string): Probe {
  return {
    key: 'token-input',
    legacy: page => page.locator('.v-dialog--active .v-card').getByPlaceholder(tr('heading.onboarding.gitDeploy.auth.pat.placeholder', 'lite'), { exact: true }),
    next: page => page.getByTestId(testId).getByPlaceholder(tr('heading.onboarding.gitDeploy.auth.pat.placeholder', 'lite'), { exact: true }),
  }
}

/** Types the repo url and continues: the connect sequence ends on the env step (branches and preview answered). */
const gitFilled = sequence(
  fillInput(GIT_MODAL, 0, REPO_URL),
  clickModalButton(GIT_MODAL, 'button.continue'),
)
const envContinue = clickModalButton(ENV_MODAL, 'button.continue')

/** Drops a file on a zone: `dragenter` then `dragover` (the zip zone) or `dragenter` then `drop` (the project list). */
function fileEvents (selector: string, events: string[]): StateAction {
  return async page => {
    await page.locator(selector).first().waitFor({ state: 'attached' })
    await page.evaluate(({ target, names }: { target: string, names: string[] }) => {
      const transfer = new DataTransfer()
      transfer.items.add(new File(['x'], 'shop-site.zip', { type: 'application/zip' }))
      const zone = document.querySelector(target)!
      for (const name of names) {
        zone.dispatchEvent(new DragEvent(name, { bubbles: true, cancelable: true, dataTransfer: transfer }))
      }
    }, { target: selector, names: events })
  }
}

/** Masks of the custom progress: the progress loaders plus the deploy console (its lines and their times). */
function deployLogMasks (testId: string): NonNullable<ParityState['masks']> {
  const masks = progressMasks(testId)
  return {
    legacy: [...masks.legacy, page => page.locator('.v-dialog--active .deploy-console')],
    next: [...masks.next, page => page.getByTestId(testId).locator('.deploy-console')],
  }
}

// Git deploy, private repo: the switch opens the token field under the repo url (`v-expand-transition`).
export const onboardingDeployGitPrivate: ParityState = {
  id: 'onboarding-deploy-git-private',
  ...onboardingState({
    home: liteOnboardingHome([gitService()]),
    legacy: [clickCreate.legacy, togglePrivate.legacy],
    next: [clickCreate.next, togglePrivate.next],
    probes: [...dialogProbes(GIT_MODAL, 'h4'), tokenProbe(GIT_MODAL)],
  }),
}

// Env vars step after the git connect: the branch select (two branches, `main` picked) and the rows of the example file.
export const onboardingEnvVars: ParityState = {
  id: 'onboarding-env-vars',
  ...onboardingState({
    home: liteOnboardingHome([gitService()]),
    handlers: gitAnswers,
    legacy: [clickCreate.legacy, ...gitFilled.legacy],
    next: [clickCreate.next, ...gitFilled.next],
    probes: [
      ...dialogProbes(ENV_MODAL, 'h4'),
      {
        key: 'branch-select',
        legacy: page => page.locator('.v-dialog--active .v-card .v-select').first(),
        next: page => page.getByTestId(ENV_MODAL).locator('.v-select').first(),
      },
      {
        key: 'env-rows',
        legacy: page => page.locator('.v-dialog--active .v-card .env-rows'),
        next: page => page.getByTestId(ENV_MODAL).locator('.env-rows'),
      },
    ],
  }),
}

// Custom deploy progress (git): Continue on the env step posts the deploy; the card shows "Your project is being created"
// and the live deploy console (masked: its lines and times move with every poll).
export const onboardingDeployProgress: ParityState = {
  id: 'onboarding-deploy-progress',
  ...onboardingState({
    home: liteOnboardingHome([gitService()]),
    handlers: { ...gitAnswers, ...deployAnswers, ...liveLogAnswers(501) },
    legacy: [clickCreate.legacy, ...gitFilled.legacy, envContinue.legacy],
    next: [clickCreate.next, ...gitFilled.next, envContinue.next],
    masks: deployLogMasks(PROGRESS_MODAL),
    probes: progressProbes(
      PROGRESS_MODAL,
      buttonProbe('cancel-deploy', PROGRESS_MODAL, 'deployLogs.cancelDeploy'),
    ),
  }),
}

// Zip deploy, empty: the files service opens the drop zone directly (`resolveAfterService`, `path.type === 'files'`).
export const onboardingDeployZip: ParityState = {
  id: 'onboarding-deploy-zip',
  ...onboardingState({
    home: liteOnboardingHome([filesService(10)]),
    legacy: [clickCreate.legacy],
    next: [clickCreate.next],
    probes: [
      ...dialogProbes(ZIP_MODAL, 'h4'),
      {
        key: 'drop-zone',
        legacy: page => page.locator('.v-dialog--active .v-card .drop-zone'),
        next: page => page.getByTestId('onboarding-deploy-zip-drop-zone'),
      },
    ],
  }),
}

// Zip deploy, a file dragged over the drop zone: `drop-zone--active` (both apps set it on `dragover`).
export const onboardingDeployZipDragOver: ParityState = {
  id: 'onboarding-deploy-zip-drag-over',
  ...onboardingState({
    home: liteOnboardingHome([filesService(10)]),
    legacy: [clickCreate.legacy, fileEvents('.v-dialog--active .v-card .drop-zone', ['dragenter', 'dragover'])],
    next: [clickCreate.next, fileEvents('[data-testid="onboarding-deploy-zip-drop-zone"]', ['dragenter', 'dragover'])],
    probes: [
      ...dialogProbes(ZIP_MODAL, 'h4'),
      {
        key: 'drop-zone',
        legacy: page => page.locator('.v-dialog--active .v-card .drop-zone'),
        next: page => page.getByTestId('onboarding-deploy-zip-drop-zone'),
      },
    ],
  }),
}

// Zip deploy, a file picked: the selection list shows its name and Continue is enabled.
export const onboardingDeployZipFilled: ParityState = {
  id: 'onboarding-deploy-zip-filled',
  ...onboardingState({
    home: liteOnboardingHome([filesService(10)]),
    legacy: [
      clickCreate.legacy,
      async page => {
        await page.locator('.v-dialog--active .v-card input[type="file"]').setInputFiles(ZIP_FILE)
      },
    ],
    next: [
      clickCreate.next,
      async page => {
        await page.getByTestId('onboarding-deploy-zip-input').setInputFiles(ZIP_FILE)
      },
    ],
    probes: [
      ...dialogProbes(ZIP_MODAL, 'h4'),
      {
        key: 'selection-list',
        legacy: page => page.locator('.v-dialog--active .v-card .selection-list'),
        next: page => page.getByTestId(ZIP_MODAL).locator('.selection-list'),
      },
      buttonProbe('continue', ZIP_MODAL, 'button.continue'),
    ],
  }),
}

// Files dropped on the project list: two files services offer the service choice (`resolveFilesDropNextStep`, the list drop
// starts `startFromFilesDrop`). No request before the choice.
export const onboardingFilesDrop: ParityState = {
  id: 'onboarding-files-drop',
  ...onboardingState({
    home: liteOnboardingHome([filesService(10), filesService(11)]),
    legacy: [fileEvents('.instances-drop-zone', ['dragenter', 'drop'])],
    next: [fileEvents('.instances-drop-zone', ['dragenter', 'drop'])],
    probes: [
      onboardingDialogProbes(CHOOSE_SERVICE_MODAL)[0]!,
      {
        key: 'service-title',
        legacy: page => page.locator('.v-dialog--active .v-card h6').first(),
        next: page => page.getByTestId(CHOOSE_SERVICE_MODAL).locator('h6').first(),
      },
    ],
  }),
}

// Hover and focus (Phase 15). A disabled continue paints neither the hover overlay nor the focus, so both bases fill the field and
// wait for the button to enable before the probes: the domain step after its validation (`isContinueDisabled`, choose-domain.ts:87),
// the git step at once (`canContinue`, the URL only). Continue is not sent, so each state stays on its step. The domain button is
// `button.website.create`, not `button.continue`: the super-quick WordPress service takes the create key (`chooseDomainActionKey`).
function modalButtonEnabled (testId: string, copyKey: string): { legacy: StateAction, next: StateAction } {
  return {
    legacy: async page => {
      await expect(page.locator('.v-dialog--active .v-card').getByRole('button', { name: tr(copyKey, 'lite'), exact: true })).toBeEnabled()
    },
    next: async page => {
      await expect(page.getByTestId(testId).getByRole('button', { name: tr(copyKey, 'lite'), exact: true })).toBeEnabled()
    },
  }
}

const domainTyped: ParityState = {
  id: 'onboarding-domain-typed',
  ...onboardingState({
    home: liteOnboardingHome([domainService()]),
    handlers: { ...instanceOptions, ...domainAnswers },
    legacy: [clickCreate.legacy, typeDomain.legacy, modalButtonEnabled(DOMAIN_MODAL, 'button.website.create').legacy],
    next: [clickCreate.next, typeDomain.next, modalButtonEnabled(DOMAIN_MODAL, 'button.website.create').next],
    probes: onboardingDialogProbes(DOMAIN_MODAL),
  }),
}

export const onboardingDomainHover = buttonHoverState(domainTyped, 'onboarding-domain-hover', 'button.website.create', 'lite')
export const onboardingDomainFocus = buttonFocusState(domainTyped, 'onboarding-domain-focus', 'button.website.create', 'lite')

const gitTyped: ParityState = {
  id: 'onboarding-deploy-git-typed',
  ...onboardingState({
    home: liteOnboardingHome([gitService()]),
    legacy: [clickCreate.legacy, fillInput(GIT_MODAL, 0, REPO_URL).legacy, modalButtonEnabled(GIT_MODAL, 'button.continue').legacy],
    next: [clickCreate.next, fillInput(GIT_MODAL, 0, REPO_URL).next, modalButtonEnabled(GIT_MODAL, 'button.continue').next],
    probes: onboardingDialogProbes(GIT_MODAL),
  }),
}

export const onboardingDeployGitHover = buttonHoverState(gitTyped, 'onboarding-deploy-git-hover', 'button.continue', 'lite')
export const onboardingDeployGitFocus = buttonFocusState(gitTyped, 'onboarding-deploy-git-focus', 'button.continue', 'lite')

// --- Phase 16: disabled states (the primary action is off: an empty field, a step still answering, a missing list) ---------------
// Disabled buttons follow the app, read from tokens (AGENTS.md rule 3): the lite
// mint chip is not the target. The disabled delta vs lite is an accepted exception (`view-review.md`), not a fix towards lite.
// Each state keeps the base's steps and adds a probe of the disabled control; `afterCapture` checks it is disabled in both apps.

/** The modal's button by its visible copy (`buttonProbe` finds it the same way). */
function modalButtonLocator (app: 'legacy' | 'next', testId: string, copyKey: string): (page: Page) => Locator {
  const name = tr(copyKey, 'lite')
  return app === 'legacy'
    ? page => page.locator('.v-dialog--active .v-card').getByRole('button', { name, exact: true })
    : page => page.getByTestId(testId).getByRole('button', { name, exact: true })
}

/** The disabled button check, run after the capture in both apps (a failure is a harness error, `state.ts:91`). */
function disabledButtonCheck (testId: string, copyKey: string): { legacy: StateAction[], next: StateAction[] } {
  return {
    legacy: [async page => {
      await expect(modalButtonLocator('legacy', testId, copyKey)(page), 'button disabled').toBeDisabled()
    }],
    next: [async page => {
      await expect(modalButtonLocator('next', testId, copyKey)(page), 'button disabled').toBeDisabled()
    }],
  }
}

/** A tab of the standard form by its copy: the tab is the disabled one when its `v-tab--disabled` class is set (both apps). */
function tabProbe (key: string, testId: string, copyKey: string): Probe {
  const text = tr(copyKey, 'lite')
  return {
    key,
    legacy: page => page.locator('.v-dialog--active .v-card .v-tab').filter({ hasText: text }),
    next: page => page.getByTestId(testId).locator('.v-tab').filter({ hasText: text }),
  }
}

function disabledTabCheck (testId: string, copyKey: string): { legacy: StateAction[], next: StateAction[] } {
  const text = tr(copyKey, 'lite')
  return {
    legacy: [async page => {
      await expect(page.locator('.v-dialog--active .v-card .v-tab').filter({ hasText: text }), 'tab disabled').toHaveClass(/v-tab--disabled/)
    }],
    next: [async page => {
      // V4 `v-tab` is a `v-btn`: the disabled class is `v-btn--disabled` (V2 `v-tab--disabled`).
      await expect(page.getByTestId(testId).locator('.v-tab').filter({ hasText: text }), 'tab disabled').toHaveClass(/v-btn--disabled/)
    }],
  }
}

// Domain: the continue of the domain step is disabled while the field is empty (base `onboarding-domain`, `isContinueButtonDisabled`).
export const onboardingDomainDisabled: ParityState = {
  ...onboardingDomain,
  id: 'onboarding-domain-disabled',
  probes: [...onboardingDomain.probes, buttonProbe('disabled-action', DOMAIN_MODAL, 'button.website.create')],
  afterCapture: disabledButtonCheck(DOMAIN_MODAL, 'button.website.create'),
}

// Import URL: the continue waits for a URL (`canContinue`, `ImportUrlModal.vue:189,210`); the base opens the step empty.
export const onboardingImportUrlDisabled: ParityState = {
  ...onboardingImportUrl,
  id: 'onboarding-import-url-disabled',
  probes: [...onboardingImportUrl.probes, buttonProbe('disabled-action', IMPORT_URL_MODAL, 'button.continue')],
  afterCapture: disabledButtonCheck(IMPORT_URL_MODAL, 'button.continue'),
}

// Git deploy: the continue waits for a repo URL (`!isContinueAllowed`, `DeployFromGitModal.vue:187`); the base opens the form empty.
export const onboardingDeployGitDisabled: ParityState = {
  ...onboardingDeployGit,
  id: 'onboarding-deploy-git-disabled',
  probes: [...onboardingDeployGit.probes, buttonProbe('disabled-action', GIT_MODAL, 'button.continue')],
  afterCapture: disabledButtonCheck(GIT_MODAL, 'button.continue'),
}

// Standard form, clone tab: the clone tab is disabled while the account has no instance to clone (`noInstances`, base answer = none).
export const onboardingStandardFormCloneDisabled: ParityState = {
  ...onboardingStandardForm,
  id: 'onboarding-standard-form-clone-disabled',
  probes: [
    ...onboardingStandardForm.probes,
    tabProbe('clone-tab', 'onboarding-standard-form-modal', 'heading.onboarding.newInstance.type.clone.tab'),
  ],
  afterCapture: disabledTabCheck('onboarding-standard-form-modal', 'heading.onboarding.newInstance.type.clone.tab'),
}

// Standard form, template tab: the template tab is disabled when the WordPress template list is empty (`noTemplates`,
// `loadTemplates`). The list answers `[]` here; the Create → Use path still reaches the form (the chooser has its own endpoints).
const noWordpressTemplates = {
  'GET /instances/wordpress-templates': { json: { data: [] } },
  'GET /projects/wordpress-templates': { json: { data: [] } },
}
export const onboardingStandardFormTemplateDisabled: ParityState = {
  id: 'onboarding-standard-form-template-disabled',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({
      id: 10,
      install_method: 'advanced',
      onboarding: { installation_type: { wordpress: true } },
    })]),
    handlers: { ...chooseTemplateHandlers(templateThemes), ...instanceOptions, ...standardFormAnswers, ...noWordpressTemplates },
    legacy: [clickCreate.legacy, clickUseTheme.legacy],
    next: [clickCreate.next, clickUseTheme.next],
    masks: {
      legacy: [page => page.locator('.v-dialog--active .v-card input[autocomplete="new-password"]')],
      next: [page => page.getByTestId('onboarding-standard-form-modal').locator('input[autocomplete="new-password"]')],
    },
    probes: [
      ...dialogProbes('onboarding-standard-form-modal', 'h4'),
      {
        key: 'tabs',
        legacy: page => page.locator('.v-dialog--active .v-card .v-tabs').first(),
        next: page => page.getByTestId('onboarding-standard-form-modal').locator('.v-tabs').first(),
      },
      tabProbe('template-tab', 'onboarding-standard-form-modal', 'heading.onboarding.newInstance.type.template.tab'),
    ],
  }),
  afterCapture: disabledTabCheck('onboarding-standard-form-modal', 'heading.onboarding.newInstance.type.template.tab'),
}

// Super-quick: "Start Creating" stays disabled until the install ends (`!showStartCreatingButton || !error`, `SuperQuick…:185`).
export const onboardingSuperQuickDisabled: ParityState = {
  ...onboardingSuperQuick,
  id: 'onboarding-super-quick-disabled',
  afterCapture: disabledButtonCheck('onboarding-super-quick-progress-modal', 'button.startCreating'),
}

// --- Phase 17: error states of the install step (domain 422 on validate, install 422 as an alert on the progress) -------------

const DOMAIN_ERROR = 'The domain is not available.'
const INSTALL_ERROR = 'The installation could not be started.'

// Domain error: the validate answer is 422 with the domain's error bag, shown under the field (`getDomainValidationError`,
// `errors.domain[0]`). Blur runs the check at once (it flushes the 500 ms debounce), so the field message is the anchor.
const domainErrorAnswers = {
  'GET /services/10/domains/validate': {
    status: 422,
    json: { message: 'The given data was invalid.', errors: { domain: [DOMAIN_ERROR] } },
  },
}
const domainErrorShown: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await settled(page.locator('.v-dialog--active .v-card .v-messages__message').first())
  },
  next: async page => {
    await settled(page.getByTestId(DOMAIN_MODAL).locator('.v-messages__message').first())
  },
}

export const onboardingDomainError: ParityState = {
  id: 'onboarding-domain-error',
  ...onboardingState({
    home: liteOnboardingHome([domainService()]),
    handlers: { ...instanceOptions, ...domainAnswers, ...domainErrorAnswers },
    legacy: [clickCreate.legacy, typeDomain.legacy, domainErrorShown.legacy],
    next: [clickCreate.next, typeDomain.next, domainErrorShown.next],
    probes: onboardingDialogProbes(DOMAIN_MODAL),
  }),
}

// Install error: `POST install` answers 422. Legacy and next both show the failure as an alert and keep the progress card in
// its in-progress state (`installInstance`, LITE `OnboardingModalWrapper.vue:1622-1630`; next `install-sequence.ts:143`).
// The alert closes after 5 s, so the wait for it is the last action, not a timer.
const installErrorAnswers = {
  'POST /instances/install': { status: 422, json: { message: INSTALL_ERROR } },
  'POST /projects/install': { status: 422, json: { message: INSTALL_ERROR } },
}
const INSTALL_PROGRESS_MODAL = 'onboarding-installation-progress-modal'

export const onboardingInstallError: ParityState = {
  id: 'onboarding-install-error',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({
      id: 10,
      onboarding_mode: 'legacy_quick',
      onboarding: { installation_type: { wordpress: true } },
    })]),
    handlers: { ...chooseTemplateHandlers(templateThemes), ...instanceOptions, ...domainAnswers, ...installErrorAnswers },
    legacy: [
      clickCreate.legacy,
      clickUseTheme.legacy,
      themeChosen.legacy,
      typeSiteName.legacy,
      submitSiteName.legacy,
      async page => {
        await settled(page.locator('.alert-manager .alert--error'))
      },
    ],
    next: [
      clickCreate.next,
      clickUseTheme.next,
      themeChosen.next,
      typeSiteName.next,
      submitSiteName.next,
      async page => {
        await settled(page.locator('.alert-manager .alert--error'))
      },
    ],
    masks: progressMasks(INSTALL_PROGRESS_MODAL),
    probes: [
      ...progressProbes(INSTALL_PROGRESS_MODAL),
      ...alertProbes(page => page.locator('.alert-manager .alert--error')),
    ],
  }),
}

// --- Phase 18: error states of the import path (URL test, plugin and FTP forms, setup-complete failure) -----------------------

const URL_ERROR = 'The WordPress URL could not be reached.'
const PLUGIN_ERROR = 'The WordPress login was rejected.'
const PLUGIN_WARNING = 'The plugin answered with a warning.'
const PLUGIN_CONNECTION = 'The plugin could not be reached from this server.'
const FTP_ERROR = 'The FTP login was rejected.'
const IMPORT_FAILED = 'The import could not be started.'

/** The connection test answers `answer` (both keys: legacy `/instances`, next `/projects`); the form reads `error_type` or `severity`. */
function connectionAnswers (answer: Record<string, unknown>): Record<string, { json: Record<string, unknown> }> {
  return {
    'POST /instances/import/test-wordpress-connection': { json: answer },
    'POST /projects/import/test-wordpress-connection': { json: answer },
  }
}

/** A message box of the modal (`.error-box` or `.warning-box`) is shown; the wait is the last action of the state. */
function messageBox (testId: string, cls: 'error-box' | 'warning-box'): { legacy: StateAction, next: StateAction } {
  return {
    legacy: async page => {
      await settled(page.locator(`.v-dialog--active .v-card .${cls}`).first())
    },
    next: async page => {
      await settled(page.getByTestId(testId).locator(`.${cls}`).first())
    },
  }
}

/** The message box as a probe, so the message text and the box are compared. */
function boxProbe (key: string, testId: string, cls: 'error-box' | 'warning-box'): Probe {
  return {
    key,
    legacy: page => page.locator(`.v-dialog--active .v-card .${cls}`).first(),
    next: page => page.getByTestId(testId).locator(`.${cls}`).first(),
  }
}

// The plugin form submitted: the method step, the plugin panel filled, then continue (the connection test runs).
const simpleSubmit = clickModalButton(IMPORT_SIMPLE_MODAL, 'button.continue')
const simpleSubmitted = {
  legacy: [...toMethodStep.legacy, methodContinue.legacy, ...simpleFilled.legacy, simpleSubmit.legacy],
  next: [...toMethodStep.next, methodContinue.next, ...simpleFilled.next, simpleSubmit.next],
}

// FTP form (protocol FTP, port 21 by default): the host, username, password and path are filled by placeholder (the protocol
// select, the port and the password field share the DOM index space, which differs between V2 and V4).
function fillByPlaceholder (testId: string, placeholder: string, value: string): { legacy: StateAction, next: StateAction } {
  return {
    legacy: async page => {
      await page.locator('.v-dialog--active .v-card').getByPlaceholder(placeholder, { exact: true }).fill(value)
    },
    next: async page => {
      await page.getByTestId(testId).getByPlaceholder(placeholder, { exact: true }).fill(value)
    },
  }
}
const ftpFilled = sequence(
  fillByPlaceholder(IMPORT_ADVANCED_MODAL, 'ftp.source.example.com', DOMAIN),
  fillByPlaceholder(IMPORT_ADVANCED_MODAL, tr('form.placeholder.ftp.user', 'lite'), 'admin'),
  fillByPlaceholder(IMPORT_ADVANCED_MODAL, tr('form.placeholder.ftp.password', 'lite'), 'secret-pass'),
  fillByPlaceholder(IMPORT_ADVANCED_MODAL, 'wp', '/public_html'),
)
const ftpSubmit = clickModalButton(IMPORT_ADVANCED_MODAL, 'button.continue')

// URL error: the test answers `error_message`; the error box shows it and the continue button stays disabled.
export const onboardingImportUrlError: ParityState = {
  id: 'onboarding-import-url-error',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({ id: 10 })]),
    handlers: {
      ...instanceOptions,
      'GET /instances/import/test-wordpress-url': { json: { wordpress_detected: false, error_message: URL_ERROR } },
      'GET /projects/import/test-wordpress-url': { json: { wordpress_detected: false, error_message: URL_ERROR } },
    },
    legacy: sequence(urlEntered, messageBox(IMPORT_URL_MODAL, 'error-box')).legacy,
    next: sequence(urlEntered, messageBox(IMPORT_URL_MODAL, 'error-box')).next,
    probes: [
      ...dialogProbes(IMPORT_URL_MODAL, 'h4', boxProbe('url-error-box', IMPORT_URL_MODAL, 'error-box')),
      ...fieldProbes('import-url', IMPORT_URL_MODAL),
    ],
  }),
  ...afterLoginEntry,
  localStorage: importRedirect,
}

// URL not detected: no WordPress and no error text, so the warning box shows and the button reads "Continue anyway".
export const onboardingImportUrlNotDetected: ParityState = {
  id: 'onboarding-import-url-not-detected',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({ id: 10 })]),
    handlers: {
      ...instanceOptions,
      'GET /instances/import/test-wordpress-url': { json: { wordpress_detected: false } },
      'GET /projects/import/test-wordpress-url': { json: { wordpress_detected: false } },
    },
    legacy: sequence(urlEntered, messageBox(IMPORT_URL_MODAL, 'warning-box')).legacy,
    next: sequence(urlEntered, messageBox(IMPORT_URL_MODAL, 'warning-box')).next,
    probes: [
      ...dialogProbes(IMPORT_URL_MODAL, 'h4', boxProbe('url-warning-box', IMPORT_URL_MODAL, 'warning-box')),
      buttonProbe('continue-anyway', IMPORT_URL_MODAL, 'button.continueAnyway'),
    ],
  }),
  ...afterLoginEntry,
  localStorage: importRedirect,
}

// Plugin form, `error_type: 'error'`: the message shows in the error box, the form stays on the first panel.
export const onboardingImportSimpleError: ParityState = {
  id: 'onboarding-import-simple-error',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({ id: 10 })]),
    handlers: { ...instanceOptions, ...importUrlAnswers, ...connectionAnswers({ success: false, error_type: 'error', message: PLUGIN_ERROR }) },
    legacy: [...simpleSubmitted.legacy, messageBox(IMPORT_SIMPLE_MODAL, 'error-box').legacy],
    next: [...simpleSubmitted.next, messageBox(IMPORT_SIMPLE_MODAL, 'error-box').next],
    probes: dialogProbes(IMPORT_SIMPLE_MODAL, 'h4', boxProbe('simple-error-box', IMPORT_SIMPLE_MODAL, 'error-box')),
  }),
  ...afterLoginEntry,
  localStorage: importRedirect,
}

// Plugin form, `error_type: 'connection_error'`: a warning box, the plugin panel opens and the simple method is disabled.
export const onboardingImportConnectionError: ParityState = {
  id: 'onboarding-import-connection-error',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({ id: 10 })]),
    handlers: { ...instanceOptions, ...importUrlAnswers, ...connectionAnswers({ success: false, error_type: 'connection_error', message: PLUGIN_CONNECTION }) },
    legacy: [...simpleSubmitted.legacy, messageBox(IMPORT_SIMPLE_MODAL, 'warning-box').legacy],
    next: [...simpleSubmitted.next, messageBox(IMPORT_SIMPLE_MODAL, 'warning-box').next],
    probes: dialogProbes(IMPORT_SIMPLE_MODAL, 'h4', boxProbe('connection-warning-box', IMPORT_SIMPLE_MODAL, 'warning-box')),
  }),
  ...afterLoginEntry,
  localStorage: importRedirect,
}

// Plugin form, `error_type: 'warning'`: the message shows in the warning box and the form stays usable.
export const onboardingImportWarning: ParityState = {
  id: 'onboarding-import-warning',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({ id: 10 })]),
    handlers: { ...instanceOptions, ...importUrlAnswers, ...connectionAnswers({ success: false, error_type: 'warning', message: PLUGIN_WARNING }) },
    legacy: [...simpleSubmitted.legacy, messageBox(IMPORT_SIMPLE_MODAL, 'warning-box').legacy],
    next: [...simpleSubmitted.next, messageBox(IMPORT_SIMPLE_MODAL, 'warning-box').next],
    probes: dialogProbes(IMPORT_SIMPLE_MODAL, 'h4', boxProbe('simple-warning-box', IMPORT_SIMPLE_MODAL, 'warning-box')),
  }),
  ...afterLoginEntry,
  localStorage: importRedirect,
}

// FTP form, `severity: 'error'`: the message shows in the error box (the advanced method reads `severity`, not `error_type`).
export const onboardingImportAdvancedError: ParityState = {
  id: 'onboarding-import-advanced-error',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({ id: 10 })]),
    handlers: { ...instanceOptions, ...importUrlAnswers, ...connectionAnswers({ success: false, severity: 'error', message: FTP_ERROR }) },
    legacy: [
      ...toMethodStep.legacy,
      chooseAdvancedMethod.legacy,
      methodContinue.legacy,
      ...ftpFilled.legacy,
      ftpSubmit.legacy,
      messageBox(IMPORT_ADVANCED_MODAL, 'error-box').legacy,
    ],
    next: [
      ...toMethodStep.next,
      chooseAdvancedMethod.next,
      methodContinue.next,
      ...ftpFilled.next,
      ftpSubmit.next,
      messageBox(IMPORT_ADVANCED_MODAL, 'error-box').next,
    ],
    probes: dialogProbes(IMPORT_ADVANCED_MODAL, 'h4', boxProbe('advanced-error-box', IMPORT_ADVANCED_MODAL, 'error-box')),
  }),
  ...afterLoginEntry,
  localStorage: importRedirect,
}

// Setup complete, failed: the connection and the domain succeed, `POST import` answers 422. The setup-complete modal opens in its
// failed state (`completed && error`, return button shown), and the failure is an alert (`addAlert`, LITE `OnboardingModalWrapper.vue:1799-1805`).
// The alert is the last action (it is shown by the failure, not by a timer).
const importFailedAnswers = {
  'POST /instances/import/import': { status: 422, json: { message: IMPORT_FAILED } },
  'POST /projects/import/import': { status: 422, json: { message: IMPORT_FAILED } },
}
export const onboardingImportFailed: ParityState = {
  id: 'onboarding-import-failed',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({ id: 10 })]),
    handlers: { ...instanceOptions, ...importUrlAnswers, ...importCompleteAnswers, ...importFailedAnswers },
    legacy: [
      ...simpleSubmitted.legacy,
      async page => {
        await settled(page.locator('.alert-manager .alert--error'))
      },
    ],
    next: [
      ...simpleSubmitted.next,
      async page => {
        await settled(page.locator('.alert-manager .alert--error'))
      },
    ],
    masks: progressMasks(IMPORT_COMPLETE_MODAL),
    probes: [
      buttonProbe('return-to-dashboard', IMPORT_COMPLETE_MODAL, 'button.returnToDashboard'),
      ...progressProbes(IMPORT_COMPLETE_MODAL),
      ...alertProbes(page => page.locator('.alert-manager .alert--error')),
    ],
  }),
  ...afterLoginEntry,
  localStorage: importRedirect,
}

// --- Phase 19: error states of the deploy lite path (git connect, zip picker, custom deploy request) -----------------------

const GIT_ERROR = 'The repository could not be cloned.'
const DEPLOY_ERROR = 'The deploy could not be started.'
const BAD_ZIP_FILE = { name: 'setup.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('x') }

// Git connect, `error_message` in the answer: the error box shows it and the form stays on the repo step (`connectFailed`,
// LITE `OnboardingDeployFromGitModal.vue:236-238`). Both keys, legacy `/instances` and next `/projects`.
const gitTestError = {
  'POST /instances/test-git-url': { json: { success: false, error_message: GIT_ERROR } },
  'POST /projects/test-git-url': { json: { success: false, error_message: GIT_ERROR } },
}
export const onboardingDeployGitError: ParityState = {
  id: 'onboarding-deploy-git-error',
  ...onboardingState({
    home: liteOnboardingHome([gitService()]),
    handlers: { ...gitAnswers, ...gitTestError },
    legacy: [clickCreate.legacy, ...gitFilled.legacy, messageBox(GIT_MODAL, 'error-box').legacy],
    next: [clickCreate.next, ...gitFilled.next, messageBox(GIT_MODAL, 'error-box').next],
    probes: [...dialogProbes(GIT_MODAL, 'h4'), boxProbe('git-error-box', GIT_MODAL, 'error-box')],
  }),
}

// Zip picker, a file type outside the allowed list (`.exe`): the error box shows the invalid-type copy and the list stays empty
// (`validateStandaloneFiles`, LITE `OnboardingDeployFromZipModal.vue:673`; next `drop-files.ts` `invalidType`).
export const onboardingDeployZipError: ParityState = {
  id: 'onboarding-deploy-zip-error',
  ...onboardingState({
    home: liteOnboardingHome([filesService(10)]),
    legacy: [
      clickCreate.legacy,
      async page => {
        await page.locator('.v-dialog--active .v-card input[type="file"]').setInputFiles(BAD_ZIP_FILE)
      },
      messageBox(ZIP_MODAL, 'error-box').legacy,
    ],
    next: [
      clickCreate.next,
      async page => {
        await page.getByTestId('onboarding-deploy-zip-input').setInputFiles(BAD_ZIP_FILE)
      },
      messageBox(ZIP_MODAL, 'error-box').next,
    ],
    probes: [...dialogProbes(ZIP_MODAL, 'h4'), boxProbe('zip-error-box', ZIP_MODAL, 'error-box')],
  }),
}

// Custom deploy request, `POST deploy` answers 422: the progress shows the failed card (`installationCompleted` and
// `installationError`, the "Try again" button, LITE `OnboardingModalWrapper.vue:612-633`) and the failure is an alert. No instance
// exists, so no live log is polled; the alert is the last action.
const deployErrorAnswers = {
  'POST /instances/deploy': { status: 422, json: { message: DEPLOY_ERROR } },
  'POST /projects/deploy': { status: 422, json: { message: DEPLOY_ERROR } },
}
export const onboardingDeployProgressFailed: ParityState = {
  id: 'onboarding-deploy-progress-failed',
  ...onboardingState({
    home: liteOnboardingHome([gitService()]),
    handlers: { ...gitAnswers, ...deployErrorAnswers },
    legacy: [
      clickCreate.legacy,
      ...gitFilled.legacy,
      envContinue.legacy,
      async page => {
        await settled(page.locator('.alert-manager .alert--error'))
      },
    ],
    next: [
      clickCreate.next,
      ...gitFilled.next,
      envContinue.next,
      async page => {
        await settled(page.locator('.alert-manager .alert--error'))
      },
    ],
    masks: deployLogMasks(PROGRESS_MODAL),
    probes: [
      ...progressProbes(PROGRESS_MODAL, buttonProbe('try-again', PROGRESS_MODAL, 'button.try')),
      ...alertProbes(page => page.locator('.alert-manager .alert--error')),
    ],
  }),
}

// --- Phase 20: loading states of the install path (domain validation held, install POST held) ---------------------------

/**
 * The modal's continue button while it is loading: `v-btn--loading` (its text is hidden, so no role/name locator) and the
 * loader wrapper `.v-btn__loader` (the same class in both Vuetify generations, `pendingSubmitProbes` in `auth.ts`).
 */
function loadingButtonProbes (testId: string): Probe[] {
  return [
    {
      key: 'loading-button',
      legacy: page => page.locator('.v-dialog--active .v-card .v-btn--loading'),
      next: page => page.getByTestId(testId).locator('.v-btn--loading'),
    },
    {
      key: 'loading-button-loader',
      legacy: page => page.locator('.v-dialog--active .v-card .v-btn--loading .v-btn__loader'),
      next: page => page.getByTestId(testId).locator('.v-btn--loading .v-btn__loader'),
    },
  ]
}

/** The loading button stays disabled until the validation ends (`isContinueButtonDisabled`, both apps). */
function loadingButtonDisabledCheck (testId: string): { legacy: StateAction[], next: StateAction[] } {
  return {
    legacy: [async page => {
      await expect(page.locator('.v-dialog--active .v-card .v-btn--loading'), 'loading button disabled').toBeDisabled()
    }],
    next: [async page => {
      await expect(page.getByTestId(testId).locator('.v-btn--loading'), 'loading button disabled').toBeDisabled()
    }],
  }
}

// Domain validating: the validate request is held after blur (legacy `validateDomainAvailability` on blur, next `:loading`
// `domainValidationLoading`). The continue button shows its loader and "check domain availability" text, and stays disabled.
export const onboardingDomainValidating: ParityState = {
  id: 'onboarding-domain-validating',
  ...onboardingState({
    home: liteOnboardingHome([domainService()]),
    handlers: { ...instanceOptions, ...domainAnswers, 'GET /services/10/domains/validate': 'hold' },
    legacy: [clickCreate.legacy, typeDomain.legacy],
    next: [clickCreate.next, typeDomain.next],
    probes: [...onboardingDialogProbes(DOMAIN_MODAL), ...loadingButtonProbes(DOMAIN_MODAL)],
  }),
  afterCapture: loadingButtonDisabledCheck(DOMAIN_MODAL),
}

// Install loading: the install POST is held after the site name, so the progress card shows its loader (`Loader`, masked)
// while the request is pending. The fulfilled variant (`onboarding-install-progress`, Phase 12) keeps the card in progress.
const installHeld = {
  'POST /instances/install': 'hold' as const,
  'POST /projects/install': 'hold' as const,
}

export const onboardingInstallProgressLoading: ParityState = {
  id: 'onboarding-install-progress-loading',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({
      id: 10,
      onboarding_mode: 'legacy_quick',
      onboarding: { installation_type: { wordpress: true } },
    })]),
    handlers: { ...chooseTemplateHandlers(templateThemes), ...instanceOptions, ...domainAnswers, ...installHeld },
    legacy: [clickCreate.legacy, clickUseTheme.legacy, themeChosen.legacy, typeSiteName.legacy, submitSiteName.legacy],
    next: [clickCreate.next, clickUseTheme.next, themeChosen.next, typeSiteName.next, submitSiteName.next],
    masks: progressMasks(INSTALL_PROGRESS_MODAL),
    probes: [
      ...progressProbes(INSTALL_PROGRESS_MODAL),
      {
        key: 'loader',
        legacy: page => page.locator('.v-dialog--active .v-card .loader').first(),
        next: page => page.getByTestId(INSTALL_PROGRESS_MODAL).locator('.loader').first(),
      },
    ],
  }),
}

// --- Phase 21: loading states of the import and deploy lite paths (URL check, import POST, env preview, git test held) ----

// Import URL checking: the append `Loader` shows as soon as the field changes (legacy `handleInput`, next `handleInput`), before
// the debounced `test-wordpress-url` request. That request is held as well, so the loader stays until the snapshot.
const importUrlHeld = {
  'GET /instances/import/test-wordpress-url': 'hold' as const,
  'GET /projects/import/test-wordpress-url': 'hold' as const,
}

export const onboardingImportUrlLoading: ParityState = {
  id: 'onboarding-import-url-loading',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({ id: 10 })]),
    handlers: { ...instanceOptions, ...importUrlHeld },
    legacy: [urlEntered.legacy],
    next: [urlEntered.next],
    masks: progressMasks(IMPORT_URL_MODAL),
    probes: [
      ...dialogProbes(IMPORT_URL_MODAL, 'h4'),
      ...fieldProbes('import-url', IMPORT_URL_MODAL),
      {
        key: 'url-loader',
        legacy: page => page.locator('.v-dialog--active .v-card .loader').first(),
        next: page => page.getByTestId(IMPORT_URL_MODAL).locator('.loader').first(),
      },
    ],
  }),
  ...afterLoginEntry,
  localStorage: importRedirect,
}

// Import in progress: `POST import/import` is held (the last request of the import, after the connection test and the domain,
// both answered). Both apps open the setup-complete card only when the import answers (`importInstanceStarted`, LITE `:1713-1744`),
// so the plugin form stays open while the request runs and its continue button shows the loader.
const importHeld = {
  'POST /instances/import/import': 'hold' as const,
  'POST /projects/import/import': 'hold' as const,
}

export const onboardingImportInProgress: ParityState = {
  id: 'onboarding-import-in-progress',
  ...onboardingState({
    home: liteOnboardingHome([onboardingService({ id: 10 })]),
    handlers: { ...instanceOptions, ...importUrlAnswers, ...importCompleteAnswers, ...importHeld },
    legacy: [
      ...toMethodStep.legacy,
      methodContinue.legacy,
      ...simpleFilled.legacy,
      clickModalButton(IMPORT_SIMPLE_MODAL, 'button.continue').legacy,
    ],
    next: [
      ...toMethodStep.next,
      methodContinue.next,
      ...simpleFilled.next,
      clickModalButton(IMPORT_SIMPLE_MODAL, 'button.continue').next,
    ],
    probes: dialogProbes(IMPORT_SIMPLE_MODAL, 'h4', ...loadingButtonProbes(IMPORT_SIMPLE_MODAL)),
  }),
  ...afterLoginEntry,
  localStorage: importRedirect,
}

// Env vars loading: both apps open the env step with the preview the git modal already fetched (`previewReady`, LITE
// `OnboardingModalWrapper.vue:571-583`), so the skeleton shows only when another branch is picked and its preview is requested
// (`loadPreview`, legacy `EnvVarsModal.vue:223`, `!initialPreviewReady` skeleton `:64-66`, next `previewLoading`). The first
// preview answers, the second one is held. The skeleton is masked (shimmer).
const previewAnswer = { json: { has_example: true, variables: [{ key: 'APP_ENV', value: 'production' }, { key: 'APP_DEBUG', value: 'false' }] } }
const previewThenHeld = {
  'POST /instances/preview-env-example': [previewAnswer, 'hold' as const],
  'POST /projects/preview-env-example': [previewAnswer, 'hold' as const],
}
const envSkeletonMasks: NonNullable<ParityState['masks']> = {
  legacy: [page => page.locator('.v-dialog--active .v-skeleton-loader')],
  next: [page => page.getByTestId(ENV_MODAL).locator('.v-skeleton-loader')],
}
const pickOtherBranch: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.locator('.v-dialog--active .v-card .v-select .v-input__slot').first().click({ timeout: 8000 })
    await page.getByRole('option', { name: 'develop', exact: true }).click({ timeout: 8000 })
  },
  next: async page => {
    await page.getByTestId(ENV_MODAL).locator('.v-select .v-field').first().click({ timeout: 8000 })
    await page.getByRole('option', { name: 'develop', exact: true }).click({ timeout: 8000 })
  },
}

export const onboardingEnvVarsLoading: ParityState = {
  id: 'onboarding-env-vars-loading',
  ...onboardingState({
    home: liteOnboardingHome([gitService()]),
    handlers: { ...gitAnswers, ...previewThenHeld },
    legacy: [clickCreate.legacy, ...gitFilled.legacy, pickOtherBranch.legacy],
    next: [clickCreate.next, ...gitFilled.next, pickOtherBranch.next],
    masks: envSkeletonMasks,
    probes: [
      ...dialogProbes(ENV_MODAL, 'h4'),
      {
        key: 'env-skeleton',
        legacy: page => page.locator('.v-dialog--active .v-card .v-skeleton-loader').first(),
        next: page => page.getByTestId(ENV_MODAL).locator('.v-skeleton-loader').first(),
      },
    ],
  }),
}

// Git connecting: the connection test is held after Continue, so the continue button shows its loader (`v-btn--loading`,
// `:loading="loading || connecting"` in next) and the status line shows "connecting".
const gitHeld = {
  'POST /instances/test-git-url': 'hold' as const,
  'POST /projects/test-git-url': 'hold' as const,
}

export const onboardingDeployGitConnecting: ParityState = {
  id: 'onboarding-deploy-git-connecting',
  ...onboardingState({
    home: liteOnboardingHome([gitService()]),
    handlers: { ...gitAnswers, ...gitHeld },
    legacy: [clickCreate.legacy, ...gitFilled.legacy],
    next: [clickCreate.next, ...gitFilled.next],
    masks: progressMasks(GIT_MODAL),
    probes: [
      ...dialogProbes(GIT_MODAL, 'h4'),
      ...loadingButtonProbes(GIT_MODAL),
    ],
  }),
}

// --- S-130 (ui-onboarding-git-deploy-key): SSH address, deploy key form (`-ssh`, `-ssh-generating`, `-ssh-error`) ----------------

const SSH_URL = 'git@github.com:example/site.git'
const SSH_ERROR = 'The repository address is invalid.'
const GENERATE_KEY = 'button.onboarding.gitDeploy.generateDeployKey'

// Generate deploy key, both prefixes (legacy `/instances/deploy-key`, next `/projects/deploy-key`). The SSH address takes no
// test-git-url request: the form only shows the branch field and the generate button.
const deployKeyHeld = {
  'POST /instances/deploy-key': 'hold' as const,
  'POST /projects/deploy-key': 'hold' as const,
}
const deployKeyError = {
  'POST /instances/deploy-key': { status: 422, json: { errors: { repo_url: [SSH_ERROR] } } },
  'POST /projects/deploy-key': { status: 422, json: { errors: { repo_url: [SSH_ERROR] } } },
}
const sshUrlEntered = fillInput(GIT_MODAL, 0, SSH_URL)

/** The branch field of the SSH form (placeholder `main`, the only input of the modal with that placeholder). */
function branchProbe (testId: string): Probe {
  return {
    key: 'branch-input',
    legacy: page => page.locator('.v-dialog--active .v-card').getByPlaceholder('main', { exact: true }),
    next: page => page.getByTestId(testId).getByPlaceholder('main', { exact: true }),
  }
}

// SSH address typed: the private switch and the token go, the branch field (`main`) and the "project is created now" note show,
// the button names the generate action (`submit` → `generateKey`, LITE `OnboardingDeployFromGitModal.vue:197-216`).
export const onboardingDeployGitSsh: ParityState = {
  id: 'onboarding-deploy-git-ssh',
  ...onboardingState({
    home: liteOnboardingHome([gitService()]),
    legacy: [clickCreate.legacy, sshUrlEntered.legacy],
    next: [clickCreate.next, sshUrlEntered.next],
    probes: [
      ...dialogProbes(GIT_MODAL, 'h4'),
      branchProbe(GIT_MODAL),
      {
        key: 'project-now',
        legacy: page => page.locator('.v-dialog--active .v-card').getByText(tr('heading.onboarding.gitDeploy.projectCreatedNow', 'lite'), { exact: true }),
        next: page => page.getByTestId(GIT_MODAL).getByText(tr('heading.onboarding.gitDeploy.projectCreatedNow', 'lite'), { exact: true }),
      },
      buttonProbe('generate-deploy-key', GIT_MODAL, GENERATE_KEY),
    ],
  }),
}

// Generate deploy key held: the create request waits, so the button shows its loader (`:loading="connectionTestLoading"`).
export const onboardingDeployGitSshGenerating: ParityState = {
  id: 'onboarding-deploy-git-ssh-generating',
  ...onboardingState({
    home: liteOnboardingHome([gitService()]),
    handlers: deployKeyHeld,
    legacy: [clickCreate.legacy, sshUrlEntered.legacy, clickModalButton(GIT_MODAL, GENERATE_KEY).legacy],
    next: [clickCreate.next, sshUrlEntered.next, clickModalButton(GIT_MODAL, GENERATE_KEY).next],
    masks: progressMasks(GIT_MODAL),
    probes: [
      ...dialogProbes(GIT_MODAL, 'h4'),
      ...loadingButtonProbes(GIT_MODAL),
    ],
  }),
}

// Generate deploy key answers 422 with `errors.repo_url`: the error box shows the message and the url stays editable (no project).
export const onboardingDeployGitSshError: ParityState = {
  id: 'onboarding-deploy-git-ssh-error',
  ...onboardingState({
    home: liteOnboardingHome([gitService()]),
    handlers: deployKeyError,
    legacy: [clickCreate.legacy, sshUrlEntered.legacy, clickModalButton(GIT_MODAL, GENERATE_KEY).legacy, messageBox(GIT_MODAL, 'error-box').legacy],
    next: [clickCreate.next, sshUrlEntered.next, clickModalButton(GIT_MODAL, GENERATE_KEY).next, messageBox(GIT_MODAL, 'error-box').next],
    probes: [...dialogProbes(GIT_MODAL, 'h4'), boxProbe('ssh-error-box', GIT_MODAL, 'error-box')],
  }),
}

// --- S-130 (ui-onboarding-git-deploy-key): key panel, confirmation and the Continue gate (`-ssh-key`, `-ssh-key-unchecked`,
// `-ssh-creating`, `-ssh-key-hover`, `-ssh-key-focus`) -----------------------------------------------------------------------

const SSH_PUBLIC_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPanelAlphaDeployKey'

// The project is created (`deploy-key` answers with the project and the key) and its create task is polled under both prefixes.
// `statuses` is the sequence of the panel status the live read answers (the last one repeats, as `deployLiveHandlers` does).
const deployKeyCreated = {
  'POST /instances/deploy-key': { json: { data: { project: { id: 502, name: 'site' }, deploy_key: { public_key: SSH_PUBLIC_KEY } } } },
  'POST /projects/deploy-key': { json: { data: { project: { id: 502, name: 'site' }, deploy_key: { public_key: SSH_PUBLIC_KEY } } } },
}
function sshLiveAnswers (statuses: string[]): Record<string, Handler> {
  const answers = (): Array<{ json: Record<string, unknown> }> => statuses.map(status => ({ json: { data: { panel: { id: 502, status } } } }))
  return {
    'GET /instances/502/deploy-logs/live': answers(),
    'GET /projects/502/deploy-logs/live': answers(),
  }
}

// Url entered and Generate pressed: the project exists, the key panel and the confirmation show after the create request.
const sshGenerated = sequence(sshUrlEntered, clickModalButton(GIT_MODAL, GENERATE_KEY))

// Waits until the create task is settled (the poll reads `running` then `finished`, about 4 s): Continue is the button again.
const keyPollSettled: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await expect(page.locator('.v-dialog--active .v-card').getByRole('button', { name: tr('button.continue', 'lite'), exact: true }), 'task settled').toBeVisible({ timeout: 15_000 })
  },
  next: async page => {
    await expect(page.getByTestId(GIT_MODAL).getByRole('button', { name: tr('button.continue', 'lite'), exact: true }), 'task settled').toBeVisible({ timeout: 15_000 })
  },
}

// The only checkbox of the SSH form is the key confirmation (the private switch is hidden for an SSH address): `togglePrivate` clicks it.
const toggleKeyAdded = togglePrivate

// Keyboard focus on the confirmation checkbox (the control is the checkbox, not a button). Focus comes from `focus()` after a
// keyboard event, so `:focus-visible` matches as with Tab; the Tab order would first stop on the key box copy buttons.
const focusKeyAdded: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.mouse.move(0, 0)
    await page.keyboard.press('Shift')
    const input = page.locator('.v-dialog--active .v-card .checkbox input[type="checkbox"]')
    await input.focus()
    await expect(input, 'keyboard focus').toBeFocused()
  },
  next: async page => {
    await page.mouse.move(0, 0)
    await page.keyboard.press('Shift')
    const input = page.getByTestId(GIT_MODAL).locator('.checkbox input[type="checkbox"]')
    await input.focus()
    await expect(input, 'keyboard focus').toBeFocused()
  },
}

/** Probes of the key step: the key box, its instruction, the confirmation checkbox and the continue button. */
function keyProbes (): Probe[] {
  return [
    ...dialogProbes(GIT_MODAL, 'h4'),
    {
      key: 'key-box',
      legacy: page => page.locator('.v-dialog--active .v-card .long-value-box'),
      next: page => page.getByTestId(GIT_MODAL).locator('.long-value-box'),
    },
    {
      key: 'key-instruction',
      legacy: page => page.locator('.v-dialog--active .v-card').getByText(tr('heading.onboarding.gitDeploy.auth.deployKey.instruction', 'lite'), { exact: true }),
      next: page => page.getByTestId(GIT_MODAL).getByText(tr('heading.onboarding.gitDeploy.auth.deployKey.instruction', 'lite'), { exact: true }),
    },
    {
      key: 'key-checkbox',
      legacy: page => page.locator('.v-dialog--active .v-card .checkbox'),
      next: page => page.getByTestId(GIT_MODAL).locator('.checkbox'),
    },
    buttonProbe('continue-action', GIT_MODAL, 'button.continue'),
  ]
}

// Key created, the create task settles: the key box, the instruction and the unchecked confirmation; Continue waits for the checkbox.
const sshKeyState = {
  home: liteOnboardingHome([gitService()]),
  handlers: { ...deployKeyCreated, ...sshLiveAnswers(['running', 'finished']) },
}
export const onboardingDeployGitSshKey: ParityState = {
  id: 'onboarding-deploy-git-ssh-key',
  ...onboardingState({
    ...sshKeyState,
    legacy: [clickCreate.legacy, ...sshGenerated.legacy, keyPollSettled.legacy],
    next: [clickCreate.next, ...sshGenerated.next, keyPollSettled.next],
    probes: keyProbes(),
  }),
}

// The same step, Continue checked for the disabled state: Continue stays off while the checkbox is not ticked.
export const onboardingDeployGitSshKeyUnchecked: ParityState = {
  ...onboardingDeployGitSshKey,
  id: 'onboarding-deploy-git-ssh-key-unchecked',
  probes: [...onboardingDeployGitSshKey.probes, buttonProbe('disabled-action', GIT_MODAL, 'button.continue')],
  afterCapture: disabledButtonCheck(GIT_MODAL, 'button.continue'),
}

// The create task still runs (every read answers `running`): the button shows its spinner and "Creating the project…", disabled.
export const onboardingDeployGitSshCreating: ParityState = {
  id: 'onboarding-deploy-git-ssh-creating',
  ...onboardingState({
    home: liteOnboardingHome([gitService()]),
    handlers: { ...deployKeyCreated, ...sshLiveAnswers(['running']) },
    legacy: [clickCreate.legacy, ...sshGenerated.legacy],
    next: [clickCreate.next, ...sshGenerated.next],
    masks: progressMasks(GIT_MODAL),
    probes: [
      ...dialogProbes(GIT_MODAL, 'h4'),
      buttonProbe('creating-action', GIT_MODAL, 'heading.onboarding.gitDeploy.projectCreating'),
    ],
  }),
  afterCapture: disabledButtonCheck(GIT_MODAL, 'heading.onboarding.gitDeploy.projectCreating'),
}

// The key is confirmed: Continue is enabled. Base for the hover and focus checks of the enabled button.
const sshKeyChecked: ParityState = {
  id: 'onboarding-deploy-git-ssh-key-checked',
  ...onboardingState({
    ...sshKeyState,
    legacy: [clickCreate.legacy, ...sshGenerated.legacy, keyPollSettled.legacy, toggleKeyAdded.legacy, modalButtonEnabled(GIT_MODAL, 'button.continue').legacy],
    next: [clickCreate.next, ...sshGenerated.next, keyPollSettled.next, toggleKeyAdded.next, modalButtonEnabled(GIT_MODAL, 'button.continue').next],
    probes: keyProbes(),
  }),
}

export const onboardingDeployGitSshKeyHover = buttonHoverState(sshKeyChecked, 'onboarding-deploy-git-ssh-key-hover', 'button.continue', 'lite')

// The checkbox has the keyboard focus (its outline), Continue is still off.
export const onboardingDeployGitSshKeyFocus: ParityState = {
  id: 'onboarding-deploy-git-ssh-key-focus',
  ...onboardingState({
    ...sshKeyState,
    legacy: [clickCreate.legacy, ...sshGenerated.legacy, keyPollSettled.legacy, focusKeyAdded.legacy],
    next: [clickCreate.next, ...sshGenerated.next, keyPollSettled.next, focusKeyAdded.next],
    probes: keyProbes(),
  }),
}

// --- S-130 (ui-onboarding-git-deploy-key): SSH connect (`-ssh-connecting`, `-ssh-connect-error`) -----------------------------------

const SSH_CONNECT_ERROR = 'The repository could not be connected.'

// Connect and its reads, both prefixes (legacy `/instances/502/git/…`, next `/projects/502/git/…`). A connect that succeeds reads the
// branches and the example env file; the held and the failing states never reach the reads.
const sshConnectAnswers: Record<string, Handler> = {
  'POST /instances/502/git/connect': { json: { data: { branch_missing: false } } },
  'POST /projects/502/git/connect': { json: { data: { branch_missing: false } } },
  'GET /instances/502/git/branches': { json: { data: ['main'] } },
  'GET /projects/502/git/branches': { json: { data: ['main'] } },
  'GET /instances/502/git/env-example': { json: { data: { has_example: false, variables: [] } } },
  'GET /projects/502/git/env-example': { json: { data: { has_example: false, variables: [] } } },
}
const sshConnectHeld = {
  'POST /instances/502/git/connect': 'hold' as const,
  'POST /projects/502/git/connect': 'hold' as const,
}
const sshConnectRejected = {
  'POST /instances/502/git/connect': { status: 422, json: { errors: { repo_url: [SSH_CONNECT_ERROR] } } },
  'POST /projects/502/git/connect': { status: 422, json: { errors: { repo_url: [SSH_CONNECT_ERROR] } } },
}

// Continue pressed on the checked key: the connect request is held, so the button shows its loader (`connectSsh`, `connecting`).
const sshConnectClick = clickModalButton(GIT_MODAL, 'button.continue')

// The connect answers 422 with `errors.repo_url`: the message shows under the key panel (`connectError`), not in the error box.
const connectErrorText: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await settled(page.locator('.v-dialog--active .v-card').getByText(SSH_CONNECT_ERROR, { exact: true }))
  },
  next: async page => {
    await settled(page.getByTestId(GIT_MODAL).getByText(SSH_CONNECT_ERROR, { exact: true }))
  },
}

export const onboardingDeployGitSshConnecting: ParityState = {
  id: 'onboarding-deploy-git-ssh-connecting',
  ...onboardingState({
    ...sshKeyState,
    handlers: { ...sshKeyState.handlers, ...sshConnectAnswers, ...sshConnectHeld },
    legacy: [clickCreate.legacy, ...sshGenerated.legacy, keyPollSettled.legacy, toggleKeyAdded.legacy, sshConnectClick.legacy],
    next: [clickCreate.next, ...sshGenerated.next, keyPollSettled.next, toggleKeyAdded.next, sshConnectClick.next],
    masks: progressMasks(GIT_MODAL),
    probes: [...keyProbes(), ...loadingButtonProbes(GIT_MODAL)],
  }),
}

export const onboardingDeployGitSshConnectError: ParityState = {
  id: 'onboarding-deploy-git-ssh-connect-error',
  ...onboardingState({
    ...sshKeyState,
    handlers: { ...sshKeyState.handlers, ...sshConnectRejected },
    legacy: [clickCreate.legacy, ...sshGenerated.legacy, keyPollSettled.legacy, toggleKeyAdded.legacy, sshConnectClick.legacy, connectErrorText.legacy],
    next: [clickCreate.next, ...sshGenerated.next, keyPollSettled.next, toggleKeyAdded.next, sshConnectClick.next, connectErrorText.next],
    probes: [
      ...keyProbes(),
      {
        key: 'connect-error',
        legacy: page => page.locator('.v-dialog--active .v-card').getByText(SSH_CONNECT_ERROR, { exact: true }),
        next: page => page.getByTestId(GIT_MODAL).getByText(SSH_CONNECT_ERROR, { exact: true }),
      },
    ],
  }),
}

// --- S-130 (ui-onboarding-git-deploy-key): SSH env step with a missing branch (`-ssh-env-branch-missing`) ------------------------------

// Connect reports the typed branch (`main`, the form default) missing on the remote: the env step opens with no branch picked, the copy
// names the branch above the select, and Skip and Continue wait for another pick (`mustChooseBranch`). The remote has two branches.
const sshBranchMissingAnswers: Record<string, Handler> = {
  'POST /instances/502/git/connect': { json: { data: { branch_missing: true } } },
  'POST /projects/502/git/connect': { json: { data: { branch_missing: true } } },
  'GET /instances/502/git/branches': { json: { data: ['main', 'develop'] } },
  'GET /projects/502/git/branches': { json: { data: ['main', 'develop'] } },
  'GET /instances/502/git/env-example': { json: { data: { has_example: true, variables: [{ key: 'APP_ENV', value: 'production' }, { key: 'APP_DEBUG', value: 'false' }] } } },
  'GET /projects/502/git/env-example': { json: { data: { has_example: true, variables: [{ key: 'APP_ENV', value: 'production' }, { key: 'APP_DEBUG', value: 'false' }] } } },
}
const BRANCH_MISSING = tr('heading.onboarding.gitDeploy.branchMissing', 'lite').replace('{{branch}}', 'main')

export const onboardingDeployGitSshEnvBranchMissing: ParityState = {
  id: 'onboarding-deploy-git-ssh-env-branch-missing',
  ...onboardingState({
    ...sshKeyState,
    handlers: { ...sshKeyState.handlers, ...sshBranchMissingAnswers },
    legacy: [clickCreate.legacy, ...sshGenerated.legacy, keyPollSettled.legacy, toggleKeyAdded.legacy, sshConnectClick.legacy],
    next: [clickCreate.next, ...sshGenerated.next, keyPollSettled.next, toggleKeyAdded.next, sshConnectClick.next],
    probes: [
      ...dialogProbes(ENV_MODAL, 'h4'),
      {
        key: 'branch-missing',
        legacy: page => page.locator('.v-dialog--active .v-card').getByText(BRANCH_MISSING, { exact: true }),
        next: page => page.getByTestId(ENV_MODAL).getByText(BRANCH_MISSING, { exact: true }),
      },
      {
        key: 'branch-select',
        legacy: page => page.locator('.v-dialog--active .v-card .v-select').first(),
        next: page => page.getByTestId(ENV_MODAL).locator('.v-select').first(),
      },
      buttonProbe('disabled-action', ENV_MODAL, 'button.continue'),
    ],
  }),
  afterCapture: disabledButtonCheck(ENV_MODAL, 'button.continue'),
}

// --- S-130 (ui-onboarding-git-deploy-key): closing window and SSH deploy retry (`-ssh-closing`, `-ssh-progress-failed`) ---------

const CLOSING_MODAL = 'onboarding-ssh-closing-modal'
const CLOSING_MESSAGE = 'heading.onboarding.gitDeploy.closing.message'

// The X of the git step closes it with the project of its key (LITE `closeGitModal`): the closing window opens over the empty page.
// The close is the first button of the step's card (the header comes first in both apps).
const closeGitStep: { legacy: StateAction, next: StateAction } = {
  legacy: async page => {
    await page.locator('.v-dialog--active .v-card .v-btn').first().click({ timeout: 8000 })
  },
  next: async page => {
    await page.getByTestId(GIT_MODAL).locator('.v-btn').first().click({ timeout: 8000 })
  },
}

export const onboardingDeployGitSshClosing: ParityState = {
  id: 'onboarding-deploy-git-ssh-closing',
  ...onboardingState({
    ...sshKeyState,
    legacy: [clickCreate.legacy, ...sshGenerated.legacy, keyPollSettled.legacy, closeGitStep.legacy, settledText(CLOSING_MESSAGE).legacy],
    next: [clickCreate.next, ...sshGenerated.next, keyPollSettled.next, closeGitStep.next, settledText(CLOSING_MESSAGE).next],
    probes: [
      {
        key: 'closing-message',
        legacy: page => page.locator('.v-dialog--active .v-card').getByText(tr(CLOSING_MESSAGE, 'lite'), { exact: true }),
        next: page => page.getByTestId(CLOSING_MODAL).getByText(tr(CLOSING_MESSAGE, 'lite'), { exact: true }),
      },
      {
        key: 'closing-card',
        legacy: page => page.locator('.v-dialog--active .v-card').filter({ hasText: tr(CLOSING_MESSAGE, 'lite') }),
        next: page => page.getByTestId(CLOSING_MODAL).locator('.ssh-closing-card'),
      },
      buttonProbe('close-action', CLOSING_MODAL, 'button.close'),
      buttonProbe('go-to-git-tab', CLOSING_MODAL, 'button.onboarding.gitDeploy.goToGitTab'),
    ],
  }),
}

/** Waits until a text of the page is visible (both apps), the last action of a state that closes or opens a window. */
function settledText (copyKey: string): { legacy: StateAction, next: StateAction } {
  return {
    legacy: async page => {
      await settled(page.locator('.v-dialog--active .v-card').getByText(tr(copyKey, 'lite'), { exact: true }))
    },
    next: async page => {
      await settled(page.getByTestId(CLOSING_MODAL).getByText(tr(copyKey, 'lite'), { exact: true }))
    },
  }
}

// Continue on the checked key connects, the single branch and no example deploy at once (`resolveSshNextStep`): the SSH deploy
// answers 500, so the progress shows the failed card with Try again (`deployFromGitSsh` keeps the payload for it).
const sshDeployErrorAnswers = {
  'POST /instances/502/git/deploy': { status: 500, json: { message: DEPLOY_ERROR } },
  'POST /projects/502/git/deploy': { status: 500, json: { message: DEPLOY_ERROR } },
}
export const onboardingDeployGitSshProgressFailed: ParityState = {
  id: 'onboarding-deploy-git-ssh-progress-failed',
  ...onboardingState({
    ...sshKeyState,
    handlers: { ...sshKeyState.handlers, ...sshConnectAnswers, ...sshDeployErrorAnswers },
    legacy: [
      clickCreate.legacy,
      ...sshGenerated.legacy,
      keyPollSettled.legacy,
      toggleKeyAdded.legacy,
      sshConnectClick.legacy,
      async page => {
        await settled(page.locator('.alert-manager .alert--error'))
      },
    ],
    next: [
      clickCreate.next,
      ...sshGenerated.next,
      keyPollSettled.next,
      toggleKeyAdded.next,
      sshConnectClick.next,
      async page => {
        await settled(page.locator('.alert-manager .alert--error'))
      },
    ],
    masks: deployLogMasks(PROGRESS_MODAL),
    probes: [
      ...progressProbes(PROGRESS_MODAL, buttonProbe('try-again', PROGRESS_MODAL, 'button.try')),
      ...alertProbes(page => page.locator('.alert-manager .alert--error')),
    ],
  }),
}

const states: ParityState[] = [
  onboardingDomain,
  onboardingDomainSubdomains,
  onboardingDomainSubdomainsFree,
  onboardingDomainTransfer,
  onboardingDnsVerify,
  onboardingSiteName,
  onboardingDeployGit,
  onboardingStandardForm,
  onboardingInstallProgress,
  onboardingSuperQuick,
  onboardingSync,
  onboardingDemoChooseProcess,
  onboardingDemoCompleted,
  onboardingForceInstall,
  onboardingImportUrl,
  onboardingImportMethod,
  onboardingImportSimple,
  onboardingImportAdvanced,
  onboardingImportComplete,
  onboardingDeployGitPrivate,
  onboardingEnvVars,
  onboardingDeployProgress,
  onboardingDeployZip,
  onboardingDeployZipDragOver,
  onboardingDeployZipFilled,
  onboardingFilesDrop,
  onboardingDomainHover,
  onboardingDomainFocus,
  onboardingDeployGitHover,
  onboardingDeployGitFocus,
  onboardingDomainDisabled,
  onboardingImportUrlDisabled,
  onboardingDeployGitDisabled,
  onboardingStandardFormCloneDisabled,
  onboardingStandardFormTemplateDisabled,
  onboardingSuperQuickDisabled,
  onboardingDomainError,
  onboardingInstallError,
  onboardingImportUrlError,
  onboardingImportUrlNotDetected,
  onboardingImportSimpleError,
  onboardingImportConnectionError,
  onboardingImportWarning,
  onboardingImportAdvancedError,
  onboardingImportFailed,
  onboardingDeployGitError,
  onboardingDeployZipError,
  onboardingDeployProgressFailed,
  onboardingDomainValidating,
  onboardingInstallProgressLoading,
  onboardingImportUrlLoading,
  onboardingImportInProgress,
  onboardingEnvVarsLoading,
  onboardingDeployGitConnecting,
  onboardingDeployGitSsh,
  onboardingDeployGitSshGenerating,
  onboardingDeployGitSshError,
  onboardingDeployGitSshKey,
  onboardingDeployGitSshKeyUnchecked,
  onboardingDeployGitSshCreating,
  onboardingDeployGitSshKeyHover,
  onboardingDeployGitSshKeyFocus,
  onboardingDeployGitSshConnecting,
  onboardingDeployGitSshConnectError,
  onboardingDeployGitSshEnvBranchMissing,
  onboardingDeployGitSshClosing,
  onboardingDeployGitSshProgressFailed,
]

for (const state of states) {
  test(`${state.id} legacy vs next`, async ({ browser }, testInfo) => {
    await runState(browser, testInfo, state)
  })
}
