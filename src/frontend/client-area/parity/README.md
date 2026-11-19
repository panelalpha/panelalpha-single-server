# Parity harness (F-01)

Renders one screen state in legacy (`../client-area`, deployed) and in next (local production build), answers every `/api/**` request of both apps from the same fixtures, and reports per state and variant: a diff PNG, a pixel-diff ratio, computed-style deltas, text deltas and a PASS / FAIL / ACCEPTED status. The parity gate of every migrated view is measured with it.

It is not part of the default checks (`type-check`, `lint`, `test`, `build`). It needs network access to the legacy host.

## Targets

Each state is measured against one deployed legacy, its **target**: `ParityState.target?: 'app' | 'lite'`, default `lite` (app-lite is the source of truth). `app` is explicit (spec loops carry `target: 'app'` until each view review moves its states) and is for what app-lite does not have. `app` is the multi-server client area (`../client-area`). `lite` is the app-lite single-server client area (`../../../app-lite/packages/client-area`, deployed on `$PARITY_LITE_URL`, self-signed TLS allowed, API on the same port). Next always runs from `vite preview`; the target only chooses the legacy origin and the fixtures, which both apps of the state are served.

A target brings its own origin, fixtures (`fixtures/` for app, `fixtures/lite/` for lite), build fingerprint, cache key and report evidence (`driver/targets.ts` is the registry). `tr(key, 'lite')` looks copy up in the lite translation. The route content under test belongs to a later slice, so lite shell states are measured on `/projects`, the default list route of single server.

## Commands

```bash
npm run parity                              # all states, report mode: exits 0 whenever capture succeeded
npm run parity -- --grep login-error        # one or a few states (regex on the state id)
npm run parity -- --project=light-desktop   # one variant
npm run parity:gate -- --grep <state>       # gate mode: exits non-zero when a variant is FAIL
npm run parity:quick -- --grep <state>      # gate mode, light-desktop only: the phase-1 check on base states
npm run parity:serve                        # build next and keep vite preview running, for PARITY_REUSE_SERVER=1
npm run parity:fixtures                     # refresh fixtures/home.json and fixtures/translation.en.json from the live API (app)
npm run parity:fixtures -- lite             # refresh fixtures/lite/{home,translation.en}.json from the app-lite host
npm test                                    # unit tests of parity/lib (comparator, pixel diff, exceptions, status)
```

A run builds next (`npm run build-only`) and serves it with `vite preview` on `http://localhost:4174` (`--strictPort`; a leftover server on 4174 fails the run — kill it first — unless `PARITY_REUSE_SERVER=1`). A full run takes tens of minutes (3 variants x 2 apps per state); with the legacy cache warm, about 2.5x less per state.

### Fast loop

Measured on 5 states in light-desktop (2026-10-06): about 71 s cold, about 52 s with the legacy cache warm, about 25 s with the cache warm and a reused server. One state takes about 4 s live and 1.6 s from the cache. The fixed cost of about 13 s (Playwright start, setup, teardown) stays.

- **Legacy cache (on by default).** Each legacy capture (screenshot, probe snapshots, fonts) is stored in `node_modules/.cache/parity-legacy/` of the main checkout, which all worktrees share. The key covers the deployed legacy build (hash of every chunk name in its `index.html`), Chromium version, state id, variant, the spec file and every shared harness file (`driver/`, `lib/`, `states/*.ts` other than specs, `@fontsource/nunito-sans`), plus the state's target: its URL, its build fingerprint and its fixture files (app: `fixtures/*`; lite: `fixtures/lite/*` and the shared images). A lite fixture refresh therefore never recaptures app. A change to any of them recaptures. A legacy redeploy invalidates everything; editing one `*.parity.ts` invalidates only its own states. When a target's `index.html` cannot be read, the cache is off for that target only, with a warning (an unreachable lite host leaves app cached). `report.md` says how many results took legacy from the cache; each `result.json` has `legacySource`.
- **Reused server.** `npm run parity:serve` (in the background), then `PARITY_REUSE_SERVER=1 npm run parity:quick -- --grep <state>` skips the build (about 15–35 s). The server serves the build it started with: restart it after every change in `src/`. Most useful while editing states, probes or exceptions.
- **Parity once, at the end.** `parity:quick` (light-desktop only) closes phase 1 on 1–2 base states (frame, chrome). Middle phases skip parity. The plan's last phase, "Parity", runs the full `parity:gate` (all variants) and makes the fixes.

Playwright needs Chromium (`npx playwright install chromium` if missing).

### Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `PARITY_LEGACY_URL` | unset (required for target `app`) | Deployed legacy client area (target `app`) |
| `PARITY_LEGACY_API_URL` | unset | API of the legacy `app` target, only for `npm run parity:fixtures` (e.g. `https://legacy.example.com:8443/api`) |
| `PARITY_LITE_URL` | unset (required for target `lite`) | Deployed app-lite client area (target `lite`) |
| `PARITY_CHANGE` | `parity-harness` | Change id; output goes to `parity/output/<PARITY_CHANGE>/` |
| `PARITY_OUT_DIR` | unset | Overrides the whole output directory (relative to the package) |
| `PARITY_NEXT_PORT` | `4174` | Port of the `vite preview` server for next (set a different one when another worktree already runs the harness) |
| `PARITY_GATE` | unset | `1` makes a FAIL status fail the test (what `parity:gate` and `parity:quick` set) |
| `PARITY_LEGACY_CACHE` | unset (on) | `refresh` recaptures legacy and overwrites the cache; `off` neither reads nor writes it |
| `PARITY_LEGACY_CACHE_DIR` | `<main checkout>/node_modules/.cache/parity-legacy` | Where the legacy cache lives |
| `PARITY_REUSE_SERVER` | unset | `1` uses a server already running on `PARITY_NEXT_PORT` (`parity:serve`) instead of building |

`PARITY_RUN_ID`, `PARITY_LEGACY_BUILD_APP` and `PARITY_LEGACY_BUILD_LITE` are set by the harness itself (global setup).

## Output

```
parity/output/<PARITY_CHANGE>/      (or $PARITY_OUT_DIR)
  <state>/<variant>/{legacy.png, next.png, diff.png, result.json}
  report.md          header (evidence), summary table, per-variant delta lists, "Stale" section
  report.json        same, machine-readable
  exceptions.json    optional, hand-written, read but never overwritten
```

Variants: `light-desktop` and `dark-desktop` (1440x900), `light-mobile` (375x812). The signed-in shell states (`states/shell.parity.ts`, and only those) also run in `dark-mobile` (375x812) and `light-tablet` (960x900, the 64 px app bar band): `playwright.config.ts` gives those two projects `testMatch: '**/shell.parity.ts'`, and the "No result this run" list in `report.md` expects 5 variants for that spec file and 3 for the others. The paragraph below about pairwise coverage still holds for every other screen. Theme comes from `/home` `app.theme.style.darkMode`, not from the browser. Theme and viewport are covered pairwise, so there is no `dark-mobile`: across 61 state runs (F-01, F-05, F-07) it never had a style delta that `dark-desktop` or `light-mobile` did not have too. A screen with mobile-only chrome (drawer, mobile app bar) is the case it would catch.

`report.md` lists only results of the current run in the summary and per-variant sections. Results left on disk by an earlier run (for example after `--grep`) go to the "Stale" section with their own commit and are never mixed into the numbers.

The header records the evidence for "deployed legacy = source", which cannot be proven from build metadata: per target used in the run (one block of `Legacy (<target>) …` lines, and `header.targets` in `report.json`): the URL, legacy chunk names parsed from the deployed `index.html`, the local legacy checkout commit and the bundle submodule pins (lite has two: `app-lite` in the bundle and `packages/client-area` inside app-lite); the summary table has a `Target` column; also loaded font files per app, Playwright and Chromium versions.

`<state>/<variant>/snapshots.json` holds the raw probe values of both apps (computed styles, box, text), so a value that is identical in both apps is not lost: `result.json` keeps only the deltas.

Each `result.json` has `pixelRatio`, both screenshot `sizes`, `homeCount` per app (information only), `styleDeltas[]` (`probe`, `property`, `legacy`, `next`), `textDeltas[]` (copy differences; informational, never fail), `status` and `exceptionsApplied[]`.

### Threshold and status

- Computed styles must be identical after colour normalisation; `x`, `y`, `width`, `height` pass within +-1 px (a missing element fails).
- Pixel diff <= 1 % of the padded screenshot area (pixelmatch `threshold: 0.1`, anti-aliasing ignored). Screenshots of different size are padded to the larger size, so a size difference counts as diff pixels. M-1 archives were measured at 0.5 %; `report.md` / `report.json` record the threshold of the run.
- `PASS`: nothing failing. `ACCEPTED`: every failing item is matched by an exception. `FAIL`: otherwise.

## Adding a state

States live in `parity/states/<feature>.parity.ts` (the file name must end in `.parity.ts`). A state is a `ParityState` (`parity/states/state.ts`):

| Field | Meaning |
| --- | --- |
| `id` | Folder name and test title (`login-error`). Used by `--grep` and by `exceptions.json` |
| `path` | Path and query both apps open, e.g. `/register/jane@example.com?new-site`. Every state is reached by driving the form against fixtures; no step has its own URL |
| `signedIn` | `true` for a state reached with a live session. Legacy treats a session as live only when `localStorage['<origin>-loggedin']` is set (and the `XSRF-TOKEN` cookie, which is always seeded), so the harness sets it in an init script before `goto`, in legacy only. Next derives the session from `/home` `user`, so the state's `home` must carry a `user` (the base fixture has none) |
| `localStorage` | Keys written to `localStorage` by an init script before each page loads, in both apps. A key may contain `{origin}`, replaced by the page's origin: `{origin}-redirect` is the key a sign-in reads to open the onboarding (`after-login`). The init script runs on every navigation, so the key is re-set on reload |
| `clock` | ISO time both apps see as "now". `page.clock.setFixedTime` runs before `goto` in both, so `moment().fromNow()` in legacy and its next port print the same text. Only `Date` is frozen; timers keep running. Set it in every state that shows relative time (notification list, trial box) |
| `expectHome` | `false` for a state in which legacy never reaches `GET /home` (a held request before it, a boot error): capture then skips the wait for `/home` to be served; the rest of stabilization is unchanged. Default `true` |
| `home` | Object deep-merged over `fixtures/home.json` (the `GET /home` body). Arrays are replaced, objects merged. `app.theme.style.darkMode` is set per variant by the harness |
| `handlers` | Fixtures keyed `'METHOD /path'` (without the `/api` prefix): `{ status?, json?, body?, headers? }`, `'hold'` (request stays pending on purpose, not counted as in flight, e.g. a spinner state) or a function `({ home }) => spec` for responses that must follow the variant's `/home` (a login success body needs the dark flag, otherwise the app flips theme). A key may also hold an array of those: the first request gets the first element, each next request the next one, the last element repeats (`[{ json: { use_password: true } }, 'hold']` answers the email step and then holds the password submit) |
| `pointer` | `'reset'` (default) moves the pointer to (0,0) and blurs the focused element before the screenshot. `'keep'` leaves both where the actions put them: use it for hover and focus states (the action does the hover and waits for the overlay it opens) |
| `actions` | `{ legacy: StateAction[], next: StateAction[] }`: Playwright steps after navigation (`(page) => Promise<void>`). DOM differs between the apps, so each has its own list; use a shared list where role/label locators work in both. End every list with a wait for what the step produced (`settled(locator)`), otherwise the anchor may be visible on the previous step |
| `probes` | Elements whose computed style and text are compared. The **first probe is the readiness anchor**: capture waits until it is visible |
| `masks` | `{ legacy, next }`: locators painted with one colour in the screenshot of both apps (use for values that change on their own: countdowns, spinners) |

Built-in fixtures (do not redefine): `GET /home`, `GET /<lng>/translation.json`, `GET /csrf-cookie` (204). `XSRF-TOKEN` is seeded as a cookie. Any other `/api/**` request that has no handler is **aborted and fails the test** ("Harness error: unmatched API requests ..."): add a handler for it, it means the app made a call you did not expect. A probe matching more than one element also throws; a probe for an element that a variant never renders (Add new on mobile, the FAB on desktop) takes `when: variant => …` and is skipped in the other variants, since an element missing in both apps is still reported as `missing`; narrow it with `.first()`, `.nth()` or a more specific locator.

Shared helpers for the session screens are in `parity/states/auth.ts` (`tr(key)` for fixture copy by legacy i18n key, `settled`, `submitEmail`, common probes). Copy for role/label locators comes from `fixtures/translation.en.json`, which both apps are served.

Minimal example:

```ts
export const loginError: ParityState = {
  id: 'login-error',
  path: '/login',
  handlers: { 'POST /login': { status: 422, json: { message: 'Invalid.', errors: { email: ['No match.'] } } } },
  actions: {
    legacy: [...submitEmail('button.logIn'), async page => { await settled(page.locator('.login-message--error')) }],
    next: [...submitEmail('button.logIn'), async page => { await settled(page.getByTestId('auth-error')) }],
  },
  probes: [
    { key: 'card', legacy: page => page.locator('.login-container .v-card'), next: page => page.getByTestId('auth-card') },
    { key: 'error', legacy: page => page.locator('.login-message--error'), next: page => page.getByTestId('auth-error') },
  ],
}
```

Register the state in the file's `states` array; the loop at the bottom of the file creates the test.

### Probes and locator policy

A `Probe` pairs a legacy locator with a next locator under one `key` (`{ key, legacy, next, part?, internal? }`); the report names deltas `key.property`.

- Locate by role / label / text first (`getByRole`, `getByLabel`, `getByText`). The copy is the fixture translation, so the same text works in both apps.
- Legacy has no `data-testid` and is never edited. When role/label offers no handle, use a legacy class or `name` (`.login-bottom-box`, `input[name=email]`).
- Next uses `getByTestId` only. Vocabulary (one id per role, reused across steps): `auth-card`, `auth-title`, `auth-error`, `auth-success`, `auth-warning`, `auth-field-email|password|password-confirm|code`, `auth-code-cells`, `auth-submit`, `auth-secondary`, `auth-remember`, `auth-forgot-link`, `auth-or-divider`, `auth-social-<provider>`, `auth-bottom-box`, `auth-bottom-link`, `auth-bottom-text`, `auth-recovery-code`, `auth-terms-link`, `auth-quick-card`, `terms-modal`, `language-activator`, `language-menu`, `not-found-card|title|info|illustration|home|logo|logo-image`. A new element in next gets an attribute-only `data-testid` in this style, following the `<component>-<element>` convention; add nothing else to `src/` for the harness.
- **Framework-internal exception.** Field box, label and outline, and the button loader wrapper `.v-btn__loader` (`getByTestId('auth-submit').locator('.v-btn__loader')`, the element legacy probes, not the kit `Loader` inside it), are rendered by Vuetify and cannot carry a `data-testid`. Anchor on the testid and reach the part below it (`getByTestId('auth-field-email').locator('.v-field')`), and in legacy use `.v-input__slot`. Mark such probes `internal: true` (and `part: 'box' | 'input'`). The same goes for a legacy-copied class below a testid anchor (`.login-message__title`). This exception exists for style probes only; do not copy CSS-class locators into behavioural E2E tests.
- Elements with different structure in the two apps (for example four code cells in legacy vs one code field in next) get separate probes, so the difference is reported as `missing` / style deltas, not as a harness error.
- Text deltas (`textDeltas`) compare `textContent`; copy differs until F-02 lands and never affects the status.

### Masks and determinism

Capture waits for: `GET /home` served, the anchor visible, `document.fonts.ready`, no fixture request in flight, images and fonts loaded, and two consecutive byte-identical screenshots (bounded retries, then a harness error). Transitions and animations are disabled in both apps; the pointer is moved to (0,0) and focus is blurred before the screenshot (unless the state sets `pointer: 'keep'`). There is no `waitForTimeout`.

What still moves must be masked: the 60 s resend countdown (mask the resend button) and the indeterminate progress circle (mask the spinner). Masked regions are painted with the same colour in both screenshots; probes still read the element, so a countdown text delta between apps can show up in `textDeltas` and is noise.

## Exceptions

`parity/output/<change>/exceptions.json` is an array of entries, written by hand for a delta that is accepted. Only `exceptions.json` and `report.md` of the output are tracked by git; screenshots and raw results are ignored:

```json
[
  {
    "state": "login-email",
    "variant": "*",
    "probe": "field-email",
    "property": "box-shadow",
    "reason": "Vuetify 4 outlined field has no shadow slot",
    "approvedBy": "name",
    "date": "2026-10-01"
  }
]
```

`state` and `variant` accept `*`; omit `probe` / `property` to match any. `property` is a computed-style name, `pixel` (pixel ratio above the threshold) or `missing` (element absent in one app). A `pixel` entry may set `maxRatio` (0–1, ratio, same unit as the threshold): a ratio above it stays FAIL, so an accepted pixel delta cannot hide a later regression. Prefer one entry per variant with `maxRatio` just above the measured value over `variant: "*"` without a cap. The harness reads this file and never writes it.

## Refreshing fixtures

`fixtures/home.json` and `fixtures/translation.en.json` (and `fixtures/lite/*`, from `npm run parity:fixtures -- lite`, which reads `$PARITY_LITE_URL/api`) are frozen copies of the live test API (`$PARITY_LEGACY_API_URL/home` and `.../en/translation.json`), so every run uses the same data. Refresh explicitly with `npm run parity:fixtures`; the script refuses a `/home` that is dark, has custom CSS/JS, an `admin` key or a reCAPTCHA site key. Re-run the baseline afterwards: a changed fixture changes the numbers.

## Host caveats

- **Legacy fonts are substituted on purpose.** Deployed legacy imports Nunito Sans from `fonts.googleapis.com` (`_fonts.scss:1`), and Google serves a different file set than the `@fontsource/nunito-sans` files next bundles (version, subset, hinting). Different files would leave residual pixel and metric deltas that look like style deltas. In the legacy browser context only, the harness answers the `fonts.googleapis.com/css2*` request with the `@font-face` rules of the same `@fontsource` sheets next loads (weights 200, 300, 400, 600, 700, 800, normal and italic, every subset with its `unicode-range`), serves the files from `node_modules` under `/__parity-fonts/` on the legacy origin and aborts every `fonts.gstatic.com` request. Weight 900 (legacy requests it, next does not) is left out, so both apps synthesize it from the same files. This is a deliberate step away from production legacy; the layout of text is compared, not the font delivery. The report header lists the font files each app loaded (taken from the finished font requests; the Resource Timing buffer is full of legacy's chunk prefetching and misses them), with the bundler content hash stripped from next's names. Both apps get the same fontsource files, but the loaded set follows content: a state loads only the weights and styles its text uses (e.g. `300-italic` only in legacy `login-recovery*`), and next also lists its icon font `materialdesignicons-webfont.woff2`.
- `navigator.clipboard.writeText` is replaced in both apps by a stub that resolves and stores the text on `window.__parityClipboard` (both origins are secure contexts, but a real write depends on the headless clipboard permission and user activation, so the result would not be deterministic). A state action reads it with `readParityClipboard(page)` (`states/auth.ts`) to assert what was copied.
- Deployed legacy is used as is. Hashed chunk names in the report header let you see whether it changed between two runs.
- Both apps are served over self-signed or plain HTTP; `ignoreHTTPSErrors` is on.
- **Gravatar never hits the network.** Both apps build avatar URLs protocol-relative (`//www.gravatar.com/avatar/<hash>?d=robohash&s=<size>`), so the request is https from legacy and http from next. Every context answers `^https?://www.gravatar.com/avatar/` with the one fixed image `fixtures/avatar.png` (a regex, not a glob, so the query string matches too).
- **`dns.google` and `rdap.org` never hit the network.** Both apps `fetch` them in the browser (DNS/SSL indicator of an instance card, email record dot, domain verification). Every context answers `https://dns.google/*` and `https://rdap.org/*` from the state's `external` map (`{ 'dns.google'?: Handler, 'rdap.org'?: Handler }`, same sequence rules as `handlers`), with `access-control-allow-origin: *`; a host the state does not mention answers "no record" (`{ Status: 3 }` / `{}`). The requests count as in-flight for capture. A card with a fresh detected certificate (`domain_ssl_details.detected_ssl_cert_checked_time` within the cache window) or without `host_ip_address` makes none of them.
- **The legacy file-manager iframe never loads the real `/fm/` app.** Legacy `/hosting/file-manager` embeds `<origin>/fm/?id=<account>` (`views/hosting/FileManager.vue:47-53`); the fm app would boot and call `/api/file-manager/*`, which no state answers. Every context answers `/fm/` (regex `/\/fm\/(?:\?|$)/`, registered in `installFixtures` before `goto`, counted in-flight) with a fixed blank page (`<div id="fm"></div>`), so the iframe box stays measurable and its pixels stable. Next renders a native file manager there instead (S-37), so the file-manager states mask the box in both apps. The route lives in `driver/`, so adding it recaptured the legacy cache of every state once.
- **Binary bodies.** `FulfillSpec.body` is `string | Buffer`; give a `content-type` header with it (instance screenshots: `GET /instances/{id}/screenshot.jpg` answers `fixtures/screenshot.png`, the handler key is the path without the query).
- Signed-in states run on fixtures (`signedIn` above), not on a test account. The app-lite host is covered by the `lite` target.
