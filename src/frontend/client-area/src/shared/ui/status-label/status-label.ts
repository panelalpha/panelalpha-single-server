/**
 * Status of a kit status chip: the colour pair of `StatusLabel.vue`, from the theme tokens in
 * `themes-variables.scss`. The screen maps its own domain status to one of these (`stateColor`, `logStatusColor`, ...).
 */
export type StatusLabelStatus = 'success' | 'error' | 'warning' | 'info' | 'gray' | 'primary' | 'purple' | 'sand'

export const STATUS_LABEL_STATUSES: ReadonlyArray<StatusLabelStatus> = ['success', 'error', 'warning', 'info', 'gray', 'primary', 'purple', 'sand']
