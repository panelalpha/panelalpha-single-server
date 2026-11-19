import type { Config } from 'dompurify'
// The only place in `src` that imports DOMPurify (rule enforced by `no-raw-html.test.ts`). Every `v-html` in the app goes through
// `sanitizeHtml` by way of the `v-safe-html` directive. Legacy rendered this HTML raw; next cleans it.
import DOMPurify from 'dompurify'

/**
 * Where the HTML comes from decides how much of it is kept:
 * - `copy`: our own text (translations, modal messages built in code, log rows): formatting tags, a short list of class names,
 *   a filtered `style`. Log rows carry API values that are not escaped, so this profile is not "trusted".
 * - `rich`: HTML our backend or an admin writes (alerts, notifications, registration terms): `copy` plus tables, any class
 *   except those that position or overlay, a filtered `style`.
 * - `external`: third-party content (plugin and theme descriptions from the catalogue): formatting tags and links only,
 *   no `class` (it could hit our CSS), no `style`, no images.
 * - `svg`: an SVG image from the API (2FA QR code): shapes only, no scripts, links, styles, classes, ids or outside references.
 */
export type HtmlProfile = 'copy' | 'rich' | 'external' | 'svg'

const TEXT_TAGS = [
  'a', 'b', 'strong', 'i', 'em', 'u', 's', 'small', 'sub', 'sup', 'code', 'pre', 'kbd', 'span', 'div', 'p', 'br', 'hr',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote',
  'del', 'ins', 'mark', 'q', 'cite', 'abbr',
]
const TABLE_TAGS = ['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td']

const COMMON: Config = {
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  KEEP_CONTENT: true,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  RETURN_TRUSTED_TYPE: false,
}

const CONFIGS: Record<HtmlProfile, Config> = {
  copy: { ...COMMON, ALLOWED_TAGS: TEXT_TAGS, ALLOWED_ATTR: ['href', 'target', 'rel', 'title', 'class', 'style'] },
  rich: { ...COMMON, ALLOWED_TAGS: [...TEXT_TAGS, ...TABLE_TAGS], ALLOWED_ATTR: ['href', 'target', 'rel', 'title', 'class', 'style', 'colspan', 'rowspan'] },
  external: { ...COMMON, ALLOWED_TAGS: TEXT_TAGS, ALLOWED_ATTR: ['href', 'target', 'rel', 'title'] },
  svg: {
    ...COMMON,
    USE_PROFILES: { svg: true },
    FORBID_TAGS: ['script', 'style', 'foreignObject', 'use', 'a', 'animate', 'animateColor', 'animateMotion', 'animateTransform', 'set', 'image'],
    FORBID_ATTR: ['style', 'class', 'id', 'href', 'xlink:href'],
  },
}

export function isHtmlProfile (value: unknown): value is HtmlProfile {
  return typeof value === 'string' && Object.hasOwn(CONFIGS, value)
}

// Class names the HTML of our own code and translations writes (`*-modals.ts`, `target-item-box.ts`, `mcp-code.ts`, the translation
// file) plus the `font-weight-*` family. Vuetify utilities are `!important` and beat inline style, so a class list from a log value
// could paint a full-screen box (`position-fixed top-0 w-100 h-100`). Add a name here when the app's own HTML starts using it.
const COPY_CLASSES = new Set([
  'mcp-path', 'tok-ph', 'text-no-wrap', 'text-break-long', 'd-inline-block', 'capitalize', 'target-item-box', 'flex-column', 'host-empty',
  'text-gray-darken-1',
])
const COPY_CLASS_FAMILY = /^font-weight-(?:\d{3}|bold|light|medium|regular|semibold)$/
// HTML from the backend or an admin may use any class the app has, except those that lift an element out of the flow or over the page.
const RICH_BLOCKED_CLASS = /^(?:position-|fixed(?:-|$)|absolute(?:-|$)|sticky(?:-|$)|z-|top-|bottom-|left-|right-|start-|end-|vw-|vh-|min-vw-|min-vh-|v-(?:overlay|dialog|menu|navigation-drawer|app|main|snackbar|tooltip|bottom-sheet))/

function filterClass (value: string, profile: HtmlProfile): string {
  return value
    .split(/\s+/)
    .filter(token => token !== '' && (profile === 'copy'
      ? COPY_CLASSES.has(token) || COPY_CLASS_FAMILY.test(token)
      : !RICH_BLOCKED_CLASS.test(token)))
    .join(' ')
}

// Properties the markup built in our code uses (`target-item-box`, modal lists, log labels) plus plain text styling. No `position`, `z-index`,
// `content` or `filter`: those turn a text value into an overlay or a tracking pixel.
const STYLE_PROPERTIES = new Set([
  'display', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-color', 'border-style', 'border-width', 'border-radius',
  'background', 'background-color', 'color', 'opacity',
  'font-size', 'font-weight', 'font-style', 'font-family', 'line-height', 'letter-spacing', 'text-align', 'text-decoration', 'text-transform',
  'white-space', 'word-break', 'overflow-wrap', 'vertical-align', 'list-style', 'list-style-type',
  'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
  'flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'align-items', 'align-self', 'justify-content', 'gap',
])
// A value that can load something, run something, beat the page CSS (`!important`), or break out of the declaration.
const UNSAFE_STYLE_VALUE = /url\s*\(|attr\s*\(|expression|javascript|vbscript|behavior|binding|image-set|[!@\\<>{}]|\/\*/i

/** Keeps the declarations whose property is on the list and whose value is plain; returns `''` when none is left. */
export function filterStyle (style: string): string {
  return style
    .split(';')
    .map(declaration => declaration.trim())
    .filter(Boolean)
    .filter(declaration => {
      const separator = declaration.indexOf(':')
      if (separator < 1) {
        return false
      }
      const property = declaration.slice(0, separator).trim().toLowerCase()
      const value = declaration.slice(separator + 1).trim()
      return STYLE_PROPERTIES.has(property) && value !== '' && !UNSAFE_STYLE_VALUE.test(value)
    })
    .join('; ')
}

// A private instance: the hooks below sit on it alone, so a second evaluation of this module (HMR, `vi.resetModules`) cannot stack them
// on a shared singleton. Without a DOM (SSR is not used) `DOMPurify` is the inert default export and `sanitize` returns an empty string.
const purify = typeof window === 'undefined' ? DOMPurify : DOMPurify(window)

// Hooks get the DOM node and the attribute, not the config; `sanitizeHtml` sets the profile for the one synchronous call.
let activeProfile: HtmlProfile = 'copy'

purify.addHook('uponSanitizeAttribute', (_node, data) => {
  if (data.attrName === 'style') {
    const filtered = filterStyle(data.attrValue)
    if (filtered) {
      data.attrValue = filtered
    } else {
      data.keepAttr = false
    }
  } else if (data.attrName === 'class') {
    const filtered = filterClass(data.attrValue, activeProfile)
    if (filtered) {
      data.attrValue = filtered
    } else {
      data.keepAttr = false
    }
  } else if (activeProfile === 'svg' && /url\s*\(\s*['"]?\s*(?!#)/i.test(data.attrValue)) {
    // `filter`, `fill`, `mask` and `clip-path` can point to another host; only a `#fragment` of the same image is allowed.
    data.keepAttr = false
  }
})

purify.addHook('afterSanitizeAttributes', node => {
  // A link that opens a new tab must not hand the page to the target (`window.opener`) or leak the referrer.
  if (node.nodeName === 'A' && node.hasAttribute('target')) {
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/** Sanitizes `html` for `v-safe-html`. `null`, `undefined` and `''` give `''`. */
export function sanitizeHtml (html: string | null | undefined, profile: HtmlProfile = 'copy'): string {
  if (!html) {
    return ''
  }
  activeProfile = profile
  return String(purify.sanitize(String(html), CONFIGS[profile]))
}
