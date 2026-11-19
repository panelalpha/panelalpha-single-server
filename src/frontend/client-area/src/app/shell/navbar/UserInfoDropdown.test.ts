import type * as ShellApi from '@/app/shell/shell.api'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { putUserDarkMode } from '@/app/shell/shell.api'
import { useSessionStore } from '@/shared/session/session.store'
import { useThemeStore } from '@/shared/theme/theme.store'
import { mountKit } from '@/test/mount-kit'
import { normalizeHtml } from '@/test/normalize-html'
import UserInfoDropdown from './UserInfoDropdown.vue'

vi.mock('@/app/shell/shell.api', async importOriginal => ({
  ...await importOriginal<typeof ShellApi>(),
  putUserDarkMode: vi.fn(),
}))

async function openMenu (app: Record<string, unknown>, user: Record<string, unknown> = {}) {
  setActivePinia(createPinia())
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  await router.push('/')
  useSessionStore().hydrateHome({ app, user: { email: 'a@b.c', services: [], ...user } } as never)
  const wrapper = await mountKit(UserInfoDropdown, { global: { plugins: [router] }, attachTo: document.body })
  await wrapper.get('[data-testid="shell-user-activator"]').trigger('click')
  await nextTick()
  await nextTick()
  const menu = document.body.querySelector('[data-testid="shell-user-menu"]')
  return { wrapper, menu }
}

function titles (menu: Element | null) {
  return [...(menu?.querySelectorAll('.v-list-item-title') ?? [])].map(el => el.textContent?.trim())
}

beforeEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
  vi.mocked(putUserDarkMode).mockReset()
  vi.mocked(putUserDarkMode).mockResolvedValue()
})

describe('UserInfoDropdown Tasks item', () => {
  it('sits after My Account and before Settings and My Plans on the Community panel (LITE `UserInfoDropdown.vue:93-123`)', async () => {
    const { menu } = await openMenu({ community_panel: true, billing_enabled: true })
    const items = titles(menu)
    const tasks = items.indexOf('general.tasks')
    expect(tasks).toBe(items.indexOf('button.account.details') + 1)
    expect(items.indexOf('general.settings')).toBe(tasks + 1)
    expect(items.indexOf('general.myPlans')).toBe(tasks + 2)
    expect(menu?.querySelector('a[href="/tasks"]')).not.toBeNull()
  })

  it('is absent without the Free flag', async () => {
    const { menu } = await openMenu({ billing_enabled: true })
    expect(titles(menu)).not.toContain('general.tasks')
    expect(menu?.querySelector('a[href="/tasks"]')).toBeNull()
  })

  it('shows the dot only while a task is running', async () => {
    const running = await openMenu({ community_panel: true, single_server: { has_running_tasks: true } })
    const item = running.menu?.querySelector('a[href="/tasks"]')
    const visible = (el: Element | null | undefined) => el instanceof HTMLElement && el.style.display !== 'none'
    expect(visible(item?.querySelector('.user-dropdown-dot-badge .v-badge__badge'))).toBe(true)
    running.wrapper.unmount()
    document.body.innerHTML = ''

    const idle = await openMenu({ community_panel: true, single_server: { has_running_tasks: false } })
    const hidden = idle.menu?.querySelector('a[href="/tasks"] .user-dropdown-dot-badge .v-badge__badge')
    expect(visible(hidden)).toBe(false)
  })
})

describe('UserInfoDropdown My Server item (usage-redesign)', () => {
  it('is the second item, right after Account details, on single-server with hosting access', async () => {
    const { menu } = await openMenu({ single_server: { active: true } }, { has_hosting_access: true })
    const items = titles(menu)
    expect(items.indexOf('heading.navbar.tab.myServer')).toBe(items.indexOf('button.account.details') + 1)
    expect(menu?.querySelector('[data-testid="shell-user-menu-my-server"]')?.getAttribute('href')).toBe('/hosting/')
  })

  it('is absent without hosting access, and on multi-server', async () => {
    const noAccess = await openMenu({ single_server: { active: true } }, { has_hosting_access: false })
    expect(titles(noAccess.menu)).not.toContain('heading.navbar.tab.myServer')
    noAccess.wrapper.unmount()
    document.body.innerHTML = ''

    const multi = await openMenu({}, { has_hosting_access: true })
    expect(titles(multi.menu)).not.toContain('heading.navbar.tab.myServer')
    expect(multi.menu?.querySelector('[data-testid="shell-user-menu-my-server"]')).toBeNull()
  })
})

describe('UserInfoDropdown My Plans and Billing (ID-56)', () => {
  it('paid build with billing off shows My Plans and not Billing', async () => {
    const { menu } = await openMenu({ community_panel: false, billing_enabled: false })
    expect(titles(menu)).toContain('general.myPlans')
    expect(titles(menu)).not.toContain('general.myBilling')
  })

  it('Free panel with billing off shows neither', async () => {
    const { menu } = await openMenu({ community_panel: true, billing_enabled: false })
    expect(titles(menu)).not.toContain('general.myPlans')
    expect(titles(menu)).not.toContain('general.myBilling')
  })
})

// Characterization of the DOM: written on the code with a raw `v-switch` in `DarkModeSwitch`, kept after it moved to `AppSwitch`; `readonly`, `aria-hidden` and `tabindex="-1"` come from the user-menu row, which is the switch itself.
describe('UserInfoDropdown mode switch DOM', () => {
  it('keeps the DOM of the mode switch', async () => {
    const { menu } = await openMenu({ single_server: { active: true } })
    const root = menu?.querySelector('.dark-mode-switch')
    expect(root).not.toBeNull()
    expect(normalizeHtml(root!.outerHTML).replace(/ id="switch-v-\d+"/g, '')).toMatchInlineSnapshot(`"<div class="v-input v-input--horizontal v-input--center-affix v-input--density-default v-theme--light v-locale--is-ltr v-input--dirty v-input--readonly v-switch v-switch--flat v-switch--size-default dark-mode-switch v-input--switch mt-0 pt-0 text-primary dark-mode-item__switch mr-3"><div class="v-input__control"><div class="v-selection-control v-selection-control--density-default"><div class="v-selection-control__wrapper"><div class="v-switch__track"></div><div class="v-selection-control__input"><input aria-disabled="false" type="checkbox" aria-hidden="true" tabindex="-1" value="true"><div class="v-switch__thumb"><i class="v-icon notranslate v-theme--light text-gray-darken-1 dark-mode-icon--sun" style="font-size: 13px; height: 13px; width: 13px;" aria-hidden="true"><svg></svg></i><i class="v-icon notranslate v-theme--light text-primary dark-mode-icon--moon" style="font-size: 13px; height: 13px; width: 13px; display: none;" aria-hidden="true"><svg></svg></i></div></div></div></div></div></div>"`)
    expect(root!.getAttributeNames().some(name => name.startsWith('data-v-'))).toBe(true)
  })
})

// The activator shows the avatar and the chevron only: without `aria-label` its name is the badge text (a11y).
describe('UserInfoDropdown activator name', () => {
  it('names the user menu button', async () => {
    const { wrapper } = await openMenu({ single_server: { active: true } })
    expect(wrapper.get('[data-testid="shell-user-activator"]').attributes('aria-label')).toBe('button.userMenu')
  })
})

// The row is the control: one click anywhere on it (the label, the switch) and Enter/Space each toggle the mode once, and
// the switch inside only shows the state, so a screen reader meets a single switch that says what it controls.
describe('UserInfoDropdown mode row', () => {
  const row = () => document.body.querySelector('[data-testid="shell-user-menu-first-item"]')!
  const press = (el: Element, key: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))

  it('is one switch named for the setting, with its state on aria-checked', async () => {
    const { menu } = await openMenu({ single_server: { active: true } })
    const item = menu!.querySelector('[data-testid="shell-user-menu-first-item"]')!
    expect(item.getAttribute('role')).toBe('switch')
    expect(item.getAttribute('aria-checked')).toBe('false')
    expect(item.getAttribute('aria-label')).toBe('heading.styleManager.darkMode.darkMode')
    expect(item.getAttribute('tabindex')).toBe('0')

    // The switch inside is not a second control: no tab stop, hidden from assistive technology.
    const input = item.querySelector('input[type=checkbox]')!
    expect(input.getAttribute('tabindex')).toBe('-1')
    expect(input.getAttribute('aria-hidden')).toBe('true')
  })

  it('toggles the mode once from a click on its label', async () => {
    const { menu } = await openMenu({ single_server: { active: true } })
    const store = useThemeStore()
    expect(store.isDark).toBe(false)

    menu!.querySelector('[data-testid="shell-user-menu-first-item"] p')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(vi.mocked(putUserDarkMode).mock.calls).toEqual([[true]])
    expect(store.isDark).toBe(true)
    expect(row().getAttribute('aria-checked')).toBe('true')
    expect((row().querySelector('input[type=checkbox]') as HTMLInputElement).checked).toBe(true)
  })

  it('toggles the mode once from the switch the row shows', async () => {
    const { menu } = await openMenu({ single_server: { active: true } })
    // In the browser the switch is not a hit target (`pointer-events: none`), so its click lands on the row.
    menu!.querySelector<HTMLInputElement>('[data-testid="shell-user-menu-first-item"] input[type=checkbox]')!.click()
    await nextTick()
    expect(vi.mocked(putUserDarkMode).mock.calls).toEqual([[true]])
  })

  it('toggles the mode once from Enter and once from Space', async () => {
    await openMenu({ single_server: { active: true } })
    const store = useThemeStore()

    press(row(), 'Enter')
    await nextTick()
    expect(vi.mocked(putUserDarkMode).mock.calls).toEqual([[true]])
    expect(store.isDark).toBe(true)

    press(row(), ' ')
    await nextTick()
    expect(vi.mocked(putUserDarkMode).mock.calls).toEqual([[true], [false]])
    expect(store.isDark).toBe(false)
  })

  it('names the setting in both modes, so the wording never repeats the switch state', async () => {
    await openMenu({ single_server: { active: true } })
    const text = () => row().querySelector('.v-list-item-title')!.textContent?.trim()
    expect(text()).toBe('heading.styleManager.darkMode.darkMode')

    row().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(text()).toBe('heading.styleManager.darkMode.darkMode')
    expect(row().getAttribute('aria-checked')).toBe('true')
  })
})
