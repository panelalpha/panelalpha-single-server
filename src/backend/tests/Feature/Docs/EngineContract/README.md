# Engine contract guard

`openapi-2.3.0.json` is the OpenAPI document of PanelAlpha Engine 2.3.0.

- Source: `core/` of the Engine repo, branch `origin/develop-2-3-0`, commit `d97b3d3aa114be4930e6c5151718534945497a0f` (2026-11-09); the
  `default` field of `BackupContainer` was taken from the Engine's `BackupContainerSchema` at `a389b0eb8` (the default store of
  an install) and the rest of the document is the commit above.
- Made with: `php artisan l5-swagger:generate` (l5-swagger from the Engine `composer.lock`, PHP 8.5 in the test image), then re-printed with `json.dumps(indent=1)`.
- Refresh: generate the document in a checkout of the Engine repo (see "Made with"), copy it here, update the commit above and run `vendor/bin/phpunit tests/Feature/Docs/EngineContract`.

`EngineContractTest` checks the Engine answers the tests fake against this document: the status of the answer, and the body (fields, types, required fields, enums). A field the document does not list is a difference.

- What is checked: the answers built by `EngineFixtures` (`engineProject`, `engineUsage`, ...) and every `Http::fake` entry in `tests/` whose Engine path and body can be worked out from the source. Entries with only `*` as key, or with a body built from a variable, are counted as not checkable.
- Known differences are in `known-gaps.php`, each with a reason and a category: `fake-outdated` (the fake is wrong, fix the fake), `spec-gap` (the document is incomplete, fix the Engine annotation), `intended` (the panel fakes a shape Engine does not send on purpose).
- The test fails on a new difference, and on a known-gaps entry that no longer happens.
