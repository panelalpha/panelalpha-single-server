<?php

namespace Tests\Feature\ClientArea;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\ClientArea\Http\EngineRequestError;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\ClientArea\Support\EngineText;
use Tests\TestCase;

/**
 * @see Engine core/routes/api.php:114-117 (tasks) and the 422/404/409 envelope
 */
class EngineClientTest extends TestCase
{
    private function client(): EngineClient
    {
        return new EngineClient(new EngineConnection(1, 'https://engine.example.com/api/', '1|test-token'));
    }

    public function test_sends_bearer_token_to_relative_path(): void
    {
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(['data' => ['username' => 'site1']])]);

        $this->assertSame('site1', $this->client()->get('/projects/site1')->json('data.username'));

        Http::assertSent(fn ($request) => $request->url() === 'https://engine.example.com/api/projects/site1'
            && $request->hasHeader('Authorization', 'Bearer 1|test-token'));
    }

    public function test_422_becomes_validation_exception_with_problems(): void
    {
        Http::fake(['*' => Http::response([
            'message' => 'The domain is taken.',
            'errors' => ['domain' => ['The domain is taken.']],
            'problems' => [['field' => 'domain', 'code' => 'taken', 'message' => 'The domain is taken.']],
        ], 422)]);

        try {
            $this->client()->post('projects', ['domain' => 'x.test']);
            $this->fail('Expected EngineValidationException');
        } catch (EngineValidationException $e) {
            $this->assertSame(['domain' => ['The domain is taken.']], EngineErrors::validation($e)->errors());
            $this->assertSame('taken', $e->problems[0]['code']);
        }
    }

    public function test_a_422_naming_an_absolute_home_path_is_replaced_by_a_safe_message(): void
    {
        // A recorded live answer: the Engine's archive check leaks
        // the absolute home path.
        // Engine: core/app/Lib/Deploy/Source/UploadedArchive.php:42
        Http::fake(['*' => Http::response([
            'message' => 'Archive not found: /home/eefiles1zip/.panelalpha/deploy-archives/site.zip',
            'errors' => ['zip_path' => ['Archive not found: /home/eefiles1zip/.panelalpha/deploy-archives/site.zip']],
            'problems' => [['field' => 'zip_path', 'code' => 'deploy_archive_invalid', 'message' => 'Archive not found: /home/eefiles1zip/.panelalpha/deploy-archives/site.zip']],
        ], 422)]);

        Log::spy();

        try {
            $this->client()->post('projects/site1/deploy-archive');
            $this->fail('Expected EngineValidationException');
        } catch (EngineValidationException $e) {
            $this->assertSame([EngineText::SAFE_VALIDATION], EngineErrors::validation($e)->errors()['zip_path']);
            $this->assertSame(EngineText::SAFE_VALIDATION, EngineErrors::problems($e)[0]['message']);
        }

        Log::shouldHaveReceived('warning')->atLeast()->once();
    }

    public function test_a_request_error_naming_an_absolute_home_path_is_redacted(): void
    {
        // The redaction covers absolute home paths too; it keeps the
        // Engine's reason and redacts only the path.
        // Engine: core/app/Http/Controllers/User/FileController.php:149 -> FileController::mkdir
        Http::fake(['*' => Http::response([
            'message' => 'Permission denied: /home/eefiles1zip/project/.panelalpha-upload/site.zip',
        ], 400)]);

        Log::spy();

        try {
            $this->client()->post('projects/site1/rebuild');
            $this->fail('Expected EngineRequestException');
        } catch (EngineRequestException $e) {
            $this->assertSame('Permission denied: '.EngineText::REDACTED_PATH, EngineErrors::message($e));
        }

        Log::shouldHaveReceived('warning')->once();
    }

    public function test_a_request_error_starting_with_a_home_path_is_redacted(): void
    {
        // The redaction must catch a path at the very start of the
        // Engine's message too, not only one preceded by whitespace - otherwise
        // `leaksInternals` says the text leaks while `sanitize` leaves it raw.
        // Engine: core/app/Http/Controllers/User/FileController.php:149 -> FileController::mkdir
        Http::fake(['*' => Http::response([
            'message' => '/home/eefiles1zip/project/.panelalpha-upload/site.zip: permission denied',
        ], 400)]);

        Log::spy();

        try {
            $this->client()->post('projects/site1/rebuild');
            $this->fail('Expected EngineRequestException');
        } catch (EngineRequestException $e) {
            $this->assertSame(EngineText::REDACTED_PATH.': permission denied', EngineErrors::message($e));
            $this->assertStringNotContainsString('/home/', EngineErrors::message($e));
        }

        Log::shouldHaveReceived('warning')->once();
    }

    public function test_422_with_a_scalar_errors_payload_falls_back_to_the_message(): void
    {
        // The removed `! is_array($errors)` guard must still
        // send a scalar `errors` to the engine-keyed message fallback.
        // Defensive (not an Engine shape): ProblemException::of always answers `errors` as a field map; a scalar is exercised to prove the removed `is_array` guard still falls back to the message.
        Http::fake(['*' => Http::response([
            'message' => 'The domain is taken.',
            'errors' => 'boom',
        ], 422)]);

        try {
            $this->client()->post('projects', ['domain' => 'x.test']);
            $this->fail('Expected EngineValidationException');
        } catch (EngineValidationException $e) {
            $this->assertSame(['engine' => ['The domain is taken.']], EngineErrors::validation($e)->errors());
        }
    }

    public function test_409_is_passed_through_and_500_becomes_502(): void
    {
        Http::fakeSequence()
            ->push(['message' => 'Deploy already running', 'task_id' => 7], 409)
            ->push(['message' => 'boom'], 500);

        try {
            $this->client()->post('projects/site1/rebuild');
            $this->fail('Expected EngineRequestException');
        } catch (EngineRequestException $e) {
            $this->assertSame(409, EngineErrors::status($e));
            $this->assertSame('Deploy already running', EngineErrors::message($e));
        }

        try {
            $this->client()->get('projects/site1');
            $this->fail('Expected EngineRequestException');
        } catch (EngineRequestException $e) {
            $this->assertSame(502, EngineErrors::status($e));
        }
    }

    public function test_a_busy_409_naming_engine_internals_is_replaced_by_a_safe_message(): void
    {
        // The live run recorded this exact text; it names the
        // Engine task and its cancel endpoint, which the customer must not see.
        // Engine: core/app/Exceptions/DeployBusyException.php:20
        Http::fake(['*' => Http::response([
            'message' => 'A deploy of this project is already queued or running: task 48. Follow it with GET /tasks/48; if it is stuck, cancel it with POST /tasks/48/cancel.',
            'task_id' => 48,
        ], 409)]);

        Log::spy();

        try {
            $this->client()->post('projects/site1/rebuild');
            $this->fail('Expected EngineRequestException');
        } catch (EngineRequestException $e) {
            $this->assertSame(409, EngineErrors::status($e));
            $this->assertSame(EngineText::SAFE_REFUSAL, EngineErrors::message($e));
        }

        // The real Engine text goes to the log for operators.
        Log::shouldHaveReceived('warning')
            ->with('Engine text hidden from the Client Area.', \Mockery::on(
                fn (array $context): bool => str_contains((string) ($context['message'] ?? ''), 'GET /tasks/48')
            ))
            ->once();
    }

    public function test_a_4xx_naming_an_engine_path_is_redacted(): void
    {
        // Defensive (not an Engine shape): the live run's 405 names the Engine
        // route path; a 4xx with the same leak keeps the reason, hides the path.
        Http::fake(['*' => Http::response([
            'message' => 'The POST method is not supported for route api/projects/site1/wp/command.',
        ], 400)]);

        Log::spy();

        try {
            $this->client()->post('projects/site1/wp/command');
            $this->fail('Expected EngineRequestException');
        } catch (EngineRequestException $e) {
            $this->assertSame(502, EngineErrors::status($e));
            $this->assertSame('The POST method is not supported for route '.EngineText::REDACTED_ENDPOINT, EngineErrors::message($e));
        }

        Log::shouldHaveReceived('warning')->once();
    }

    /**
     * A refusal whose only internal detail is a task
     * number (no path/URI) must still be hidden from the Client Area.
     */
    public function test_a_4xx_naming_only_a_task_id_is_replaced_by_a_safe_message(): void
    {
        // Defensive (not an Engine shape): the Engine's busy texts can name the
        // running task with no follow-up URI.
        Http::fake(['*' => Http::response(['message' => 'Task 55 is still running.'], 409)]);

        Log::spy();

        try {
            $this->client()->post('projects/site1/rebuild');
            $this->fail('Expected EngineRequestException');
        } catch (EngineRequestException $e) {
            $this->assertSame(409, EngineErrors::status($e));
            $this->assertSame(EngineText::SAFE_REFUSAL, EngineErrors::message($e));
        }

        Log::shouldHaveReceived('warning')->once();
    }

    /**
     * The Engine's `project_not_eligible` refusal
     * tells the **API caller** to "Create the project with `template: dind`";
     * the customer must only see our own sentence.
     */
    public function test_a_known_project_not_eligible_code_is_mapped_to_a_safe_message(): void
    {
        // The text a live run recorded.
        $r2 = "Project 'e2egit7' is classic shared hosting, so a git source cannot be attached to it. "
            .'Create the project with `template: dind` to deploy it from git.';
        // Engine: core/app/Lib/Project/SourceAttacher.php:94 -> assertEligible project_not_eligible
        Http::fake(['*' => Http::response([
            'message' => $r2,
            'problems' => [['field' => 'git_repo', 'code' => 'project_not_eligible', 'message' => $r2]],
        ], 409)]);

        try {
            $this->client()->post('projects/e2egit7/source');
            $this->fail('Expected EngineRequestException');
        } catch (EngineRequestException $e) {
            $this->assertSame(409, EngineErrors::status($e));
            $this->assertSame('This project cannot be deployed from git. Create a new project instead.', EngineErrors::message($e));
            $this->assertStringNotContainsString('template: dind', EngineErrors::message($e));
            $this->assertStringNotContainsString('Create the project with', EngineErrors::message($e));
        }
    }

    /**
     * A known `source_already_attached` refusal is
     * also mapped to the panel's own sentence, not the Engine's project-naming
     * text; the CA shows only the safe message (unlike the busy 409).
     */
    public function test_a_known_source_already_attached_code_is_mapped_to_a_safe_message(): void
    {
        // Engine: core/app/Lib/Project/SourceAttacher.php:84 -> assertEligible source_already_attached
        Http::fake(['*' => Http::response([
            'message' => "Project 'site1' already deploys from https://github.com/example/site.git.",
            'problems' => [['field' => 'git_repo', 'code' => 'source_already_attached', 'message' => "Project 'site1' already deploys from https://github.com/example/site.git."]],
        ], 409)]);

        try {
            $this->client()->post('projects/site1/source');
            $this->fail('Expected EngineRequestException');
        } catch (EngineRequestException $e) {
            $this->assertSame(409, EngineErrors::status($e));
            $this->assertSame('This project already deploys from a git repository.', EngineErrors::message($e));
            $this->assertStringNotContainsString('site1', EngineErrors::message($e));
        }
    }

    public function test_a_caller_instruction_without_a_code_is_redacted(): void
    {
        // The same instruction with no `problems[].code` still must not reach the
        // CA: the redaction rules drop the instruction sentence and keep the
        // reason.
        // Defensive (not an Engine shape): a code-less variant proves the fallback.
        $r2 = "Project 'e2egit7' is classic shared hosting, so a git source cannot be attached to it. "
            .'Create the project with `template: dind` to deploy it from git.';
        // Defensive (not an Engine shape): the Engine always sends `problems[].code`; a code-less 400 exercises the redaction fallback.
        Http::fake(['*' => Http::response(['message' => $r2], 400)]);

        Log::spy();

        try {
            $this->client()->post('projects/e2egit7/source');
            $this->fail('Expected EngineRequestException');
        } catch (EngineRequestException $e) {
            $this->assertStringContainsString('classic shared hosting', EngineErrors::message($e));
            $this->assertStringNotContainsString('template: dind', EngineErrors::message($e));
            $this->assertStringNotContainsString('Create the project with', EngineErrors::message($e));
        }

        Log::shouldHaveReceived('warning')->once();
    }

    public function test_an_engine_4xx_is_reported_at_warning_without_a_stack_trace(): void
    {
        Log::spy();

        // The handler's report() path calls the exception's own report()
        // (expected Engine 4xx answers used to fill the log with a stack trace).
        app(\Illuminate\Contracts\Debug\ExceptionHandler::class)
            ->report(new EngineRequestException(404, 'FTP account not found'));

        Log::shouldHaveReceived('warning')
            ->with('Engine refused the request.', ['status' => 404, 'message' => 'FTP account not found'])
            ->once();
        Log::shouldNotHaveReceived('error');

        // An Engine 5xx keeps the default error reporting with the throwable.
        $this->assertFalse((new EngineRequestError(new EngineRequestException(503, 'boom')))->report());
    }

    public function test_connection_failure_becomes_unavailable(): void
    {
        Http::fake(['*' => Http::failedConnection()]);

        $this->expectException(EngineUnavailableException::class);

        $this->client()->get('projects/all');
    }

    /**
     * A client bound to one part of a project sends the parameter with every
     * call, and the caller's own value wins; a timeout copy keeps it.
     */
    public function test_a_bound_query_is_sent_with_every_call(): void
    {
        // Engine: core/app/Http/Controllers/User/Wp/WpCoreController.php:85 -> status
        Http::fake(['*' => Http::response(['data' => []])]);

        $client = $this->client()->withQuery(['path' => 'site1/public_html/blog']);

        $client->get('projects/site1/wp/core', ['skip_plugins' => 1]);
        $client->withTimeout(600)->post('projects/site1/wp/cache/flush');
        $client->get('projects/site1/wp/plugins', ['path' => 'other']);

        Http::assertSent(fn ($request) => str_contains($request->url(), '/wp/core?')
            && ($request['skip_plugins'] ?? null) == 1
            && ($request['path'] ?? null) === 'site1/public_html/blog');
        Http::assertSent(fn ($request) => str_contains($request->url(), '/wp/cache/flush')
            && str_contains($request->url(), 'path=site1%2Fpublic_html%2Fblog'));
        Http::assertSent(fn ($request) => str_contains($request->url(), '/wp/plugins?')
            && ($request['path'] ?? null) === 'other');
    }

    /**
     * The Engine's task-log stream answers 503 + `Retry-After: 5`
     * when its limiter is full; that is a retryable Engine-down answer, not a
     * generic 502.
     */
    public function test_the_task_log_stream_maps_a_503_to_engine_unavailable(): void
    {
        // Engine: core/app/Http/Controllers/TaskController.php:286 -> tooManyStreams() (503 + Retry-After)
        Http::fake(['*' => Http::response(['message' => 'Too many streams.'], 503, ['Retry-After' => '5'])]);

        try {
            $this->client()->streamTaskLogs(48, static function (): void {});
            $this->fail('Expected EngineUnavailableException');
        } catch (EngineUnavailableException $e) {
            $this->assertSame(503, EngineErrors::status($e));
        }
    }
}
