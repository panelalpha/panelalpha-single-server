import type { HtmlProfile } from './sanitize-html'
import { describe, expect, it, vi } from 'vitest'
import { filterStyle, sanitizeHtml } from './sanitize-html'

const TEXT_PROFILES: HtmlProfile[] = ['copy', 'rich', 'external']

/** Parses the result like the browser does and reports what an attacker needs: script, handlers, dangerous URLs. */
function inspect (html: string) {
  const root = document.createElement('div')
  root.innerHTML = html
  const all = [root, ...root.querySelectorAll('*')]
  return {
    tags: all.slice(1).map(element => element.tagName.toLowerCase()),
    attributes: all.flatMap(element => [...element.attributes].map(attribute => `${element.tagName.toLowerCase()}@${attribute.name}=${attribute.value}`)),
    handlers: all.flatMap(element => [...element.attributes].filter(attribute => attribute.name.startsWith('on'))),
  }
}

const XSS_VECTORS: Array<[string, string]> = [
  ['script tag', '<script>alert(1)</script>'],
  ['script with src', '<script src="https://evil.test/x.js"></script>'],
  ['img onerror', '<img src=x onerror=alert(1)>'],
  ['svg onload', '<svg onload=alert(1)></svg>'],
  ['svg script', '<svg><script>alert(1)</script></svg>'],
  ['body onload', '<body onload=alert(1)>'],
  ['javascript href', '<a href="javascript:alert(1)">x</a>'],
  ['javascript href with tab', '<a href="java\tscript:alert(1)">x</a>'],
  ['javascript href uppercase', '<a href="JaVaScRiPt:alert(1)">x</a>'],
  ['javascript href with entity', '<a href="&#106;avascript:alert(1)">x</a>'],
  ['javascript href with leading space', '<a href=" javascript:alert(1)">x</a>'],
  ['vbscript href', '<a href="vbscript:msgbox(1)">x</a>'],
  ['data html href', '<a href="data:text/html,<script>alert(1)</script>">x</a>'],
  ['iframe', '<iframe src="https://evil.test"></iframe>'],
  ['iframe srcdoc', '<iframe srcdoc="<script>alert(1)</script>"></iframe>'],
  ['object', '<object data="https://evil.test/x.swf"></object>'],
  ['embed', '<embed src="https://evil.test/x.swf">'],
  ['form action', '<form action="https://evil.test"><input name=x></form>'],
  ['input autofocus onfocus', '<input autofocus onfocus=alert(1)>'],
  ['meta refresh', '<meta http-equiv="refresh" content="0;url=https://evil.test">'],
  ['base href', '<base href="https://evil.test/">'],
  ['link stylesheet', '<link rel="stylesheet" href="https://evil.test/x.css">'],
  ['style tag', '<style>body{display:none}</style>'],
  ['math with style (mXSS)', '<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;img src=1 onerror=alert(1)&gt;">'],
  ['noscript (mXSS)', '<noscript><p title="</noscript><img src=x onerror=alert(1)>">'],
  ['svg with style (mXSS)', '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">'],
  ['nested broken tags', '<<script>script>alert(1)<</script>/script>'],
  ['uppercase tag and handler', '<IMG SRC=x ONERROR=alert(1)>'],
  ['handler without quotes in b', '<b onmouseover=alert(1)>x</b>'],
  ['handler in anchor', '<a href="https://ok.test" onclick="alert(1)">x</a>'],
  ['details ontoggle', '<details open ontoggle=alert(1)>'],
  ['video source onerror', '<video><source onerror=alert(1)></video>'],
  ['template', '<template><script>alert(1)</script></template>'],
  ['xlink href', '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>'],
  ['svg use', '<svg><use href="data:image/svg+xml,<svg id=x xmlns=http://www.w3.org/2000/svg><script>alert(1)</script></svg>#x"></use></svg>'],
  ['svg animate', '<svg><animate onbegin=alert(1) attributeName=x dur=1s></animate></svg>'],
  ['svg set', '<svg><a><set attributeName=href to=javascript:alert(1)></set><text>x</text></a></svg>'],
  ['foreignObject', '<svg><foreignObject><iframe src="https://evil.test"></iframe></foreignObject></svg>'],
  ['style attribute url', '<span style="background:url(javascript:alert(1))">x</span>'],
  ['style attribute expression', '<span style="width:expression(alert(1))">x</span>'],
  ['dom clobbering id', '<img name="body" id="attributes">'],
]

describe('sanitizeHtml: XSS vectors', () => {
  for (const profile of ['copy', 'rich', 'external', 'svg'] as const) {
    describe(`profile ${profile}`, () => {
      for (const [name, vector] of XSS_VECTORS) {
        it(`removes ${name}`, () => {
          const result = sanitizeHtml(vector, profile)
          const { tags, attributes, handlers } = inspect(result)
          expect(handlers).toEqual([])
          for (const forbidden of ['script', 'iframe', 'object', 'embed', 'form', 'input', 'meta', 'base', 'link', 'style', 'template', 'foreignobject', 'use', 'animate', 'set', 'video', 'details', 'math']) {
            expect(tags).not.toContain(forbidden)
          }
          expect(result.toLowerCase()).not.toMatch(/javascript:|vbscript:|data:text\/html|onerror|onload|onfocus|expression\(/)
          expect(attributes.filter(attribute => /^a@(?:href|xlink:href|src)=\s*(?:javascript|vbscript|data):/i.test(attribute))).toEqual([])
        })
      }
    })
  }

  it('returns an empty string for null, undefined and empty input', () => {
    expect(sanitizeHtml(null)).toBe('')
    expect(sanitizeHtml(undefined)).toBe('')
    expect(sanitizeHtml('')).toBe('')
  })

  it('keeps the text of a removed element', () => {
    expect(sanitizeHtml('<b>kept</b><script>alert(1)</script>after')).toBe('<b>kept</b>after')
  })

  it('does not decode escaped markup back into tags', () => {
    expect(sanitizeHtml('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
  })
})

describe('sanitizeHtml: markup the app renders keeps its look', () => {
  it('keeps translation markup (b, strong, span and code with class)', () => {
    const copy = 'Use our <strong>migration plugin</strong> in <code class="mcp-path">Users → Profile</code>, <b>Make sure </b>and <span class="font-weight-600">upgrade</span>.'
    expect(sanitizeHtml(copy, 'copy')).toBe(copy)
  })

  it('keeps the lists and line breaks that modal messages are built from', () => {
    const message = '<p>Remove:</p><ul><li><strong class="d-inline-block">name</strong></li></ul><br>'
    expect(sanitizeHtml(message, 'copy')).toBe(message)
  })

  it('keeps the inline style of the target item box', () => {
    const box = '<span class="target-item-box" style="display: flex; align-items: center; border-radius: 6px; border: 1px solid var(--v-gray-lighten3); background: var(--v-gray-lighten5); padding: 16px; margin-top: 16px; font-weight: 600">x</span>'
    expect(sanitizeHtml(box, 'copy')).toBe(box)
  })

  it('keeps the label colour a log row builds from the API', () => {
    const label = '<span style="background-color: #1abc9c; color: white; padding: 1px 8px; border-radius: 15px">Label</span>'
    expect(sanitizeHtml(label, 'copy')).toBe(label)
  })

  it('keeps the escaped entities of an API value', () => {
    expect(sanitizeHtml('<b>a &amp; b &lt;c&gt;</b>', 'copy')).toBe('<b>a &amp; b &lt;c&gt;</b>')
  })

  it('keeps links and gives a new-tab link a safe rel', () => {
    expect(sanitizeHtml('<a href="https://panelalpha.com/terms" target="_blank">Terms</a>', 'rich'))
      .toBe('<a href="https://panelalpha.com/terms" target="_blank" rel="noopener noreferrer">Terms</a>')
  })

  it('overwrites a rel the source sets on a new-tab link', () => {
    expect(sanitizeHtml('<a href="https://ok.test" target="_blank" rel="opener">x</a>', 'rich'))
      .toBe('<a href="https://ok.test" target="_blank" rel="noopener noreferrer">x</a>')
  })

  it('keeps mailto and tel links', () => {
    expect(sanitizeHtml('<a href="mailto:a@b.test">m</a><a href="tel:+48123">t</a>', 'copy'))
      .toBe('<a href="mailto:a@b.test">m</a><a href="tel:+48123">t</a>')
  })

  it('keeps tables only in the rich profile', () => {
    const table = '<table><tbody><tr><td colspan="2">cell</td></tr></tbody></table>'
    expect(sanitizeHtml(table, 'rich')).toBe(table)
    expect(sanitizeHtml(table, 'copy')).toBe('cell')
  })

  it('keeps the formatting of a catalogue description but drops class, style and images', () => {
    const description = '<p class="intro" style="color:red">A <em>fast</em> plugin, see <a href="https://wordpress.org/plugins/x/">docs</a>.</p><img src="https://evil.test/p.gif"><h3>Features</h3><ul><li>One</li></ul>'
    expect(sanitizeHtml(description, 'external'))
      .toBe('<p>A <em>fast</em> plugin, see <a href="https://wordpress.org/plugins/x/">docs</a>.</p><h3>Features</h3><ul><li>One</li></ul>')
  })

  it('keeps the shapes of a QR code SVG', () => {
    const qr = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect width="100" height="100" fill="#ffffff"></rect><g transform="scale(4)"><path fill="#000000" d="M0 0h1v1H0z"></path></g></svg>'
    const result = sanitizeHtml(qr, 'svg')
    expect(result).toContain('viewBox="0 0 100 100"')
    expect(result).toContain('<rect')
    expect(result).toContain('d="M0 0h1v1H0z"')
    expect(result).toContain('transform="scale(4)"')
    expect(result).toContain('fill="#000000"')
  })

  it('keeps a QR code in the shape BaconQrCode (Laravel Fortify) writes', () => {
    const qr = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="192" height="192" viewBox="0 0 192 192"><rect x="0" y="0" width="192" height="192" fill="#fefefe"/><g transform="scale(8.727272727273)"><g transform="translate(4,4)"><path fill-rule="evenodd" d="M0 0L7 0L7 1L0 1Z" fill="#000000"/></g></g></svg>\n'
    const result = sanitizeHtml(qr, 'svg')
    const svg = new DOMParser().parseFromString(result, 'text/html').querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 192 192')
    expect(svg?.getAttribute('width')).toBe('192')
    expect(svg?.querySelector('rect')?.getAttribute('fill')).toBe('#fefefe')
    expect(svg?.querySelectorAll('g')).toHaveLength(2)
    expect(svg?.querySelector('path')?.getAttribute('fill-rule')).toBe('evenodd')
    expect(svg?.querySelector('path')?.getAttribute('d')).toBe('M0 0L7 0L7 1L0 1Z')
  })

  it('does not let an SVG carry a style attribute or a link', () => {
    const result = sanitizeHtml('<svg viewBox="0 0 1 1"><rect style="fill:red" width="1" height="1"></rect><a href="https://evil.test"><rect width="1" height="1"></rect></a></svg>', 'svg')
    expect(result).not.toContain('style')
    expect(result).not.toContain('href')
    expect(result).not.toContain('<a')
  })

  it('keeps no class in the external profile, a short list in copy and most classes in rich', () => {
    expect(sanitizeHtml('<b class="font-weight-bold">t</b>', 'external')).toBe('<b>t</b>')
    expect(sanitizeHtml('<b class="font-weight-bold">t</b>', 'copy')).toBe('<b class="font-weight-bold">t</b>')
    expect(sanitizeHtml('<b class="x">t</b>', 'copy')).toBe('<b>t</b>')
    expect(sanitizeHtml('<b class="x">t</b>', 'rich')).toBe('<b class="x">t</b>')
  })

  it('keeps every class name the app writes in its own HTML', () => {
    for (const name of ['mcp-path', 'tok-ph', 'text-no-wrap', 'text-break-long', 'd-inline-block', 'capitalize', 'target-item-box', 'flex-column', 'host-empty', 'text-gray-darken-1', 'font-weight-600', 'font-weight-bold']) {
      expect(sanitizeHtml(`<span class="${name}">t</span>`, 'copy')).toBe(`<span class="${name}">t</span>`)
    }
  })

  it('keeps the allowed classes of a list and drops the others', () => {
    expect(sanitizeHtml('<span class="  mcp-path   position-fixed  font-weight-600 ">t</span>', 'copy')).toBe('<span class="mcp-path font-weight-600">t</span>')
  })

  it('does not let a class list lift an element over the page (copy and rich)', () => {
    const overlay = '<div class="position-fixed top-0 left-0 w-100 h-100 bg-white z-index-10" style="color: red">LOGIN</div>'
    expect(sanitizeHtml(overlay, 'copy')).toBe('<div style="color: red">LOGIN</div>')
    const rich = sanitizeHtml(overlay, 'rich')
    for (const blocked of ['position-fixed', 'top-0', 'left-0', 'z-index-10']) {
      expect(rich).not.toContain(blocked)
    }
    for (const blocked of ['v-overlay', 'v-dialog', 'sticky', 'absolute', 'z-5', 'vw-100', 'vh-100', 'bottom-0', 'right-0', 'start-0', 'end-0']) {
      expect(sanitizeHtml(`<div class="${blocked}">t</div>`, 'rich')).toBe('<div>t</div>')
    }
  })

  it('keeps the text tags a catalogue description may use and drops images', () => {
    const description = '<dl><dt>a</dt><dd>b</dd></dl><del>x</del><ins>y</ins><mark>m</mark><q>q</q><cite>c</cite><abbr title="t">ab</abbr><img src="https://evil.test/p.gif">'
    expect(sanitizeHtml(description, 'external'))
      .toBe('<dl><dt>a</dt><dd>b</dd></dl><del>x</del><ins>y</ins><mark>m</mark><q>q</q><cite>c</cite><abbr title="t">ab</abbr>')
  })

  it('gives a new-tab link a safe rel in the external profile too', () => {
    expect(sanitizeHtml('<a href="https://wordpress.org" target="_blank">wp</a>', 'external'))
      .toBe('<a href="https://wordpress.org" target="_blank" rel="noopener noreferrer">wp</a>')
  })

  it('keeps the rules when the module is evaluated twice (HMR, resetModules)', async () => {
    vi.resetModules()
    const again = await import('./sanitize-html')
    const html = '<a href="https://ok.test" target="_blank" class="x" style="color: red; position: fixed">t</a><script>alert(1)</script>'
    expect(again.sanitizeHtml(html, 'copy')).toBe(sanitizeHtml(html, 'copy'))
    expect(again.sanitizeHtml(html, 'copy')).toBe('<a href="https://ok.test" target="_blank" style="color: red" rel="noopener noreferrer">t</a>')
  })

  it('drops a data attribute and an aria attribute in every text profile', () => {
    for (const profile of TEXT_PROFILES) {
      expect(sanitizeHtml('<b data-x="1" aria-label="y">t</b>', profile)).toBe('<b>t</b>')
    }
  })
})

describe('filterStyle', () => {
  it('keeps listed properties with plain values', () => {
    expect(filterStyle('margin-left: auto; min-width: 48px')).toBe('margin-left: auto; min-width: 48px')
  })

  it('drops properties that are not listed', () => {
    expect(filterStyle('position: fixed; top: 0; z-index: 9999; display: flex')).toBe('display: flex')
  })

  it('drops values that load or run something', () => {
    expect(filterStyle('background: url(https://evil.test/p.gif)')).toBe('')
    expect(filterStyle('background-color: expression(alert(1))')).toBe('')
    expect(filterStyle(String.raw`color: red\9`)).toBe('')
    expect(filterStyle('width: 1px /* x */')).toBe('')
  })

  it('drops a declaration without a value or a property', () => {
    expect(filterStyle('color:; : red; margin-top: 24px')).toBe('margin-top: 24px')
  })

  it('returns an empty string for an empty style', () => {
    expect(filterStyle('')).toBe('')
    expect(filterStyle(' ; ; ')).toBe('')
  })

  it('drops attr() and !important', () => {
    expect(filterStyle('background: attr(title url)')).toBe('')
    expect(filterStyle('color: red !important; width: 100vw !important; margin-top: 4px')).toBe('margin-top: 4px')
  })
})

describe('sanitizeHtml: svg profile', () => {
  it('drops class and id', () => {
    const result = sanitizeHtml('<svg viewBox="0 0 1 1"><rect id="app" class="v-overlay position-fixed w-100 h-100" width="1" height="1"></rect></svg>', 'svg')
    expect(result).toContain('<rect')
    expect(result).not.toContain('class')
    expect(result).not.toContain('id=')
  })

  it('drops a reference to another host and keeps a reference to the same image', () => {
    const outside = sanitizeHtml('<svg viewBox="0 0 1 1"><rect filter="url(https://evil.test/x.svg#f)" fill="url(//evil.test/p#a)" mask="url( x )" clip-path="url(&quot;x&quot;)" width="1" height="1"></rect></svg>', 'svg')
    for (const attribute of ['filter', 'fill', 'mask', 'clip-path']) {
      expect(outside).not.toContain(`${attribute}=`)
    }
    const inside = sanitizeHtml('<svg viewBox="0 0 1 1"><rect fill="url(#grad)" width="1" height="1"></rect></svg>', 'svg')
    expect(inside).toContain('fill="url(#grad)"')
  })

  it('drops animateColor', () => {
    expect(sanitizeHtml('<svg viewBox="0 0 1 1"><rect width="1" height="1"><animateColor attributeName="fill" values="red;blue"></animateColor></rect></svg>', 'svg')).not.toContain('animate')
  })
})
