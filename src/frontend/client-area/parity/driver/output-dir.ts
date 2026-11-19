import { resolve } from 'node:path'

/**
 * Output directory of one parity run: `PARITY_OUT_DIR`, or `parity/output/<PARITY_CHANGE>` (default change `parity-harness`).
 * Screenshots and raw results there are git-ignored; `exceptions.json` and `report.md` are tracked.
 */
export function parityOutputDir (env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string {
  return env.PARITY_OUT_DIR
    ? resolve(cwd, env.PARITY_OUT_DIR)
    : resolve(cwd, 'parity/output', env.PARITY_CHANGE ?? 'parity-harness')
}
