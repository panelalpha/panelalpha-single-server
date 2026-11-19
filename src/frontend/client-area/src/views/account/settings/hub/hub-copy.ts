// The texts of the PanelAlpha Hub section that two components share (ui-fix-v2). The keys are `settings.panelalphaHub.*` of the front; the
// backend does not have them yet, so each has a `defaultValue` (the mock-up of the change). Every text says "PanelAlpha Hub".

/** 409 of `POST /community/hub/disconnect` and the modal of a panel with no password of its own. */
export const DISCONNECT_SET_PASSWORD_DEFAULT = 'PanelAlpha Hub is the only way to sign in to this panel. Set a password in My account first, then disconnect.'

export const DISCONNECT_WARNING_DEFAULT = 'Disconnecting removes this server from your PanelAlpha Hub account and turns off "Sign in with PanelAlpha Hub" until you connect again.'

/** The lead of the connected card; `{{account}}` is the name of the Hub account. */
export const CONNECTED_ACCOUNT_DEFAULT = 'Linked to the account {{account}}.'

/**
 * The toasts of a `POST /community/hub/complete` answer, by the key `toastKeyOf` gives (`@/entities/hub/hub-connection`): `denied` and
 * `pending` say "PanelAlpha Hub"; `expired` keeps the old key, its text names no product. The pending note of the card reuses the pending text.
 */
export const HUB_TOAST_DEFAULTS: Readonly<Record<string, string>> = {
  'settings.panelalphaHub.toast.denied': 'Not connected. The request was denied on PanelAlpha Hub.',
  'settings.panelalphaHub.toast.pending': 'PanelAlpha Hub has not confirmed the connection yet. Check again in a moment.',
  'settings.hub.expired': 'The link expired. Start again.',
}

/** `POST /community/hub/start` gave no http(s) link to follow (the wizard checks the same, `connect-step.ts`). */
export const UNREACHABLE_DEFAULT = 'PanelAlpha Hub could not be reached. Try again in a moment.'
