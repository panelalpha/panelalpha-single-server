// @vitest-environment node
import { resolve } from 'node:path'
import postcss, { type AtRule, type Rule } from 'postcss'
import { compile } from 'sass-embedded'
import { describe, expect, it } from 'vitest'

const root = postcss.parse(compile(resolve(__dirname, 'reset.scss')).css)
const CONTEXT = ':is(.v-application, .v-overlay-container)'

const resetLayers = root.nodes.filter((node): node is AtRule => node.type === 'atrule' && node.name === 'layer')
const unlayeredRules = root.nodes.filter((node): node is Rule => node.type === 'rule')

function selectorsOf (nodes: Array<AtRule | Rule>): string[] {
  const selectors: string[] = []
  for (const node of nodes) {
    node.walkRules(rule => {
      selectors.push(...rule.selectors)
    })
  }
  return selectors
}

describe('reset.scss', () => {
  it('puts the V2 reset in vuetify-core.reset', () => {
    expect(resetLayers.map(layer => layer.params)).toEqual(['vuetify-core.reset'])
    const selectors = selectorsOf(resetLayers)
    expect(selectors).toContain('*')
    expect(selectors).toContain('html')
    expect(selectors).toContain('select')
  })

  it('zeroes margin and padding of every element in the layer', () => {
    const star = resetLayers[0].nodes.find((node): node is Rule => node.type === 'rule' && node.selector === '*')
    const declarations = Object.fromEntries(star?.nodes.map(node => [(node as postcss.Declaration).prop, (node as postcss.Declaration).value]) ?? [])
    expect(declarations).toEqual({ padding: '0', margin: '0' })
  })

  it('keeps the vertical scrollbar of V2 on html', () => {
    const html = resetLayers[0].nodes.find((node): node is Rule => node.type === 'rule' && node.selector === 'html')
    expect(html?.toString()).toContain('overflow-y: scroll')
  })

  it('has no unlayered universal selector', () => {
    expect(selectorsOf(unlayeredRules)).not.toContain('*')
  })

  it('keeps the V2 element rules outside a layer, covering overlays', () => {
    const selectors = unlayeredRules.map(rule => rule.selector)
    expect(selectors).toEqual([
      `${CONTEXT} p`,
      `${CONTEXT} :is(ul, ol)`,
      `${CONTEXT} .v-pagination__list`,
    ])
  })

  it('sets 16px under p, 24px for lists and no padding for the pagination list', () => {
    const byClass = Object.fromEntries(unlayeredRules.map(rule => [rule.selector, rule.toString()]))
    expect(byClass[`${CONTEXT} p`]).toContain('margin-bottom: 16px')
    expect(byClass[`${CONTEXT} :is(ul, ol)`]).toContain('padding-left: 24px')
    expect(byClass[`${CONTEXT} .v-pagination__list`]).toContain('padding-left: 0')
  })
})
