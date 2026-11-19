import type { ProxyRule } from './containers.api'
import { describe, expect, it } from 'vitest'
import {
  buildUrlFromRule,
  canStart,
  canStop,
  confirmCopy,
  confirmedProjectAction,
  confirmedServiceAction,
  containerHeaders,
  containerUptime,
  getPortEntries,
  groupPortRows,
  isGroupActing,
  parseHostPorts,
  parsePortsForDisplay,
  portRowKey,
  portTooltip,
  previewPublicUrl,
  projectActions,
  serviceKey,
  stateColor,
} from './containers'

function rule (overrides: Partial<ProxyRule> = {}): ProxyRule {
  return {
    id: 1,
    transport: 'http',
    upstream_port: 8080,
    upstream_protocol: 'http',
    listen_port: 80,
    server_name: 'example.com',
    ...overrides,
  }
}

describe('container state', () => {
  it.each([
    ['running', 'success'],
    ['restarting', 'warning'],
    ['exited', 'error'],
    ['dead', 'error'],
    ['created', 'gray'],
    ['paused', 'gray'],
    ['RUNNING', 'success'],
  ])('colours %s as %s', (state, color) => {
    expect(stateColor(state)).toBe(color)
  })

  it('colours an empty state gray', () => {
    expect(stateColor('')).toBe('gray')
  })

  it.each([
    ['running', false, true],
    ['restarting', false, true],
    ['exited', true, false],
    ['dead', true, false],
    ['created', true, false],
    ['paused', true, false],
  ])('for %s: can start %s, can stop %s', (state, start, stop) => {
    expect(canStart(state)).toBe(start)
    expect(canStop(state)).toBe(stop)
  })

  it('an empty state can be started and not stopped', () => {
    expect(canStart('')).toBe(true)
    expect(canStop('')).toBe(false)
  })
})

describe('parseHostPorts', () => {
  it('reads the host port of each mapping once, IPv4 and IPv6 alike', () => {
    expect(parseHostPorts('0.0.0.0:8080->80/tcp, :::8080->80/tcp')).toEqual([8080])
    expect(parseHostPorts('127.0.0.1:5432->5432/tcp, 0.0.0.0:3306->3306/tcp')).toEqual([5432, 3306])
  })

  it('skips ranges and the PORT/proto form', () => {
    expect(parseHostPorts('9000-9002/tcp, 3306/tcp')).toEqual([])
  })

  it('returns nothing for an empty string', () => {
    expect(parseHostPorts('')).toEqual([])
  })
})

describe('parsePortsForDisplay', () => {
  it('reads public, loopback, sensitive and range entries from the fixture string', () => {
    expect(parsePortsForDisplay('0.0.0.0:8080->80/tcp, :::8080->80/tcp')).toEqual([{ type: 'external', port: 8080 }])
    expect(parsePortsForDisplay('127.0.0.1:5432->5432/tcp')).toEqual([{ type: 'internal', port: 5432 }])
    expect(parsePortsForDisplay('0.0.0.0:3306->3306/tcp, 9000-9002/tcp')).toEqual([
      { type: 'sensitive', port: 3306 },
      { type: 'range', display: '9000-9002' },
    ])
  })

  it('reads the PORT/proto form without a mapping as an internal port', () => {
    expect(parsePortsForDisplay('3306/tcp')).toEqual([{ type: 'internal', port: 3306 }])
    expect(parsePortsForDisplay('9000-9002/udp')).toEqual([{ type: 'range', display: '9000-9002' }])
  })

  it('treats * and the empty host as public binds', () => {
    expect(parsePortsForDisplay('*:8081->81/tcp')).toEqual([{ type: 'external', port: 8081 }])
  })

  it('reads a range mapping as a range', () => {
    expect(parsePortsForDisplay('0.0.0.0:9000-9002->9000-9002/tcp')).toEqual([{ type: 'range', display: '9000-9002' }])
  })

  it('returns nothing for an empty string', () => {
    expect(parsePortsForDisplay('')).toEqual([])
  })
})

describe('getPortEntries', () => {
  it('lists a public port as external when there are no rules', () => {
    expect(getPortEntries({ Ports: '0.0.0.0:8080->80/tcp' }, [], null)).toEqual([{ type: 'external', port: 8080 }])
  })

  it('lists every type of the fixture without rules', () => {
    const entries = getPortEntries({ Ports: '0.0.0.0:8080->80/tcp, 127.0.0.1:5432->5432/tcp, 0.0.0.0:3306->3306/tcp, 9000-9002/tcp' }, [], null)
    expect(entries.map(entry => entry.type)).toEqual(['external', 'internal', 'sensitive', 'range'])
  })

  it('expands an external port with an http rule to a proxied row', () => {
    const entries = getPortEntries({ Ports: '0.0.0.0:8080->80/tcp' }, [rule({ upstream_port: 8080 })], '192.0.2.10')
    expect(entries).toEqual([{ type: 'proxied', port: 8080, rule: rule({ upstream_port: 8080 }) }])
  })

  it('expands a sensitive port with an http rule to a sensitive-proxied row', () => {
    const entries = getPortEntries({ Ports: '0.0.0.0:3306->3306/tcp' }, [rule({ upstream_port: 3306 })], null)
    expect(entries.map(entry => entry.type)).toEqual(['sensitive-proxied'])
  })

  it('gives one row per http rule', () => {
    const rules = [rule({ id: 1, listen_port: 80 }), rule({ id: 2, listen_port: 8000 })]
    const entries = getPortEntries({ Ports: '0.0.0.0:8080->80/tcp' }, rules, null)
    expect(entries.map(entry => entry.type)).toEqual(['proxied', 'proxied'])
    expect(entries.map(entry => portRowKey(entry))).toEqual(['rule-1', 'rule-2'])
  })

  it('prefers an http rule over a stream rule on the same port', () => {
    const rules = [rule({ id: 1, transport: 'tcp', listen_port: 9090 }), rule({ id: 2, transport: 'http', listen_port: 80 })]
    const entries = getPortEntries({ Ports: '0.0.0.0:8080->80/tcp' }, rules, null)
    expect(entries.map(entry => entry.type)).toEqual(['proxied'])
  })

  it('shows a stream rule as stream-proxied with the server address', () => {
    const rules = [rule({ id: 3, transport: 'tcp', upstream_port: 8080, listen_port: 9090 })]
    const entries = getPortEntries({ Ports: '0.0.0.0:8080->80/tcp' }, rules, '192.0.2.10')
    expect(entries).toEqual([{ type: 'stream-proxied', port: 8080, rule: rules[0], address: '192.0.2.10:9090' }])
    expect(getPortEntries({ Ports: '0.0.0.0:8080->80/tcp' }, rules, null)[0]).toMatchObject({ address: '[server-ip]:9090' })
  })

  it('does not apply rules to internal and range ports', () => {
    const rules = [rule({ upstream_port: 5432 }), rule({ id: 2, upstream_port: 9000 })]
    const entries = getPortEntries({ Ports: '127.0.0.1:5432->5432/tcp, 9000-9002/tcp' }, rules, null)
    expect(entries.map(entry => entry.type)).toEqual(['internal', 'range'])
  })

  it('returns no rows for a container without ports', () => {
    expect(getPortEntries({ Ports: '' }, [], null)).toEqual([])
  })
})

describe('portTooltip', () => {
  it('gives the legacy tooltip of each row type', () => {
    expect(portTooltip({ type: 'range', display: '9000-9002' })).toBe('Port range 9000-9002. Port ranges cannot be individually proxied.')
    expect(portTooltip({ type: 'internal', port: 5432 })).toBe('Bound to 127.0.0.1, only accessible inside the server. Cannot be exposed publicly.')
    expect(portTooltip({ type: 'sensitive', port: 3306 })).toBe('Port 3306 looks like a non-HTTP service (e.g. database). HTTP proxying is unlikely to work. Manage this via Admin Area if needed.')
    expect(portTooltip({ type: 'external', port: 8080 })).toBe('Port 8080 is not yet publicly accessible. Click to add a public URL.')
  })
})

describe('buildUrlFromRule', () => {
  it('omits the port on 80 and uses the server name', () => {
    // eslint-disable-next-line unicorn/prefer-https -- plain http: a port 80 rule without an https upstream
    expect(buildUrlFromRule(rule({ listen_port: 80, server_name: 'example.com' }), '192.0.2.10')).toBe('http://example.com/')
  })

  it('uses https on 443', () => {
    expect(buildUrlFromRule(rule({ listen_port: 443 }), null)).toBe('https://example.com/')
  })

  it('uses https for an https upstream and keeps a non-default port', () => {
    expect(buildUrlFromRule(rule({ listen_port: 8443, upstream_protocol: 'https' }), null)).toBe('https://example.com:8443/')
  })

  it('falls back to the server address and then to the placeholder', () => {
    expect(buildUrlFromRule(rule({ listen_port: 8000, server_name: null }), '192.0.2.10')).toBe('http://192.0.2.10:8000/')
    expect(buildUrlFromRule(rule({ listen_port: 8000, server_name: null }), null)).toBe('http://[server-ip]:8000/')
  })
})

describe('previewPublicUrl', () => {
  it('shows the dash for a port of 0', () => {
    expect(previewPublicUrl('example.com', 0)).toBe('—')
  })

  it('uses https only on 443, not for an https upstream', () => {
    expect(previewPublicUrl('example.com', 443)).toBe('https://example.com/')
    // eslint-disable-next-line unicorn/prefer-https -- plain http: a non-443 preview is never https
    expect(previewPublicUrl('example.com', 8443)).toBe('http://example.com:8443/')
  })

  it('shows the dash when there is no domain', () => {
    expect(previewPublicUrl(null, 8080)).toBe('—')
  })
})

describe('serviceKey', () => {
  it('joins the account and the service', () => {
    expect(serviceKey(11, 'web')).toBe('11:web')
  })
})

describe('groupPortRows', () => {
  it('gives one chip per port with every URL and stream address of the port', () => {
    const rules = [rule({ id: 1, listen_port: 80 }), rule({ id: 2, listen_port: 443 })]
    const groups = groupPortRows(getPortEntries({ Ports: '0.0.0.0:8080->80/tcp, :::8080->80/tcp' }, rules, null), null)

    expect(groups).toEqual([{
      key: '8080',
      label: '8080',
      port: 8080,
      status: 'success',
      // eslint-disable-next-line unicorn/prefer-https -- plain http: a port 80 rule without an https upstream
      links: ['http://example.com/', 'https://example.com/'],
      streams: [],
      hint: portTooltip({ type: 'proxied', port: 8080, rule: rules[0]! }),
      manageable: true,
    }])
  })

  it('keeps the kind of each port: a range without a port, a non-web port amber, a stream address, a plain external port', () => {
    const rules = [rule({ id: 3, transport: 'tcp', upstream_port: 6000, listen_port: 9090 })]
    const groups = groupPortRows(
      getPortEntries({ Ports: '9000-9002/tcp, 0.0.0.0:3306->3306/tcp, 0.0.0.0:6000->6000/tcp, 0.0.0.0:8080->80/tcp' }, rules, '192.0.2.10'),
      '192.0.2.10',
    )

    expect(groups.map(group => [group.label, group.port, group.status, group.manageable])).toEqual([
      ['9000-9002', null, 'gray', false],
      ['3306', 3306, 'warning', false],
      ['6000', 6000, 'gray', false],
      ['8080', 8080, 'gray', true],
    ])
    expect(groups[2]?.streams).toEqual(['192.0.2.10:9090'])
    expect(groups[3]?.links).toEqual([])
  })

  it('returns no chips for a container without ports', () => {
    expect(groupPortRows([], null)).toEqual([])
  })
})

describe('containerUptime', () => {
  it('reads the time after `Up` without the health note', () => {
    expect(containerUptime('Up 59 seconds')).toBe('59 seconds')
    expect(containerUptime('Up 2 hours (healthy)')).toBe('2 hours')
    expect(containerUptime('Up About an hour')).toBe('About an hour')
  })

  it('gives the dash to a container that does not run', () => {
    expect(containerUptime('Exited (0) 2 hours ago')).toBe('—')
    expect(containerUptime('Restarting (1) 3 seconds ago')).toBe('—')
    expect(containerUptime('Created')).toBe('—')
    expect(containerUptime('')).toBe('—')
  })
})

describe('containerHeaders', () => {
  it('lists the columns with Service and Image sortable', () => {
    const headers = containerHeaders(key => key)
    expect(headers.map(header => [header.key, header.sortable])).toEqual([
      ['Service', true],
      ['Image', true],
      ['State', false],
      ['Status', false],
      ['ports', false],
      ['actions', false],
    ])
    expect(headers[0]?.title).toBe('heading.hosting.containers.col.service')
    expect(headers[3]?.title).toBe('Uptime')
    expect(headers[4]?.title).toBe('Ports')
    expect(headers[5]?.align).toBe('end')
  })
})

describe('projectActions', () => {
  it('lists the legacy menu in order without Down (ID-46), with the line icons', () => {
    const items = projectActions(key => key)

    expect(items.map(item => item.id)).toEqual(['up', 'restart', 'stop', 'pull'])
    expect(items.map(item => item.icon)).toEqual(['$play', '$restore', '$pauseLine', '$downloadLine'])
    expect(items.every(item => item.iconSize === '20')).toBe(true)
    expect(items[0]?.title).toBe('heading.hosting.containers.action.up')
  })
})

describe('confirmed actions (ID-46)', () => {
  const t = (key: string, options?: Record<string, unknown>) => options ? `${key}:${JSON.stringify(options)}` : key

  it('asks before Restart, Stop All and Pull & Redeploy of the project, not before Start All', () => {
    expect(confirmedProjectAction('restart')).toEqual({ scope: 'project', action: 'restart' })
    expect(confirmedProjectAction('stop')).toEqual({ scope: 'project', action: 'stop' })
    expect(confirmedProjectAction('pull')).toEqual({ scope: 'project', action: 'pull' })
    expect(confirmedProjectAction('up')).toBeNull()
  })

  it('asks before Stop and Restart of one container, not before Start', () => {
    expect(confirmedServiceAction('web', 'stop')).toEqual({ scope: 'service', action: 'stop', service: 'web' })
    expect(confirmedServiceAction('web', 'restart')).toEqual({ scope: 'service', action: 'restart', service: 'web' })
    expect(confirmedServiceAction('web', 'start')).toBeNull()
  })

  it('takes the project texts and the action label as the button', () => {
    expect(confirmCopy({ scope: 'project', action: 'stop' }, t)).toEqual({
      title: 'heading.hosting.containers.confirm.stop.title',
      message: 'heading.hosting.containers.confirm.stop.message',
      button: 'heading.hosting.containers.action.stop',
    })
  })

  it('names the container, escaped, in the title and in bold in the message', () => {
    expect(confirmCopy({ scope: 'service', action: 'restart', service: '<i>web</i>' }, t)).toEqual({
      title: 'heading.hosting.containers.confirm.serviceRestart.title:{"service":"&lt;i&gt;web&lt;/i&gt;"}',
      message: 'heading.hosting.containers.confirm.serviceRestart.message:{"service":"<b>&lt;i&gt;web&lt;/i&gt;</b>"}',
      button: 'heading.hosting.containers.service.restart',
    })
  })

  it('names the URL, the port and the container, escaped, when a public URL is removed', () => {
    const rule = { id: 5, transport: 'http', upstream_port: 8080, upstream_protocol: 'http', listen_port: 443, server_name: 'shop.example.com' } as ProxyRule
    expect(confirmCopy({ scope: 'url', rule, url: 'https://shop.example.com/', service: '<web>' }, t)).toEqual({
      title: 'heading.hosting.containers.confirm.removeUrl.title',
      message: 'heading.hosting.containers.confirm.removeUrl.message:{"url":"<b>https://shop.example.com/</b>","port":8080,"service":"<b>&lt;web&gt;</b>"}',
      button: 'button.remove',
    })
  })

  it('has empty texts without a target', () => {
    expect(confirmCopy(null, t)).toEqual({ title: '', message: '', button: '' })
  })
})

describe('isGroupActing', () => {
  it('is false without a group, whatever is loading', () => {
    expect(isGroupActing({ 11: 'up' }, null)).toBe(false)
    expect(isGroupActing({ 11: 'up' }, null, 'up')).toBe(false)
  })

  it('reports any action of the group without an action argument, and only the named one with it', () => {
    expect(isGroupActing({ 11: 'pull' }, 11)).toBe(true)
    expect(isGroupActing({ 11: 'pull' }, 11, 'pull')).toBe(true)
    expect(isGroupActing({ 11: 'pull' }, 11, 'up')).toBe(false)
    expect(isGroupActing({ 11: undefined }, 11)).toBe(false)
    expect(isGroupActing({ 12: 'up' }, 11)).toBe(false)
  })
})
