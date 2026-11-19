<?php

namespace Tests\Feature\ClientArea\Hosting;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PanelAlpha\EngineClient\Api\FilesApi;
use PanelAlpha\ClientArea\Hosting\EnvFileParser;
use PanelAlpha\ClientArea\Hosting\EnvFileService;
use PanelAlpha\ClientArea\Hosting\FilesClassicEnvFileReader;
use PanelAlpha\ClientArea\Models\ActivityLog;
use PanelAlpha\ClientArea\Models\Application;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The project .env editor. A container project reads and
 * writes the Engine's stored `env-vars`; a classic
 * project's real .env is read through files/download (the Engine does not own
 * it; the controller's own code) and saved with the file manager's
 * files/upload, a user-driven write.
 *
 * Contract of the classic save:
 * - CA: `EnvFile.vue:420-428` PUTs JSON `{path, mode, contents, restart}` with
 *   `contents` = the raw editor text in both modes and `restart` =
 *   `restartChecked && meta.supports_restart`; it reads `restarted` (`:403`)
 *   and shows a failure through `Api.getErrorMessage` (`:413`).
 * - Old: `ServerAccount/Instance/EnvFileController.php:76-112` – the same
 *   rules, `validatedAbsolutePath()`, `saveFileContents()` of the raw contents
 *   (create or replace, no parse check), `restarted` only for a dind service,
 *   `{success, path (absolute), restarted}`; privilege
 *   `hosting.manage_env_file`, activity `user.hosting.env_file.update[.project]`
 *   (`packages/api/routes/api.php:643-648`).
 * - Engine: `POST E:/files/upload` multipart `{path (directory), file}`
 *   (`FileController.php:665`, `UploadRequest`), 200 `{success: true}`, 400
 *   `{message}` when the write fails (`:682`); the file manager's save
 *   (`FileManagerService::updateFile`) makes this call.
 * @see packages/client-area/src/views/instance/advanced/EnvFile.vue:326 – the CA call site
 * @see Engine core/routes/api.php:146-147 (env-vars) – container projects; :231-241 (files/*) – the classic read and save
 */
class EnvFileTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function application(User $user): Application
    {
        return $this->syncedApplication($user);
    }

    /**
     * A container (DinD) project, whose env vars the Engine stores.
     */
    private function containerApplication(User $user): Application
    {
        return $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);
    }

    public function test_show_of_a_container_project_renders_the_engine_env_vars(): void
    {
        $user = User::factory()->create();
        $application = $this->containerApplication($user);

        // Engine: core/app/Http/Controllers/User/EnvVarsController.php:49 -> EnvVarsController::index, EnvVarsResource {data:{vars,applied_keys}}
        Http::fake(['engine.example.com/api/projects/site1/env-vars*' => Http::response(['data' => [
            'vars' => [
                ['key' => 'APP_ENV', 'value' => 'production', 'masked' => false],
                ['key' => 'GREETING', 'value' => 'hello world', 'masked' => false],
            ],
            'applied_keys' => ['APP_ENV'],
        ]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:355
            ->getJson("/api/server-accounts/{$application->id}/instances/{$application->id}/env-file?path=".urlencode('project/.env'))
            ->assertOk()
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:360
            ->assertJsonPath('exists', true)
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:360
            ->assertJsonPath('contents', "APP_ENV=production\nGREETING=\"hello world\"\n")
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:363
            ->assertJsonPath('parsed.0.key', 'APP_ENV');

        Http::assertSent(fn ($request) => str_contains($request->url(), '/projects/site1/env-vars')
            && $request['reveal'] === 1);
    }

    public function test_update_of_a_container_project_writes_the_engine_env_vars(): void
    {
        $user = User::factory()->create();
        $application = $this->containerApplication($user);

        // Engine: core/app/Http/Controllers/User/EnvVarsController.php:122 -> EnvVarsController::update, {data:{keys}}
        Http::fake(['engine.example.com/api/projects/site1/env-vars' => Http::response(['data' => ['keys' => ['APP_ENV', 'GREETING']]])]);

        // The same text the read renders, so the round trip is exact.
        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:420
            ->putJson("/api/server-accounts/{$application->id}/projects/{$application->id}/env-file", [
                'path' => 'project/.env',
                'mode' => 'kv',
                'contents' => "APP_ENV=production\nGREETING=\"hello world\"\n",
                'restart' => false,
            ])
            ->assertOk()
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:403
            ->assertJsonPath('restarted', false);

        Http::assertSent(fn ($request) => $request->method() === 'PUT'
            && str_contains($request->url(), '/projects/site1/env-vars')
            && $request['env_vars'] === ['APP_ENV' => 'production', 'GREETING' => 'hello world']
            && $request['replace'] === true
            && $request['apply'] === 'none');
    }

    public function test_update_of_a_container_project_applies_on_restart(): void
    {
        $user = User::factory()->create();
        $application = $this->containerApplication($user);

        // Engine: core/app/Http/Controllers/User/EnvVarsController.php:122 -> EnvVarsController::update, 202 TaskResource
        Http::fake(['engine.example.com/api/projects/site1/env-vars' => Http::response(['data' => [
            'id' => 7, 'job_type' => 'ApplyEnvVars', 'status' => 'queued',
        ]], 202)]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:420
            ->putJson("/api/server-accounts/{$application->id}/projects/{$application->id}/env-file", [
                'path' => 'project/.env',
                'mode' => 'raw',
                'contents' => "APP_ENV=production\n",
                'restart' => true,
            ])
            ->assertOk()
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:403
            ->assertJsonPath('restarted', true);

        Http::assertSent(fn ($request) => str_contains($request->url(), '/projects/site1/env-vars')
            && $request['apply'] === 'recreate');
    }

    #[DataProvider('containerForeignPathProvider')]
    public function test_a_container_env_file_read_rejects_a_foreign_path(string $path): void
    {
        $user = User::factory()->create();
        $application = $this->containerApplication($user);

        // Defensive (not an Engine shape): the path is refused before any Engine call.
        Http::fake(['engine.example.com/*' => Http::response(['data' => []])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:355 (the path comes from the editable field)
            ->getJson("/api/server-accounts/{$application->id}/instances/{$application->id}/env-file?path=".urlencode($path))
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:367
            ->assertJsonPath('errors.path.0', 'Only the project environment file project/.env can be edited.');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/env-vars'));
    }

    #[DataProvider('containerForeignPathProvider')]
    public function test_a_container_env_file_save_rejects_a_foreign_path(string $path): void
    {
        $user = User::factory()->create();
        $application = $this->containerApplication($user);

        // Defensive (not an Engine shape): the path is refused before any Engine call.
        Http::fake(['engine.example.com/*' => Http::response(['data' => []])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:420 (the path comes from the editable field)
            ->putJson("/api/server-accounts/{$application->id}/projects/{$application->id}/env-file", [
                'path' => $path,
                'mode' => 'raw',
                'contents' => "APP_ENV=production\n",
                'restart' => false,
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:413
            ->assertJsonPath('errors.path.0', 'Only the project environment file project/.env can be edited.');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/env-vars'));
    }

    /**
     * The paths a user can type that must not reach the Engine's stored env vars
     *An absolute system path, a traversal, and another file in
     * the project home.
     *
     * @return array<string, array{string}>
     */
    public static function containerForeignPathProvider(): array
    {
        return [
            'absolute system path' => ['/etc/passwd'],
            'traversal' => ['../x'],
            'another file in the home' => ['project/other.env'],
        ];
    }

    public function test_update_of_a_container_project_rejects_an_invalid_line(): void
    {
        $user = User::factory()->create();
        $application = $this->containerApplication($user);

        // Defensive (not an Engine shape): the parse fails before any Engine call.
        Http::fake(['engine.example.com/*' => Http::response(['data' => []])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:420
            ->putJson("/api/server-accounts/{$application->id}/projects/{$application->id}/env-file", [
                'path' => 'project/.env',
                'mode' => 'raw',
                'contents' => "APP_ENV=production\nnot a setting\n",
                'restart' => false,
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:413
            ->assertJsonPath('errors.contents.0', 'Line 2 is not a KEY=value setting.');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/env-vars'));
    }

    public function test_update_of_a_container_project_answers_503_when_the_engine_is_down(): void
    {
        $user = User::factory()->create();
        $application = $this->containerApplication($user);

        // Defensive (not an Engine shape): the connection never answers.
        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('down')]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:420
            ->putJson("/api/server-accounts/{$application->id}/projects/{$application->id}/env-file", [
                'path' => 'project/.env',
                'mode' => 'raw',
                'contents' => "APP_ENV=production\n",
                'restart' => false,
            ], ['Accept' => 'application/json'])
            ->assertStatus(503);
    }

    public function test_meta_reports_the_default_env_path(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:326
            ->getJson("/api/server-accounts/{$application->id}/instances/{$application->id}/env-file/meta")
            ->assertOk()
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:329
            // A classic project opens its site directory (the old panel's
            // `$application->path`); its home has no `project/` to write into.
            ->assertJsonPath('default_env_path', $application->domain.'/.env')
            ->assertJsonPath('default_env_dir', $application->domain)
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:328
            ->assertJsonPath('is_dind', false)
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:330
            ->assertJsonPath('app_type', 'custom')
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:426
            ->assertJsonPath('supports_restart', false);
    }

    public function test_meta_keeps_project_env_for_a_container_project(): void
    {
        $user = User::factory()->create();
        $application = $this->containerApplication($user);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:326
            ->getJson("/api/server-accounts/{$application->id}/instances/{$application->id}/env-file/meta")
            ->assertOk()
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:329
            ->assertJsonPath('default_env_path', 'project/.env')
            ->assertJsonPath('default_env_dir', 'project')
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:328
            ->assertJsonPath('is_dind', true);
    }

    public function test_show_parses_the_env_file(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists; :625 -> files/download
        Http::fake([
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => true, 'path' => 'project/.env']),
            'engine.example.com/api/projects/site1/files/download*' => Http::response("APP_KEY=abc\n# comment\nDB_HOST=db\n"),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:355
            ->getJson("/api/server-accounts/{$application->id}/instances/{$application->id}/env-file?path=".urlencode('project/.env'))
            ->assertOk()
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:360
            ->assertJsonPath('exists', true)
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:363
            ->assertJsonPath('parsed.0.key', 'APP_KEY')
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:363
            ->assertJsonPath('parsed.0.value', 'abc');
    }

    public function test_show_answers_an_engine_error_when_the_exists_body_is_malformed(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // A 200 without the boolean `exists` is malformed; answer the
            // Engine error instead of "does not exist".
            // Engine: core/app/Http/Controllers/User/FileController.php:54
            'engine.example.com/api/projects/site1/files/exists*' => Http::response([]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:355
            ->getJson("/api/server-accounts/{$application->id}/instances/{$application->id}/env-file?path=".urlencode('project/.env'))
            ->assertStatus(502)
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:367
            ->assertJsonPath('message', 'The Engine did not answer whether the file exists.');

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/files/download'));
    }

    public function test_show_answers_an_engine_error_when_the_exists_flag_is_not_boolean(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // `exists` present but not a boolean is still malformed: is_bool()
            // rejects it instead of reading the file.
            // Engine: core/app/Http/Controllers/User/FileController.php:54
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => 'true', 'path' => 'project/.env']),
            'engine.example.com/api/projects/site1/files/download*' => Http::response("APP_KEY=abc\n"),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:355
            ->getJson("/api/server-accounts/{$application->id}/instances/{$application->id}/env-file?path=".urlencode('project/.env'))
            ->assertStatus(502)
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:367
            ->assertJsonPath('message', 'The Engine did not answer whether the file exists.');

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/files/download'));
    }

    /**
     * The classic save writes the CA's text as it is
     * (no parse check, like the old raw write) with the file manager's
     * `files/upload` into the resolved directory, and answers the container
     * save's shape with the absolute path and no restart.
     */
    #[DataProvider('classicSavePathProvider')]
    public function test_a_classic_save_writes_the_file_through_the_file_manager_upload(string $path, string $directory, string $filename, string $absolute): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        // The CA's raw text, quotes, comment and a line no KEY=value parser
        // accepts included: the old panel wrote it unchanged.
        $contents = "APP_KEY=xyz\n# keep me\nexport GREETING='hello world'\nnot a setting";

        $sent = [];
        Http::fake([
            'engine.example.com/api/projects/site1/files/upload' => function (Request $request) use (&$sent) {
                $sent[] = self::multipart($request->body());

                // Engine: core/app/Http/Controllers/User/FileController.php:665 -> files/upload {success:true}
                return Http::response(['success' => true]);
            },
        ]);

        $response = $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:420
            ->putJson("/api/server-accounts/{$application->id}/projects/{$application->id}/env-file", [
                'path' => $path,
                'mode' => 'raw',
                'contents' => $contents,
                // The CA sends `restartChecked && meta.supports_restart`
                // (EnvFile.vue:426); a classic project has no restart either way.
                'restart' => true,
            ])
            ->assertOk();

// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:403
        $response->assertJsonPath('restarted', false);
        // The old update() answered `{success, path, restarted}` with the
        // absolute path (ServerAccount/Instance/EnvFileController.php:107-110).
        $this->assertSame(['success' => true, 'path' => $absolute, 'restarted' => false], $response->json());

        $this->assertSame([['path' => $directory, 'filename' => $filename, 'contents' => $contents]], $sent);
        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), '/env-vars'));
    }

    /**
     * The classic read's path rules (`resolvePath`): relative to
     * the home, or absolute inside it; the Engine takes the home-relative
     * directory, `/` for the home itself.
     *
     * @return array<string, array{string, string, string, string}>
     */
    public static function classicSavePathProvider(): array
    {
        return [
            'the default path' => ['project/.env', 'project', '.env', '/home/site1/project/.env'],
            'an absolute path inside the home' => ['/home/site1/project/.env', 'project', '.env', '/home/site1/project/.env'],
            'a file in the home itself' => ['./.env', '/', '.env', '/home/site1/.env'],
        ];
    }

    #[DataProvider('classicForeignPathProvider')]
    public function test_a_classic_save_refuses_a_path_outside_the_home_before_any_engine_call(string $path): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Defensive (not an Engine shape): the path is refused before any Engine call.
        Http::fake(['engine.example.com/*' => Http::response(['success' => true])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:420 (the path comes from the editable field)
            ->putJson("/api/server-accounts/{$application->id}/projects/{$application->id}/env-file", [
                'path' => $path,
                'mode' => 'raw',
                'contents' => "APP_KEY=xyz\n",
                'restart' => false,
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:413
            ->assertJsonPath('errors.path.0', 'Invalid file path.');

        Http::assertNothingSent();
        $this->assertSame(0, ActivityLog::query()->count());
    }

    /**
     * Paths the old `validatedAbsolutePath()` rejected, or that leave no file
     * to write: a traversal above the home, an absolute path outside it, a
     * traversal out of an absolute home path, the home itself and a NUL byte.
     *
     * @return array<string, array{string}>
     */
    public static function classicForeignPathProvider(): array
    {
        return [
            'traversal' => ['../../etc/passwd'],
            'absolute system path' => ['/etc/passwd'],
            'absolute traversal out of the home' => ['/home/site1/../site2/.env'],
            'the home itself' => ['/home/site1'],
            'a NUL byte' => ["project/\0.env"],
        ];
    }

    public function test_a_classic_save_answers_the_file_managers_refusal_on_an_engine_400(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:682 -> files/upload 400 {message}
        Http::fake(['engine.example.com/api/projects/site1/files/upload' => Http::response(['message' => 'Permission denied'], 400)]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:420
            ->putJson("/api/server-accounts/{$application->id}/projects/{$application->id}/env-file", [
                'path' => 'project/.env',
                'mode' => 'raw',
                'contents' => "APP_KEY=xyz\n",
                'restart' => false,
            ])
            ->assertStatus(422)
            // The file manager's save answers the old "Cannot update file."
            // for an Engine 400 (FileManagerService::updateFile); the env
            // editor shows it as the key-0 alert.
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:413
            ->assertJsonPath('errors.0.0', 'Cannot update file.');

        $this->assertSame(0, ActivityLog::query()->count());
    }

    public function test_a_classic_save_answers_503_when_the_engine_is_down_at_the_write(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Defensive (not an Engine shape): the connection never answers.
        Http::fake(['engine.example.com/api/projects/site1/files/upload' => fn () => throw new ConnectionException('down')]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:420
            ->putJson("/api/server-accounts/{$application->id}/projects/{$application->id}/env-file", [
                'path' => 'project/.env',
                'mode' => 'raw',
                'contents' => "APP_KEY=xyz\n",
                'restart' => false,
            ])
            ->assertStatus(503);
    }

    public function test_a_classic_save_answers_502_on_an_engine_5xx_at_the_write(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Defensive (not an Engine shape): an Engine 5xx at the write.
        Http::fake(['engine.example.com/api/projects/site1/files/upload' => Http::response(['message' => 'Server Error'], 500)]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:420
            ->putJson("/api/server-accounts/{$application->id}/projects/{$application->id}/env-file", [
                'path' => 'project/.env',
                'mode' => 'raw',
                'contents' => "APP_KEY=xyz\n",
                'restart' => false,
            ])
            ->assertStatus(502);
    }

    public function test_a_classic_save_logs_the_old_activity_name_for_each_path_segment(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:665 -> files/upload {success:true}
        Http::fake(['engine.example.com/api/projects/site1/files/upload' => Http::response(['success' => true])]);

        $body = [
            'path' => 'project/.env',
            'mode' => 'kv',
            'contents' => "APP_KEY=xyz\n",
            'restart' => false,
        ];

        // The old panel registered the env-file routes twice: `/instances`
        // logged `user.hosting.env_file.update`, `/projects`
        // `…update.project` (packages/api/routes/api.php:643-648).
        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:420
            ->putJson("/api/server-accounts/{$application->id}/projects/{$application->id}/env-file", $body)
            ->assertOk();

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:420
            ->putJson("/api/server-accounts/{$application->id}/instances/{$application->id}/env-file", $body)
            ->assertOk();

        $this->assertSame(
            ['user.hosting.env_file.update.project', 'user.hosting.env_file.update'],
            ActivityLog::query()->orderBy('id')->pluck('action')->all(),
        );
    }

    /**
     * The multipart `path` field and the `file` part as the Engine's
     * UploadRequest reads them.
     *
     * @return array{path: string|null, filename: string|null, contents: string|null}
     */
    private static function multipart(string $body): array
    {
        $path = preg_match('/name="path"\r\n(?:[^\r\n]+\r\n)*\r\n([^\r\n]*)\r\n/', $body, $m) === 1 ? $m[1] : null;
        $file = preg_match('/name="file"; filename="([^"]*)"\r\n(?:[^\r\n]+\r\n)*\r\n([\s\S]*?)\r\n--/', $body, $f) === 1 ? $f : null;

        return ['path' => $path, 'filename' => $file[1] ?? null, 'contents' => $file[2] ?? null];
    }

    public function test_update_requires_mode_contents_and_restart(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // CA always sends all four (`views/instance/advanced/EnvFile.vue:419-428`);
        // the old PUT validated `mode`/`contents`/`restart` as required
        // (ServerAccount/Instance/EnvFileController.php:81-86). A PUT with only
        // `path` used to hit an undefined `contents` key and answer 500.
        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:420
            ->putJson("/api/server-accounts/{$application->id}/projects/{$application->id}/env-file", [
                'path' => 'project/.env',
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:413
            ->assertJsonValidationErrors(['mode', 'contents', 'restart']);
    }

    /**
     * The table editor saves the whole file. Deleting the last variable sends
     * `contents: ""`, which the global ConvertEmptyStringsToNull used to turn
     * into null (422); the env-file PUT is exempt, and an empty map clears the vars.
     */
    public function test_a_container_save_of_empty_contents_clears_the_engine_env_vars(): void
    {
        $user = User::factory()->create();
        $application = $this->containerApplication($user);

        // Engine: core/app/Http/Controllers/User/EnvVarsController.php:123-139 -> EnvVarsController::update, `apply: none` answers {data:{keys}}
        Http::fake(['engine.example.com/api/projects/site1/env-vars' => Http::response(['data' => ['keys' => []]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:500-505 (`Api.put(envFileUrl, {path, mode: 'raw', contents, restart})`; deleting the last variable, :478, sends `contents: ""`)
            ->putJson("/api/server-accounts/{$application->id}/projects/{$application->id}/env-file", [
                'path' => 'project/.env',
                'mode' => 'raw',
                'contents' => '',
                'restart' => false,
            ])
            ->assertOk()
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:512 (`response.data.restarted`)
            ->assertJsonPath('restarted', false);

        Http::assertSent(fn ($request) => $request->method() === 'PUT'
            && str_contains($request->url(), '/projects/site1/env-vars')
            && $request['env_vars'] === []
            && $request['replace'] === true);
    }

    /**
     * TrimStrings would drop the trailing newline of the classic file; the
     * env-file PUT is exempt, so the text reaches the Engine unchanged. Both
     * the `projects` and the `instances` URL segments are covered.
     */
    #[DataProvider('envFileSegmentProvider')]
    public function test_a_classic_save_keeps_the_trailing_newline(string $segment): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $sent = [];
        Http::fake([
            'engine.example.com/api/projects/site1/files/upload' => function (Request $request) use (&$sent) {
                $sent[] = self::multipart($request->body());

                // Engine: core/app/Http/Controllers/User/FileController.php:703-705 -> files/upload {success:true}
                return Http::response(['success' => true]);
            },
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:500-505 (`Api.put(envFileUrl, {path, mode: 'raw', contents, restart})`; the CA's URL uses the `instances` segment)
            ->putJson("/api/server-accounts/{$application->id}/{$segment}/{$application->id}/env-file", [
                'path' => 'project/.env',
                'mode' => 'raw',
                'contents' => "A=1\n",
                'restart' => false,
            ])
            ->assertOk();

        $this->assertSame([['path' => 'project', 'filename' => '.env', 'contents' => "A=1\n"]], $sent);
    }

    /**
     * @return array<string, array{string}>
     */
    public static function envFileSegmentProvider(): array
    {
        return ['projects' => ['projects'], 'instances' => ['instances']];
    }

    public function test_update_rejects_an_invalid_mode(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:420
            ->putJson("/api/server-accounts/{$application->id}/projects/{$application->id}/env-file", [
                'path' => 'project/.env',
                'mode' => 'xml',
                'contents' => "A=B\n",
                'restart' => false,
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:413
            ->assertJsonValidationErrors('mode');
    }

    public function test_update_rejects_a_wordpress_project_with_the_old_message(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->update(['type' => Application::TYPE_WORDPRESS]);

        // Old text (ServerAccount/Instance/EnvFileController.php:148-150); the CA
        // shows `app_type` errors next to the editor.
        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:420
            ->putJson("/api/server-accounts/{$application->id}/projects/{$application->id}/env-file", [
                'path' => 'project/.env',
                'mode' => 'kv',
                'contents' => "A=B\n",
                'restart' => false,
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:413
            ->assertJsonPath('errors.app_type.0', 'Environment file editing is not available for WordPress instances.');

        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/files/put-contents'));
        // The file write covers a classic `.env` only: WordPress is configured
        // through `wp/config` and `wp/options`, never a file write.
        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/files/upload'));
    }

    public function test_env_file_rejects_a_path_outside_home(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:355
            ->getJson("/api/server-accounts/{$application->id}/instances/{$application->id}/env-file?path=".urlencode('../../etc/passwd'))
            ->assertStatus(422);
    }

    public function test_env_file_accepts_an_absolute_path_inside_home(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists; :625 -> files/download
        Http::fake([
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => true, 'path' => 'project/.env']),
            'engine.example.com/api/projects/site1/files/download*' => Http::response("A=B\n"),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:355
            ->getJson("/api/server-accounts/{$application->id}/instances/{$application->id}/env-file?path=".urlencode('/home/site1/project/.env'))
            ->assertOk()
            // The Engine takes home-relative paths; the answer keeps the
            // absolute path the old show() returned.
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:359
            ->assertJsonPath('path', '/home/site1/project/.env')
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:363
            ->assertJsonPath('parsed.0.value', 'B');

        Http::assertSent(fn ($r) => str_contains($r->url(), '/files/exists') && $r['path'] === 'project/.env');
    }

    public function test_env_file_rejects_an_absolute_path_outside_home(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:355
            ->getJson("/api/server-accounts/{$application->id}/instances/{$application->id}/env-file?path=".urlencode('/etc/passwd'))
            ->assertStatus(422);

        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/files/'));
    }

    public function test_the_dead_files_put_contents_helper_is_removed(): void
    {
        // The file manager creates an empty file with `files/upload` and the
        // classic env-file save reuses its `files/upload` save,
        // so `FilesApi::putContents` has no caller.
        $this->assertFalse(method_exists(FilesApi::class, 'putContents'));
    }

    public function test_the_env_file_update_returns_the_old_ca_shape(): void
    {
        // A container save returns the old
        // `{success, path, restarted}` shape, so the method no longer `never`s.
        $returnType = (new \ReflectionMethod(EnvFileService::class, 'update'))->getReturnType();

        $this->assertInstanceOf(\ReflectionNamedType::class, $returnType);
        $this->assertSame('array', $returnType->getName());
    }

    #[DataProvider('classicSizeProvider')]
    public function test_a_classic_env_file_read_keeps_the_old_1_mb_cap(int $bytes, int $status): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists; :625 -> files/download
        Http::fake([
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => true, 'path' => 'project/.env']),
            'engine.example.com/api/projects/site1/files/download*' => Http::response(str_repeat('A', $bytes)),
        ]);

        $response = $this->actingAs($user)
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:355
            ->getJson("/api/server-accounts/{$application->id}/instances/{$application->id}/env-file?path=".urlencode('project/.env'))
            ->assertStatus($status);

        if ($status === 422) {
// CA reads: packages/client-area/src/views/instance/advanced/EnvFile.vue:367
            $response->assertJsonPath('errors.path.0', 'File is too large to edit.');
        }
    }

    /**
     * The old show() refused a file over `MAX_FILE_SIZE = 1024 * 1024`
     * (ServerAccount/Instance/EnvFileController.php:21, :63).
     *
     * @return array<string, array{int, int}>
     */
    public static function classicSizeProvider(): array
    {
        return [
            'at the cap' => [1048576, 200],
            'one byte over' => [1048577, 422],
        ];
    }

    /**
     * The classic read and the `.env` parser left
     * client-area-legacy – the Engine does not own a classic `.env`,
     * so they are the env editor's own code, without `@legacy`
     * markers, and the `ClassicEnvFileReader`/`EnvFileFormat` seams are gone.
     */
    public function test_the_env_file_code_is_controller_code(): void
    {
        foreach ([EnvFileService::class, EnvFileParser::class, FilesClassicEnvFileReader::class] as $class) {
            $file = (string) (new \ReflectionClass($class))->getFileName();
            $this->assertStringContainsString('/packages/client-area/src/Hosting/', $file);
            $this->assertStringNotContainsString('@legacy', (string) file_get_contents($file));
            $this->assertStringNotContainsString('@engine-gap', (string) file_get_contents($file));
        }

        $this->assertInstanceOf(FilesClassicEnvFileReader::class, app(FilesClassicEnvFileReader::class));
    }

    public function test_env_file_requires_authentication(): void
    {
// CA: packages/client-area/src/views/instance/advanced/EnvFile.vue:326
        $this->getJson('/api/server-accounts/1/instances/1/env-file/meta')->assertUnauthorized();
    }
}
