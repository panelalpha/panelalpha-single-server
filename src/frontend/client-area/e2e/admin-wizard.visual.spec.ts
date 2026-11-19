import type { Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { markWizardFlow } from './support/fake-wizard-api'
import { expect, test } from './support/fixtures'
import { SNAPSHOT as BASE_SNAPSHOT, disableTransitions, expectHoverShot, holdRoute } from './support/visual'

// The animated GIF of the Hub diagram (step 1) changes every frame, so every shot of the wizard hides it (`stylePath`) and keeps its box.
const SNAPSHOT = { ...BASE_SNAPSHOT, stylePath: fileURLToPath(new URL('support/wizard-hub-diagram.css', import.meta.url)) }

// Visual gate of the first-run wizard (`toHaveScreenshot`, baselines of next). The mock-up B2 is measured in `e2e/admin-wizard.reference.spec.ts`.
// Run it on its own port, with a pattern of one state (`v3-` prefix) when it updates the baselines:
//   E2E_PORT=4188 npx playwright test e2e/admin-wizard.visual.spec.ts -g v3-general-local [--update-snapshots]
// Baselines live in `admin-wizard.visual.spec.ts-snapshots/`.

test.use({ viewport: { width: 1440, height: 900 }, timezoneId: 'UTC', locale: 'en-US', colorScheme: 'light' })

const GENERAL_PATH = '/wizard/general-config'

/** Opens step 2 (the local form of a guest) and waits for the form and the fonts, so the text is the same on every run. */
async function openGeneral (page: Page): Promise<void> {
  await page.goto(GENERAL_PATH)
  await expect(page.getByRole('heading', { name: 'Name your server' })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.mouse.move(0, 0)
}

/** Fills the account with valid values; the server name keeps its default. */
async function fillAccount (page: Page, overrides: { email?: string, password?: string, confirm?: string } = {}): Promise<void> {
  await page.getByLabel('Email').fill(overrides.email ?? 'ada@example.com')
  await page.getByLabel('Password', { exact: true }).fill(overrides.password ?? 'Secret1!')
  await page.getByLabel('Confirm password').fill(overrides.confirm ?? 'Secret1!')
}

// Step 2 of v3 in the `local` mode (a guest creates the account) and the `readonly` mode (the account exists): wizard-v3, phase 6.
// Run: `E2E_PORT=4188 npx playwright test e2e/admin-wizard.visual.spec.ts -g "v3-general-(local|readonly)"`.
test.describe('v3 general local', () => {
  test('v3-general-local-default: the form of the server and the account in the palette of the mock-up', async ({ page }) => {
    await openGeneral(page)

    await expect(page.getByRole('link', { name: 'Connect with Hub instead' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Server name' })).toHaveValue('My server')
    await expect(page).toHaveScreenshot('v3-general-local-default.png', SNAPSHOT)
  })

  test('v3-general-local-validation: every rule shows its message and nothing is sent', async ({ page, wizard }) => {
    await openGeneral(page)
    await page.getByRole('textbox', { name: 'Server name' }).fill('')
    await fillAccount(page, { email: 'ada', password: 'short', confirm: 'other' })
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.locator('.v-messages__message').first()).toBeVisible()
    await page.getByTestId('wizard-next').blur()
    await page.mouse.move(0, 0)
    await expect(page).toHaveScreenshot('v3-general-local-validation.png', SNAPSHOT)
    expect(wizard.posts).toEqual([])
  })

  test('v3-general-local-error: a 422 of the save shows the message without the field name under the fields', async ({ page, wizard }) => {
    wizard.failSetup = { status: 422, body: { message: 'The given data was invalid.', errors: { email: ['The email has already been taken.'] } } }
    await openGeneral(page)
    await fillAccount(page)
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByTestId('wizard-general-error')).toHaveText('The email has already been taken.')
    await expect(page).toHaveURL(/\/wizard\/general-config$/)
    await page.mouse.move(0, 0)
    await expect(page).toHaveScreenshot('v3-general-local-error.png', SNAPSHOT)
  })

  test('v3-general-local-checker: the hint under Password while it has the focus', async ({ page }) => {
    await openGeneral(page)
    await page.getByLabel('Password', { exact: true }).fill('abc1')
    await expect(page.getByTestId('wizard-password-checker')).toBeVisible()
    await expect(page.getByTestId('wizard-checker-lowercase')).toHaveAttribute('data-passed', 'true')
    await expect(page.getByTestId('wizard-checker-symbol')).toHaveAttribute('data-passed', 'false')

    await expect(page).toHaveScreenshot('v3-general-local-checker.png', SNAPSHOT)
  })

  test('v3-general-local-checker closes when the field loses the focus', async ({ page }) => {
    await openGeneral(page)
    await page.getByLabel('Password', { exact: true }).fill('abc1')
    await expect(page.getByTestId('wizard-password-checker')).toBeVisible()

    await page.getByLabel('Confirm password').focus()

    await expect(page.getByTestId('wizard-password-checker')).toBeHidden()
  })

  test('v3-general-local-hover: Continue turns darker', async ({ page }) => {
    await openGeneral(page)
    await disableTransitions(page)
    await page.getByTestId('wizard-next').hover()

    await expectHoverShot(page, page.getByTestId('wizard-footer'), 'v3-general-local-hover.png')
  })

  test('v3-general-local-focus: Continue has a visible ring', async ({ page }) => {
    await openGeneral(page)
    await disableTransitions(page)
    // A key press first, so the programmatic focus counts as keyboard focus (`:focus-visible`).
    await page.keyboard.press('Shift')
    await page.getByTestId('wizard-next').focus()
    await expect(page.getByTestId('wizard-next')).toBeFocused()

    await expectHoverShot(page, page.getByTestId('wizard-footer'), 'v3-general-local-focus.png')
  })

  test('v3-general-local-save: Continue creates the account and opens step 3 (Connect AI)', async ({ page, wizard }) => {
    await openGeneral(page)
    await fillAccount(page)
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page).toHaveURL(/\/wizard\/connect-ai$/)
    expect(wizard.posts).toEqual([{
      path: '/community/setup',
      body: expect.objectContaining({ email: 'ada@example.com' }),
    }])
  })

  test('v3-general-local-back: "Back" and the link of the lead return to step 1 and send nothing', async ({ page, wizard }) => {
    await openGeneral(page)
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page).toHaveURL(/\/wizard\/panelalpha-connect$/)

    await openGeneral(page)
    await page.getByRole('link', { name: 'Connect with Hub instead' }).click()
    await expect(page).toHaveURL(/\/wizard\/panelalpha-connect$/)
    expect(wizard.posts).toEqual([])
  })

  test('v3-general-local-continue-width: Continue is as wide as in admin area (127px: 17px of padding, the label and the arrow)', async ({ page }) => {
    await openGeneral(page)

    const box = await page.getByTestId('wizard-next').boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(125)
    expect(box?.width).toBeLessThanOrEqual(130)
  })
})

test.describe('v3 general readonly', () => {
  test('v3-general-readonly: the account exists, the fields are locked and Continue goes on to step 3', async ({ page, wizard }) => {
    await signIn(page, wizard)
    wizard.serverName = 'Acme server'
    await openGeneral(page)

    await expect(page.getByRole('textbox', { name: 'Server name' })).toBeDisabled()
    await expect(page.getByRole('textbox', { name: 'Server name' })).toHaveValue('Acme server')
    await expect(page.getByLabel('Email')).toBeDisabled()
    await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Connect with Hub instead' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0)
    await expect(page).toHaveScreenshot('v3-general-readonly.png', { ...SNAPSHOT, fullPage: false })

    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page).toHaveURL(/\/wizard\/connect-ai$/)
    expect(wizard.posts).toEqual([])
    expect(wizard.puts).toEqual([])
  })

  test('v3-general-readonly-tooltip: the tooltip says why a field is locked', async ({ page, wizard }) => {
    await signIn(page, wizard)
    await openGeneral(page)

    // A disabled input takes no pointer events, so the pointer rests on the box around it (the email is the third one).
    await page.getByTestId('wizard-locked-hint').nth(2).hover()

    // Every locked field has its own tooltip in the page; only the one under the pointer is shown.
    await expect(page.getByText('has been already created and cannot be changed in the wizard').filter({ visible: true })).toHaveCount(1)
    await expect(page).toHaveScreenshot('v3-general-readonly-tooltip.png', { ...SNAPSHOT, fullPage: false })
  })
})

// Step 1 (PanelAlpha Connect) of v3: its states are at the end of the file (`v3 connect`, `v3 connect states`).
// Run: `E2E_PORT=4188 npx playwright test e2e/admin-wizard.visual.spec.ts -g v3-connect`.
const CONNECT_PATH = '/wizard/panelalpha-connect'

/** The account of the wizard exists: the later steps are open to the signed-in admin of this tab, the one that is finishing the setup. */
async function signIn (page: Page, wizard: { setupRequired: boolean, signedIn: boolean }): Promise<void> {
  wizard.setupRequired = false
  wizard.signedIn = true
  await markWizardFlow(page)
}

async function openConnect (page: Page, path = CONNECT_PATH): Promise<void> {
  await page.goto(path)
  await expect(page.getByRole('heading', { name: 'How do you want to sign in?' })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.mouse.move(0, 0)
}

// Step 3 (Summary), used by the layouts below and by the `v3 summary` tests at the end of the file. The confetti is a rAF animation,
// so its container is hidden for the shots.
const SUMMARY_PATH = '/wizard/summary'
const AI_PATH = '/wizard/connect-ai'

/** Opens Summary and waits for the row of the account: `Hub account` after a Hub sign-in, `Admin email` after a local account. */
async function openSummary (page: Page, expectedAccount: 'Hub account' | 'Admin email'): Promise<void> {
  await page.goto(SUMMARY_PATH)
  await expect(page.getByRole('heading', { name: 'You\'re all set.' })).toBeVisible()
  await expect(page.getByTestId('wizard-summary-account')).toContainText(expectedAccount)
  await page.addStyleTag({ content: '[data-testid="wizard-confetti"] { visibility: hidden; }' })
  await page.evaluate(() => document.fonts.ready)
  await page.mouse.move(0, 0)
}

// Layouts of v3: every screen at 375 (bar of the steps), 768 (bar), 1024 (76px rail) and 1440 (360px sidebar). Breakpoints of next: the rail from
// 976 to 1199px, the bar below 976px, the footer in a column below 576px (`sm`). The confetti is hidden. Full-page shots, so the diagram that
// goes under the list of benefits below 976px is in the frame.
// Run: `E2E_PORT=4188 npx playwright test e2e/admin-wizard.visual.spec.ts --grep v3-layout`.
type Screen = 'start' | 'general' | 'connect' | 'ai' | 'summary'

const SCREENS: Record<Screen, { path: string, heading: string }> = {
  start: { path: '/wizard', heading: 'A few steps to your first deploy.' },
  general: { path: GENERAL_PATH, heading: 'Name your server' },
  connect: { path: CONNECT_PATH, heading: 'How do you want to sign in?' },
  ai: { path: AI_PATH, heading: 'Connect your AI assistant' },
  summary: { path: SUMMARY_PATH, heading: 'You\'re all set.' },
}

async function openScreen (page: Page, screen: Screen): Promise<void> {
  await page.goto(SCREENS[screen].path)
  await expect(page.getByRole('heading', { name: SCREENS[screen].heading })).toBeVisible()
  await page.addStyleTag({ content: '[data-testid="wizard-confetti"] { visibility: hidden; }' })
  await page.evaluate(() => document.fonts.ready)
  // The logo changes with the theme, so the shot waits until every picture is loaded.
  await page.waitForFunction(() => Array.from(document.images).every(image => image.complete))
  await page.mouse.move(0, 0)
}

const WIDTHS = [375, 768, 1024, 1440]

// `general-hub` is step 2 after a Hub return (the name of the server), `general` the local form of a guest.
type LayoutScreen = Screen | 'general-hub'
const LAYOUT_SCREENS: LayoutScreen[] = ['start', 'connect', 'general', 'general-hub', 'ai', 'summary']

test.describe('v3 layout', () => {
  for (const width of WIDTHS) {
    for (const screen of LAYOUT_SCREENS) {
      test(`v3-layout-${screen}-${width}: no horizontal scroll and the shot of the page`, async ({ page, wizard }) => {
        await page.setViewportSize({ width, height: 900 })
        if (screen === 'summary' || screen === 'ai') {
          await signIn(page, wizard)
        }
        if (screen === 'general-hub') {
          await hubReturned(page, wizard)
          await openHubName(page)
        } else {
          await openScreen(page, screen)
        }

        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await expect(page).toHaveScreenshot(`v3-layout-${screen}-${width}.png`, { ...SNAPSHOT, fullPage: true })
      })
    }
  }

  for (const width of WIDTHS) {
    test(`v3-layout-language-menu-${width}: the menu of the language footer opens inside the window`, async ({ page, wizard }) => {
      await signIn(page, wizard)
      await page.setViewportSize({ width, height: 900 })
      await openScreen(page, 'ai')
      await page.getByTestId('wizard-language').getByRole('button').click()
      // The kit menu has no ARIA role of its own (a plain `v-list`), so its overlay is found by the testid of the kit.
      const menu = page.getByTestId('language-menu')
      await expect(menu).toBeVisible()
      const box = await menu.boundingBox()
      expect(box && box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 900).toBe(true)
    })
  }

  test('v3-layout-rail: the rail is 76px wide, keeps the names of the steps for screen readers and opens a reached step', async ({ page, wizard }) => {
    await page.setViewportSize({ width: 1024, height: 900 })
    await signIn(page, wizard)
    await openScreen(page, 'summary')

    await expect(page.getByRole('button', { name: 'Server name' })).toBeAttached()
    const box = await page.getByTestId('wizard-sidebar').boundingBox()
    expect(box?.width).toBe(76)
    await page.getByRole('button', { name: 'Server name' }).click()
    await expect(page).toHaveURL(/\/wizard\/general-config$/)
  })

  test('v3-layout-sidebar: from 1200px the sidebar is 380px wide (admin area)', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 })
    await openScreen(page, 'connect')

    const box = await page.getByTestId('wizard-sidebar').boundingBox()
    expect(box?.width).toBe(380)
  })

  test('v3-layout-footer: under 576px the buttons stand one under the other, the main one on top', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await openScreen(page, 'general')

    const next = await page.getByTestId('wizard-next').boundingBox()
    const previous = await page.getByTestId('wizard-previous').boundingBox()
    // Stacked: the main button ends above the top of "Back".
    expect(next && previous && next.y + next.height <= previous.y).toBe(true)
    expect(next?.width).toBe(previous?.width)
  })

  test('v3-layout-hub-card: below 976px the diagram stands under the benefits and the button, in one column', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 })
    await openConnect(page)

    const button = await page.getByTestId('wizard-connect-button').boundingBox()
    const diagram = await page.getByTestId('wizard-hub-diagram').boundingBox()
    expect(button && diagram && button.y + button.height <= diagram.y).toBe(true)
  })
})

// The wizard is always light (D5): a dark preference (browser, `localStorage`, `/home`) changes nothing on its routes and comes back after them.
test.describe('v3 light forced', () => {
  test.use({ colorScheme: 'dark' })

  test.beforeEach(async ({ page, wizard }) => {
    wizard.darkMode = true
    await page.addInitScript(() => {
      localStorage.setItem('isDarkMode', 'true')
      localStorage.setItem('theme', 'dark')
    })
  })

  test('v3-light-forced: v-app, the wizard and the tooltip of the lock are light, the shot equals the light one, dark comes back after the wizard', async ({ page, wizard }) => {
    await openConnect(page)

    await expect(page.locator('.v-application').first()).toHaveClass(/v-theme--light/)
    await expect(page.locator('.v-application').first()).not.toHaveClass(/v-theme--dark/)
    await expect(page.getByTestId('wizard-sidebar')).toBeVisible()
    expect(await page.evaluate(() => document.querySelector('[data-testid="wizard-sidebar"]')?.closest('.v-theme--light') !== null)).toBe(true)
    await expect(page.locator('body')).toHaveClass(/is-light/)
    // The same shot as the light variant of `v3-connect-default`.
    await expect(page).toHaveScreenshot('v3-connect-default.png', SNAPSHOT)

    // Summary of a signed-in admin: the tooltip of the closed step 1 is light too.
    await signIn(page, wizard)
    await openSummary(page, 'Admin email')
    await page.keyboard.press('Shift')
    await page.getByTestId('wizard-step-panelalpha-connect').focus()
    const tip = page.locator('.v-overlay--active').filter({ hasText: 'so this step is closed' })
    await expect(tip).toBeVisible()
    expect(await tip.evaluate(node => node.closest('.v-theme--light') !== null)).toBe(true)
    expect(await tip.evaluate(node => node.closest('.v-theme--dark') === null)).toBe(true)

    // Leaving the wizard: the preference of the user is back. The list of projects the shell opens is not what this test measures.
    await page.route(/\/api\/(labels|projects)/, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) }))
    await page.getByRole('button', { name: 'Create your first project' }).click()
    await expect(page).not.toHaveURL(/\/wizard/)
    await expect(page.locator('.v-application').first()).toHaveClass(/v-theme--dark/)
    await expect(page.locator('body')).toHaveClass(/is-dark/)
  })
})

// wizard-v3 (S-136): states of the mock-up B2 rebuild. Every test has the `v3-` prefix (plan, "Konwencja e2e"), so `--grep v3-` never
// matches the tests of S-135.
test.describe('v3 start page', () => {
  test('v3-start-default: the start page in the look of admin area', async ({ page }) => {
    await openScreen(page, 'start')

    await expect(page).toHaveScreenshot('v3-start-default.png', SNAPSHOT)
  })
})

// Step 1 of v3 (PanelAlpha Connect): the default state of a guest, the start of the pairing and the link to the local form.
test.describe('v3 connect', () => {
  test('v3-connect-default: the card "Connect with Hub" with the diagram, and the local link', async ({ page }) => {
    await openConnect(page)

    await expect(page.getByTestId('wizard-hub-card')).toBeVisible()
    await expect(page.getByTestId('wizard-hub-diagram')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Create a local account instead' })).toBeVisible()
    await expect(page).toHaveScreenshot('v3-connect-default.png', SNAPSHOT)
  })

  test('v3-connect-start: "Connect with Hub" sends the origin and the server name, then leaves for the Hub link', async ({ page, wizard }) => {
    wizard.hubStartLink = 'http://localhost/hub-stub'
    await page.route('**/hub-stub', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>hub</title>' }))
    await openConnect(page)
    const origin = new URL(page.url()).origin

    await page.getByRole('button', { name: 'Connect with Hub' }).click()

    await expect(page).toHaveURL(/\/hub-stub$/)
    expect(wizard.posts).toEqual([{ path: '/community/hub/start', body: { admin_url: origin, server_name: 'My server' } }])
  })

  test('v3-connect-local-link: the link opens the local form and starts nothing', async ({ page, wizard }) => {
    await openConnect(page)
    await page.getByRole('link', { name: 'Create a local account instead' }).click()

    await expect(page).toHaveURL(/\/wizard\/general-config$/)
    expect(wizard.posts).toEqual([])
  })

  test('v3-connect-no-shell-footer: the footer of the signed-in shell is not on the page', async ({ page }) => {
    await openConnect(page)

    await expect(page.locator('footer')).toHaveCount(0)
  })
})

// Step 1 of v3, the states after the default one: the return from the Hub, the failures, hover and focus.
const RETURN_PATH = `${CONNECT_PATH}?state=s1&result=r1`

test.describe('v3 connect states', () => {
  test('v3-connect-completing: the return is being confirmed, the card is locked with a loader', async ({ page }) => {
    const release = await holdRoute(page, '**/api/free/hub/complete')
    await openConnect(page, RETURN_PATH)

    await expect(page.getByTestId('wizard-hub-skeleton')).toBeVisible()
    // The address bar is clean while the call is open.
    await expect(page).toHaveURL(/\/wizard\/panelalpha-connect$/)
    await expect(page.getByTestId('wizard-connect-button')).toBeDisabled()
    await expect(page).toHaveScreenshot('v3-connect-completing.png', { ...SNAPSHOT, mask: [page.getByTestId('wizard-hub-skeleton'), page.getByTestId('wizard-connect-button')] })
    release()
    await expect(page).toHaveURL(/\/wizard\/general-config$/)
  })

  test('v3-connect-approved: an approved return signs the guest in and ends on step 2', async ({ page, wizard }) => {
    wizard.hubComplete = { status: 'connected' }
    await page.goto(`${CONNECT_PATH}?state=s1&result=approved`)

    await expect(page).toHaveURL(/\/wizard\/general-config$/)
    await expect(page.getByTestId('wizard-step-title')).toBeVisible()
    expect(wizard.posts).toEqual([{ path: '/community/hub/complete', body: { state: 's1', result: 'approved' } }])
    // The session is the new admin: the shell is signed in (no redirect to /login or to the start page).
    expect(wizard.signedIn).toBe(true)
    await expect(page).toHaveURL(/\/wizard\/general-config$/)
  })

  test('v3-connect-error: a denied return shows the alert with "Try again" above the card', async ({ page, wizard }) => {
    wizard.hubComplete = { status: 'denied' }
    await openConnect(page, RETURN_PATH)

    await expect(page.getByTestId('wizard-connect-error')).toHaveText('Not connected. The request was denied on PanelAlpha.')
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
    await expect(page.getByTestId('wizard-hub-card')).toBeVisible()
    await page.mouse.move(0, 0)
    await expect(page).toHaveScreenshot('v3-connect-error.png', SNAPSHOT)
  })

  test('v3-connect-unsupported: no email from the Hub offers the local account, which opens the form', async ({ page, wizard }) => {
    wizard.hubComplete = { status: 'unsupported' }
    await openConnect(page, RETURN_PATH)

    await expect(page.getByTestId('wizard-connect-error')).toContainText('did not share an email address')
    await page.mouse.move(0, 0)
    await expect(page).toHaveScreenshot('v3-connect-unsupported.png', SNAPSHOT)

    await page.getByTestId('wizard-connect-use-local').click()
    await expect(page).toHaveURL(/\/wizard\/general-config$/)
  })

  test('v3-connect-hover: the card button turns darker', async ({ page }) => {
    await openConnect(page)
    await disableTransitions(page)
    // The clip of the hover shot does not take `stylePath`: the GIF is hidden by a style tag, as in the other shots.
    await page.addStyleTag({ path: fileURLToPath(new URL('support/wizard-hub-diagram.css', import.meta.url)) })
    await page.getByTestId('wizard-connect-button').hover()

    await expectHoverShot(page, page.getByTestId('wizard-hub-card'), 'v3-connect-hover.png')
  })

  test('v3-connect-focus: Tab reaches the card button and then the local link with a visible ring', async ({ page }) => {
    await openConnect(page)
    await disableTransitions(page)
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    // The sidebar steps come first in the order; walk on until the card button is focused.
    for (let i = 0; i < 6 && !(await page.getByTestId('wizard-connect-button').evaluate(node => node === document.activeElement)); i++) {
      await page.keyboard.press('Tab')
    }
    await expect(page.getByTestId('wizard-connect-button')).toBeFocused()
    // The focus of the legacy buttons is the overlay of the button (`legacy/_buttons.scss`), not an outline.
    await expect(page.getByTestId('wizard-connect-button').locator('.v-btn__overlay')).not.toHaveCSS('opacity', '0')
    await expectHoverShot(page, page.getByTestId('wizard-hub-card'), 'v3-connect-focus.png')

    await page.keyboard.press('Tab')
    await expect(page.getByTestId('wizard-connect-local')).toBeFocused()
    await expectHoverShot(page, page.locator('.connect-quiet'), 'v3-connect-focus-link.png')
  })
})

// Step 2 of v3 in the `hub` mode (wizard-v3, phase 5): the name of the server after a Hub return. The admin Hub created has a generated password.
const HUB_NAME_PATH = '/wizard/general-config'

/** A signed-in admin of a Hub return: the account exists with a generated password, Hub is paired. */
async function hubReturned (page: Page, wizard: { setupRequired: boolean, signedIn: boolean, passwordGenerated: boolean, userEmail: string, hub: { paired: boolean, accountName: string | null } }): Promise<void> {
  wizard.setupRequired = false
  wizard.signedIn = true
  await markWizardFlow(page)
  wizard.passwordGenerated = true
  wizard.userEmail = 'alex@example.com'
  wizard.hub = { paired: true, accountName: 'Alex' }
}

async function waitForHubName (page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Name your server' })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  // As `openScreen`: the logo and the illustration are pictures, the shot waits until every one is loaded (impl-review F2).
  await page.waitForFunction(() => Array.from(document.images).every(image => image.complete))
  await page.mouse.move(0, 0)
}

async function openHubName (page: Page): Promise<void> {
  await page.goto(HUB_NAME_PATH)
  await waitForHubName(page)
}

test.describe('v3 general hub', () => {
  test('v3-general-hub-default: the frame of the account, the name of the server and Continue', async ({ page, wizard }) => {
    await hubReturned(page, wizard)
    await openHubName(page)

    await expect(page.getByText('Signed in as alex@example.com')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Use another account' })).toHaveAttribute('href', 'https://hub.example.test/account')
    await expect(page.getByRole('link', { name: 'Use another account' })).toHaveAttribute('target', '_blank')
    await expect(page.getByRole('textbox', { name: 'Server name' })).toHaveValue('My server')
    await expect(page).toHaveScreenshot('v3-general-hub-default.png', SNAPSHOT)
  })

  test('v3-general-hub-loading: the field and Continue are locked while the name is read', async ({ page, wizard }) => {
    await hubReturned(page, wizard)
    await holdRoute(page, '**/api/free/settings')
    await page.goto(HUB_NAME_PATH)
    await waitForHubName(page)

    await expect(page.getByRole('textbox', { name: 'Server name' })).toBeDisabled()
    await expect(page.getByTestId('wizard-next')).toBeDisabled()
    await expect(page).toHaveScreenshot('v3-general-hub-loading.png', SNAPSHOT)
  })

  test('v3-general-hub-error: a failed read shows the alert and keeps Continue locked', async ({ page, wizard }) => {
    await hubReturned(page, wizard)
    wizard.failSettingsGet = { status: 500, body: { message: 'The settings could not be read.' } }
    await openHubName(page)

    await expect(page.getByTestId('wizard-hub-load-error')).toHaveText('The settings could not be read.')
    await expect(page.getByTestId('wizard-next')).toBeDisabled()
    await expect(page).toHaveScreenshot('v3-general-hub-error.png', SNAPSHOT)
  })

  test('v3-general-hub-saving: Continue shows the loader while the name is saved', async ({ page, wizard }) => {
    await hubReturned(page, wizard)
    await openHubName(page)
    // Never released: the test ends with the call open, the page is closed with it.
    await holdRoute(page, '**/api/free/settings')
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByTestId('wizard-next')).toHaveClass(/v-btn--loading/)
    await page.mouse.move(0, 0)
    await expect(page).toHaveScreenshot('v3-general-hub-saving.png', SNAPSHOT)
  })

  test('v3-general-hub-validation: a 422 of the name shows under the field', async ({ page, wizard }) => {
    await hubReturned(page, wizard)
    wizard.failSettingsPut = { status: 422, body: { message: 'The given data was invalid.', errors: { name: ['The name may not be greater than 60 characters.'] } } }
    await openHubName(page)
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByText('The name may not be greater than 60 characters.')).toBeVisible()
    await expect(page).toHaveURL(/\/wizard\/general-config$/)
    await page.mouse.move(0, 0)
    await expect(page).toHaveScreenshot('v3-general-hub-validation.png', SNAPSHOT)
  })

  test('v3-general-hub-save: Continue sends the typed name with the defaults of the panel and opens step 3', async ({ page, wizard }) => {
    await hubReturned(page, wizard)
    wizard.settings = { name: 'My server', default_language: 'pl', default_date_format: 'YYYY-MM-DD' }
    await openHubName(page)
    await page.getByRole('textbox', { name: 'Server name' }).fill('Acme server')
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page).toHaveURL(/\/wizard\/connect-ai$/)
    expect(wizard.puts).toEqual([{ path: '/community/settings', body: { name: 'Acme server', default_language: 'pl', default_date_format: 'YYYY-MM-DD' } }])
  })

  test('v3-general-hub-return: the return from Hub lands on step 2 with the name filled and the Hub link', async ({ page, wizard }) => {
    wizard.hubComplete = { status: 'connected' }
    await page.goto(`${CONNECT_PATH}?state=s1&result=approved`)

    await expect(page).toHaveURL(/\/wizard\/general-config$/)
    await expect(page.getByRole('heading', { name: 'Name your server' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Server name' })).toHaveValue('My server')
    await expect(page.getByRole('link', { name: 'Use another account' })).toHaveAttribute('href', 'https://hub.example.test/account')
  })
})

// Step 3 of v3 (Connect AI): no token yet (Create token + Skip), an active token (connected), the modal of the token, hover and focus.
// Run: `E2E_PORT=4188 npx playwright test e2e/admin-wizard.visual.spec.ts -g v3-ai`.
async function openAi (page: Page): Promise<void> {
  await page.goto(AI_PATH)
  await expect(page.getByRole('heading', { name: 'Connect your AI assistant' })).toBeVisible()
  // The button is busy while the tokens are read (`aria-busy` of the loading `v-btn`); the state is settled once it is not.
  await expect(page.getByTestId('wizard-ai-create')).not.toHaveAttribute('aria-busy', 'true')
  await page.evaluate(() => document.fonts.ready)
  await page.mouse.move(0, 0)
}

/** Creates a token in the modal of step 3: name, "Create", the confirmation of the saved token, "Continue" (the modal closes). */
async function createTokenInModal (page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Create token' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('e.g. Claude on my laptop').fill(name)
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await dialog.getByLabel('I have saved my token in a safe place').check()
  await dialog.getByRole('button', { name: 'Continue' }).click()
  await expect(dialog).toBeHidden()
}

test.describe('v3 ai', () => {
  test('v3-ai-default: no token yet, the card with "Create token", the MCP address, the guide, the "later" note and "Skip for now"', async ({ page, wizard }) => {
    await signIn(page, wizard)
    await openAi(page)

    await expect(page.getByRole('button', { name: 'Create token' })).toBeVisible()
    await expect(page.getByTestId('wizard-ai-address')).toContainText('/mcp')
    await expect(page.getByRole('link', { name: 'Documentation' })).toHaveAttribute('href', 'https://www.panelalpha.com/documentation/single-server/connect-ai')
    await expect(page.getByText('You can connect your AI assistant later in Connect AI.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible()
    await expect(page.getByTestId('wizard-next')).toHaveCount(0)
    await expect(page).toHaveScreenshot('v3-ai-default.png', SNAPSHOT)
  })

  test('v3-ai-connected: an active token shows the confirmation, "Create another token" and Continue', async ({ page, wizard }) => {
    await signIn(page, wizard)
    wizard.mcpTokens = [{ id: 1, name: 'Claude', last_used_at: null, revoked_at: null, created_at: '2026-11-01T10:00:00.000000Z' }]
    await openAi(page)

    await expect(page.getByTestId('wizard-ai-connected')).toHaveText('AI is connected to this panel.')
    await expect(page.getByRole('button', { name: 'Create another token' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip for now' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
    await expect(page.getByText('You can connect your AI assistant later in Connect AI.')).toHaveCount(0)
    await expect(page).toHaveScreenshot('v3-ai-connected.png', SNAPSHOT)
  })

  test('v3-ai-create-hover: "Create token" turns darker', async ({ page, wizard }) => {
    await signIn(page, wizard)
    await openAi(page)
    await disableTransitions(page)
    await page.getByRole('button', { name: 'Create token' }).hover()

    await expectHoverShot(page, page.getByTestId('wizard-ai-status'), 'v3-ai-create-hover.png')
  })

  test('v3-ai-create-focus: "Create token" has a visible ring', async ({ page, wizard }) => {
    await signIn(page, wizard)
    await openAi(page)
    await disableTransitions(page)
    await page.keyboard.press('Shift')
    await page.getByRole('button', { name: 'Create token' }).focus()
    await expect(page.getByRole('button', { name: 'Create token' })).toBeFocused()

    await expectHoverShot(page, page.getByTestId('wizard-ai-status'), 'v3-ai-create-focus.png')
  })

  test('v3-ai-skip: "Skip for now" opens Summary, the AI row says Not connected, no token is sent', async ({ page, wizard }) => {
    await signIn(page, wizard)
    await openAi(page)
    await disableTransitions(page)
    await page.keyboard.press('Shift')
    await page.getByRole('button', { name: 'Skip for now' }).focus()
    await expectHoverShot(page, page.getByTestId('wizard-footer'), 'v3-ai-skip.png')

    await page.getByRole('button', { name: 'Skip for now' }).click()
    await expect(page).toHaveURL(/\/wizard\/summary$/)
    await expect(page.getByTestId('wizard-summary-ai-status').getByRole('definition')).toHaveText('Not connected')
    expect(wizard.mcpPosts).toEqual([])
  })

  test('v3-ai-token: the modal creates a token, the step turns connected, Continue opens Summary with AI Connected', async ({ page, wizard }) => {
    await signIn(page, wizard)
    await openAi(page)
    await createTokenInModal(page, 'Claude on my laptop')

    expect(wizard.mcpPosts).toEqual([{ name: 'Claude on my laptop' }])
    await expect(page.getByTestId('wizard-ai-connected')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create another token' })).toBeVisible()
    await page.mouse.move(0, 0)
    await expect(page).toHaveScreenshot('v3-ai-token.png', SNAPSHOT)

    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page).toHaveURL(/\/wizard\/summary$/)
    await expect(page.getByTestId('wizard-summary-ai-status').getByRole('definition')).toHaveText('Connected')
  })
})

// Step 3 (Summary) in the look of admin area: the facts and the PanelAlpha Hub list after a Hub sign-in, the facts alone after a local
// account, the failed and the running finish, hover and focus of "Create your first project", no way back, and the closed step 1 in the sidebar.
// Run: `E2E_PORT=4194 npx playwright test e2e/admin-wizard.visual.spec.ts --grep v3-summary`.
test.describe('v3 summary', () => {
  test('v3-summary-connected: after a Hub sign-in, the Hub account and the four lines of PanelAlpha Hub', async ({ page, wizard }) => {
    await signIn(page, wizard)
    wizard.hub = { paired: true, accountName: 'Ann Ann' }
    await openSummary(page, 'Hub account')

    await expect(page.getByTestId('wizard-summary-connect-head')).toHaveText('Included with PanelAlpha Hub')
    await expect(page.getByTestId('wizard-summary-connect-line')).toHaveCount(4)
    await expect(page.getByTestId('wizard-summary-server')).toHaveText('Server nameMy server')
    await expect(page.getByTestId('wizard-summary-hub-status').getByRole('definition')).toHaveText('Connected')
    await expect(page.getByTestId('wizard-summary-ai-status').getByRole('definition')).toHaveText('Not connected')
    await expect(page).toHaveScreenshot('v3-summary-connected.png', SNAPSHOT)
  })

  test('v3-summary-missing: after a local account, the admin rows and no Hub list nor any Hub action', async ({ page, wizard }) => {
    await signIn(page, wizard)
    await openSummary(page, 'Admin email')

    await expect(page.getByTestId('wizard-summary-account')).toHaveText('Admin emailjane@example.com')
    await expect(page.getByTestId('wizard-summary-hub-status').getByRole('definition')).toHaveText('Not connected')
    await expect(page.getByTestId('wizard-summary-hub-later')).toContainText('You can connect PanelAlpha Hub later in Settings.')
    await expect(page.getByTestId('wizard-summary-connect-head')).toHaveCount(0)
    await expect(page.getByTestId('wizard-summary-connect-line')).toHaveCount(0)
    await expect(page.getByTestId('wizard-summary-box').getByRole('button', { name: /connect/i })).toHaveCount(0)
    await expect(page).toHaveScreenshot('v3-summary-missing.png', SNAPSHOT)
  })

  test('v3-summary-status-hidden: when both status calls fail, the Hub and AI rows are not shown', async ({ page, wizard }) => {
    await signIn(page, wizard)
    wizard.failHubStatus = true
    wizard.failMcpTokens = true
    await openSummary(page, 'Admin email')

    await expect(page.getByTestId('wizard-summary-hub-status')).toHaveCount(0)
    await expect(page.getByTestId('wizard-summary-ai-status')).toHaveCount(0)
    await expect(page.getByTestId('wizard-summary-hub-later')).toHaveCount(0)
    await expect(page).toHaveScreenshot('v3-summary-status-hidden.png', SNAPSHOT)
  })

  test('v3-summary-ai-connected: an active token makes the AI row Connected', async ({ page, wizard }) => {
    await signIn(page, wizard)
    wizard.mcpTokens = [{ id: 1, name: 'Claude', last_used_at: null, revoked_at: null, created_at: '2026-11-01T10:00:00.000000Z' }]
    await openSummary(page, 'Admin email')

    await expect(page.getByTestId('wizard-summary-ai-status').getByRole('definition')).toHaveText('Connected')
  })

  test('v3-summary-error: a failed /home shows the message above the buttons', async ({ page, wizard }) => {
    await signIn(page, wizard)
    await openSummary(page, 'Admin email')
    // The route added last answers first: the shell has loaded, so only the call of the finish fails.
    await page.route('**/api/home', route => route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'The server could not read the home data.' }),
    }))

    await page.getByRole('button', { name: 'Create your first project' }).click()

    await expect(page.getByRole('alert')).toHaveText('The server could not read the home data.')
    await expect(page).toHaveURL(/\/wizard\/summary$/)
    await page.mouse.move(0, 0)
    await expect(page).toHaveScreenshot('v3-summary-error.png', SNAPSHOT)
  })

  test('v3-summary-loading: the button shows the loader while /home is read', async ({ page, wizard }) => {
    await signIn(page, wizard)
    await openSummary(page, 'Admin email')
    // Never released: the test ends with the call open, the page is closed with it.
    await holdRoute(page, '**/api/home')

    await page.getByRole('button', { name: 'Create your first project' }).click()

    await expect(page.getByTestId('wizard-next')).toHaveClass(/v-btn--loading/)
    await page.mouse.move(0, 0)
    await expect(page).toHaveScreenshot('v3-summary-loading.png', SNAPSHOT)
  })

  test('v3-summary-create-hover: "Create your first project" turns darker', async ({ page, wizard }) => {
    await signIn(page, wizard)
    await openSummary(page, 'Admin email')
    await disableTransitions(page)
    await page.getByTestId('wizard-next').hover()

    await expectHoverShot(page, page.getByTestId('wizard-footer'), 'v3-summary-create-hover.png')
  })

  test('v3-summary-create-focus: "Create your first project" has a visible ring', async ({ page, wizard }) => {
    await signIn(page, wizard)
    await openSummary(page, 'Admin email')
    await disableTransitions(page)
    await page.keyboard.press('Shift')
    await page.getByTestId('wizard-next').focus()
    await expect(page.getByTestId('wizard-next')).toBeFocused()

    await expectHoverShot(page, page.getByTestId('wizard-footer'), 'v3-summary-create-focus.png')
  })

  test('v3-summary-previous: no way back, the setup is saved and only "Create your first project" is left', async ({ page, wizard }) => {
    await signIn(page, wizard)
    await openSummary(page, 'Admin email')

    await expect(page.getByTestId('wizard-previous')).toHaveCount(0)
    await expect(page.getByTestId('wizard-footer').getByRole('button')).toHaveText(['Create your first project'])
  })

  test('v3-finish-onboarding: "Create your first project" leaves for /projects and opens the choice of the installation type', async ({ page, wizard }) => {
    await signIn(page, wizard)
    await openSummary(page, 'Admin email')
    await page.getByRole('button', { name: 'Create your first project' }).click()

    await expect(page).toHaveURL(/\/projects$/)
    // One dialog, on the first step of the onboarding: the choice of the installation type (impl-review F7).
    await expect(page.getByRole('dialog')).toHaveCount(1)
    await expect(page.getByRole('dialog').getByRole('heading', { name: /^Choose how to create your/ })).toBeVisible()
    await expect(page.getByRole('dialog').getByText('WordPress', { exact: true })).toBeVisible()
  })
})

// Once the account exists step 1 is closed in the sidebar: the click opens nothing and the tooltip says why.
test.describe('v3 sidebar', () => {
  test('v3-sidebar-locked: step 1 stays closed after the account exists, with the reason in a tooltip', async ({ page, wizard }) => {
    await signIn(page, wizard)
    await openSummary(page, 'Admin email')

    const first = page.getByTestId('wizard-step-panelalpha-connect')
    await expect(first).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByTestId('wizard-step-general-config')).toHaveAttribute('aria-disabled', 'false')
    await expect(page.getByTestId('wizard-step-summary')).toHaveAttribute('aria-disabled', 'false')

    // A screen reader gets the reason with the button: `aria-describedby` points at the hidden text.
    const hintId = await first.getAttribute('aria-describedby')
    expect(hintId).not.toBeNull()
    await expect(page.locator(`[id="${hintId}"]`)).toContainText('so this step is closed')

    await first.click({ force: true })
    await expect(page).toHaveURL(/\/wizard\/summary$/)
    await expect(page.getByText('so this step is closed').filter({ visible: true })).toHaveCount(1)
  })

  test('v3-sidebar-locked-keyboard: the reason shows on keyboard focus too, and Enter opens nothing', async ({ page, wizard }) => {
    await signIn(page, wizard)
    await openSummary(page, 'Admin email')

    await page.keyboard.press('Shift')
    await page.getByTestId('wizard-step-panelalpha-connect').focus()
    await expect(page.getByText('so this step is closed').filter({ visible: true })).toHaveCount(1)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/wizard\/summary$/)
  })

  test('v3-sidebar-guest: a guest on step 1 can still open it, the later steps stay closed', async ({ page }) => {
    await openConnect(page)

    await expect(page.getByTestId('wizard-step-panelalpha-connect')).toHaveAttribute('aria-disabled', 'false')
    await expect(page.getByTestId('wizard-step-general-config')).toHaveAttribute('aria-disabled', 'true')
  })
})

// Whole runs from the start page to Summary (wizard-v3, phase 9): no snapshots, the URL, the titles of the steps and the calls to the API.
test.describe('v3 flow', () => {
  test('v3-flow-hub: the start page, Connect with Hub, the return from Hub, the name of the server and Summary', async ({ page, wizard }) => {
    wizard.hubStartLink = 'http://localhost/hub-stub'
    await page.route('**/hub-stub', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>hub</title>' }))

    await page.goto('/wizard')
    await page.getByTestId('wizard-start-button').click()
    await expect(page).toHaveURL(/\/wizard\/panelalpha-connect$/)
    const origin = new URL(page.url()).origin

    await page.getByRole('button', { name: 'Connect with Hub' }).click()
    await expect(page).toHaveURL(/\/hub-stub$/)
    expect(wizard.posts).toEqual([{ path: '/community/hub/start', body: { admin_url: origin, server_name: 'My server' } }])

    // The Hub sends the browser back to the panel; the route of the app turns it into the step that completes the pairing.
    await page.goto('/hub-connected?state=s1&result=approved')
    await expect(page).toHaveURL(/\/wizard\/general-config$/)
    await expect(page.getByRole('heading', { name: 'Name your server' })).toBeVisible()
    expect(wizard.posts.at(-1)).toEqual({ path: '/community/hub/complete', body: { state: 's1', result: 'approved' } })

    await page.getByRole('textbox', { name: 'Server name' }).fill('Flow server')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page).toHaveURL(/\/wizard\/connect-ai$/)
    expect(wizard.puts).toEqual([{ path: '/community/settings', body: expect.objectContaining({ name: 'Flow server' }) }])

    // Step 3: a token is created in the modal, then Continue.
    await createTokenInModal(page, 'Flow token')
    expect(wizard.mcpPosts).toEqual([{ name: 'Flow token' }])
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page).toHaveURL(/\/wizard\/summary$/)

    await expect(page.getByRole('heading', { name: 'You\'re all set.' })).toBeVisible()
    await expect(page.getByTestId('wizard-summary-ai-status').getByRole('definition')).toHaveText('Connected')
    await expect(page.getByTestId('wizard-summary-account')).toHaveText('Hub accountjane@example.com')
    await expect(page.getByTestId('wizard-summary-server')).toHaveText('Server nameFlow server')
    await expect(page.getByTestId('wizard-summary-connect-head')).toHaveText('Included with PanelAlpha Hub')
    await expect(page.getByRole('button', { name: 'Create your first project' })).toBeVisible()
  })

  test('v3-flow-local: the start page, the local account, the form and Summary without PanelAlpha Hub', async ({ page, wizard }) => {
    await page.goto('/wizard')
    await page.getByTestId('wizard-start-button').click()
    await expect(page).toHaveURL(/\/wizard\/panelalpha-connect$/)

    await page.getByRole('link', { name: 'Create a local account instead' }).click()
    await expect(page).toHaveURL(/\/wizard\/general-config$/)
    await expect(page.getByRole('heading', { name: 'Name your server' })).toBeVisible()

    await fillAccount(page)
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page).toHaveURL(/\/wizard\/connect-ai$/)
    expect(wizard.posts).toEqual([{ path: '/community/setup', body: expect.objectContaining({ email: 'ada@example.com' }) }])
    expect(wizard.puts).toEqual([])

    await page.getByRole('button', { name: 'Skip for now' }).click()
    await expect(page).toHaveURL(/\/wizard\/summary$/)
    await expect(page.getByTestId('wizard-summary-ai-status').getByRole('definition')).toHaveText('Not connected')

    await expect(page.getByRole('heading', { name: 'You\'re all set.' })).toBeVisible()
    await expect(page.getByTestId('wizard-summary-account')).toHaveText('Admin emailada@example.com')
    await expect(page.getByTestId('wizard-summary-connect-head')).toHaveCount(0)
    await expect(page.getByTestId('wizard-summary-box').getByRole('button', { name: /connect/i })).toHaveCount(0)
  })
})

// The wizard belongs to the first run only: a signed-in admin whose browser is not finishing the setup (a bookmark, a hand-typed address)
// gets the panel, not the steps. The flow specs above prove the other side, where the account step and the Hub return stay open.
test.describe('v3 after the setup', () => {
  test('v3-closed-later: /wizard/* and /hub-connected lead a signed-in admin to the projects', async ({ page, wizard }) => {
    wizard.setupRequired = false
    wizard.signedIn = true
    await page.route(/\/api\/(labels|projects)/, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], meta: { total: 0 } }),
    }))

    for (const path of ['/wizard/general-config', '/wizard/summary', '/wizard/panelalpha-connect', '/hub-connected', '/setup']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/projects$/)
      await expect(page.getByTestId('wizard-root')).toHaveCount(0)
    }
  })
})
