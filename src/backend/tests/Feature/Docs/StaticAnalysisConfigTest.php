<?php

namespace Tests\Feature\Docs;

use PanelAlpha\ClientArea\Contracts\PanelUser;
use PHPStan\DependencyInjection\NeonAdapter;
use Symfony\Component\Process\Process;
use Tests\TestCase;

/**
 * The static-analysis setup is an artefact of this repository, so
 * it is pinned by a test, not by convention. Each assertion here is the test
 * for one requirement: the two dev dependencies, the two configs and their
 * coverage, the three composer scripts, and the "no baseline file" rule.
 *
 * The guards go further: both analysers cover the same roots, `phpstan.neon`
 * treats docblock types as uncertain and cannot gain `ignoreErrors` or
 * `excludePaths` or lose level 9, the Psalm `issueHandlers` list is pinned, the
 * inline suppression budget stays 0, and the configured user model implements
 * {@see PanelUser}. Every guard has a bypass-shaped self-test.
 *
 * The PHPStan assertions read the **effective** parameters
 * from `phpstan dump-parameters --json` (level, `ignoreErrors`, `excludePaths`,
 * `stubFiles`, `includes:` files) and parses `psalm.xml` as DOM for the root
 * `errorLevel`, the single `<issueHandlers>` section and the exact
 * `<ignoreFiles>` list; the suppression regex also covers `@psalm-ignore-*` and
 * `@phpstan-ignore*`.
 *
 * The analysers themselves are the test for "zero errors": they run in the
 * pre-commit routine and their exit codes gate every commit.
 */
class StaticAnalysisConfigTest extends TestCase
{
    /** PHPStan runs at level 9 (level 8 was the first requirement). */
    private const PHPSTAN_LEVEL = 9;

    /** Psalm runs at errorLevel 1, the strictest (errorLevel 3 was the first requirement). */
    private const PSALM_ERROR_LEVEL = 1;

    /** The exact `issueHandlers` list psalm.xml may carry. */
    private const PSALM_ISSUE_HANDLERS = [
        'ClassMustBeFinal' => 'info',
        'ImplicitToStringCast' => 'info',
        'MissingClosureReturnType' => 'info',
        'MissingImmutableAnnotation' => 'info',
        'MissingOverrideAttribute' => 'info',
        'RedundantCast' => 'info',
        'RedundantCondition' => 'info',
        'UnnecessaryVarAnnotation' => 'suppress',
    ];

    /** Inline `@phpstan-ignore` / `@psalm-suppress` the analysed roots may carry. */
    private const SUPPRESSION_BUDGET = 0;

    /** The one project rule phpstan.neon may carry. */
    private const PHPSTAN_RULES = [self::PHPSTAN_RULE, self::PHPSTAN_DIRECTION_RULE];

    /**
     * The real rule FQCN. Every self-test fixture spells it exactly, so a
     * bypass fixture is flagged for its own shape and not for a wrong rule
     * name.
     */
    private const PHPSTAN_RULE = 'PanelAlpha\StaticAnalysis\ApplicationQueryRule';

    /** The package-direction rule. */
    private const PHPSTAN_DIRECTION_RULE = 'PanelAlpha\StaticAnalysis\PackageDirectionRule';

    /** The only top-level keys phpstan.neon may carry. */
    private const PHPSTAN_TOP_LEVEL_KEYS = ['includes', 'parameters', 'rules'];

    /** The only Psalm plugin psalm.xml may carry. */
    private const PSALM_PLUGINS = ['Psalm\LaravelPlugin\Plugin'];

    /** The XInclude namespace psalm.xml must not use. */
    private const XINCLUDE_NS = 'http://www.w3.org/2001/XInclude';

    /** The roots both analysers must cover, exactly, without duplicates. */
    private const ROOTS = [
        'app',
        '../packages/engine-client/src',
        '../packages/hub/src',
        '../packages/client-area/src',
        '../packages/community/src',
        'bootstrap',
        'config',
        'database',
        'routes',
        'public/index.php',
        'artisan',
    ];

    public function test_larastan_is_a_dev_requirement(): void
    {
        $requireDev = $this->composer()['require-dev'];

        $this->assertArrayHasKey('larastan/larastan', $requireDev, 'larastan/larastan must stay a dev dependency.');
        $this->assertFileExists(base_path('vendor/bin/phpstan'), 'Larastan must be installed (composer install).');
    }

    public function test_psalm_and_its_laravel_plugin_are_dev_requirements(): void
    {
        $requireDev = $this->composer()['require-dev'];

        $this->assertArrayHasKey('vimeo/psalm', $requireDev, 'vimeo/psalm must stay a dev dependency.');
        $this->assertArrayHasKey('psalm/plugin-laravel', $requireDev, 'The Laravel plugin is supported on Laravel 13 and must stay a dev dependency.');
        $this->assertFileExists(base_path('vendor/bin/psalm'));
    }

    public function test_phpstan_config_covers_the_package_sources_at_level_9(): void
    {
        $config = (string) file_get_contents(base_path('phpstan.neon'));

        $this->assertStringContainsString('vendor/larastan/larastan/extension.neon', $config);
        $this->assertMatchesRegularExpression('/^\s*level:\s*'.self::PHPSTAN_LEVEL.'\s*$/m', $config, 'PHPStan must run at level 9.');

        foreach ($this->sources() as $path) {
            $this->assertStringContainsString('- '.$path."\n", $config, "phpstan.neon must analyse {$path}.");
        }

        $this->assertStringNotContainsString('baseline', strtolower($this->withoutComments($config, '#')), 'PHPStan runs without a baseline file.');
    }

    public function test_psalm_config_covers_the_package_sources_at_error_level_1(): void
    {
        $config = (string) file_get_contents(base_path('psalm.xml'));

        $this->assertMatchesRegularExpression('/errorLevel="'.self::PSALM_ERROR_LEVEL.'"/', $config, 'Psalm must run at errorLevel '.self::PSALM_ERROR_LEVEL.'.');

        foreach ($this->sources() as $path) {
            $this->assertMatchesRegularExpression(
                '/<directory name="'.preg_quote($path, '/').'"\s*\/>/',
                $config,
                "psalm.xml must analyse {$path}.",
            );
        }

        $this->assertStringContainsString('Psalm\LaravelPlugin\Plugin', $config, 'The Laravel-aware Psalm plugin is enabled.');
        $this->assertStringNotContainsString('baseline', strtolower($this->withoutComments($config, '<!--')), 'Psalm runs without a baseline file.');
    }

    public function test_the_analyse_scripts_exist(): void
    {
        $scripts = $this->composer()['scripts'];

        $this->assertSame('php vendor/bin/phpstan analyse --memory-limit=2G --no-progress', $scripts['analyse:phpstan'] ?? null);
        $this->assertSame('php vendor/bin/psalm --no-cache', $scripts['analyse:psalm'] ?? null);
        $this->assertSame(['@analyse:phpstan', '@analyse:psalm'], $scripts['analyse'] ?? null);
    }

    public function test_phpunit_fails_on_risky_tests(): void
    {
        $phpunit = (string) file_get_contents(base_path('phpunit.xml'));

        $this->assertStringContainsString(
            'failOnRisky="true"',
            $phpunit,
            'PHPUnit must fail on a risky test, so a lost error-handler flush cannot slip through.',
        );
    }

    public function test_no_analysis_baseline_files_are_committed(): void
    {
        foreach (['phpstan-baseline.neon', 'psalm-baseline.xml', 'psalm-baseline.php'] as $file) {
            $this->assertFileDoesNotExist(base_path($file), "A {$file} baseline is forbidden.");
        }
    }

    public function test_phpstan_treats_docblock_types_as_uncertain(): void
    {
        $config = $this->withoutComments((string) file_get_contents(base_path('phpstan.neon')), '#');

        $this->assertMatchesRegularExpression(
            '/^\s*treatPhpDocTypesAsCertain\s*:\s*false\s*$/m',
            $config,
            'With docblock types uncertain, a runtime guard on Engine data is never "dead code".',
        );
    }

    public function test_phpstan_config_cannot_be_weakened(): void
    {
        $config = (string) file_get_contents(base_path('phpstan.neon'));

        $this->assertSame(
            [],
            $this->phpstanWeaknesses($config, self::PHPSTAN_LEVEL),
            'PHPStan must stay at level '.self::PHPSTAN_LEVEL.' with no ignoreErrors and no excludePaths.',
        );
    }

    public function test_the_phpstan_weakening_guard_catches_each_bypass(): void
    {
        $bypasses = [
            "parameters:\n    level: 8\n    ignoreErrors:\n        - '#foo#'\n" => 'ignoreErrors',
            "parameters:\n    level: 8\n    excludePaths:\n        - app/Foo.php\n" => 'excludePaths',
            "parameters:\n    level: 5\n" => 'lowered level',
            "parameters:\n    paths:\n        - app\n" => 'missing level',
        ];

        foreach ($bypasses as $neon => $what) {
            $this->assertNotSame([], $this->phpstanWeaknesses($neon, self::PHPSTAN_LEVEL), "The guard must catch a {$what} bypass.");
        }
    }

    /**
     * The raw `phpstan.neon` text can be bypassed through an
     * `includes:` file, so the guard must assert the **effective** parameters
     * `phpstan dump-parameters --json` prints.
     */
    public function test_the_effective_phpstan_config_cannot_be_weakened(): void
    {
        $this->assertSame(
            [],
            $this->phpstanParameterViolations($this->effectivePhpstanParameters()),
            'The effective PHPStan parameters must stay at level '.self::PHPSTAN_LEVEL.' with no ignoreErrors, no excludePaths, no extra stubFiles and only the Larastan include.',
        );
    }

    /**
     * One bypass fixture per effective-parameter hole (B1-B5), so the guard
     * cannot silently lose a check.
     */
    public function test_the_effective_phpstan_config_guard_catches_each_bypass(): void
    {
        $base = [
            'level' => self::PHPSTAN_LEVEL,
            'ignoreErrors' => [],
            'excludePaths' => ['analyseAndScan' => [], 'analyse' => []],
            'stubFiles' => ['phar:///app/backend/vendor/phpstan/phpstan.phar/stubs/core.stub'],
            'allConfigFiles' => [
                'phar:///app/backend/vendor/phpstan/phpstan.phar/conf/config.level8.neon',
                base_path('phpstan.neon'),
                base_path('vendor/larastan/larastan/extension.neon'),
            ],
        ];

        $this->assertSame([], $this->phpstanParameterViolations($base), 'The clean fixture must pass.');

        $larastan = base_path('vendor/larastan/larastan/extension.neon');
        $bypasses = [
            'B1 an includes file adds excludePaths' => array_merge($base, ['excludePaths' => ['analyseAndScan' => [], 'analyse' => [base_path('app/Foo.php')]]]),
            'B2 ignoreErrors' => array_merge($base, ['ignoreErrors' => [['message' => '#foo#']]]),
            'B3 a lowered level' => array_merge($base, ['level' => 5]),
            'B4 an extra stubFile' => array_merge($base, ['stubFiles' => array_merge($base['stubFiles'], [base_path('app/stub.php')])]),
            'B5 an extra includes file' => array_merge($base, ['allConfigFiles' => array_merge($base['allConfigFiles'], [base_path('extra.neon')])]),
            'E10 the Larastan include is missing' => array_merge($base, ['allConfigFiles' => array_values(array_filter($base['allConfigFiles'], static fn (string $file): bool => $file !== base_path('vendor/larastan/larastan/extension.neon')))]),
            'E11 a suffix-matched Larastan include' => array_merge($base, ['allConfigFiles' => array_merge($base['allConfigFiles'], ['/tmp/evil/vendor/larastan/larastan/extension.neon'])]),
            'E11b a suffix-matched phpstan.neon' => array_merge($base, ['allConfigFiles' => array_merge($base['allConfigFiles'], ['/tmp/evil/phpstan.neon'])]),
            'E11c the real path replaced by a suffix twin' => array_merge($base, ['allConfigFiles' => array_values(array_map(
                static fn (string $file): string => $file === $larastan ? '/tmp/evil/vendor/larastan/larastan/extension.neon' : $file,
                $base['allConfigFiles'],
            ))]),
        ];

        foreach ($bypasses as $what => $parameters) {
            $this->assertNotSame([], $this->phpstanParameterViolations($parameters), "The effective-config guard must catch {$what}.");
        }
    }

    public function test_both_analysers_cover_the_same_roots(): void
    {
        $expected = self::ROOTS;
        sort($expected);

        $phpstan = $this->phpstanPaths((string) file_get_contents(base_path('phpstan.neon')));
        $psalm = $this->psalmPaths((string) file_get_contents(base_path('psalm.xml')));

        $this->assertSame(count($phpstan), count(array_unique($phpstan)), 'phpstan.neon must not list a path twice.');
        $this->assertSame(count($psalm), count(array_unique($psalm)), 'psalm.xml must not list a path twice.');

        $phpstanSorted = $phpstan;
        sort($phpstanSorted);
        $psalmSorted = $psalm;
        sort($psalmSorted);

        $this->assertSame($expected, $phpstanSorted, 'phpstan.neon must cover exactly the canonical roots.');
        $this->assertSame($expected, $psalmSorted, 'psalm.xml must cover exactly the canonical roots.');
    }

    public function test_psalm_issue_handlers_are_pinned(): void
    {
        $this->assertSame(
            [],
            $this->psalmIssueHandlerViolations((string) file_get_contents(base_path('psalm.xml')), self::PSALM_ISSUE_HANDLERS),
            'The psalm.xml issueHandlers list is pinned; a new handler or a changed level fails here.',
        );
    }

    public function test_the_issue_handler_guard_catches_each_bypass(): void
    {
        $fixture = '<psalm><issueHandlers><RedundantCondition errorLevel="info"/><SneakyLeak errorLevel="error"/></issueHandlers></psalm>';
        $violations = $this->psalmIssueHandlerViolations($fixture, ['RedundantCondition' => 'info']);
        $this->assertNotSame([], $violations, 'The guard must catch a new issueHandler.');

        $relaxed = '<psalm><issueHandlers><RedundantCondition errorLevel="suppress"/></issueHandlers></psalm>';
        $violations = $this->psalmIssueHandlerViolations($relaxed, ['RedundantCondition' => 'info']);
        $this->assertNotSame([], $violations, 'The guard must catch a relaxed issueHandler level.');

        // A handler removed from psalm.xml must be caught too – the pinned list
        // is exact in both directions.
        $missing = '<psalm><issueHandlers><RedundantCondition errorLevel="info"/></issueHandlers></psalm>';
        $violations = $this->psalmIssueHandlerViolations($missing, ['RedundantCondition' => 'info', 'SneakyLeak' => 'error']);
        $this->assertNotSame([], $violations, 'The guard must catch a missing issueHandler.');
    }

    /**
     * The DOM assertions must not stop at the first
     * `<issueHandlers>` section or ignore `<ignoreFiles>`.
     */
    public function test_the_effective_psalm_config_cannot_be_weakened(): void
    {
        $this->assertSame(
            [],
            $this->psalmConfigViolations((string) file_get_contents(base_path('psalm.xml'))),
            'psalm.xml root errorLevel, the single issueHandlers section and the ignoreFiles list are pinned.',
        );
    }

    /**
     * B6 (a second `<issueHandlers>`) and B7 (a changed `<ignoreFiles>`), plus a
     * lowered root level, each fail.
     */
    public function test_the_psalm_config_guard_catches_each_bypass(): void
    {
        $clean = '<psalm errorLevel="1"><projectFiles><directory name="app"/><ignoreFiles><directory name="bootstrap/cache"/><directory name="vendor"/></ignoreFiles></projectFiles><issueHandlers><RedundantCondition errorLevel="info"/></issueHandlers></psalm>';
        $this->assertSame([], $this->psalmConfigViolations($clean), 'The clean fixture must pass.');

        $bypasses = [
            'B6 a second issueHandlers section' => '<psalm errorLevel="1"><projectFiles><directory name="app"/><ignoreFiles><directory name="bootstrap/cache"/><directory name="vendor"/></ignoreFiles></projectFiles><issueHandlers><RedundantCondition errorLevel="info"/></issueHandlers><issueHandlers><SneakyLeak errorLevel="error"/></issueHandlers></psalm>',
            'B7 a changed ignoreFiles list' => '<psalm errorLevel="1"><projectFiles><directory name="app"/><ignoreFiles><directory name="bootstrap/cache"/></ignoreFiles></projectFiles><issueHandlers><RedundantCondition errorLevel="info"/></issueHandlers></psalm>',
            'B7b a lowered root errorLevel' => '<psalm errorLevel="4"><projectFiles><directory name="app"/><ignoreFiles><directory name="bootstrap/cache"/><directory name="vendor"/></ignoreFiles></projectFiles><issueHandlers><RedundantCondition errorLevel="info"/></issueHandlers></psalm>',
            'E12 an added ignoreFiles directory' => '<psalm errorLevel="1"><projectFiles><directory name="app"/><ignoreFiles><directory name="bootstrap/cache"/><directory name="vendor"/><directory name="app/Evil"/></ignoreFiles></projectFiles><issueHandlers><RedundantCondition errorLevel="info"/></issueHandlers></psalm>',
        ];

        foreach ($bypasses as $what => $xml) {
            $this->assertNotSame([], $this->psalmConfigViolations($xml), "The psalm-config guard must catch {$what}.");
        }
    }

    public function test_inline_suppressions_stay_within_the_budget(): void
    {
        $offenders = [];
        foreach (self::ROOTS as $path) {
            $offenders = array_merge($offenders, $this->suppressions(base_path($path)));
        }

        $this->assertCount(
            self::SUPPRESSION_BUDGET,
            $offenders,
            "Inline suppressions are fixed in code, not added:\n".implode("\n", $offenders),
        );
    }

    public function test_the_suppression_scan_flags_each_bypass(): void
    {
        $this->assertSame(['phpstan-ignore'], $this->suppressionsIn("<?php\n\$x = 1; // @phpstan-ignore argument.type\n"));
        $this->assertSame(['phpstan-ignore-next-line'], $this->suppressionsIn("<?php\n// @phpstan-ignore-next-line\n"));
        $this->assertSame(['psalm-suppress'], $this->suppressionsIn("<?php\n/** @psalm-suppress MixedArgument */\n"));
        $this->assertSame(['psalm-ignore-nullable-return'], $this->suppressionsIn("<?php\n/** @psalm-ignore-nullable-return */\n"));
    }

    /**
     * The top-level shape of both analyser configs is pinned, not only the
     * effective parameters – a `services:` entry tagged
     * `phpstan.ignoreErrorExtension` or an extra `<pluginClass>` would otherwise
     * suppress findings silently.
     */
    public function test_the_analyser_top_level_config_is_pinned(): void
    {
        $this->assertSame(
            [],
            $this->phpstanTopLevelViolations((string) file_get_contents(base_path('phpstan.neon'))),
            'phpstan.neon top-level keys must be exactly includes, parameters and the one rules entry.',
        );
        $this->assertSame(
            [],
            $this->psalmPluginViolations((string) file_get_contents(base_path('psalm.xml')), base_path('psalm.xml')),
            'psalm.xml <plugins> must be exactly the Laravel plugin, with no <stubs>.',
        );
    }

    /**
     * One fixture per top-level bypass: an `ignoreErrorExtension` service, a
     * `conditionalTags` section, a second rule, a missing rule and an empty
     * `rules:` for PHPStan; a `<plugin filename>`, a `<fileExtensions>`
     * section, an `xi:include`, a `BeforeAddIssueInterface` plugin and a
     * `<stubs>` section for Psalm.
     *
     * Every PHPStan fixture carries the real rule FQCN, so it is flagged for its
     * own shape and not for a wrong rule name.
     */
    public function test_the_analyser_top_level_guard_catches_each_bypass(): void
    {
        $this->assertSame([], $this->phpstanTopLevelViolations($this->phpstanNeon()), 'The clean PHPStan fixture must pass.');

        $phpstanBypasses = [
            'an ignoreErrorExtension service' => [$this->phpstanNeon("services:\n    -\n        class: Evil\\Ignore\n        tags: [phpstan.ignoreErrorExtension]\n"), 'services'],
            'a conditionalTags section' => [$this->phpstanNeon("conditionalTags:\n    PanelAlpha\\StaticAnalysis\\ApplicationQueryRule:\n        - X\n"), 'conditionalTags'],
            'a second rule' => [$this->phpstanNeon('', [self::PHPSTAN_RULE, 'Evil\\Rule']), 'rules must be exactly'],
            'no rule' => [$this->phpstanNeon('', []), 'rules must be exactly'],
            'a missing rules key' => ["includes:\n    - vendor/larastan/larastan/extension.neon\nparameters:\n    level: 8\n", 'missing the top-level key rules'],
            'a quoted block key' => [$this->phpstanNeon("\"services\":\n    - { class: Evil\\Ignore }\n"), 'services'],
            'a quoted flow key' => ["{ includes: [vendor/larastan/larastan/extension.neon], parameters: { level: 8 }, rules: [PanelAlpha\\StaticAnalysis\\ApplicationQueryRule], \"services\": { class: Evil } }\n", 'services'],
            'a second rule with an inline comment' => [$this->phpstanNeon('', [self::PHPSTAN_RULE.' # a comment', 'Evil\\Rule']), 'rules must be exactly'],
        ];
        foreach ($phpstanBypasses as $what => [$neon, $expected]) {
            $violations = $this->phpstanTopLevelViolations($neon);
            $this->assertNotSame([], $violations, "The top-level guard must catch {$what}.");
            $this->assertStringContainsString($expected, implode("\n", $violations), "The guard must flag {$what} for its own pattern, not a wrong rule name.");
        }

        $this->assertSame(
            [],
            $this->psalmPluginViolations('<psalm><plugins><pluginClass class="Psalm\LaravelPlugin\Plugin"/></plugins></psalm>'),
            'The clean Psalm fixture must pass.',
        );

        // Each fixture carries the real Laravel plugin, so it fails only on the
        // pattern it is about, not on the plugins-mismatch check.
        $psalmBypasses = [
            'a BeforeAddIssueInterface plugin' => [
                '<psalm><plugins><pluginClass class="Psalm\LaravelPlugin\Plugin"/><pluginClass class="Evil\BeforeAddIssue"/></plugins></psalm>',
                'Evil\BeforeAddIssue',
            ],
            'a legacy <plugin filename> element' => [
                '<psalm><plugins><pluginClass class="Psalm\LaravelPlugin\Plugin"/><plugin filename="evil.php"/></plugins></psalm>',
                'legacy <plugin',
            ],
            'a <fileExtensions> section' => [
                '<psalm><plugins><pluginClass class="Psalm\LaravelPlugin\Plugin"/></plugins><fileExtensions><extension name="evil"/></fileExtensions></psalm>',
                '<fileExtensions>',
            ],
            'an xi:include' => [
                '<psalm xmlns:xi="http://www.w3.org/2001/XInclude"><plugins><pluginClass class="Psalm\LaravelPlugin\Plugin"/></plugins><xi:include href="evil.xml" parse="xml"/></psalm>',
                '<xi:include>',
            ],
            'a <stubs> section' => [
                '<psalm><stubs><file name="app/stub.php"/></stubs><plugins><pluginClass class="Psalm\LaravelPlugin\Plugin"/></plugins></psalm>',
                '<stubs>',
            ],
        ];
        foreach ($psalmBypasses as $what => [$xml, $expected]) {
            $violations = $this->psalmPluginViolations($xml);
            $this->assertNotSame([], $violations, "The top-level guard must catch {$what}.");
            $this->assertStringContainsString($expected, implode("\n", $violations), "The guard must flag {$what} for its own pattern, not the plugins-mismatch check.");
        }
    }

    /**
     * XInclude is really expanded (not merely forbidden): an included document
     * that adds a second `<pluginClass>` is seen after `xinclude()`.
     */
    public function test_the_psalm_plugin_guard_expands_xinclude(): void
    {
        $dir = sys_get_temp_dir();
        $evil = $dir.'/pa-xi-evil-'.uniqid('', true).'.xml';
        $main = $dir.'/pa-xi-main-'.uniqid('', true).'.xml';

        file_put_contents($evil, '<psalm><plugins><pluginClass class="Evil\\Included"/></plugins></psalm>');
        file_put_contents($main, '<psalm xmlns:xi="'.self::XINCLUDE_NS.'"><plugins><pluginClass class="Psalm\\LaravelPlugin\\Plugin"/></plugins><xi:include href="'.basename($evil).'" parse="xml"/></psalm>');

        try {
            $violations = $this->psalmPluginViolations((string) file_get_contents($main), $main);
            $message = implode("\n", $violations);
            $this->assertStringContainsString('xi:include', $message, 'The guard must reject the xi:include itself.');
            $this->assertStringContainsString('Evil\\Included', $message, 'The guard must expand the include and see the extra plugin.');
        } finally {
            @unlink($evil);
            @unlink($main);
        }
    }

    public function test_the_configured_user_model_is_a_panel_user(): void
    {
        $model = config('auth.providers.users.model');

        $this->assertIsString($model);
        $this->assertTrue(
            is_a($model, PanelUser::class, true),
            "config('auth.providers.users.model') must implement ".PanelUser::class.'.',
        );
    }

    /**
     * The directory roots the analysers must cover (the
     * files are checked by {@see test_both_analysers_cover_the_same_roots}).
     *
     * @return list<string>
     */
    private function sources(): array
    {
        return ['app', '../packages/engine-client/src', '../packages/client-area/src'];
    }

    /**
     * `ignoreErrors`, `excludePaths` or a level below the required one.
     *
     * @return list<string>
     */
    private function phpstanWeaknesses(string $neon, int $requiredLevel): array
    {
        $code = implode("\n", $this->uncommentedLines($neon, '#'));

        $weaknesses = [];

        if (preg_match('/^\s*ignoreErrors\s*:/m', $code) === 1) {
            $weaknesses[] = 'ignoreErrors is forbidden; fix the finding in code.';
        }

        if (preg_match('/^\s*excludePaths\s*:/m', $code) === 1) {
            $weaknesses[] = 'excludePaths is forbidden; narrow the type instead.';
        }

        if (preg_match('/^\s*level\s*:\s*(\d+)/m', $code, $matches) !== 1) {
            $weaknesses[] = "no level set; PHPStan would default below {$requiredLevel}.";
        } elseif ((int) $matches[1] < $requiredLevel) {
            $weaknesses[] = "level {$matches[1]} is below {$requiredLevel}.";
        }

        return $weaknesses;
    }

    /**
     * The **effective** PHPStan parameters from `phpstan dump-parameters --json`
     *So an `includes:` file cannot weaken the config silently.
     *
     * @return array<string, mixed>
     */
    private function effectivePhpstanParameters(): array
    {
        $process = new Process(
            [PHP_BINARY, base_path('vendor/bin/phpstan'), 'dump-parameters', '--json'],
            base_path(),
        );
        $process->setTimeout(120);
        $process->run();

        $this->assertTrue(
            $process->isSuccessful(),
            'phpstan dump-parameters failed: '.$process->getErrorOutput(),
        );

        $output = $process->getOutput();
        $start = strpos($output, '{');
        $this->assertNotFalse($start, 'phpstan dump-parameters produced no JSON.');

        $parameters = json_decode(substr($output, (int) $start), true, 512, JSON_THROW_ON_ERROR);
        $this->assertIsArray($parameters);

        return $parameters;
    }

    /**
     * `ignoreErrors`, `excludePaths`, an extra `stubFiles` entry, a level below
     * the required one, or an `includes:` file other than the Larastan
     * extension.
     *
     * @param  array<string, mixed>  $parameters
     * @return list<string>
     */
    private function phpstanParameterViolations(array $parameters): array
    {
        $violations = [];

        if ((int) ($parameters['level'] ?? 0) !== self::PHPSTAN_LEVEL) {
            $violations[] = 'level '.var_export($parameters['level'] ?? null, true).' is not '.self::PHPSTAN_LEVEL.'.';
        }

        if (($parameters['ignoreErrors'] ?? null) !== []) {
            $violations[] = 'ignoreErrors is forbidden; fix the finding in code.';
        }

        $excludePaths = $parameters['excludePaths'] ?? null;
        if (! is_array($excludePaths) || array_filter($excludePaths) !== []) {
            $violations[] = 'excludePaths is forbidden; narrow the type instead.';
        }

        foreach ((array) ($parameters['stubFiles'] ?? []) as $stub) {
            if (! is_string($stub) || ! str_starts_with($stub, 'phar://')) {
                $violations[] = 'extra stubFile '.var_export($stub, true).'; remove it.';
            }
        }

        // Exact resolved paths, not suffix matches: a file that merely ends in
        // `/vendor/larastan/larastan/extension.neon` must not pass.
        $allowed = array_map(
            static fn (string $path): string => str_replace('\\', '/', $path),
            [base_path('phpstan.neon'), base_path('vendor/larastan/larastan/extension.neon')],
        );
        $larastan = str_replace('\\', '/', base_path('vendor/larastan/larastan/extension.neon'));
        $hasLarastan = false;
        $configFiles = array_values(array_filter(
            (array) ($parameters['allConfigFiles'] ?? []),
            static fn (mixed $file): bool => is_string($file) && ! str_starts_with($file, 'phar://'),
        ));
        foreach ($configFiles as $file) {
            $normalized = str_replace('\\', '/', (string) $file);
            if (! in_array($normalized, $allowed, true)) {
                $violations[] = "unexpected config include {$file}; only the exact resolved Larastan extension path is allowed.";
            }
            if ($normalized === $larastan) {
                $hasLarastan = true;
            }
        }
        if (! $hasLarastan) {
            $violations[] = 'the Larastan extension include is missing.';
        }

        return $violations;
    }

    /**
     * @param  array<string, string>  $expected
     * @return list<string>
     */
    private function psalmIssueHandlerViolations(string $xml, array $expected): array
    {
        $actual = $this->psalmIssueHandlers($xml);

        $violations = [];
        foreach (array_diff_key($actual, $expected) as $name => $level) {
            $violations[] = "new issueHandler {$name} ({$level}).";
        }
        foreach (array_diff_key($expected, $actual) as $name => $level) {
            $violations[] = "missing issueHandler {$name} ({$level}).";
        }
        foreach (array_intersect_key($expected, $actual) as $name => $level) {
            if ($actual[$name] !== $level) {
                $violations[] = "issueHandler {$name} changed to {$actual[$name]}.";
            }
        }

        return $violations;
    }

    /** @return array<string, string> */
    private function psalmIssueHandlers(string $xml): array
    {
        $container = $this->psalmDocument($xml)->getElementsByTagName('issueHandlers')->item(0);
        if ($container === null) {
            return [];
        }

        $handlers = [];
        foreach ($container->childNodes as $node) {
            if ($node instanceof \DOMElement) {
                $handlers[$node->nodeName] = $node->getAttribute('errorLevel');
            }
        }

        return $handlers;
    }

    /**
     * The effective `psalm.xml` structure: the root
     * `errorLevel`, exactly one `<issueHandlers>` section and the exact
     * `<ignoreFiles>` list.
     *
     * @return list<string>
     */
    private function psalmConfigViolations(string $xml): array
    {
        $dom = $this->psalmDocument($xml);
        $violations = [];

        $root = $dom->documentElement;
        if (! $root instanceof \DOMElement || $root->getAttribute('errorLevel') !== (string) self::PSALM_ERROR_LEVEL) {
            $violations[] = 'psalm.xml must set errorLevel '.self::PSALM_ERROR_LEVEL.' on the root.';
        }

        $handlers = $dom->getElementsByTagName('issueHandlers');
        if ($handlers->length !== 1) {
            $violations[] = 'psalm.xml must have exactly one <issueHandlers> section, found '.$handlers->length.'.';
        }

        $ignoreFiles = $this->psalmIgnoreFiles($dom);
        if ($ignoreFiles !== ['bootstrap/cache', 'vendor']) {
            $violations[] = 'psalm.xml <ignoreFiles> must be exactly [bootstrap/cache, vendor], found ['.implode(', ', $ignoreFiles).'].';
        }

        return $violations;
    }

    /** @return list<string> */
    private function psalmIgnoreFiles(\DOMDocument $dom): array
    {
        $names = [];
        foreach ($dom->getElementsByTagName('ignoreFiles') as $node) {
            if (! $node instanceof \DOMElement) {
                continue;
            }
            foreach ($node->childNodes as $child) {
                if ($child instanceof \DOMElement) {
                    $names[] = $child->getAttribute('name');
                }
            }
        }

        return $names;
    }

    /**
     * The top-level keys phpstan.neon may carry and the single `rules:` entry
     *Parsed as real NEON with PHPStan's bundled decoder, so a
     * quoted key, a flow map or a reordered file cannot slip past a line regex,
     * and `array_keys` is compared directly.
     *
     * @return list<string>
     */
    private function phpstanTopLevelViolations(string $neon): array
    {
        $file = $this->neonFile($neon);
        try {
            $decoded = (new NeonAdapter([]))->load($file);
        } catch (\Throwable $e) {
            return ['phpstan.neon is not valid NEON: '.$e->getMessage()];
        } finally {
            @unlink($file);
        }

        $violations = [];
        $keys = array_keys($decoded);

        foreach (array_diff($keys, self::PHPSTAN_TOP_LEVEL_KEYS) as $key) {
            $violations[] = "phpstan.neon must not carry the top-level key {$key}.";
        }
        foreach (self::PHPSTAN_TOP_LEVEL_KEYS as $required) {
            if (! in_array($required, $keys, true)) {
                $violations[] = "phpstan.neon is missing the top-level key {$required}.";
            }
        }

        $rules = $decoded['rules'] ?? null;
        $rules = is_array($rules) ? array_values(array_map(static fn (mixed $rule): string => (string) $rule, $rules)) : [];
        if ($rules !== self::PHPSTAN_RULES) {
            $violations[] = 'phpstan.neon rules must be exactly ['.implode(', ', self::PHPSTAN_RULES).'], found ['.implode(', ', $rules).'].';
        }

        return $violations;
    }

    /**
     * A `phpstan.neon` fixture that carries the real rule FQCN, so a bypass
     * fixture is flagged for its own shape and not for a wrong rule name.
     *
     * @param  list<string>|null  $rules
     */
    private function phpstanNeon(string $extra = '', ?array $rules = null): string
    {
        $rules ??= self::PHPSTAN_RULES;

        $neon = "includes:\n    - vendor/larastan/larastan/extension.neon\n\nparameters:\n    level: 8\n\nrules:\n";
        foreach ($rules as $rule) {
            $neon .= "    - {$rule}\n";
        }

        return $neon.$extra;
    }

    private function neonFile(string $neon): string
    {
        $path = (string) tempnam(sys_get_temp_dir(), 'pa-phpstan');
        file_put_contents($path, $neon);

        return $path;
    }

    /**
     * The `<plugins>` and `<stubs>` sections psalm.xml may carry:
     * exactly the Laravel plugin and no stubs, so a plugin implementing
     * `BeforeAddIssueInterface` or a stub file cannot suppress findings. An
     * `xi:include` is expanded with the real XInclude processor first, so an
     * included document cannot smuggle a plugin past the scan, and the
     * legacy `<plugin filename>` and `<fileExtensions>` sections are forbidden.
     *
     * @return list<string>
     */
    private function psalmPluginViolations(string $xml, ?string $file = null): array
    {
        $dom = $this->psalmDocument($xml, $file);
        $violations = [];

        if ($dom->getElementsByTagNameNS(self::XINCLUDE_NS, 'include')->length > 0) {
            $violations[] = 'psalm.xml must not use <xi:include>; inline the config instead.';
        }

        // Run XInclude only for the real file: a string fixture has no base URI
        // to resolve an href against.
        if ($file !== null) {
            $previous = libxml_use_internal_errors(true);
            $dom->xinclude();
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }

        $plugins = [];
        foreach ($dom->getElementsByTagName('pluginClass') as $node) {
            if ($node instanceof \DOMElement) {
                $plugins[] = $node->getAttribute('class');
            }
        }
        if ($plugins !== self::PSALM_PLUGINS) {
            $violations[] = 'psalm.xml <plugins> must be exactly ['.implode(', ', self::PSALM_PLUGINS).'], found ['.implode(', ', $plugins).'].';
        }
        if ($dom->getElementsByTagName('plugin')->length > 0) {
            $violations[] = 'psalm.xml must use <pluginClass class="…"/>, not the legacy <plugin filename="…"/>.';
        }
        if ($dom->getElementsByTagName('fileExtensions')->length > 0) {
            $violations[] = 'psalm.xml must not carry a <fileExtensions> section.';
        }
        if ($dom->getElementsByTagName('stubs')->length > 0) {
            $violations[] = 'psalm.xml must not carry a <stubs> section.';
        }

        return $violations;
    }

    /** @return list<string> */
    private function psalmPaths(string $xml): array    {
        $dom = $this->psalmDocument($xml);

        $paths = [];
        foreach (['directory', 'file'] as $tag) {
            foreach ($dom->getElementsByTagName($tag) as $node) {
                if (! $node instanceof \DOMElement || ! $node->parentNode instanceof \DOMElement) {
                    continue;
                }
                if ($node->parentNode->nodeName !== 'projectFiles') {
                    continue;
                }
                $name = $node->getAttribute('name');
                if ($name !== '') {
                    $paths[] = $name;
                }
            }
        }

        return $paths;
    }

    private function psalmDocument(string $xml, ?string $file = null): \DOMDocument
    {
        $previous = libxml_use_internal_errors(true);
        $dom = new \DOMDocument();
        $loaded = $file !== null ? $dom->load($file) : $dom->loadXML($xml);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        $this->assertTrue($loaded, 'psalm.xml must be valid XML.');

        return $dom;
    }

    /**
     * The `paths:` list from phpstan.neon, comment lines removed.
     *
     * @return list<string>
     */
    private function phpstanPaths(string $neon): array
    {
        $paths = [];
        $collecting = false;
        foreach ($this->uncommentedLines($neon, '#') as $line) {
            if (! $collecting) {
                if (preg_match('/^\s*paths\s*:/', $line) === 1) {
                    $collecting = true;
                }

                continue;
            }

            if (preg_match('/^\s*-\s*(\S+)\s*$/', $line, $matches) === 1) {
                $paths[] = $matches[1];

                continue;
            }

            if (trim($line) !== '') {
                break;
            }
        }

        return $paths;
    }

    /**
     * Every `@phpstan-ignore` / `@psalm-suppress` in a file or directory tree.
     *
     * @return list<string>
     */
    private function suppressions(string $root): array
    {
        if (is_file($root)) {
            return array_map(
                static fn (string $tag): string => $root.':'.$tag,
                $this->suppressionsIn((string) file_get_contents($root)),
            );
        }

        if (! is_dir($root)) {
            return [];
        }

        $found = [];
        $files = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root));
        foreach ($files as $file) {
            if (! $file->isFile() || $file->getExtension() !== 'php') {
                continue;
            }

            foreach ($this->suppressionsIn((string) file_get_contents($file->getPathname())) as $tag) {
                $found[] = $file->getPathname().':'.$tag;
            }
        }

        return $found;
    }

    /** @return list<string> */
    private function suppressionsIn(string $code): array
    {
        preg_match_all('/@(phpstan-ignore[\w-]*|psalm-suppress[\w-]*|psalm-ignore-[\w-]*)/', $code, $matches);

        return $matches[1];
    }

    /**
     * @return list<string>
     */
    private function uncommentedLines(string $content, string $marker): array
    {
        return array_values(array_filter(
            preg_split('/\R/', $content) ?: [],
            static fn (string $line): bool => ! str_starts_with(trim($line), $marker),
        ));
    }

    /**
     * Drops comment lines so a comment that mentions the word "baseline" does
     * not count as a baseline reference.
     */
    private function withoutComments(string $content, string $marker): string
    {
        $lines = array_filter(
            preg_split('/\R/', $content) ?: [],
            static fn (string $line): bool => ! str_starts_with(trim($line), $marker),
        );

        return implode("\n", $lines);
    }

    /**
     * @return array<string, mixed>
     */
    private function composer(): array
    {
        return json_decode((string) file_get_contents(base_path('composer.json')), true, 512, JSON_THROW_ON_ERROR);
    }
}
