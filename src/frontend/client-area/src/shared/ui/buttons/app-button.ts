// Mapping of the `AppButton` `kind` to `v-btn` props. One place for the literals the kit presets used to repeat in their templates.
// Values keep the type they had in those templates (`elevation` and `height` are strings), and a key is never set to `undefined`,
// so a `kind` never overrides a `v-btn` default by accident.

export type AppButtonKind = 'default' | 'close' | 'icon' | 'icon-labeled' | 'page-add' | 'row-action' | 'icon-toggle' | 'toolbar' | 'primary' | 'cancel' | 'setting-action' | 'danger' | 'field' | 'secondary' | 'link' | 'text' | 'surface'

export interface AppButtonBindings {
  icon?: boolean
  size?: string
  variant?: 'text' | 'flat' | 'outlined' | 'elevated'
  color?: string
  elevation?: string
  height?: string
  class?: string
}

export interface AppButtonOptions {
  // Only `icon-labeled`: a filled (flat) button instead of the text one (`BaseIconButton` `filled`).
  filled?: boolean
  // `icon-toggle`: the active view of a switch (outlined, primary) instead of the text one (`ListGridSwitch`).
  // `toolbar`: the pressed button (primary colour).
  active?: boolean
}

// Props of the `v-tooltip` that `AppButton` renders inside the button (`tooltip` prop). The literals every row tooltip repeated by hand;
// `offset` and `contentClass` are set only when given, so a missing one keeps the V4 default, as a tooltip without `:offset` did.
export interface AppButtonTooltipBindings {
  location: 'bottom'
  openDelay: string
  transition: string
  zIndex: number
  offset?: number
  contentClass?: string
}

export function appButtonTooltip (options: { offset?: number, contentClass?: string } = {}): AppButtonTooltipBindings {
  const bindings: AppButtonTooltipBindings = { location: 'bottom', openDelay: '150', transition: 'custom-tooltip', zIndex: 99 }
  if (options.offset !== undefined) {
    bindings.offset = options.offset
  }
  if (options.contentClass !== undefined) {
    bindings.contentClass = options.contentClass
  }
  return bindings
}

export function appButtonBindings (kind: AppButtonKind, options: AppButtonOptions = {}): AppButtonBindings {
  switch (kind) {
    case 'close': {
      // `ModalCloseButton`: the X of a modal title.
      return { icon: true, size: 'x-small', variant: 'text', class: 'modal-close-button' }
    }
    case 'icon': {
      // `CopyTextButton`: a small icon-only button.
      return { icon: true, size: 'x-small', variant: 'text' }
    }
    case 'icon-labeled': {
      // `BaseIconButton`: an icon above a caption (V2 `v-btn--vertical`).
      return { class: 'v-btn--vertical', elevation: '0', height: 'auto', variant: options.filled ? 'flat' : 'text' }
    }
    case 'page-add': {
      // `QuickActionsButton` activator: the green Add button of a page title.
      return { class: 'p-2 add-new-button page-title__add-button', color: 'primary', elevation: '0' }
    }
    case 'row-action': {
      // The icon of a table row (Edit, Delete, Info): a small text icon button.
      return { icon: true, size: 'small', variant: 'text' }
    }
    case 'icon-toggle': {
      // `ListGridSwitch`: the active view is outlined and primary, the other one is a text button.
      return options.active ? { icon: true, variant: 'outlined', color: 'primary' } : { icon: true, variant: 'text' }
    }
    case 'toolbar': {
      // A button of a toolbar (file manager): a text icon button like `row-action`, but outside a table cell. Disabled is only grayed out (no
      // `gray lighten5` fill, `_buttons.scss` `.app-button--toolbar`), the pressed one (`active`) is primary, 44px below `md`.
      return options.active ? { icon: true, variant: 'text', color: 'primary', class: 'app-button--toolbar' } : { icon: true, variant: 'text', class: 'app-button--toolbar' }
    }
    case 'primary': {
      // The filled submit of a modal (onboarding Continue). `elevated`, not the `v-card-actions` text variant, with no shadow.
      return { color: 'primary', elevation: '0', variant: 'elevated' }
    }
    case 'cancel': {
      // The gray text button next to a submit (Maybe Later, Back).
      return { color: 'gray', elevation: '0', variant: 'text' }
    }
    case 'setting-action': {
      // The white bordered action of a setting card: Purge, Manage, Log in, Copy. The look is the
      // global `.v-btn--default` (`_buttons.scss`); the label stays in the slot.
      return { class: 'mt-0 pt-0 font-weight-bold v-btn--default', elevation: '0' }
    }
    case 'danger': {
      // The filled error button (Delete, Disconnect confirm, cancel deploy). As `primary`: elevated, no shadow.
      return { color: 'error', elevation: '0', variant: 'elevated' }
    }
    case 'field': {
      // The outlined primary button (next to a field: Change email, Change password, Application URL; Import, Test connection).
      return { color: 'primary', elevation: '0', variant: 'outlined' }
    }
    case 'secondary': {
      // The outlined neutral button (second button of an auth card, Back, Manage, menu activators). Another tone via `color`.
      return { color: 'gray', elevation: '0', variant: 'outlined' }
    }
    case 'link': {
      // The primary text button (Download log, Show more, Clear filters). Another tone via `color` (info, warning, error).
      return { color: 'primary', elevation: '0', variant: 'text' }
    }
    case 'text': {
      // The plain text button without a colour (Close, Cancel without the gray label, Load more): it keeps the inherited text colour,
      // because `gray` (#CBCBDC) on a label without its own coloured span would be too light.
      return { elevation: '0', variant: 'text' }
    }
    case 'surface': {
      // The V2 default button, `#f5f5f5` (`#272727` in dark) with the text colour of the theme (Cancel next to Apply in Filters).
      // V4's default elevated button is the white card surface, so the fill comes from the class (`_buttons.scss`, `.app-button--surface`).
      return { class: 'app-button--surface', elevation: '0' }
    }
    default: {
      return {}
    }
  }
}
