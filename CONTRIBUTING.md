# Contributing to PanelAlpha Single Server Edition

Thank you for taking the time to contribute. A bug report or a change to the code is welcome.

This guide takes you from a clean checkout to a pull request that is easy to review.

**Found a security issue?** Do not open a public issue. Follow [`SECURITY.md`](SECURITY.md) and report it privately.

## Ways to contribute

- **Report a bug.** Open an issue with the steps to reproduce, what you expected and what you saw, and the Engine version (`pae system:version`).
- **Suggest an idea.** Open an issue that describes the problem you want solved, not only the solution.
- **Fix a bug or build a feature.** Follow the steps below.

## Project layout

| Path | What lives here |
|---|---|
| [`src/backend/`](src/backend/) | The Laravel 13 host app: sign-in and accounts, settings, notifications, CLI commands, the test suite and the static analysis rules. |
| [`src/packages/client-area/`](src/packages/client-area/) | The Client Area API: every project route, the project list and its sync with the Engine. |
| [`src/packages/community/`](src/packages/community/) | What only Single Server Community has: the setup wizard, the Tasks and Settings pages and the PanelAlpha Hub connection. |
| [`src/packages/engine-client/`](src/packages/engine-client/) | The client for the Engine API. Every Engine path lives here. |
| [`src/packages/hub/`](src/packages/hub/) | The PanelAlpha Hub protocol: pairing, signed reports and login tickets. |
| [`src/frontend/client-area/`](src/frontend/client-area/) | The Client Area web interface (Vue 3, Vite, TypeScript), built into the image. |
| [`Dockerfile`](Dockerfile), [`src/entrypoint.sh`](src/entrypoint.sh), [`src/config/`](src/config/) | The image, its start script and the nginx and supervisor configuration. |
| [`.panelalpha/`](.panelalpha/) | The app configuration the Engine reads when it deploys the panel. |

The paid editions (Plus and Pro) are built from private repositories and are not part of this one. Without them this repository builds and tests Single Server Community.

## Before you start

You need Git and Docker. PHP and Composer run in containers: the image uses PHP 8.5, and `composer.lock` needs PHP 8.4 or later.

## Running the panel locally

Build the Client Area once, then start the development container. It mounts your checkout, so a code change needs only a restart. Then connect it to an Engine and create your user:

```bash
(cd src/frontend/client-area && npm ci && npm run build-only)
cd app && docker compose up -d --build                  # http://localhost:9080
docker compose exec -u www-data panel php artisan settings:set engine-api-url https://<engine>:2011/api
docker compose exec -u www-data panel php artisan settings:set engine-api-token <token>
docker compose exec -u www-data panel php artisan users:create you@example.com
```

## Running the tests

Run these from the repository root. Every change keeps both green:

```bash
docker run --rm -u $(id -u):$(id -g) -v $PWD:/w -w /w/src/backend composer:2 composer install
docker run --rm -u $(id -u):$(id -g) -v $PWD:/w -w /w/src/backend composer:2 composer analyse
docker run --rm -u $(id -u):$(id -g) -v $PWD:/w -w /w/src/backend composer:2 php artisan test
```

`composer analyse` runs PHPStan and Psalm. There is no baseline, so the analysis must report nothing. The test suite must pass with no incomplete tests.

If you change the image, its configuration or `src/entrypoint.sh`, also run the container checks. They build the image:

```bash
bash src/backend/scripts/check-container-config.sh
bash src/backend/scripts/check-container-prod.sh
```

## Making your change

1. **Branch** off `master` with a short descriptive name, for example `fix/backup-restore-label` or `feat/connect-ai-steps`.
2. **Keep it focused.** A small pull request with one purpose is reviewed and merged faster.
3. **Write a test** where it makes sense, and run the suite.

A changed endpoint must still answer in the shape the Client Area expects.

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: show the PHP version on the project card
fix: keep the backup schedule when the store changes
docs: describe the Connect AI steps
chore: bump dev dependencies
```

Common types are `feat`, `fix`, `docs`, `chore`, `refactor` and `test`. Reference an issue where it applies, for example `#123`.

## Opening a pull request

- Give it a clear title and say **what** changed and **why**.
- Link the related issue.
- Say how you checked it: the commands you ran and what they reported.
- Keep the description up to date if the change moves during review.

We review as soon as we can. Expect some back and forth.

## Questions

Stuck, or want to talk an idea through before you build it? Ask on [Discord](https://discord.gg/9twHWR7xGX) or in the [community forum](https://community.panelalpha.com/).
