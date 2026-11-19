<?php

namespace Tests\Feature\Docs;

/**
 * Uncited Engine stubs per test file, keyed by normalised stub text. The counts
 * are the `ea7c307` offender set pruned to the stubs still uncited at a later
 * rescan, and may only shrink:
 * {@see EngineCitationGuardTest} fails when a file gains an uncited stub and
 * when a file loses one without its entry here being lowered. Regenerate from
 * the `ea7c307` tree with `scripts/generate-citation-baseline.php`, then prune
 * the entries that have since been cited.
 */
final class EngineCitationBaseline
{
    /** @var array<string, array<string, positive-int>> */
    public const OFFENDERS = [
  'tests/Feature/ClientArea/EngineClientStreamingTest.php' => 
  array (
    '\'engine.example.com/api/tasks/55*\' => Http::response([\'data\' => [' => 1,
    'Http::fake([\'*\' => Http::response([\'message\' => \'Not found\'], 404)]);' => 1,
    'Http::fake([\'engine.example.com/api/projects/site1/files/download*\' => Http::response(\'tail-of-log\', 200)]);' => 1,
    'Http::fake([\'engine.example.com/api/projects/site1/files/upload*\' => Http::response([\'success\' => true])]);' => 1,
    'Http::fake([\'engine.example.com/api/tasks/7/logs/stream*\' => Http::response($ndjson, 200)]);' => 1,
  ),
  'tests/Feature/ClientArea/EngineClientTest.php' => 
  array (
    '->push([\'message\' => \'Deploy already running\', \'task_id\' => 7], 409)' => 1,
    '->push([\'message\' => \'boom\'], 500);' => 1,
    'Http::fake([\'*\' => Http::response([' => 1,
    'Http::fake([\'engine.example.com/api/projects/site1\' => Http::response([\'data\' => [\'username\' => \'site1\']])]);' => 1,
    'Http::fakeSequence()' => 1,
  ),
  'tests/Feature/ClientArea/EngineFixtures.php' => 
  array (
    'Http::fake([\'engine.example.com/api/projects/all*\' => Http::response([\'data\' => [' => 1,
  ),
];
}
