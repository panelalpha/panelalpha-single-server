// `psl` ships its types but its `exports` map hides them from `moduleResolution: bundler`; only `parse` is used.
declare module 'psl' {
  export interface ParsedDomain {
    input: string
    tld: string | null
    sld: string | null
    domain: string | null
    subdomain: string | null
    listed: boolean
  }

  export interface ErrorResult {
    input: string
    error: { code: string, message: string }
  }

  export function parse (input: string): ParsedDomain | ErrorResult

  const psl: { parse: typeof parse }
  export default psl
}
