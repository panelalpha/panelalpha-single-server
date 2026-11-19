# client-area-next

The new PanelAlpha client area: Vue 3, Vuetify 4, TypeScript, Vite, Pinia. It replaces the legacy Vue 2 client areas
(multi-server `app` and single-server `app-lite`) view by view; the legacy apps are the reference for look, copy and behaviour.

## Requirements

- Node `24.21.0` (`.nvmrc`), npm
- Docker, for the dev server script
- Chromium for Playwright, only for e2e and parity: `npx playwright install chromium`

## Getting started

```bash
npm ci
cp .env.dev.example .env.dev   # fill DEV_HOST, API_HOST (or API_PROXY), ports
./docker-npm-dev.sh            # Vite dev server over HTTPS in node:24
```

The dev host must be a subdomain of the API host (Sanctum session cookies), so do not use `localhost` against a live API.
`API_PROXY` lets Vite proxy `/api` and `/ws` to a panel whose CORS does not allow credentials.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run type-check` | `vue-tsc --build` |
| `npm run lint` | ESLint (including import-direction rules between layers) |
| `npm test` | Vitest: unit and component tests, UI contract (`scripts/ui-contract`), architecture boundaries (`scripts/arch-boundaries`), parity harness libs |
| `npm run build` | type-check and production build to `dist/` |
| `npm run e2e` | Playwright e2e against a local build with a fake backend (`e2e/support/`), including `toHaveScreenshot` baselines |
| `npm run ui:scan -- <files>` | lists colour literals that should be design tokens |
| `npm run parity`, `parity:gate`, `parity:quick` | visual and computed-style comparison with the deployed legacy (see below) |

Before merging: `type-check`, `lint`, `test`, `build`.

## Layout

```
src/app        boot, router, signed-in shell, global styles and theme
src/views      screens, one directory per route group (auth, projects, hosting, account, reseller, ...)
src/entities   domain: API, models and small components of one entity (project, domain, ssl, service, ...)
src/shared     no domain knowledge: HTTP client, session, formatting, UI kit (src/shared/ui)
e2e/           Playwright e2e tests and screenshot baselines
parity/        parity harness: states, fixtures, driver, report
scripts/       UI contract and architecture boundary checks
```

Layers import only downwards: `app -> views -> entities -> shared`, view groups do not import each other, and imports use
the `@/` alias (enforced by ESLint and `scripts/arch-boundaries`).

## Parity harness

`parity/` renders the same screen state in the deployed legacy client area and in a local build of next, serves both from
the same fixtures and reports pixel and computed-style differences. It needs network access to a deployed legacy:

```bash
export PARITY_LITE_URL=https://<app-lite panel>      # target lite (default)
export PARITY_LEGACY_URL=https://<legacy client area> # target app
PARITY_CHANGE=<change-id> npm run parity:gate -- --grep <state>
```

Output goes to `parity/output/<change-id>/`; only `exceptions.json` and `report.md` there are tracked by git. Details:
[`parity/README.md`](parity/README.md).
