<?php

namespace Tests\Feature\ClientArea;

use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\EngineConnection;
use PanelAlpha\EngineClient\EngineProject;
use PanelAlpha\EngineClient\Exceptions\EngineException;
use PanelAlpha\EngineClient\Exceptions\EngineNotConfiguredException;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use PanelAlpha\EngineClient\Exceptions\EngineValidationException;
use PanelAlpha\EngineClient\Exceptions\ProjectProtectedException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The Engine client's exceptions carry facts only.
 *
 * Contract: an Engine error answer becomes an exception with the Engine
 * status, its `code`, its own message and `problems[]`, unredacted; none of
 * them renders or reports itself (the Client Area does, see
 * EngineErrorRenderingTest). Not configured, unavailable, refused, validation
 * and protected are distinct types; only the first three are EngineExceptions,
 * so a `catch (EngineException)` takes neither a 422 nor a protected refusal,
 * as before. The Engine shapes: `core/app/Exceptions/Handler.php:186`
 * (`{message, errors?, problems?, code?}`) and the protected refusal
 * `core/app/Http/Middleware/EnsureProjectNotProtected.php:157`.
 */
final class EngineExceptionFactsTest extends TestCase
{
    private function client(): EngineClient
    {
        return new EngineClient(new EngineConnection(1, 'https://engine.example.com/api', '1|test-token'));
    }

    public function test_an_error_answer_keeps_the_engine_facts_unredacted(): void
    {
        $text = 'A deploy of this project is already queued or running: task 48. Follow it with GET /tasks/48.';
        $problems = [['field' => 'git_repo', 'code' => 'project_busy', 'message' => $text]];
        // Engine: core/app/Exceptions/DeployBusyException.php:20
        Http::fake(['*' => Http::response(['message' => $text, 'code' => 'deploy_busy', 'problems' => $problems, 'task_id' => 48], 409)]);

        try {
            $this->client()->post('projects/site1/rebuild');
            $this->fail('Expected EngineRequestException');
        } catch (EngineRequestException $e) {
            $this->assertSame(409, $e->engineStatus);
            $this->assertSame('deploy_busy', $e->engineCode);
            $this->assertSame($text, $e->engineMessage);
            $this->assertSame($text, $e->getMessage());
            $this->assertSame($problems, $e->problems);
            $this->assertSame(48, $e->response?->json('task_id'));
        }
    }

    public function test_an_error_answer_without_a_message_gets_a_neutral_one(): void
    {
        // Defensive (not an Engine shape): the Engine always sends `message`; a bare 500 proves the neutral fallback.
        Http::fake(['*' => Http::response([], 500)]);

        try {
            $this->client()->get('projects/site1');
            $this->fail('Expected EngineRequestException');
        } catch (EngineRequestException $e) {
            $this->assertNull($e->engineMessage);
            $this->assertNull($e->engineCode);
            $this->assertSame('Engine API request failed with HTTP 500.', $e->getMessage());
        }
    }

    public function test_a_422_keeps_the_engine_field_errors_and_problems_unredacted(): void
    {
        $text = 'Archive not found: /home/site1/.panelalpha/deploy-archives/site.zip';
        // Engine: core/app/Lib/Deploy/Source/UploadedArchive.php:42
        Http::fake(['*' => Http::response([
            'message' => $text,
            'errors' => ['zip_path' => [$text], 'env' => 'A scalar error.'],
            'problems' => [['field' => 'zip_path', 'code' => 'deploy_archive_invalid', 'message' => $text]],
        ], 422)]);

        try {
            $this->client()->post('projects/site1/deploy-archive');
            $this->fail('Expected EngineValidationException');
        } catch (EngineValidationException $e) {
            $this->assertNotInstanceOf(ValidationException::class, $e);
            $this->assertSame($text, $e->getMessage());
            $this->assertSame(['zip_path' => [$text], 'env' => ['A scalar error.']], $e->errors);
            $this->assertSame([['field' => 'zip_path', 'code' => 'deploy_archive_invalid', 'message' => $text]], $e->problems);
        }
    }

    public function test_a_protected_409_is_its_own_type_and_another_409_is_not(): void
    {
        // Engine: core/app/Http/Middleware/EnsureProjectNotProtected.php:157 -> 409 {message, code: project_protected}
        Http::fakeSequence()
            ->push(['message' => 'Project site1 is protected.', 'code' => 'project_protected'], 409)
            // Engine: core/app/Exceptions/DeployBusyException.php:20
            ->push(['message' => 'Deploy already running', 'code' => 'deploy_busy'], 409);

        try {
            $this->client()->delete('projects/site1');
            $this->fail('Expected ProjectProtectedException');
        } catch (ProjectProtectedException $e) {
            $this->assertSame(409, $e->engineStatus);
            $this->assertSame(ProjectProtectedException::CODE, $e->engineCode);
            $this->assertSame('Project site1 is protected.', $e->getMessage());
        }

        $this->expectException(EngineRequestException::class);
        $this->client()->delete('projects/site1');
    }

    public function test_the_pre_check_refuses_with_the_project_and_no_engine_status(): void
    {
        Http::fake();

        try {
            ProjectProtectedException::throwIfProtected(new EngineProject(1, 'site1', protected: true));
            $this->fail('Expected ProjectProtectedException');
        } catch (ProjectProtectedException $e) {
            $this->assertSame('site1', $e->username);
            $this->assertNull($e->engineStatus);
            $this->assertNull($e->engineCode);
        }

        ProjectProtectedException::throwIfProtected(new EngineProject(1, 'site1'));
        Http::assertNothingSent();
    }

    /**
     * @return array<string, array{class-string}>
     */
    public static function engineExceptions(): array
    {
        return [
            'not configured' => [EngineNotConfiguredException::class],
            'unavailable' => [EngineUnavailableException::class],
            'refused' => [EngineRequestException::class],
            'validation' => [EngineValidationException::class],
            'protected' => [ProjectProtectedException::class],
        ];
    }

    /**
     * @param  class-string  $class
     */
    #[DataProvider('engineExceptions')]
    public function test_an_engine_exception_renders_and_reports_nothing(string $class): void
    {
        foreach (['render', 'report', 'httpStatus', 'toResponse', 'context'] as $method) {
            $this->assertFalse(method_exists($class, $method), "{$class}::{$method}() presents the failure.");
        }
        $this->assertFalse(is_subclass_of($class, ValidationException::class));
    }

    public function test_the_failures_stay_distinct_types(): void
    {
        $classes = array_map(static fn (array $case): string => $case[0], self::engineExceptions());
        foreach ($classes as $class) {
            foreach ($classes as $other) {
                if ($class !== $other) {
                    $this->assertFalse(is_a($class, $other, true), "{$class} is a {$other}.");
                }
            }
        }

        // A `catch (EngineException)` takes the three call failures, never a 422
        // or a protected refusal (it did not before either: both were Laravel
        // ValidationExceptions).
        $this->assertTrue(is_subclass_of(EngineNotConfiguredException::class, EngineException::class));
        $this->assertTrue(is_subclass_of(EngineUnavailableException::class, EngineException::class));
        $this->assertTrue(is_subclass_of(EngineRequestException::class, EngineException::class));
        $this->assertFalse(is_subclass_of(EngineValidationException::class, EngineException::class));
        $this->assertFalse(is_subclass_of(ProjectProtectedException::class, EngineException::class));
    }
}
