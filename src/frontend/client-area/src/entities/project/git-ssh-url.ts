// SSH repo address (`git@host:path` or `ssh://…`) shared by the onboarding git form and the instance git page. It lives here
// so that `views/projects/project` does not import from `views/onboarding`.

const SCP_URL = /^[\w.-]+@([^:/\s]+):(?!\/\/)(.+)$/
const SSH_URL = /^ssh:\/\/(?:[^@/\s]+@)?([^/:\s]+)(?::\d+)?\/(.+)$/i

/** Host (lower case) and path (no leading or trailing slashes, no `.git`) of an SSH repo address, `null` for any other address. */
export function parseSshRepoUrl (url: string | null | undefined): { host: string, path: string } | null {
  const value = String(url || '').trim()
  const match = value.match(SSH_URL) || value.match(SCP_URL)
  if (!match) {
    return null
  }
  const path = match[2].replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.git$/i, '')
  return { host: match[1].toLowerCase(), path }
}

/** An SSH repo address (`git@host:path` or `ssh://…`). */
export function isSshRepoUrl (url: string | null | undefined): boolean {
  return parseSshRepoUrl(url) !== null
}
