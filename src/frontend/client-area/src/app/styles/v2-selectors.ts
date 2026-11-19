/** Selector fragments that only exist in the Vuetify 2 DOM. */
export const V2_SELECTORS = [
  '.v-input__slot', '.v-text-field__details', '.v-select__slot', '.v-select__selections',
  '.v-input--is-focused', '.error--text', '.primary--text', '.v-menu__content',
  '.v-tooltip__content', '.v-list-item__title', '.v-btn--has-bg', '.v-btn--outlined',
  '.v-btn--text', '.v-btn--plain', '.v-size--', '.v-card__', '.v-dialog__content', '.v-snack__',
  '.v-tabs-slider', '.v-tab--active', '.v-expansion-panel-header', '.v-expansion-panel-content',
  '.v-data-table__wrapper', '.v-icon__component', '.v-application--is-rtl', '::v-deep',
  '.v-image', '.v-input--is-disabled', '.theme--dark', '.theme--light',
  // V2-only VAlert elements; V4 renders `.v-alert__content` / `__border` too.
  '.v-alert__wrapper', '.v-alert__icon', '.v-alert__dismissible',
  // `.v-badge--bordered` is not listed: V4 VBadge renders it too.
  '.v-input--switch', '.v-input--selection-controls',
  // `.v-input__control` is not listed: V4 renders it too.
  '.v-input--is-label-active', '.v-input--indeterminate', '.v-select--is-menu-active',
  '.v-input__append-inner', '.v-text-field--outlined',
] as const
