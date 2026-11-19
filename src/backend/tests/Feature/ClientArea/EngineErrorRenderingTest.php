<?php

namespace Tests\Feature\ClientArea;

use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use PanelAlpha\ClientArea\Support\EngineErrors;
use PanelAlpha\ClientArea\Support\EngineText;
use PanelAlpha\EngineClient\Exceptions\EngineUnavailableException;
use Tests\TestCase;

/**
 * What the Client Area answers for every Engine failure.
 *
 * Contract: the route is a plain pass-through read (`GET
 * /server-accounts/{id}/cron-jobs`, `AccountsApi::cronJobs`, no catch on the
 * way), so the answer is exactly the Client Area's rendering of the Engine
 * client's exception. Each case pins the raw response body and status and the
 * log lines the old self-rendering exceptions produced: this class passed
 * unchanged before the exceptions stopped rendering themselves and after it,
 * which is the byte-identity proof for the renderers.
 *
 * - CA: `packages/client-area/src/views/hosting/Cron.vue:703` loads the list;
 *   a 422 with key-0 errors shows the bare message
 *   (`packages/client-area/src/apis/Api.js:80`), any other error its `message`
 *   (`packages/client-area/src/apis/Api.js:85`).
 * - Engine: errors are rendered by `core/app/Exceptions/Handler.php:186`
 *   (`{message, errors?, problems?, code?}`); the protected refusal by
 *   `core/app/Http/Middleware/EnsureProjectNotProtected.php:157`.
 */
final class EngineErrorRenderingTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private const SAFE_VALIDATION = 'The Engine rejected the request.';

    private const SAFE_REFUSAL = 'The project is busy with another operation. Please try again later.';

    private const PROTECTED = 'The server operator has protected this project, so it cannot be deleted, stopped or redeployed from the panel.';

    /**
     * @return array<string, array{array<string, mixed>, int, int, array<string, mixed>, array{hidden: int, validationHidden: int, refused: array<string, mixed>|null, error: string|null}}>
     */
    public static function engineAnswers(): array
    {
        $none = ['hidden' => 0, 'validationHidden' => 0, 'refused' => null, 'error' => null];

        return [
            'Engine 422 with field errors' => [
                ['message' => 'The command field is required.', 'errors' => ['command' => ['The command field is required.']]], 422,
                422, ['message' => 'The command field is required.', 'errors' => ['command' => ['The command field is required.']]],
                $none,
            ],
            'Engine 422 with two field errors' => [
                ['message' => 'Invalid.', 'errors' => ['command' => ['Bad command.'], 'minute' => ['Bad minute.', 'Out of range.']]], 422,
                422, ['message' => 'Bad command. (and 2 more errors)', 'errors' => ['command' => ['Bad command.'], 'minute' => ['Bad minute.', 'Out of range.']]],
                $none,
            ],
            'Engine 422 without field errors' => [
                ['message' => 'The project is not eligible.'], 422,
                422, ['message' => 'The project is not eligible.', 'errors' => ['engine' => ['The project is not eligible.']]],
                $none,
            ],
            'Engine 422 naming a home path' => [
                [
                    'message' => 'Archive not found: /home/site1/.panelalpha/deploy-archives/site.zip',
                    'errors' => ['zip_path' => ['Archive not found: /home/site1/.panelalpha/deploy-archives/site.zip']],
                    'problems' => [['field' => 'zip_path', 'code' => 'deploy_archive_invalid', 'message' => 'Archive not found: /home/site1/.panelalpha/deploy-archives/site.zip']],
                ], 422,
                422, ['message' => self::SAFE_VALIDATION, 'errors' => ['zip_path' => [self::SAFE_VALIDATION]]],
                ['validationHidden' => 2] + $none,
            ],
            'protected project 409' => [
                ['message' => 'Project site1 is protected. Run pae project:settings:set protected off first.', 'code' => 'project_protected'], 409,
                422, ['message' => self::PROTECTED, 'errors' => [[self::PROTECTED]]],
                $none,
            ],
            'Engine 404 passes through' => [
                ['message' => 'Cron job not found.'], 404,
                404, ['message' => 'Cron job not found.'],
                ['refused' => ['status' => 404, 'message' => 'Cron job not found.']] + $none,
            ],
            'busy 409 passes through' => [
                ['message' => 'Deploy already running', 'task_id' => 7], 409,
                409, ['message' => 'Deploy already running'],
                ['refused' => ['status' => 409, 'message' => 'Deploy already running']] + $none,
            ],
            'busy 409 naming a task keeps the safe busy text' => [
                ['message' => 'A deploy of this project is already queued or running: task 48. Follow it with GET /tasks/48.', 'task_id' => 48], 409,
                409, ['message' => self::SAFE_REFUSAL],
                ['hidden' => 1, 'refused' => ['status' => 409, 'message' => self::SAFE_REFUSAL]] + $none,
            ],
            'other 409 with a known problem code' => [
                [
                    'message' => "Project 'site1' is classic shared hosting. Create the project with `template: dind` to deploy it from git.",
                    'problems' => [['field' => 'git_repo', 'code' => 'project_not_eligible', 'message' => 'x']],
                ], 409,
                409, ['message' => 'This project cannot be deployed from git. Create a new project instead.'],
                ['refused' => ['status' => 409, 'message' => 'This project cannot be deployed from git. Create a new project instead.']] + $none,
            ],
            'Engine 400 naming a home path becomes 502 redacted' => [
                ['message' => 'Permission denied: /home/site1/project/.panelalpha-upload/site.zip'], 400,
                502, ['message' => 'Permission denied: [path]'],
                ['hidden' => 1, 'refused' => ['status' => 400, 'message' => 'Permission denied: [path]']] + $none,
            ],
            'Engine 400 naming an Engine route becomes 502 redacted' => [
                ['message' => 'The POST method is not supported for route api/projects/site1/wp/command.'], 400,
                502, ['message' => 'The POST method is not supported for route [engine endpoint]'],
                ['hidden' => 1, 'refused' => ['status' => 400, 'message' => 'The POST method is not supported for route [engine endpoint]']] + $none,
            ],
            'Engine 500 becomes 502' => [
                ['message' => 'boom'], 500,
                502, ['message' => 'boom'],
                ['error' => 'boom'] + $none,
            ],
            'Engine 500 without a message' => [
                [], 500,
                502, ['message' => 'Engine API request failed with HTTP 500.'],
                ['error' => 'Engine API request failed with HTTP 500.'] + $none,
            ],
            'Engine 422 pending project reads the preparing sentence' => [
                [
                    'message' => "Project 'site1' is pending.",
                    'errors' => ['project' => ["Project 'site1' is pending."]],
                    'problems' => [['field' => 'project', 'code' => 'project_pending', 'message' => "Project 'site1' is pending."]],
                ], 422,
                422, ['message' => EngineText::STILL_PREPARING, 'errors' => ['project' => [EngineText::STILL_PREPARING]]],
                ['validationHidden' => 2] + $none,
            ],
            'Engine 422 refused deploy key reads the key sentence' => [
                [
                    'message' => "Permission denied (publickey). The repository does not accept this project's deploy key: add its public half (POST /projects/site1/git/deploy-key).",
                    'code' => 'git_ssh_key_refused',
                    'errors' => ['repo_url' => ["Permission denied (publickey). The repository does not accept this project's deploy key: add its public half (POST /projects/site1/git/deploy-key)."]],
                ], 422,
                422, ['message' => EngineText::SSH_KEY_REFUSED, 'errors' => ['repo_url' => [EngineText::SSH_KEY_REFUSED]]],
                ['validationHidden' => 1] + $none,
            ],
            'Engine 422 shared zone certificate reads the panel sentence' => [
                [
                    'message' => 'Could not obtain a certificate for site1.example.net: site1.example.net is under example.net, a zone every engine in the fleet issues under and shares one 50-certificate weekly limit on. Set shared_zone_issuance to obtain one anyway, or give the project a domain you own.',
                    'errors' => ['domain' => ['Could not obtain a certificate for site1.example.net: site1.example.net is under example.net, a zone every engine in the fleet issues under and shares one 50-certificate weekly limit on. Set shared_zone_issuance to obtain one anyway, or give the project a domain you own.']],
                ], 422,
                422, ['message' => EngineText::SHARED_ZONE_REFUSED, 'errors' => ['domain' => [EngineText::SHARED_ZONE_REFUSED]]],
                ['validationHidden' => 1] + $none,
            ],
            'Engine 500 PHP error becomes 502 with the generic detail' => [
                ['message' => 'Call to undefined method WP_Migration::run()'], 500,
                502, ['message' => EngineText::INTERNAL_ERROR_DETAIL],
                ['hidden' => 1, 'error' => EngineText::INTERNAL_ERROR_DETAIL] + $none,
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $engineBody
     * @param  array<string, mixed>  $expected
     * @param  array{hidden: int, validationHidden: int, refused: array<string, mixed>|null, error: string|null}  $logs
     */
    #[DataProvider('engineAnswers')]
    public function test_an_engine_answer_renders_as_before(array $engineBody, int $engineStatus, int $status, array $expected, array $logs): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        Log::spy();

        // Engine: core/app/Exceptions/Handler.php:186 -> the Engine's error envelope (one case per answer)
        Http::fake(['engine.example.com/api/projects/site1/cron-jobs*' => Http::response($engineBody, $engineStatus)]);

        // CA: packages/client-area/src/views/hosting/Cron.vue:703
        $response = $this->actingAs($user)->getJson("/api/server-accounts/{$application->id}/cron-jobs");

        $response->assertStatus($status);
        // CA reads: packages/client-area/src/apis/Api.js:80 (errors) and :85 (message)
        $this->assertSame(json_encode($expected), $response->getContent());

        $this->assertWarnings('Engine text hidden from the Client Area.', $logs['hidden']);
        $this->assertWarnings('Engine validation text hidden from the Client Area.', $logs['validationHidden']);
        if ($logs['refused'] === null) {
            Log::shouldNotHaveReceived('warning', ['Engine refused the request.', Mockery::any()]);
        } else {
            Log::shouldHaveReceived('warning')->with('Engine refused the request.', $logs['refused'])->once();
        }
        if ($logs['error'] === null) {
            Log::shouldNotHaveReceived('error');
        } else {
            Log::shouldHaveReceived('error')->with($logs['error'], Mockery::any())->once();
        }
    }

    private function assertWarnings(string $message, int $times): void
    {
        if ($times === 0) {
            Log::shouldNotHaveReceived('warning', [$message, Mockery::any()]);

            return;
        }

        Log::shouldHaveReceived('warning')->with($message, Mockery::any())->times($times);
    }

    public function test_an_engine_that_is_not_configured_answers_503(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        Setting::set('engine-api-token', '');
        Log::spy();

        // CA: packages/client-area/src/views/hosting/Cron.vue:703
        $response = $this->actingAs($user)->getJson("/api/server-accounts/{$application->id}/cron-jobs");

        $response->assertStatus(503);
        // CA reads: packages/client-area/src/apis/Api.js:85
        $this->assertSame(
            json_encode(['message' => 'Engine connection is not configured. Set engine-api-url and engine-api-token via settings:set.']),
            $response->getContent(),
        );
        Log::shouldHaveReceived('error')->with('Engine connection is not configured. Set engine-api-url and engine-api-token via settings:set.', Mockery::any())->once();
    }

    public function test_an_unreachable_engine_answers_503_without_the_engine_address(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);
        Log::spy();

        // External: Laravel's Http::failedConnection() (no Engine answer at all)
        Http::fake(['engine.example.com/api/projects/site1/cron-jobs*' => Http::failedConnection()]);

        // CA: packages/client-area/src/views/hosting/Cron.vue:703
        $response = $this->actingAs($user)->getJson("/api/server-accounts/{$application->id}/cron-jobs");

        $response->assertStatus(503);
        // CA reads: packages/client-area/src/apis/Api.js:85 (one sentence, no Engine internals)
        $this->assertSame(json_encode(['message' => EngineText::SAFE_UNAVAILABLE]), $response->getContent());
        $this->assertStringNotContainsString('engine.example.com', $response->getContent());
        $this->assertStringNotContainsString('cURL', $response->getContent());

        $message = 'Engine #1 is unreachable: cURL error 6: Could not resolve host: engine.example.com (see https://curl.haxx.se/libcurl/c/libcurl-errors.html) for https://engine.example.com/api/projects/site1/cron-jobs.';
        Log::shouldHaveReceived('error')->with($message, Mockery::any())->once();
    }

    /** The panel's own "this Engine is down" sentences name no address and are presented as they are. */
    public function test_a_sentence_the_panel_made_up_about_a_down_engine_is_kept(): void
    {
        $sentence = 'Engine #2 is down; the backup container is kept.';

        $this->assertSame($sentence, EngineErrors::message(new EngineUnavailableException($sentence)));
    }
}
