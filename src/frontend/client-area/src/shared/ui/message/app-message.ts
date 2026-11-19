/** Meaning of an in-content message. */
export type MessageVariant = 'error' | 'warning' | 'success' | 'info'

/** Default icon of each variant: the icon most legacy copies used (`$alertwarning` for problems, `$infoCircle` for news). */
export const MESSAGE_ICONS: Readonly<Record<MessageVariant, string>> = {
  error: '$alertwarning',
  warning: '$alertwarning',
  success: '$infoCircle',
  info: '$infoCircle',
}

export function messageIcon (variant: MessageVariant, icon?: string): string {
  return icon ?? MESSAGE_ICONS[variant]
}
