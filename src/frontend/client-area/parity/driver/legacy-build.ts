import { request } from 'node:https'

/** Deployed legacy `index.html`; self-signed TLS is accepted for this request only. */
function fetchText (url: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const req = request(url, { rejectUnauthorized: false }, response => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', chunk => (body += chunk))
      response.on('end', () => resolvePromise(body))
    })
    req.on('error', reject)
    req.setTimeout(15_000, () => req.destroy(new Error('timeout')))
    req.end()
  })
}

/** Every hashed js/css file the deployed legacy `index.html` references (it prefetches all route chunks). Throws when legacy is unreachable. */
export async function legacyAssets (url: string): Promise<string[]> {
  const html = await fetchText(`${url}/`)
  return [...new Set([...html.matchAll(/(?:js|css)\/[\w-]+\.[\da-f]+\.(?:js|css)/g)].map(match => match[0]))].toSorted()
}

/** The app and login chunks, as evidence in the report header. */
export async function legacyChunks (url: string): Promise<string[]> {
  try {
    return (await legacyAssets(url)).filter(name => /^(?:js\/app\.[\w-]+\.js|js\/login\.[\w-]+\.js|css\/login\.[\w-]+\.css)$/.test(name))
  } catch (error) {
    return [`unavailable (${error instanceof Error ? error.message : String(error)})`]
  }
}
