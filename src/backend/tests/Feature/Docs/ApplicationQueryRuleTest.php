<?php

namespace Tests\Feature\Docs;

use PanelAlpha\StaticAnalysis\ApplicationQueryRule;
use PHPStan\Rules\Rule;
use PHPStan\Testing\RuleTestCase;
use PHPUnit\Framework\Attributes\DataProvider;

/**
 * The application-query guard is an AST PHPStan rule, not the regex scanner that lived in
 * `ApplicationQueryGuardTest`.
 *
 * Every bypass shape the gate reported is a provider case with its own fixture,
 * so one failing shape cannot hide the others. The legitimate
 * shapes the regex guard flagged stay clean, the pinned path-exclusion and
 * call-site allow-lists are asserted literally, the package namespaces are in
 * scope, and the real request/mirror files prove the exclusions and the
 * allow-lists end to end.
 *
 * @extends RuleTestCase<ApplicationQueryRule>
 */
final class ApplicationQueryRuleTest extends RuleTestCase
{
    private const DIRECT = 'Direct Application query; go through ApplicationRepository.';

    private const NEW = 'Direct Application instantiation; go through ApplicationRepository.';

    private const CONTAINER = 'Container resolution of the Application model; go through ApplicationRepository.';

    private const INSTANCE = 'Unscoped instance query on an Application; go through ApplicationRepository.';

    private const TABLE = 'Direct query on the applications table; go through ApplicationRepository.';

    private const CALLABLE = 'Callable array reaching the Application model; go through ApplicationRepository.';

    private const FIRST_CLASS = 'First-class callable reaching the Application model; go through ApplicationRepository.';

    private const FIRST_CLASS_INSTANCE = 'First-class callable building an Application query; go through ApplicationRepository.';

    private const RELATION = 'Relation query on an Application; go through ApplicationRepository.';

    private const USER_RELATION = "Relation query on a user's applications; go through ApplicationRepository.";

    /** @var list<string> */
    private array $temporaryFiles = [];

    protected function getRule(): Rule
    {
        return new ApplicationQueryRule();
    }

    protected function tearDown(): void
    {
        foreach ($this->temporaryFiles as $file) {
            @unlink($file);
        }
        $this->temporaryFiles = [];
        parent::tearDown();
    }

    /**
     * One bypass shape per case; a `MARK` comment pins the expected line.
     *
     * @return array<string, array{0: string, 1: string}>
     */
    public static function flaggedShapes(): array
    {
        $use = "use PanelAlpha\\ClientArea\\Models\\Application;\n";

        return [
            'a spaced static call' => ["<?php\n{$use}Application :: query(); /*MARK*/\n", self::DIRECT],
            'a multi-line static call' => ["<?php\n{$use}Application /*MARK*/\n    ::query();\n", self::DIRECT],
            'a callable array' => ["<?php\n{$use}[Application::class, 'query']; /*MARK*/\n", self::CALLABLE],
            'a (Application::class)::query() call' => ["<?php\n{$use}(Application::class)::query(); /*MARK*/\n", self::DIRECT],
            'a container resolve() call' => ["<?php\n{$use}resolve(Application::class); /*MARK*/\n", self::CONTAINER],
            'an app()->make() call' => ["<?php\n{$use}app()->make(Application::class); /*MARK*/\n", self::CONTAINER],
            'a $this->app->make() call' => [
                "<?php\n{$use}\nclass ContainerUser\n{\n    public object \$app;\n\n    public function boot(): void\n    {\n        \$this->app->make(Application::class); /*MARK*/\n    }\n}\n",
                self::CONTAINER,
            ],
            'an instance newModelQuery()' => [
                "<?php\n{$use}\nfunction build(Application \$application): void\n{\n    \$application->newModelQuery(); /*MARK*/\n}\n",
                self::INSTANCE,
            ],
            'an instance newQueryWithoutScopes()' => [
                "<?php\n{$use}\nfunction build(Application \$application): void\n{\n    \$application->newQueryWithoutScopes(); /*MARK*/\n}\n",
                self::INSTANCE,
            ],
            'an instance newQuery()' => [
                "<?php\n{$use}\nfunction build(Application \$application): void\n{\n    \$application->newQuery(); /*MARK*/\n}\n",
                self::INSTANCE,
            ],
            'DB::query()->from()' => ["<?php\nuse Illuminate\\Support\\Facades\\DB;\n\nDB::query()->from('applications'); /*MARK*/\n", self::TABLE],
            'DB::connection()->table()' => ["<?php\nuse Illuminate\\Support\\Facades\\DB;\n\nDB::connection()->table('applications'); /*MARK*/\n", self::TABLE],
            "a ->join('applications')" => ["<?php\nuse Illuminate\\Support\\Facades\\DB;\n\nDB::query()->join('applications', 'a', '=', 'b'); /*MARK*/\n", self::TABLE],
            "DB::table('applications')" => ["<?php\nuse Illuminate\\Support\\Facades\\DB;\n\nDB::table('applications'); /*MARK*/\n", self::TABLE],
            "DB::table('applications as a')" => ["<?php\nuse Illuminate\\Support\\Facades\\DB;\n\nDB::table('applications as a'); /*MARK*/\n", self::TABLE],
            'raw SQL with backticks' => ["<?php\nuse Illuminate\\Support\\Facades\\DB;\n\nDB::select('select id from `applications`'); /*MARK*/\n", self::TABLE],
            'raw SQL with a quoted JOIN and a newline' => ["<?php\nuse Illuminate\\Support\\Facades\\DB;\n\nDB::select(\"select *\\n  JOIN 'applications' ON 1\"); /*MARK*/\n", self::TABLE],
            'raw SQL with a double-quoted table' => ["<?php\nuse Illuminate\\Support\\Facades\\DB;\n\nDB::select('select id from \"applications\"'); /*MARK*/\n", self::TABLE],
            'a split aliased import' => [
                "<?php\nuse PanelAlpha\\ClientArea\\Models\\Application as Aliased;\n\nAliased::query(); /*MARK*/\n",
                self::DIRECT,
            ],
            'a grouped aliased import' => [
                "<?php\nuse PanelAlpha\\ClientArea\\Models\\{Application as Grouped};\n\nGrouped::query(); /*MARK*/\n",
                self::DIRECT,
            ],
            'a multi aliased import' => [
                "<?php\nuse PanelAlpha\\ClientArea\\Models\\Application as Aliased, Foo;\n\nAliased::query(); /*MARK*/\n",
                self::DIRECT,
            ],
            'an unscoped query beside an unrelated whereKey' => [
                "<?php\n{$use}\n\n\$unrelated = Bar::query()->whereKey(1);\nApplication::query(); /*MARK*/\n",
                self::DIRECT,
            ],
            'a class-string variable call' => [
                "<?php\n{$use}\n/** @var class-string<Application> \$model */\n\$model = Application::class;\n\$model::query(); /*MARK*/\n",
                self::DIRECT,
            ],
            'a new Application' => ["<?php\n{$use}\n\$application = new Application(); /*MARK*/\n", self::NEW],

            // The shapes the gate report left unflagged.
            'a first-class callable on the model' => ["<?php\n{$use}Application::query(...); /*MARK*/\n", self::FIRST_CLASS],
            'an instance first-class callable' => [
                "<?php\n{$use}\nfunction build(Application \$application): void\n{\n    \$application->query(...); /*MARK*/\n}\n",
                self::FIRST_CLASS_INSTANCE,
            ],
            'an instance query()' => [
                "<?php\n{$use}\nfunction build(Application \$application): void\n{\n    \$application->query(); /*MARK*/\n}\n",
                self::INSTANCE,
            ],
            'an instance where()' => [
                "<?php\n{$use}\nfunction build(Application \$application): void\n{\n    \$application->where('status', 'active'); /*MARK*/\n}\n",
                self::INSTANCE,
            ],
            'an instance newQueryWithoutRelationships()' => [
                "<?php\n{$use}\nfunction build(Application \$application): void\n{\n    \$application->newQueryWithoutRelationships(); /*MARK*/\n}\n",
                self::INSTANCE,
            ],
            'an instance relation query' => [
                "<?php\n{$use}\nfunction build(Application \$application): void\n{\n    \$application->stagings(); /*MARK*/\n}\n",
                self::RELATION,
            ],
            "a user's applications() relation" => [
                "<?php\nuse App\\Models\\User;\n{$use}\nfunction build(User \$user): void\n{\n    \$user->applications(); /*MARK*/\n}\n",
                self::USER_RELATION,
            ],
            'App::make' => [
                "<?php\nuse Illuminate\\Support\\Facades\\App;\n{$use}App::make(Application::class); /*MARK*/\n",
                self::CONTAINER,
            ],
            'app()->get' => ["<?php\n{$use}app()->get(Application::class); /*MARK*/\n", self::CONTAINER],
            'Container::get' => [
                "<?php\nuse Illuminate\\Container\\Container;\n{$use}Container::get(Application::class); /*MARK*/\n",
                self::CONTAINER,
            ],
            'a subclass static call' => [
                "<?php\n{$use}use Tests\\Feature\\Docs\\ApplicationSubclassFixture;\n\nApplicationSubclassFixture::query(); /*MARK*/\n",
                self::DIRECT,
            ],
            'a subclass instantiation' => [
                "<?php\n{$use}use Tests\\Feature\\Docs\\ApplicationSubclassFixture;\n\nnew ApplicationSubclassFixture(); /*MARK*/\n",
                self::NEW,
            ],
            'DB::update' => ["<?php\nuse Illuminate\\Support\\Facades\\DB;\n\nDB::update('update applications set status = ?', ['active']); /*MARK*/\n", self::TABLE],
            'DB::statement delete from' => ["<?php\nuse Illuminate\\Support\\Facades\\DB;\n\nDB::statement('delete from applications'); /*MARK*/\n", self::TABLE],
            'DB::statement truncate' => ["<?php\nuse Illuminate\\Support\\Facades\\DB;\n\nDB::statement('truncate applications'); /*MARK*/\n", self::TABLE],
            'an insert into raw SQL' => ["<?php\nuse Illuminate\\Support\\Facades\\DB;\n\nDB::insert('insert into applications (id) values (1)'); /*MARK*/\n", self::TABLE],
            'a fromRaw applications' => ["<?php\nuse Illuminate\\Support\\Facades\\DB;\n\nDB::table('x')->fromRaw('applications'); /*MARK*/\n", self::TABLE],
            'a leftJoin applications' => ["<?php\nuse Illuminate\\Support\\Facades\\DB;\n\nDB::query()->leftJoin('applications', 'a', '=', 'b'); /*MARK*/\n", self::TABLE],
            'a schema-qualified table' => ["<?php\nuse Illuminate\\Support\\Facades\\DB;\n\nDB::table('public.applications'); /*MARK*/\n", self::TABLE],

            // The package namespaces must stay in scope.
            'a query in the package root namespace' => [
                "<?php\n\nnamespace PanelAlpha\\ClientArea;\n\n{$use}\nfinal class Builder\n{\n    public function run(): void\n    {\n        Application::query(); /*MARK*/\n    }\n}\n",
                self::DIRECT,
            ],
            'a query in the Projects namespace' => [
                "<?php\n\nnamespace PanelAlpha\\ClientArea\\Projects;\n\n{$use}\nfinal class Builder\n{\n    public function run(): void\n    {\n        Application::query(); /*MARK*/\n    }\n}\n",
                self::DIRECT,
            ],
            'a query in the Edition Community namespace' => [
                "<?php\n\nnamespace PanelAlpha\\Edition\\Community;\n\n{$use}\nfinal class Builder\n{\n    public function run(): void\n    {\n        Application::query(); /*MARK*/\n    }\n}\n",
                self::DIRECT,
            ],
            'a spoofed mirror namespace outside src' => [
                "<?php\n\nnamespace PanelAlpha\\ClientArea\\Sync;\n\n{$use}\nfinal class Builder\n{\n    public function run(): void\n    {\n        Application::query(); /*MARK*/\n    }\n}\n",
                self::DIRECT,
            ],
        ];
    }

    #[DataProvider('flaggedShapes')]
    public function test_every_flagged_shape_reports_an_error(string $code, string $message): void
    {
        $this->analyse([$this->phpFile($code)], [[$message, $this->lineOf($code)]]);
    }

    public function test_the_legitimate_shapes_are_clean(): void
    {
        $code = "<?php\n\nnamespace Fixture;\n\n"
            ."use Other\\Application as Foreign;\n"
            ."use PanelAlpha\\ClientArea\\Models\\Application;\n\n"
            ."enum Colour: string\n{\n    case Red = 'red';\n}\n\n"
            ."\$enum = Colour::class;\n"
            ."\$enum::from('red');\n"
            ."\$class = 'Fixture';\n"
            ."\$class::make();\n"
            ."\$object = new \\stdClass();\n"
            ."\$object->newQuery();\n"
            ."Foreign::query();\n"
            ."\$label = 'from applications';\n";

        $this->analyse([$this->phpFile($code)], []);
    }

    /**
     * The pinned path-exclusion and call-site allow-lists. Changing any of them is a deliberate, reviewed act.
     */
    public function test_the_pinned_exclusion_and_allow_lists_are_stable(): void
    {
        $this->assertSame([
            '/src/Sync/',
            '/src/Jobs/',
            '/src/Models/',
        ], ApplicationQueryRule::EXCLUDED_PATH_SEGMENTS);

        $this->assertSame([
            'PanelAlpha\\ClientArea\\Access\\SingleOwnerApplicationRepository',
            'PanelAlpha\\ClientArea\\Provisioning\\SingleEngineProvisioner',
            'PanelAlpha\\ClientArea\\Access\\SingleUserAccessResolver',
            'PanelAlpha\\EditionPro\\Access\\OwnedApplications',
            'PanelAlpha\\EditionPro\\Access\\ServiceApplicationRepository',
            'PanelAlpha\\EditionPro\\Access\\ServiceAccessResolver',
            'PanelAlpha\\EditionPro\\Access\\ServiceTableDirectory',
            'PanelAlpha\\EditionPro\\Provisioning\\ServiceProvisioner',
            'PanelAlpha\\EditionPro\\Edition\\SingleServerProjects',
            'PanelAlpha\\AdminAreaController\\Users\\UserProjectQueries',
            'PanelAlpha\\AdminAreaController\\Queries\\HostingCounts',
            'PanelAlpha\\AdminAreaController\\Hosting\\ServiceProjects',
            'PanelAlpha\\AdminAreaController\\Projects\\AdminProjects',
            'PanelAlpha\\AdminAreaController\\Engine\\ProjectServices',
            'PanelAlpha\\AdminAreaController\\Billing\\TrialAccountFactory',
            'PanelAlpha\\AdminAreaController\\Reseller\\ResellerProjects',
            'PanelAlpha\\EditionMulti\\Engines\\EngineProjects',
        ], ApplicationQueryRule::EXCLUDED_CLASSES);

        $this->assertSame([
            'PanelAlpha\\ClientArea\\Http\\Middleware\\LogActivity::record' => [
                'count' => 1,
                'reason' => 'post-delete id existence check, scoped by whereKey',
            ],
        ], ApplicationQueryRule::ALLOWED_QUERY_CALL_SITES);

        $this->assertSame([
            'PanelAlpha\\ClientArea\\Projects\\DeployService::resolveTarget' => [
                'count' => 1,
                'reason' => 'newest staging of a repository-scoped parent',
            ],
            'PanelAlpha\\ClientArea\\Projects\\ProjectService::delete' => [
                'count' => 1,
                'reason' => 'refuse to delete a live project that still has a staging',
            ],
            'PanelAlpha\\ClientArea\\Projects\\StagingService::retry' => [
                'count' => 1,
                'reason' => 'one staging under a repository-scoped parent',
            ],
            'PanelAlpha\\ClientArea\\Projects\\StagingService::pushToStaging' => [
                'count' => 1,
                'reason' => 'latest staging of a repository-scoped live project',
            ],
            'PanelAlpha\\ClientArea\\Projects\\StagingService::pushToStagingDiff' => [
                'count' => 1,
                'reason' => 'latest staging of a repository-scoped live project for the push diff',
            ],
            'PanelAlpha\\ClientArea\\Projects\\StagingService::assertCanCreate' => [
                'count' => 1,
                'reason' => 'refuse a second staging on a repository-scoped parent',
            ],
            'PanelAlpha\\ClientArea\\Projects\\GitService::reuseRepositoryUrl' => [
                'count' => 1,
                'reason' => 'staging repository lookup on a repository-scoped live project',
            ],
        ], ApplicationQueryRule::ALLOWED_RELATION_CALL_SITES);

        $this->assertSame('applications', ApplicationQueryRule::TABLE);
    }

    /**
     * The mirror owners are excluded by **file path**, not by a declared
     * namespace, so a spoofed namespace cannot escape; a real
     * file under `src/Sync|Jobs|Models` stays clean.
     */
    public function test_the_mirror_paths_and_edition_bindings_are_excluded(): void
    {
        $this->analyse([
            $this->packagePath('client-area/src/Sync/ApplicationSynchronizer.php'),
            $this->packagePath('client-area/src/Jobs/Application/WatchStagingJob.php'),
            $this->packagePath('client-area/src/Access/SingleOwnerApplicationRepository.php'),
            $this->packagePath('client-area/src/Provisioning/SingleEngineProvisioner.php'),
            $this->packagePath('client-area/src/Access/SingleUserAccessResolver.php'),
        ], []);
    }

    /**
     * The one id-scoped lookup the request path keeps (post-delete existence
     * check in LogActivity) must clear the rule; removing the allow-list makes
     * this test red.
     */
    public function test_the_id_scoped_allow_list_clears_log_activity(): void
    {
        $this->analyse([$this->packagePath('client-area/src/Http/Middleware/LogActivity.php')], []);
    }

    /**
     * The query allow-list is a **call site** plus an **AST shape**,
     * not a text search. Only `LogActivity::record` may keep it, and only when
     * `whereKey(<scalar>)` sits directly on that query's chain.
     */
    public function test_the_query_allow_list_requires_a_call_site_and_an_ast_chain(): void
    {
        // The allowed shape clears.
        $this->analyse([$this->phpFile($this->logActivity('Application::query()->whereKey($id)->exists();'))], []);

        // A query with no whereKey is flagged.
        $noChain = $this->logActivity('Application::query()->exists(); /*MARK*/');
        $this->analyse([$this->phpFile($noChain)], [[self::DIRECT, $this->lineOf($noChain)]]);

        // A whereKey whose argument is not a scalar id is flagged.
        $nonScalar = $this->logActivity("Application::query()->whereKey(request('id'))->exists(); /*MARK*/");
        $this->analyse([$this->phpFile($nonScalar)], [[self::DIRECT, $this->lineOf($nonScalar)]]);

        // The same shape in another method of the same class is flagged: the
        // call site, not the text, is what the allow-list pins.
        $otherMethod = "<?php\n\nnamespace PanelAlpha\\ClientArea\\Http\\Middleware;\n\n"
            ."use PanelAlpha\\ClientArea\\Models\\Application;\n\n"
            ."final class LogActivity\n{\n    public function other(): void\n    {\n"
            ."        Application::query()->whereKey(1)->exists(); /*MARK*/\n    }\n}\n";
        $this->analyse([$this->phpFile($otherMethod)], [[self::DIRECT, $this->lineOf($otherMethod)]]);
    }

    /**
     * The relation-query uses the request path keeps are pinned call sites and
     * clear the rule. Removing the allow-list makes this test red.
     */
    public function test_the_relation_allow_list_clears_the_real_call_sites(): void
    {
        $this->analyse([
            $this->packagePath('client-area/src/Projects/DeployService.php'),
            $this->packagePath('client-area/src/Projects/ProjectService.php'),
            $this->packagePath('client-area/src/Projects/StagingService.php'),
            $this->packagePath('client-area/src/Projects/GitService.php'),
        ], []);
    }

    /**
     * The pinned count is enforced. A second `$parent->stagings()`
     * in the allow-listed `StagingService::retry` exceeds the pinned 1 and is
     * flagged, so a relation query cannot hide behind the first.
     */
    public function test_the_relation_allow_list_count_is_enforced(): void
    {
        $code = "<?php\n\nnamespace PanelAlpha\\ClientArea\\Projects;\n\n"
            ."use PanelAlpha\\ClientArea\\Models\\Application;\n\n"
            ."final class StagingService\n{\n    public function retry(Application \$parent): void\n    {\n"
            ."        \$parent->stagings()->whereKey(1)->first();\n"
            ."        \$parent->stagings()->whereKey(2)->first(); /*MARK*/\n"
            ."    }\n}\n";

        $this->analyse([$this->phpFile($code)], [[self::RELATION, $this->lineOf($code)]]);
    }

    /**
     * A second id-scoped `LogActivity::record` query exceeds the
     * pinned 1 and is flagged, even though each query on its own is allowed.
     */
    public function test_the_query_allow_list_count_is_enforced(): void
    {
        $code = $this->logActivity(
            "Application::query()->whereKey(1)->exists();\n"
            ."        Application::query()->whereKey(2)->exists(); /*MARK*/"
        );

        $this->analyse([$this->phpFile($code)], [[self::DIRECT, $this->lineOf($code)]]);
    }

    private function logActivity(string $body): string
    {
        return "<?php\n\nnamespace PanelAlpha\\ClientArea\\Http\\Middleware;\n\n"
            ."use PanelAlpha\\ClientArea\\Models\\Application;\n\n"
            ."final class LogActivity\n{\n    public function record(): void\n    {\n"
            ."        {$body}\n    }\n}\n";
    }

    private function packagePath(string $relative): string
    {
        return dirname(__DIR__, 3).'/../packages/'.$relative;
    }

    private function lineOf(string $code): int
    {
        $position = strpos($code, '/*MARK*/');
        $this->assertNotFalse($position, 'The fixture must carry a /*MARK*/ comment on the offending line.');

        return substr_count(substr($code, 0, (int) $position), "\n") + 1;
    }

    private function phpFile(string $code): string
    {
        $path = tempnam(sys_get_temp_dir(), 'appquery');
        $this->assertIsString($path);
        $file = $path.'.php';
        rename($path, $file);
        file_put_contents($file, $code);
        $this->temporaryFiles[] = $file;

        return $file;
    }
}
