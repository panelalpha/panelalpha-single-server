<?php

namespace Tests\Unit\Packages\EngineClient;

use Illuminate\Contracts\Debug\ExceptionHandler;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PanelAlpha\EngineClient\Api\BackupsApi;
use PanelAlpha\EngineClient\Api\ContainersApi;
use PanelAlpha\EngineClient\Api\DomainsApi;
use PanelAlpha\EngineClient\Api\EnvVarsApi;
use PanelAlpha\EngineClient\Api\FilesApi;
use PanelAlpha\EngineClient\Api\McpApi;
use PanelAlpha\EngineClient\Api\ProjectsApi;
use PanelAlpha\EngineClient\Api\SystemApi;
use PanelAlpha\EngineClient\Api\UploadsApi;
use PanelAlpha\EngineClient\Api\VaultApi;
use PanelAlpha\EngineClient\Api\WordPressMigrationsApi;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\EngineFeatures;
use PanelAlpha\EngineClient\EngineHealth;
use PanelAlpha\EngineClient\EngineProject;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\EngineClient\Exceptions\ProjectProtectedException;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;
use Tests\Support\TestNetwork;
use Tests\TestCase;
use Throwable;

/**
 * The branches of the `Api` classes that the error sweep does not reach: the
 * protected-project guards, the typed create, the Range handling of the log
 * readers, the MCP address and the plugin link check. No database.
 */
final class EngineApiBehaviourTest extends TestCase
{
    private const URL = 'https://engine.example.com/api';

    private function engine(string $url = self::URL): EngineClient
    {
        return new EngineClient(new EngineConnection(EngineConnection::DEFAULT_ID, $url, '1|token'));
    }

    private function project(bool $protected = false, ?string $domain = null): EngineProject
    {
        return new EngineProject(EngineConnection::DEFAULT_ID, 'site1', $protected, $domain);
    }

    private function fakeFeatures(): void
    {
        // Engine: core/app/Http/Controllers/SystemController.php:56
        Http::fake(['engine.example.com/api/system/info' => Http::response(['data' => ['features' => ['project_source']]])]);
    }

    /**
     * @return list<string>
     */
    private function requestLines(): array
    {
        return Http::recorded()->map(static fn (array $pair): string => $pair[0]->method().' '.$pair[0]->url())->values()->all();
    }

    // ---- protected-project guards -----------------------------------------

    public function test_stopping_actions_are_refused_for_a_protected_project_before_any_call(): void
    {
        Http::fake();
        $api = new ContainersApi($this->engine());

        foreach (['stop', 'restart', 'down'] as $action) {
            try {
                $api->projectAction($this->project(true), ['action' => $action]);
                $this->fail("{$action} must be refused");
            } catch (ProjectProtectedException $e) {
                $this->assertSame('site1', $e->username);
            }
        }
        foreach (['stop', 'restart'] as $action) {
            try {
                $api->serviceAction($this->project(true), 'web', ['action' => $action]);
                $this->fail("{$action} must be refused");
            } catch (ProjectProtectedException) {
            }
        }

        Http::assertNothingSent();
    }

    public function test_start_actions_pass_for_a_protected_project(): void
    {
        // Engine: core/app/Http/Controllers/User/ContainerController.php:110
        Http::fake(['*' => Http::response(['data' => ''], 202)]);
        $api = new ContainersApi($this->engine());

        $api->projectAction($this->project(true), ['action' => 'start']);
        $api->serviceAction($this->project(true), 'web', ['action' => 'start']);
        $api->projectAction($this->project(false), ['action' => 'stop']);

        $this->assertSame([
            'POST '.self::URL.'/projects/site1/containers/action',
            'POST '.self::URL.'/projects/site1/containers/web/action',
            'POST '.self::URL.'/projects/site1/containers/action',
        ], array_map(static fn (string $line): string => preg_replace('/\?.*$/', '', $line) ?? $line, $this->requestLines()));
    }

    public function test_only_the_main_domain_of_a_protected_project_cannot_be_deleted(): void
    {
        // Engine: core/app/Http/Middleware/EnsureProjectNotProtected.php:173
        Http::fake(['*' => Http::response('', 204)]);
        $api = new DomainsApi($this->engine());
        $project = $this->project(true, 'site1.test');

        $api->deleteDomain($project, 'addon.test');
        Http::assertSentCount(1);

        $this->expectException(ProjectProtectedException::class);
        $api->deleteDomain($project, 'site1.test');
    }

    public function test_applying_env_vars_now_is_refused_for_a_protected_project_but_storing_them_is_not(): void
    {
        // Engine: core/app/Http/Controllers/User/EnvVarsController.php:124
        Http::fake(['*' => Http::response(['data' => []])]);
        $api = new EnvVarsApi($this->engine());

        $api->update($this->project(true), ['A' => 'b'], false);
        Http::assertSentCount(1);

        $this->expectException(ProjectProtectedException::class);
        $api->update($this->project(true), ['A' => 'b'], true);
    }

    public function test_a_project_update_that_changes_the_domain_is_refused_when_protected(): void
    {
        // Engine: core/app/Http/Controllers/UserController.php:1063
        Http::fake(['*' => Http::response(['data' => ['username' => 'site1']])]);
        $api = new ProjectsApi($this->engine());

        $this->assertSame('site1', $api->update($this->project(true), ['memory_limit' => 512])['username']);
        $api->update($this->project(true), ['domain' => '']);

        $this->expectException(ProjectProtectedException::class);
        $api->update($this->project(true), ['domain' => 'new.test']);
    }

    public function test_a_source_can_not_be_set_on_a_protected_project(): void
    {
        $this->fakeFeatures();

        $this->expectException(ProjectProtectedException::class);
        (new ProjectsApi($this->engine()))->setSource($this->project(true), ['type' => 'git', 'url' => 'https://git.example.com/a.git']);
    }

    public function test_a_409_that_slips_past_a_stale_flag_is_the_same_refusal(): void
    {
        // Engine: core/app/Http/Middleware/EnsureProjectNotProtected.php:173
        Http::fake(['*' => Http::response(['message' => 'protected', 'code' => 'project_protected'], 409)]);

        $this->expectException(ProjectProtectedException::class);
        (new ProjectsApi($this->engine()))->update($this->project(false), ['domain' => 'new.test']);
    }

    // ---- ProjectsApi: create, copy, source --------------------------------

    public function test_a_create_on_an_engine_without_the_feature_sends_the_flat_body(): void
    {
        // Engine: core/app/Http/Controllers/SystemController.php:56
        Http::fake([
            'engine.example.com/api/system/info' => Http::response(['data' => ['version' => '2.2.0']]),
            // Engine: core/app/Http/Controllers/UserController.php:204
            'engine.example.com/api/projects' => Http::response(['data' => ['username' => 'site1']], 202),
        ]);

        (new ProjectsApi($this->engine()))->create(['username' => 'site1', 'domain' => 'a.test', 'template' => 'wordpress']);

        Http::assertSent(static fn (Request $request): bool => $request->url() === self::URL.'/projects'
            && $request->data() === ['username' => 'site1', 'domain' => 'a.test', 'template' => 'wordpress']);
    }

    public function test_a_create_on_an_engine_with_the_feature_sends_the_typed_body(): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/SystemController.php:56
            'engine.example.com/api/system/info' => Http::response(['data' => ['features' => ['project_source']]]),
            // Engine: core/app/Http/Controllers/UserController.php:204
            'engine.example.com/api/projects' => Http::response(['data' => ['username' => 'site1']], 202),
        ]);

        (new ProjectsApi($this->engine()))->create(['username' => 'site1', 'domain' => 'a.test', 'template' => 'wordpress']);

        Http::assertSent(static fn (Request $request): bool => $request->url() === self::URL.'/projects'
            && ($request->data()['domain'] ?? null) === ['name' => 'a.test']
            && ($request->data()['runtime'] ?? null) === 'php_hosting');
    }

    public function test_a_typed_create_refusal_is_renamed_back_to_the_flat_fields(): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/SystemController.php:56
            'engine.example.com/api/system/info' => Http::response(['data' => ['features' => ['project_source']]]),
            // Engine: core/app/Exceptions/ProblemException.php:62
            'engine.example.com/api/projects' => Http::response([
                'message' => 'taken',
                'errors' => ['domain.name' => ['taken'], 'name' => ['bad name']],
                'problems' => [['field' => 'domain.name', 'code' => 'taken', 'message' => 'taken']],
            ], 422),
        ]);

        try {
            (new ProjectsApi($this->engine()))->create(['username' => 'site1', 'domain' => 'a.test']);
            $this->fail('A 422 must throw.');
        } catch (EngineValidationException $e) {
            $this->assertSame(['domain' => ['taken'], 'username' => ['bad name']], $e->errors);
            $this->assertSame('domain', $e->problems[0]['field']);
            $this->assertSame('taken', $e->problems[0]['code']);
        }
    }

    public function test_a_copy_names_the_source_project_and_only_the_name_and_domain_given(): void
    {
        // Engine: core/app/Http/Controllers/UserController.php:204
        Http::fake(['*' => Http::response(['data' => ['username' => 'site2']], 202)]);
        $api = new ProjectsApi($this->engine());

        $api->copy($this->project(), false, ['name' => 'Copy', 'domain' => 'copy.test']);
        $api->copy($this->project(), true, ['name' => '', 'domain' => '']);
        $api->copy($this->project());

        $bodies = Http::recorded()->map(static fn (array $pair): array => $pair[0]->data())->all();
        $this->assertSame([
            'source' => ['type' => 'project', 'from' => 'site1', 'copy_databases' => false],
            'name' => 'Copy',
            'domain' => ['name' => 'copy.test'],
        ], $bodies[0]);
        $this->assertSame(['source' => ['type' => 'project', 'from' => 'site1', 'copy_databases' => true]], $bodies[1]);
        $this->assertSame($bodies[1], $bodies[2]);
    }

    public function test_a_copy_refusal_is_renamed_to_new_username(): void
    {
        // Engine: core/app/Exceptions/ProblemException.php:62
        Http::fake(['*' => Http::response(['message' => 'bad', 'errors' => ['name' => ['bad']], 'problems' => [['field' => 'domain.name', 'code' => 'taken', 'message' => 'bad']]], 422)]);

        try {
            (new ProjectsApi($this->engine()))->copy($this->project());
            $this->fail('A 422 must throw.');
        } catch (EngineValidationException $e) {
            $this->assertSame(['new_username' => ['bad']], $e->errors);
            $this->assertSame('domain', $e->problems[0]['field']);
        }
    }

    public function test_the_source_of_a_project_is_put_with_its_build_env_vars(): void
    {
        // Engine: core/app/Http/Controllers/User/ProjectSourceController.php:56
        Http::fake(['*' => Http::response(['data' => ['id' => 11]], 202)]);
        $api = new ProjectsApi($this->engine());

        $api->setSource($this->project(), ['type' => 'git', 'url' => 'https://git.example.com/a.git'], ['A' => 'b']);
        $api->setSource($this->project(), ['type' => 'archive', 'upload_id' => 'upl_1']);

        $bodies = Http::recorded()->map(static fn (array $pair): array => $pair[0]->data())->all();
        $this->assertSame(['source' => ['type' => 'git', 'url' => 'https://git.example.com/a.git'], 'build' => ['env_vars' => ['A' => 'b']]], $bodies[0]);
        $this->assertSame(['source' => ['type' => 'archive', 'upload_id' => 'upl_1']], $bodies[1]);
        $this->assertSame(['PUT '.self::URL.'/projects/site1/source', 'PUT '.self::URL.'/projects/site1/source'], $this->requestLines());
    }

    public function test_a_source_refusal_is_renamed_to_the_flat_fields(): void
    {
        // Engine: core/app/Exceptions/ProblemException.php:62
        Http::fake(['*' => Http::response(['message' => 'bad', 'errors' => ['source.url' => ['bad url']], 'problems' => []], 422)]);

        try {
            (new ProjectsApi($this->engine()))->setSource($this->project(), ['type' => 'git', 'url' => 'x']);
            $this->fail('A 422 must throw.');
        } catch (EngineValidationException $e) {
            $this->assertSame(['git_repo' => ['bad url']], $e->errors);
        }
    }

    public function test_attaching_a_git_source_on_an_engine_with_the_feature_is_a_typed_put(): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/SystemController.php:56
            'engine.example.com/api/system/info' => Http::response(['data' => ['features' => ['project_source']]]),
            // Engine: core/app/Http/Controllers/User/ProjectSourceController.php:56
            'engine.example.com/api/projects/site1/source' => Http::response(['data' => ['id' => 21]], 202),
        ]);

        $taskId = (new ProjectsApi($this->engine()))->attachSource($this->project(), [
            'git_repo' => 'https://git.example.com/a.git',
            'git_branch' => 'main',
            'git_token' => 'secret',
            'env_vars' => ['A' => 'b'],
        ]);

        $this->assertSame(21, $taskId);
        Http::assertSent(static fn (Request $request): bool => $request->method() === 'PUT' && $request->data() === [
            'source' => ['type' => 'git', 'url' => 'https://git.example.com/a.git', 'branch' => 'main', 'auth' => ['type' => 'token', 'token' => 'secret']],
            'build' => ['env_vars' => ['A' => 'b']],
        ]);
    }

    public function test_attaching_a_git_source_on_an_older_engine_is_a_flat_post_without_empty_fields(): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/SystemController.php:56
            'engine.example.com/api/system/info' => Http::response(['data' => []]),
            // Engine: core/app/Http/Controllers/UserController.php:899
            'engine.example.com/api/projects/site1/source' => Http::response(['data' => ['id' => 22]], 202),
        ]);

        $taskId = (new ProjectsApi($this->engine()))->attachSource($this->project(), [
            'git_repo' => 'https://git.example.com/a.git',
            'git_branch' => '',
            'env_vars' => ['A' => 'b'],
        ]);

        $this->assertSame(22, $taskId);
        Http::assertSent(static fn (Request $request): bool => $request->method() === 'POST'
            && $request->data() === ['git_repo' => 'https://git.example.com/a.git', 'env_vars' => ['A' => 'b']]);
    }

    public function test_attaching_a_source_to_a_protected_project_is_refused_on_an_older_engine_too(): void
    {
        // Engine: core/app/Http/Controllers/SystemController.php:56
        Http::fake(['*' => Http::response(['data' => []])]);

        $this->expectException(ProjectProtectedException::class);
        (new ProjectsApi($this->engine()))->attachSource($this->project(true), ['git_repo' => 'https://git.example.com/a.git']);
    }

    public function test_skip_steps_are_sent_only_when_given(): void
    {
        // Engine: core/app/Http/Controllers/UserController.php:204
        Http::fake(['*' => Http::response(['data' => ['id' => 5]], 202)]);
        $api = new ProjectsApi($this->engine());

        $api->rebuild($this->project(), ['dependencies' => true], ['assets']);
        $api->rebuild($this->project());
        $api->gitPull($this->project(), ['strategy' => 'ff'], ['upgrade']);
        $api->gitChangeBranch($this->project(), 'dev', null, ['assets', 'upgrade']);
        $api->deployArchive($this->project(), 'a.zip', [], ['dependencies']);

        $bodies = Http::recorded()->map(static fn (array $pair): array => $pair[0]->data())->all();
        $this->assertSame(['dependencies' => true, 'skip' => ['assets']], $bodies[0]);
        $this->assertSame([], $bodies[1]);
        $this->assertSame(['strategy' => 'ff', 'skip' => ['upgrade']], $bodies[2]);
        $this->assertSame(['assets', 'upgrade'], $bodies[3]['skip']);
        $this->assertSame(['dependencies'], $bodies[4]['skip']);
    }

    public function test_rebuild_style_calls_are_refused_for_a_protected_project_before_any_call(): void
    {
        Http::fake();
        $api = new ProjectsApi($this->engine());
        $project = $this->project(true);

        foreach ([
            fn () => $api->rebuild($project),
            fn () => $api->gitPull($project),
            fn () => $api->gitChangeBranch($project, 'dev'),
            fn () => $api->deployArchive($project, 'a.zip'),
        ] as $call) {
            try {
                $call();
                $this->fail('A protected project must be refused.');
            } catch (ProjectProtectedException) {
            }
        }

        Http::assertNothingSent();
    }

    public function test_the_app_credentials_are_read_from_the_project(): void
    {
        // Engine: core/app/Http/Controllers/User/AppCredentialsController.php:49
        Http::fake(['*' => Http::response(['data' => ['available' => true, 'login_url' => 'https://a.test/login', 'fields' => []]])]);

        $this->assertTrue((new ProjectsApi($this->engine()))->appCredentials($this->project())['available']);
        $this->assertSame(['GET '.self::URL.'/projects/site1/app-credentials'], $this->requestLines());
    }

    public function test_the_deploy_history_and_a_missing_deploy_key_read_specific_refusals_as_empty(): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/Concerns/ReadsDeployLogs.php:18
            'engine.example.com/api/projects/site1/deploys' => Http::response(['message' => 'Deploy logs work only on container projects.'], 403),
            // Engine: core/app/Exceptions/Handler.php:80
            'engine.example.com/api/projects/site1/git/deploy-key' => Http::response(['message' => 'No deploy key'], 404),
        ]);
        $api = new ProjectsApi($this->engine());

        $this->assertSame([], $api->deploys($this->project()));
        $this->assertNull($api->gitShowDeployKey($this->project()));
    }

    public function test_a_deploy_key_404_without_a_message_still_bubbles(): void
    {
        // Defensive (not an Engine shape): a proxy answers 404 without a body
        Http::fake(['engine.example.com/*' => Http::response('', 404)]);

        $this->expectException(EngineRequestException::class);
        (new ProjectsApi($this->engine()))->gitShowDeployKey($this->project());
    }

    public function test_a_deploy_key_404_from_an_engine_without_the_read_still_bubbles(): void
    {
        // The Engine's fallback route answers the string `Not Found` for a URI it has no route for.
        Http::fake([
            // Defensive (not an Engine shape): the fallback's body is a bare string, not an Engine error body.
            'engine.example.com/api/projects/site1/git/deploy-key' => Http::response('Not Found', 404),
        ]);

        $this->expectException(EngineRequestException::class);
        (new ProjectsApi($this->engine()))->gitShowDeployKey($this->project());
    }

    public function test_a_deploy_key_404_that_wraps_laravels_not_found_still_bubbles(): void
    {
        Http::fake([
            // Defensive (not an Engine shape): a framework 404 that wraps Laravel's text in `message`.
            'engine.example.com/api/projects/site1/git/deploy-key' => Http::response(['message' => 'Not Found'], 404),
        ]);

        $this->expectException(EngineRequestException::class);
        (new ProjectsApi($this->engine()))->gitShowDeployKey($this->project());
    }

    // ---- FilesApi ---------------------------------------------------------

    public function test_exists_answers_a_boolean_and_the_path_when_the_engine_sends_one(): void
    {
        // Engine: core/app/Http/Controllers/User/FileController.php:54
        Http::fake(['*' => Http::sequence()
            ->push(['exists' => true, 'path' => 'public_html/index.php'])
            ->push(['exists' => false])]);
        $api = new FilesApi($this->engine());

        $this->assertSame(['exists' => true, 'path' => 'public_html/index.php'], $api->exists($this->project(), 'public_html/index.php'));
        $this->assertSame(['exists' => false], $api->exists($this->project(), 'nope'));
    }

    public function test_a_wp_cli_and_an_ssh_command_post_their_body_and_return_the_raw_answer(): void
    {
        // Engine: core/app/Http/Controllers/User/Wp/WpCliController.php:61
        Http::fake(['*' => Http::response(['exit_code' => 0, 'stdout' => 'ok', 'stderr' => ''])]);
        $api = new FilesApi($this->engine());

        $this->assertSame('ok', $api->wpCommand($this->project(), ['plugin', 'list'])['stdout']);
        $api->sshCommand($this->project(), 'ls', '/app', 30);
        $api->sshCommand($this->project(), 'ls');

        $bodies = Http::recorded()->map(static fn (array $pair): array => $pair[0]->data())->all();
        $this->assertSame(['args' => ['plugin', 'list']], $bodies[0]);
        $this->assertSame(['command' => 'ls', 'cwd' => '/app', 'timeout' => 30], $bodies[1]);
        $this->assertSame(['command' => 'ls'], $bodies[2]);
        $this->assertSame([
            'POST '.self::URL.'/projects/site1/wp-cli/command',
            'POST '.self::URL.'/projects/site1/ssh/command',
            'POST '.self::URL.'/projects/site1/ssh/command',
        ], $this->requestLines());
    }

    public function test_a_log_range_reads_exactly_the_requested_length(): void
    {
        // Defensive (not an Engine shape): RFC 9110 section 15.3.7 partial content (206) answer of a ranged GET
        Http::fake(['*' => Http::response('0123456789abcdef', 206)]);

        $part = (new FilesApi($this->engine()))->logFileRange($this->project(), 'a.test', 'access.log', 0, 9);

        $this->assertSame('0123456789', $part);
        Http::assertSent(static fn (Request $request): bool => $request->hasHeader('Range', 'bytes=0-9')
            && $request->url() === self::URL.'/projects/site1/domains/a.test/log-files/access.log?all_webservers=1');
    }

    public function test_a_log_range_past_the_end_surfaces_the_engines_416(): void
    {
        // Defensive (not an Engine shape): RFC 9110 section 15.5.17 range not satisfiable (416)
        Http::fake(['*' => Http::response(['message' => 'Range not satisfiable'], 416)]);

        try {
            (new FilesApi($this->engine()))->logFileRange($this->project(), 'a.test', 'access.log', 100, 200);
            $this->fail('A 416 must throw.');
        } catch (EngineRequestException $e) {
            $this->assertSame(416, $e->engineStatus);
        }
    }

    public function test_a_log_tail_longer_than_the_file_is_re_read_without_a_range(): void
    {
        // Defensive (not an Engine shape): RFC 9110 section 15.5.17 range not satisfiable (416) for a suffix longer than the file
        // Defensive (not an Engine shape): RFC 9110 section 15.3.1 OK answer of a plain GET
        Http::fake(['*' => Http::sequence()->push('', 416)->push('line1 line2 line3')]);

        $tail = (new FilesApi($this->engine()))->logFileContents($this->project(), 'a.test', 'access.log', 11);

        $this->assertSame('line2 line3', $tail);
        $sent = Http::recorded()->map(static fn (array $pair): Request => $pair[0])->all();
        $this->assertTrue($sent[0]->hasHeader('Range', 'bytes=-11'));
        $this->assertFalse($sent[1]->hasHeader('Range'));
    }

    public function test_a_log_file_error_other_than_416_bubbles(): void
    {
        // Engine: core/app/Exceptions/Handler.php:80
        Http::fake(['*' => Http::response(['message' => 'No such log'], 404)]);

        try {
            (new FilesApi($this->engine()))->logFileContents($this->project(), 'a.test', 'nope.log', 10);
            $this->fail('A 404 must throw.');
        } catch (EngineRequestException $e) {
            $this->assertSame(404, $e->engineStatus);
        }
    }

    public function test_a_whole_log_without_a_limit_is_read_without_a_range(): void
    {
        // Defensive (not an Engine shape): RFC 9110 section 15.3.1 OK answer of a plain GET
        Http::fake(['*' => Http::response('the whole log')]);

        $this->assertSame('the whole log', (new FilesApi($this->engine()))->logFileContents($this->project(), 'a.test', 'access.log'));
        Http::assertSent(static fn (Request $request): bool => ! $request->hasHeader('Range'));
    }

    public function test_reading_a_file_asks_for_twice_the_limit_and_keeps_the_tail(): void
    {
        // Defensive (not an Engine shape): RFC 9110 section 15.3.7 partial content (206) answer of a ranged GET
        Http::fake(['*' => Http::response('abcdefghij', 206)]);

        $this->assertSame('ghij', (new FilesApi($this->engine()))->readFile($this->project(), 'public_html/debug.log', 4));
        Http::assertSent(static fn (Request $request): bool => $request->hasHeader('Range', 'bytes=-8'));
    }

    public function test_reading_a_file_re_reads_on_a_416_and_takes_the_tail_locally(): void
    {
        // Defensive (not an Engine shape): RFC 9110 section 15.5.17 range not satisfiable (416) for a suffix longer than the file
        // Defensive (not an Engine shape): RFC 9110 section 15.3.1 OK answer of a plain GET
        Http::fake(['*' => Http::sequence()->push('', 416)->push('short file')]);

        $this->assertSame('hort file', (new FilesApi($this->engine()))->readFile($this->project(), 'a.log', 9));
    }

    public function test_reading_a_missing_file_throws_the_engines_404(): void
    {
        // Engine: core/app/Exceptions/Handler.php:80
        Http::fake(['*' => Http::response(['message' => 'File not found'], 404)]);
        try {
            (new FilesApi($this->engine()))->readFile($this->project(), 'missing.log');
            $this->fail('A 404 must throw.');
        } catch (EngineRequestException $e) {
            $this->assertSame(404, $e->engineStatus);
        }
    }

    public function test_reading_a_file_reports_a_failure_that_is_not_a_404(): void
    {
        // Engine: core/app/Exceptions/Handler.php:106
        Http::fake(['*' => Http::response(['message' => 'disk error'], 500)]);
        $reported = [];
        $this->app->instance(ExceptionHandler::class, new class($reported) implements ExceptionHandler
        {
            public function __construct(public array &$reported) {}

            public function report(Throwable $e): void
            {
                $this->reported[] = $e::class;
            }

            public function shouldReport(Throwable $e): bool
            {
                return true;
            }

            public function render($request, Throwable $e): SymfonyResponse
            {
                return new SymfonyResponse;
            }

            public function renderForConsole($output, Throwable $e): void {}
        });

        try {
            (new FilesApi($this->engine()))->readFile($this->project(), 'a.log');
            $this->fail('A 500 must throw.');
        } catch (EngineRequestException) {
        }

        $this->assertSame([EngineRequestException::class], $reported);
    }

    public function test_a_file_and_a_log_file_can_be_streamed_and_opened(): void
    {
        // Defensive (not an Engine shape): RFC 9110 section 15.3.1 OK answer of a plain GET
        Http::fake(['*' => Http::response('body bytes')]);
        $api = new FilesApi($this->engine());

        $seen = [];
        $api->streamFile($this->project(), 'public_html/a.txt', function ($body) use (&$seen): void {
            $seen[] = (string) $body;
        });
        $api->streamLogFile($this->project(), 'a.test', 'access.log', function ($body) use (&$seen): void {
            $seen[] = (string) $body;
        });
        $seen[] = (string) $api->openFileStream($this->project(), 'public_html/a.txt');
        $seen[] = (string) $api->openLogFileStream($this->project(), 'a.test', 'access.log');

        $this->assertSame(array_fill(0, 4, 'body bytes'), $seen);
        $this->assertSame([
            'GET '.self::URL.'/projects/site1/files/download?path=public_html%2Fa.txt',
            'GET '.self::URL.'/projects/site1/domains/a.test/log-files/access.log?all_webservers=1',
            'GET '.self::URL.'/projects/site1/files/download?path=public_html%2Fa.txt',
            'GET '.self::URL.'/projects/site1/domains/a.test/log-files/access.log?all_webservers=1',
        ], $this->requestLines());
    }

    public function test_the_php_error_log_drops_lines_that_are_not_strings(): void
    {
        // Engine: core/app/Http/Controllers/User/PhpController.php:98
        Http::fake(['*' => Http::response(['data' => ['lines' => ['a', 7, null, 'b'], 'file' => 'php_error.log']])]);

        $this->assertSame(['a', 'b'], (new FilesApi($this->engine()))->phpErrorLog($this->project(), 50));
        Http::assertSent(static fn (Request $request): bool => str_ends_with($request->url(), '/projects/site1/php/error-log?lines=50'));
    }

    // ---- BackupsApi, SystemApi, McpApi, uploads, vault, migrations ---------

    public function test_a_backup_download_forwards_a_range_only_when_given(): void
    {
        // Defensive (not an Engine shape): RFC 9110 section 15.3.7 partial content (206) answer of a ranged GET
        Http::fake(['*' => Http::response('part', 206)]);
        $api = new BackupsApi($this->engine());

        $this->assertSame(206, $api->download($this->project(), 5, 2, 'bytes=0-3')->status());
        $api->download($this->project(), 5, 2, '');
        $api->download($this->project(), 5, 2);

        $sent = Http::recorded()->map(static fn (array $pair): Request => $pair[0])->all();
        $this->assertTrue($sent[0]->hasHeader('Range', 'bytes=0-3'));
        $this->assertFalse($sent[1]->hasHeader('Range'));
        $this->assertFalse($sent[2]->hasHeader('Range'));
        $this->assertSame(self::URL.'/projects/site1/backups/5/items/2/download', $sent[2]->url());
    }

    public function test_the_ssl_config_and_the_subdomain_bases_come_from_the_engine(): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/SystemController.php:191
            'engine.example.com/api/system/ssl-config' => Http::response(['data' => ['issuer' => 'acme', 'acme_email' => 'a@example.com']]),
            // Engine: core/app/Http/Controllers/SystemController.php:56
            'engine.example.com/api/system/info' => Http::response(['data' => ['sites_base_domain' => 'sites.example.com']]),
        ]);
        $api = new SystemApi($this->engine());

        $this->assertSame('acme', $api->sslConfig()['issuer']);
        $this->assertSame(['sites.example.com'], $api->subdomainBases());
    }

    public function test_subdomain_bases_fall_back_and_drop_duplicates_and_blanks(): void
    {
        $this->assertSame(['panelalpha.online'], SystemApi::subdomainBasesFrom([]));
        $this->assertSame(['fallback.test'], SystemApi::subdomainBasesFrom(['sites_base_domain' => ''], 'fallback.test'));
        $this->assertSame(['a.test', 'b.test'], SystemApi::subdomainBasesFrom(['sites_base_domain' => 'a.test', 'sites_base_domains' => ['a.test', '', 'b.test', 7]]));
    }

    public function test_rename_bases_skip_the_online_zone_and_fall_back_to_the_cert_domain_then_the_direct_name(): void
    {
        $this->assertSame(['sites.example.com'], SystemApi::renameBasesFrom(['sites_base_domain' => 'sites.example.com', 'cert_domain' => 'cert.example.com']));
        $this->assertSame(['cert.example.com'], SystemApi::renameBasesFrom(['sites_base_domain' => 'panelalpha.online', 'cert_domain' => ' Cert.Example.com. ']));
        $this->assertSame([str_replace('.', '-', TestNetwork::public(5)).'.panelalpha.direct'], SystemApi::renameBasesFrom(['sites_base_domain' => 'x.panelalpha.online', 'cert_domain' => 'y.panelalpha.online', 'default_ipv4' => TestNetwork::public(5)]));
        $this->assertSame([], SystemApi::renameBasesFrom(['default_ipv4' => 'not an ip']));
        $this->assertSame([], SystemApi::renameBasesFrom([]));
    }

    public function test_the_mcp_url_is_the_engine_origin_unless_overridden(): void
    {
        $this->assertSame('https://engine.example.com/mcp', (new McpApi($this->engine()))->mcpUrl());
        $this->assertSame('https://engine.example.com:2011/mcp', (new McpApi($this->engine('https://engine.example.com:2011/api/')))->mcpUrl());
        $this->assertSame('https://mcp.example.com/custom', (new McpApi($this->engine(), 'https://mcp.example.com/custom/'))->mcpUrl());
        $this->assertSame('https://engine.example.com/mcp', (new McpApi($this->engine(), ''))->mcpUrl());
    }

    public function test_an_engine_url_that_is_not_absolute_can_not_serve_mcp(): void
    {
        foreach (['engine.example.com/api', '/api', 'http:///api', 'http://:80'] as $url) {
            try {
                (new McpApi($this->engine($url)))->mcpUrl();
                $this->fail("{$url} must not serve MCP");
            } catch (EngineUnavailableException $e) {
                $this->assertSame('The Engine API URL cannot serve an MCP endpoint.', $e->getMessage());
            }
        }
    }

    public function test_the_mcp_proxy_appends_the_suffix_to_the_derived_url(): void
    {
        // Defensive (not an Engine shape): Model Context Protocol streamable HTTP transport answer
        Http::fake(['*' => Http::response('', 202)]);

        $response = (new McpApi($this->engine()))->proxyMcp('POST', 'caller-token', ['json' => ['jsonrpc' => '2.0']], '/messages');

        $this->assertSame(202, $response->status());
        Http::assertSent(static fn (Request $request): bool => $request->url() === 'https://engine.example.com/mcp/messages'
            && $request->hasHeader('Authorization', 'Bearer caller-token'));
    }

    public function test_an_upload_is_stored_read_and_deleted_by_its_id(): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/UploadController.php:49
            'engine.example.com/api/uploads' => Http::response(['data' => ['id' => 'upl_1', 'filename' => 'a.zip']], 201),
            // Engine: core/app/Http/Controllers/UploadController.php:69
            'engine.example.com/api/uploads/upl_1' => Http::response(['data' => ['id' => 'upl_1', 'claimed_by' => null]]),
        ]);
        $api = new UploadsApi($this->engine());

        $this->assertSame('upl_1', $api->store('zip bytes', 'a.zip')['id']);
        $this->assertNull($api->show('upl_1')['claimed_by']);
        $api->delete('upl_1');

        $this->assertSame([
            'POST '.self::URL.'/uploads',
            'GET '.self::URL.'/uploads/upl_1',
            'DELETE '.self::URL.'/uploads/upl_1',
        ], $this->requestLines());
    }

    public function test_an_upload_id_is_url_encoded(): void
    {
        // Engine: core/app/Http/Controllers/UploadController.php:69
        Http::fake(['*' => Http::response(['data' => []])]);

        (new UploadsApi($this->engine()))->show('a/b c');

        $this->assertSame(['GET '.self::URL.'/uploads/a%2Fb%20c'], $this->requestLines());
    }

    public function test_a_deploy_key_is_created_without_empty_params(): void
    {
        // Engine: core/app/Http/Controllers/SecretVaultController.php:176
        Http::fake(['*' => Http::response(['data' => ['ref' => 'vault:abc', 'public_key' => 'ssh-ed25519 AAAA']], 201)]);

        $key = (new VaultApi($this->engine()))->createDeployKey(['scope' => 'project', 'project' => 'site1', 'host' => '', 'purpose' => null, 'expires_in' => 0]);

        $this->assertSame('vault:abc', $key['ref']);
        Http::assertSent(static fn (Request $request): bool => $request->url() === self::URL.'/vault/deploy-keys'
            && $request->data() === ['scope' => 'project', 'project' => 'site1', 'expires_in' => 0]);
    }

    public function test_a_plugin_package_needs_a_64_char_token_and_a_link(): void
    {
        $token = str_repeat('ab', 32);
        // Engine: core/app/Http/Controllers/WordpressMigrationController.php:219
        Http::fake([
            'engine.example.com/api/wordpress/migrations/plugin-package' => Http::sequence()
                ->push(['token' => $token, 'download_url' => self::URL.'/wordpress/migrations/plugin-package/'.$token.'?signature=x', 'expires_at' => '2026-11-10T00:00:00Z'])
                ->push(['token' => 'short', 'download_url' => 'https://engine.example.com/x'])
                ->push(['token' => $token, 'download_url' => '']),
        ]);
        $api = new WordPressMigrationsApi($this->engine());

        $package = $api->pluginPackage();
        $this->assertSame($token, $package['token']);
        $this->assertStringContainsString('signature=x', $package['download_url']);

        foreach ([1, 2] as $_) {
            try {
                $api->pluginPackage();
                $this->fail('A malformed package must throw.');
            } catch (EngineRequestException $e) {
                $this->assertSame(502, $e->engineStatus);
            }
        }
    }

    public function test_the_plugin_zip_is_opened_relative_to_the_engine_base_path(): void
    {
        // Engine: core/app/Http/Controllers/WordpressMigrationController.php:238
        Http::fake(['*' => Http::response('PK zip bytes')]);

        $body = (new WordPressMigrationsApi($this->engine()))->openPluginPackage(self::URL.'/wordpress/migrations/plugin-package/abc?signature=s&expires=1');

        $this->assertSame('PK zip bytes', (string) $body);
        $this->assertSame(['GET '.self::URL.'/wordpress/migrations/plugin-package/abc?signature=s&expires=1'], $this->requestLines());
    }

    public function test_the_plugin_zip_link_works_without_a_base_path_or_a_query(): void
    {
        // Engine: core/app/Http/Controllers/WordpressMigrationController.php:238
        Http::fake(['*' => Http::response('PK')]);

        (new WordPressMigrationsApi($this->engine('https://engine.example.com:2011')))->openPluginPackage('HTTPS://ENGINE.example.com:2011/plugin.zip');

        $this->assertSame(['GET https://engine.example.com:2011/plugin.zip'], $this->requestLines());
    }

    public function test_a_plugin_link_on_another_origin_is_refused_without_a_request(): void
    {
        Http::fake();
        $api = new WordPressMigrationsApi($this->engine());

        foreach (['https://evil.example.com/api/x', 'http://engine.example.com/api/x', 'https://engine.example.com:8443/api/x', '/api/x', 'not a url'] as $link) {
            try {
                $api->openPluginPackage($link);
                $this->fail("{$link} must be refused");
            } catch (EngineRequestException $e) {
                $this->assertSame(502, $e->engineStatus);
            }
        }

        Http::assertNothingSent();
    }

    public function test_a_plugin_zip_is_refused_when_the_engine_url_has_no_origin(): void
    {
        Http::fake();

        $this->expectException(EngineRequestException::class);
        (new WordPressMigrationsApi($this->engine('engine.example.com/api')))->openPluginPackage('https://engine.example.com/api/x');
    }

    // ---- EngineClient, EngineFeatures, EngineHealth ------------------------

    public function test_list_projects_and_project_read_the_data_key(): void
    {
        // Engine: core/app/Http/Controllers/UserController.php:204
        Http::fake(['*' => Http::sequence()
            ->push(['data' => [['username' => 'a'], 'junk', ['username' => 'b']]])
            ->push(['data' => ['username' => 'a', 'status' => 'active']])]);
        $client = $this->engine();

        $this->assertSame([['username' => 'a'], ['username' => 'b']], $client->listProjects());
        $this->assertSame('active', $client->project($this->project())['status']);
        $this->assertSame(['GET '.self::URL.'/projects/all?with_domain_names=1', 'GET '.self::URL.'/projects/site1'], $this->requestLines());
    }

    public function test_list_projects_refuses_a_payload_without_a_list(): void
    {
        // Defensive (not an Engine shape): an answer without its data key
        Http::fake(['engine.example.com/*' => Http::response(['data' => 'oops'])]);

        try {
            $this->engine()->listProjects();
            $this->fail('A malformed list must throw.');
        } catch (EngineRequestException $e) {
            $this->assertSame(200, $e->engineStatus);
            $this->assertSame('Engine API returned an unexpected projects payload.', $e->getMessage());
        }
    }

    public function test_a_task_is_polled_with_a_cursor_only_when_given(): void
    {
        // Engine: core/app/Http/Controllers/TaskController.php:207
        Http::fake(['*' => Http::response(['data' => ['id' => 9, 'status' => 'running']])]);
        $client = $this->engine();

        $this->assertSame('running', $client->task(9)['status']);
        $client->task(9, 40);

        $this->assertSame(['GET '.self::URL.'/tasks/9', 'GET '.self::URL.'/tasks/9?after_id=40'], $this->requestLines());
    }

    public function test_features_fall_back_to_the_last_known_good_answer_when_the_engine_fails(): void
    {
        // Engine: core/app/Http/Controllers/SystemController.php:56
        Http::fake([
            'engine.example.com/api/system/info' => Http::sequence()
                ->push(['data' => ['features' => ['project_source']]])
                ->push(['message' => 'down'], 502),
        ]);
        $client = $this->engine();

        $this->assertTrue(EngineFeatures::supports($client, EngineFeatures::PROJECT_SOURCE));

        Cache::forget('engine-client:features:1:'.md5(self::URL));
        $this->assertTrue(EngineFeatures::supports($client, EngineFeatures::PROJECT_SOURCE));
    }

    public function test_an_engine_that_was_never_read_has_no_features(): void
    {
        Http::fake([
            // Engine: core/app/Exceptions/Handler.php:106
            'engine.example.com/api/system/info' => Http::response(['message' => 'down'], 502),
        ]);

        $this->assertSame([], EngineFeatures::of($this->engine()));
    }

    public function test_the_hosts_refresh_remembers_the_features_it_read(): void
    {
        Http::fake();
        $client = $this->engine();

        EngineFeatures::remember($client, ['features' => ['project_source', 7]]);

        $this->assertSame(['project_source'], EngineFeatures::of($client));
        Http::assertNothingSent();
    }

    public function test_the_breaker_is_down_until_five_minutes_pass_and_then_forgets(): void
    {
        $health = app(EngineHealth::class);
        $this->assertFalse($health->isDown(1));

        $health->open(1);
        $this->assertTrue($health->isDown(1));

        $this->travel(EngineHealth::OPEN_SECONDS - 1)->seconds();
        $this->assertTrue($health->isDown(1));

        $this->travel(2)->seconds();
        $this->assertFalse($health->isDown(1));
        $this->assertFalse(Cache::has('user-application:engine:1:unavailable-since'));
    }

    public function test_closing_a_closed_breaker_does_nothing_and_other_engines_are_independent(): void
    {
        $health = app(EngineHealth::class);
        $health->close(1);
        $health->open(2);

        $this->assertFalse($health->isDown(1));
        $this->assertTrue($health->isDown(2));

        $health->close(2);
        $this->assertFalse($health->isDown(2));
    }
}
