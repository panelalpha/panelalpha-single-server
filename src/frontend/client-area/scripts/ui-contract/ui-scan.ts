// `npm run ui:scan -- <files|directories> [--fail]`: prints every UI contract hit and the counts (change `ui-guard`, F-14).
// Measurement for the pre-audit of a slice: exit 0 always, `--fail` exits 1 when hits exist, no arguments exit 2.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { formatFileSummary, formatHit, formatTotal, scanText, sourceFiles } from './ui-contract.ts'

const args = process.argv.slice(2)
const fail = args.includes('--fail')
const targets = args.filter(arg => arg !== '--fail')

function scan (): void {
  if (targets.length === 0) {
    console.error('Usage: npm run ui:scan -- <file|directory>... [--fail]\n'
      + 'Categories: hex, fn, inline-style, mdi, important (outside styles/legacy).\n'
      + 'Output: file:line: category: text, then file: N (...) per file and SUMA: N. Exit 0; --fail exits 1 on hits; a missing path exits 2.')
    process.exitCode = 2
    return
  }
  let total = 0
  for (const target of targets) {
    if (!existsSync(target)) {
      console.error(`ui:scan: no such file or directory: ${target}`)
      process.exitCode = 2
      return
    }
    const isDirectory = statSync(target).isDirectory()
    for (const file of isDirectory ? sourceFiles(target) : [target]) {
      const hits = scanText(readFileSync(file, 'utf8'), { file })
      for (const hit of hits) {
        console.log(formatHit(file, hit))
      }
      if (hits.length > 0 || !isDirectory) {
        console.log(formatFileSummary(file, hits))
      }
      total += hits.length
    }
  }
  console.log(formatTotal(total))
  process.exitCode = fail && total > 0 ? 1 : 0
}

scan()
