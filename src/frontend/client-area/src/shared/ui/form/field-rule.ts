/**
 * One validation rule shape for every kit field (Vuetify 4 accepts `string | boolean`).
 * The parameter is `unknown` so `useFormRules()` arrays fit any field, as legacy passed
 * `FormRulesMixin` arrays straight into modal fields.
 */
export type FieldRule = (value: unknown) => boolean | string
