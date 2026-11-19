<?php

namespace Tests\Feature\ClientArea\Hosting;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Contracts\ApplicationProvisioner;
use PanelAlpha\ClientArea\Hosting\ServerAccountService;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Provisioning\ProvisionRequest;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * MySQL hosting pages for a server account
 * (id = project in single-server mode).
 * @see packages/client-area/src/mixins/PHPMyAdminMixin.js:54 – the CA call site
 * @see Engine core/routes/api.php:206-224 (mysql/*)
 */
class MysqlTest extends TestCase
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
     * A project created by the plain domain step (the classic custom kind the
     * panel knows at creation) with the Engine create
     * task already finished – so no hourly type probe has run yet.
     */
    private function createdClassic(User $user): Application
    {
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:300 -> projects storeAsync (202 + TaskResource)
        Http::fake(['engine.example.com/api/projects' => Http::response(['data' => ['id' => 55, 'username' => 'shop']], 202)]);

        $application = $this->app->make(ApplicationProvisioner::class)
            ->provision($user, new ProvisionRequest(domain: 'shop.example.com'))
            ->application;

        // The Engine create task finished; the row is active before any probe.
        $application->forceFill(['status' => 'active'])->save();

        return $application;
    }

    public function test_rename_works_right_after_a_classic_creation(): void
    {
        $user = User::factory()->create();
        $application = $this->createdClassic($user);

        // Engine: core/app/Http/Controllers/User/Mysql/DatabaseController.php:247 -> rename, 202 TaskResource
        Http::fake([
            'engine.example.com/api/projects/shop/mysql/databases/shop_db/rename' => Http::response(['data' => [
                'id' => 55, 'job_type' => 'RenameMysqlDatabase', 'status' => 'queued',
            ]], 202),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
            'engine.example.com/api/tasks/55*' => Http::response(['data' => [
                'id' => 55, 'status' => 'completed', 'details' => ['action' => 'mysql_database_rename'],
            ]]),
        ]);

        // The type the provisioner wrote is enough: no `meta.actions.rename`
        // gate and no type probe stands in the way.
        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:787-790
            ->putJson("/api/server-accounts/{$application->id}/mysql/databases/shop_db/name", ['name' => 'blog'])
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Databases.vue:797 (success alert + reload; body ignored)
            ->assertJson(['success' => true]);

        Http::assertSent(fn ($request) => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/projects/shop/mysql/databases/shop_db/rename')
            && $request['name'] === 'blog');
    }

    /**
     * A project whose Engine create task still runs
     * answers a busy 409; the CA reads the 409's message, so it must say the
     * project is still being prepared, not just "busy".
     */
    public function test_rename_of_a_still_provisioning_project_keeps_the_409_with_a_clear_text(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'shop', ['domain' => 'shop.example.com', 'details' => []]);
        $application->forceFill(['type' => Application::TYPE_CUSTOM, 'status' => 'pending'])->save();

        // Engine: core/app/Exceptions/ProjectBusyException.php:49 -> taskRunning (409; names the running create task)
        Http::fake([
            'engine.example.com/api/projects/shop/mysql/databases/shop_db/rename' => Http::response([
                'message' => "Project 'shop' is busy: deploy task 91 is running. Cancel it (POST /tasks/91/cancel) or wait for it to finish.",
            ], 409),
        ]);

        // CA: packages/client-area/src/views/hosting/Databases.vue:787-790
        // CA reads: packages/client-area/src/apis/Api.js:84 (error.response.data.message)
        $this->actingAs($user)
            ->putJson("/api/server-accounts/{$application->id}/mysql/databases/shop_db/name", ['name' => 'blog'])
            ->assertStatus(409)
            ->assertJsonPath('message', 'The project is still being prepared. Please try again in a moment.');
    }

    /**
     * Review-fix: the STILL_PREPARING text is only for a project whose
     * Engine create task still runs. A busy 409 on an active project must keep
     * the Engine's user-safe busy text, so an over-broad mapping cannot relabel
     * a deploy-in-progress refusal.
     */
    public function test_rename_of_a_busy_active_project_keeps_the_busy_text(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'shop', ['domain' => 'shop.example.com', 'details' => []]);
        $application->forceFill(['type' => Application::TYPE_CUSTOM, 'status' => 'active'])->save();

        // Engine: core/app/Exceptions/ProjectBusyException.php:35 -> taskRunning (409; a deploy of the active project)
        Http::fake([
            'engine.example.com/api/projects/shop/mysql/databases/shop_db/rename' => Http::response([
                'message' => "Project 'shop' is busy: deploy task 91 is running. Cancel it (POST /tasks/91/cancel) or wait for it to finish.",
            ], 409),
        ]);

        // CA: packages/client-area/src/views/hosting/Databases.vue:787-790
        // CA reads: packages/client-area/src/apis/Api.js:84 (error.response.data.message)
        $this->actingAs($user)
            ->putJson("/api/server-accounts/{$application->id}/mysql/databases/shop_db/name", ['name' => 'blog'])
            ->assertStatus(409)
            ->assertJsonPath('message', 'The project is busy with another operation. Please try again later.');
    }

    public function test_databases_list_maps_size_to_disk_usage_and_shows_rename(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        // The rename is advertised only for a project proven custom.
        $application->forceFill(['type' => Application::TYPE_CUSTOM])->save();

        // Engine: core/app/Http/Controllers/User/Mysql/DatabaseController.php:58 -> index()
        Http::fake(['engine.example.com/api/projects/site1/mysql/databases' => Http::response(['data' => [
            ['database' => 'site1_wp', 'size_bytes' => 2048, 'created_at' => null, 'updated_at' => null],
        ]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:880
            ->getJson("/api/server-accounts/{$application->id}/mysql/databases")
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Databases.vue:881
            ->assertJsonPath('data.0.database', 'site1_wp')
// CA reads: packages/client-area/src/views/hosting/Databases.vue:881
            ->assertJsonPath('data.0.disk_usage', 2048)
// CA reads: packages/client-area/src/views/hosting/Databases.vue:1517 (item.can_rename = meta.actions.rename)
            ->assertJsonPath('meta.actions.rename', true);
    }

    /**
     * Since Engine 2.2.0 a WordPress project's database is renamed with its
     * DB_NAME, so the CA offers the rename.
     */
    public function test_databases_offer_the_rename_for_a_wordpress_project(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['type' => Application::TYPE_WORDPRESS])->save();

        // Engine: core/app/Http/Controllers/User/Mysql/DatabaseController.php:58 -> index()
        Http::fake(['engine.example.com/api/projects/site1/mysql/databases' => Http::response(['data' => []])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:880
            ->getJson("/api/server-accounts/{$application->id}/mysql/databases")
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Databases.vue:1517 (item.can_rename = meta.actions.rename)
            ->assertJsonPath('meta.actions.rename', true);
    }

    public function test_databases_hide_the_rename_for_an_undetected_project(): void
    {
        $user = User::factory()->create();
        // syncedApplication() leaves `type` null until the probe runs.
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Mysql/DatabaseController.php:58 -> index()
        Http::fake(['engine.example.com/api/projects/site1/mysql/databases' => Http::response(['data' => []])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:880
            ->getJson("/api/server-accounts/{$application->id}/mysql/databases")
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Databases.vue:1517 (the CA hides the rename menu)
            ->assertJsonPath('meta.actions.rename', false);
    }

    public function test_create_and_delete_database(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Mysql/DatabaseController.php:175 -> store()
        Http::fake([
            'engine.example.com/api/projects/site1/mysql/databases' => Http::response(['data' => ['database' => 'site1_app']]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:712
            ->postJson("/api/server-accounts/{$application->id}/mysql/databases", ['name' => 'app'])
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Databases.vue:712
            ->assertJson(['success' => true]);

        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_ends_with($request->url(), '/projects/site1/mysql/databases')
            && $request['name'] === 'app');
    }

    public function test_create_database_validates_the_name(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:712
            ->postJson("/api/server-accounts/{$application->id}/mysql/databases", ['name' => 'bad name!'])
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/hosting/Databases.vue:712
            ->assertJsonValidationErrors('name');
    }

    public function test_users_list_includes_meta_flags(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Mysql/UserController.php:52 -> index()
        Http::fake(['engine.example.com/api/projects/site1/mysql/users' => Http::response(['data' => [
            ['user' => 'site1_wp', 'databases' => ['site1_wp']],
        ]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:1534
            ->getJson("/api/server-accounts/{$application->id}/mysql/users")
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Databases.vue:1535
            ->assertJsonPath('data.0.user', 'site1_wp')
// CA reads: packages/client-area/src/views/hosting/Databases.vue:1535
            ->assertJsonPath('data.0.databases.0', 'site1_wp')
// CA reads: packages/client-area/src/views/hosting/Databases.vue:1535
            ->assertJsonPath('meta.privileges_supported', true)
// CA reads: packages/client-area/src/views/hosting/Databases.vue:1535
            ->assertJsonPath('meta.rename_supported', true);
    }

    public function test_privileges_show_and_update(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Mysql/PrivilegesController.php:57 -> show()
        Http::fake(['engine.example.com/api/projects/site1/mysql/privileges/*' => Http::response(['data' => 'SELECT, INSERT'])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:666
            ->getJson("/api/server-accounts/{$application->id}/mysql/privileges/site1_wp/site1_wp")
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Databases.vue:670
            ->assertJson(['data' => 'SELECT, INSERT']);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:1474
            ->putJson("/api/server-accounts/{$application->id}/mysql/privileges/site1_wp/site1_wp", [
                'privileges' => 'SELECT,INSERT',
            ])
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Databases.vue:1479
            ->assertJson(['success' => true]);
    }

    public function test_privileges_rejects_unknown_names(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:1474
            ->putJson("/api/server-accounts/{$application->id}/mysql/privileges/site1_wp/site1_wp", [
                'privileges' => 'SELECT,GRANT ALL',
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/hosting/Databases.vue:1494
            ->assertJsonValidationErrors('privileges')
            // The message names the offending privilege.
            ->assertJsonPath('errors.privileges.0', 'Invalid value GRANT ALL');
    }

    public function test_delete_database_calls_the_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Mysql/DatabaseController.php:197 -> destroy()
        Http::fake(['engine.example.com/api/projects/site1/mysql/databases/*' => Http::response(['data' => []])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:853
            ->deleteJson("/api/server-accounts/{$application->id}/mysql/databases/site1_wp", ['confirm' => true])
            ->assertOk();

        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_ends_with($request->url(), '/mysql/databases/site1_wp'));
    }

    /** The Delete Database dialog's confirmation box is required: a delete without it is refused. */
    public function test_delete_database_without_the_confirmation_is_refused(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Mysql/DatabaseController.php:197 -> destroy()
        Http::fake(['engine.example.com/api/projects/site1/mysql/databases/*' => Http::response(['data' => []])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:853
            ->deleteJson("/api/server-accounts/{$application->id}/mysql/databases/site1_wp")
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/hosting/Databases.vue:853
            ->assertJsonValidationErrors('confirm');

        // A cleared box is refused too, not only a missing one.
        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:853
            ->deleteJson("/api/server-accounts/{$application->id}/mysql/databases/site1_wp", ['confirm' => false])
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/hosting/Databases.vue:853
            ->assertJsonValidationErrors('confirm');

        Http::assertNotSent(fn ($request) => $request->method() === 'DELETE');
    }

    public function test_rename_database_calls_the_engine_and_follows_the_task(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['type' => Application::TYPE_CUSTOM])->save();

        // Engine: core/app/Http/Controllers/User/Mysql/DatabaseController.php:247 -> rename, 202 TaskResource
        Http::fake([
            'engine.example.com/api/projects/site1/mysql/databases/site1_wp/rename' => Http::response(['data' => [
                'id' => 55, 'job_type' => 'RenameMysqlDatabase', 'status' => 'queued',
                'details' => ['action' => 'mysql_database_rename', 'from' => 'site1_wp', 'to' => 'site1_blog'],
            ]], 202),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
            'engine.example.com/api/tasks/55*' => Http::response(['data' => [
                'id' => 55, 'status' => 'completed', 'details' => ['action' => 'mysql_database_rename'],
            ]]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:787-790
            ->putJson("/api/server-accounts/{$application->id}/mysql/databases/site1_wp/name", ['name' => 'blog'])
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Databases.vue:797 (success alert + reload; body ignored)
            ->assertJson(['success' => true]);

        Http::assertSent(fn ($request) => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/projects/site1/mysql/databases/site1_wp/rename')
            && $request['name'] === 'blog');
        // The 202 task is followed before the response, so the CA's immediate
        // reload sees the new name (`Databases.vue:801`).
        Http::assertSent(fn ($request) => str_contains($request->url(), '/api/tasks/55'));
    }

    public function test_rename_database_answers_the_engine_message_when_the_task_fails(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['type' => Application::TYPE_CUSTOM])->save();

        // Engine: core/app/Http/Controllers/User/Mysql/DatabaseController.php:247 -> rename, 202 TaskResource
        Http::fake([
            'engine.example.com/api/projects/site1/mysql/databases/site1_wp/rename' => Http::response(['data' => [
                'id' => 56, 'job_type' => 'RenameMysqlDatabase', 'status' => 'queued',
            ]], 202),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
            'engine.example.com/api/tasks/56*' => Http::response(['data' => [
                'id' => 56, 'status' => 'failed', 'details' => ['error' => 'The database name is already taken.'],
            ]]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:787-790
            ->putJson("/api/server-accounts/{$application->id}/mysql/databases/site1_wp/name", ['name' => 'blog'], ['Accept' => 'application/json'])
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/hosting/Databases.vue:805 (`Api.getErrorMessage(error)`)
            ->assertJsonPath('errors.0.0', 'The database name is already taken.');
    }

    /**
     * The Engine fake of a WordPress project's rename: `GET wp/config` lists
     * DB_NAME, the rename is a 202 task carrying the prefixed names, the task
     * answers `$taskStatus`, and `PUT wp/config/DB_NAME` succeeds.
     */
    private function fakeWordPressRename(string $dbName, string $taskStatus): void
    {
        Http::fake([
            // Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:67 -> index (`wp config list --format=json`)
            'engine.example.com/api/projects/site1/wp/config?*' => Http::response(['data' => [
                ['name' => 'DB_NAME', 'value' => $dbName, 'type' => 'constant'],
                ['name' => 'DB_USER', 'value' => 'site1_wp', 'type' => 'constant'],
            ]]),
            // Engine: core/app/Http/Controllers/User/Wp/WpConfigController.php:258 -> update
            'engine.example.com/api/projects/site1/wp/config/DB_NAME' => Http::response(['data' => ['message' => "Updated the constant 'DB_NAME' in the 'wp-config.php' file with the value 'site1_blog'."]]),
            // Engine: core/app/Http/Controllers/User/Mysql/DatabaseController.php:248-273 -> rename, 202 TaskResource with details from/to
            'engine.example.com/api/projects/site1/mysql/databases/site1_wp/rename' => Http::response(['data' => [
                'id' => 58, 'job_type' => 'RenameMysqlDatabase', 'status' => 'queued',
                'details' => ['action' => 'mysql_database_rename', 'from' => 'site1_wp', 'to' => 'site1_blog'],
            ]], 202),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show
            'engine.example.com/api/tasks/58*' => Http::response(['data' => [
                'id' => 58, 'status' => $taskStatus, 'details' => ['action' => 'mysql_database_rename', 'from' => 'site1_wp', 'to' => 'site1_blog'],
            ]]),
        ]);
    }

    /**
     * Since Engine 2.2.0 the WordPress install's database is renamed too: once
     * the rename completed the panel sets `DB_NAME` to the new (prefixed) name
     * with the dedicated `PUT wp/config/DB_NAME` (refused before that version).
     */
    public function test_renaming_the_wordpress_database_points_db_name_at_the_new_name(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['type' => Application::TYPE_WORDPRESS])->save();
        $this->fakeWordPressRename('site1_wp', 'completed');

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:787-790
            ->putJson("/api/server-accounts/{$application->id}/mysql/databases/site1_wp/name", ['name' => 'blog'])
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Databases.vue:797 (success alert + reload; body ignored)
            ->assertJson(['success' => true]);

        $paths = Http::recorded()->map(fn ($pair) => $pair[0]->method().' '.parse_url($pair[0]->url(), PHP_URL_PATH))->values()->all();
        // Read DB_NAME first, rename, follow the task, then point WordPress at the new name.
        $this->assertSame([
            'GET /api/projects/site1/wp/config',
            'PUT /api/projects/site1/mysql/databases/site1_wp/rename',
            'GET /api/tasks/58',
            'PUT /api/projects/site1/wp/config/DB_NAME',
        ], $paths);
        Http::assertSent(fn ($request) => $request->method() === 'PUT'
            && str_ends_with($request->url(), '/wp/config/DB_NAME')
            && $request->data() === ['value' => 'site1_blog', 'type' => 'constant']);
    }

    public function test_renaming_another_database_of_a_wordpress_project_leaves_db_name(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['type' => Application::TYPE_WORDPRESS])->save();
        $this->fakeWordPressRename('site1_live', 'completed');

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:787-790
            ->putJson("/api/server-accounts/{$application->id}/mysql/databases/site1_wp/name", ['name' => 'blog'])
            ->assertOk();

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/mysql/databases/site1_wp/rename'));
        Http::assertNotSent(fn ($request) => $request->method() === 'PUT' && str_contains($request->url(), '/wp/config/'));
    }

    public function test_a_failed_wordpress_database_rename_leaves_db_name(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['type' => Application::TYPE_WORDPRESS])->save();
        $this->fakeWordPressRename('site1_wp', 'failed');

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:787-790
            ->putJson("/api/server-accounts/{$application->id}/mysql/databases/site1_wp/name", ['name' => 'blog'], ['Accept' => 'application/json'])
            ->assertStatus(422);

        Http::assertNotSent(fn ($request) => $request->method() === 'PUT' && str_contains($request->url(), '/wp/config/'));
    }

    /**
     * A rename that outlasts the request leaves DB_NAME to a queued job, which
     * sets it only once the task completed.
     */
    public function test_a_wordpress_database_rename_that_outlasts_the_request_queues_the_db_name_update(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['type' => Application::TYPE_WORDPRESS])->save();
        $this->fakeWordPressRename('site1_wp', 'running');
        \Illuminate\Support\Sleep::fake(syncWithCarbon: true);
        \Illuminate\Support\Facades\Queue::fake();

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:787-790
            ->putJson("/api/server-accounts/{$application->id}/mysql/databases/site1_wp/name", ['name' => 'blog'])
            ->assertOk();

        Http::assertNotSent(fn ($request) => $request->method() === 'PUT' && str_contains($request->url(), '/wp/config/'));
        \Illuminate\Support\Facades\Queue::assertPushed(
            \PanelAlpha\ClientArea\Jobs\WordPress\PointWordPressAtRenamedDatabaseJob::class,
            fn ($job): bool => $job->applicationId === $application->id && $job->taskId === 58 && $job->database === 'site1_blog',
        );
    }

    /**
     * @return array<string, array{string, bool}>
     */
    public static function renameTaskOutcomes(): array
    {
        return [
            'completed' => ['completed', true],
            'failed' => ['failed', false],
            'cancelled' => ['cancelled', false],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('renameTaskOutcomes')]
    public function test_the_queued_job_sets_db_name_only_after_a_completed_rename(string $status, bool $updates): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->fakeWordPressRename('site1_wp', $status);

        (new \PanelAlpha\ClientArea\Jobs\WordPress\PointWordPressAtRenamedDatabaseJob($application->id, 58, 'site1_blog'))
            ->handle(app(\PanelAlpha\EngineClient\Contracts\EngineResolver::class));

        $sent = Http::recorded(fn ($request) => $request->method() === 'PUT' && str_ends_with($request->url(), '/wp/config/DB_NAME'));
        $this->assertCount($updates ? 1 : 0, $sent);
    }

    public function test_the_queued_job_polls_again_while_the_rename_runs(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $this->fakeWordPressRename('site1_wp', 'running');
        \Illuminate\Support\Facades\Queue::fake();

        (new \PanelAlpha\ClientArea\Jobs\WordPress\PointWordPressAtRenamedDatabaseJob($application->id, 58, 'site1_blog'))
            ->handle(app(\PanelAlpha\EngineClient\Contracts\EngineResolver::class));

        \Illuminate\Support\Facades\Queue::assertPushed(\PanelAlpha\ClientArea\Jobs\WordPress\PointWordPressAtRenamedDatabaseJob::class, 1);
        Http::assertNotSent(fn ($request) => $request->method() === 'PUT');
        $this->assertSame(5, \PanelAlpha\ClientArea\Jobs\WordPress\PointWordPressAtRenamedDatabaseJob::POLL_SECONDS);
        $this->assertSame(3600, \PanelAlpha\ClientArea\Jobs\WordPress\PointWordPressAtRenamedDatabaseJob::WALL_CLOCK_SECONDS);
    }

    public function test_rename_database_refuses_an_undetected_project(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Defensive (not an Engine shape): fail closed until the type probe ran.
        Http::fake(['engine.example.com/*' => Http::response(['data' => []])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:787-790
            ->putJson("/api/server-accounts/{$application->id}/mysql/databases/site1_wp/name", ['name' => 'blog'])
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/hosting/Databases.vue:805 (`Api.getErrorMessage(error)`)
            ->assertJsonPath('errors.0.0', ServerAccountService::DATABASE_RENAME_UNKNOWN_REFUSAL);
    }

    public function test_rename_database_validates_the_new_name(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:787-790
            ->putJson("/api/server-accounts/{$application->id}/mysql/databases/site1_wp/name", ['name' => 'bad name!'])
            ->assertStatus(422)
// CA reads: packages/client-area/src/views/hosting/Databases.vue:805 (`Api.getErrorMessage(error)`)
            ->assertJsonValidationErrors('name');
    }

    public function test_rename_database_answers_503_when_the_engine_is_down(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['type' => Application::TYPE_CUSTOM])->save();

        // The connection never answers (Engine down).
        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('down')]);

        // CA: packages/client-area/src/views/hosting/Databases.vue:787-790
        $this->actingAs($user)
            ->putJson("/api/server-accounts/{$application->id}/mysql/databases/site1_wp/name", ['name' => 'blog'], ['Accept' => 'application/json'])
            ->assertStatus(503);
    }

    public function test_rename_database_answers_502_on_an_engine_5xx(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['type' => Application::TYPE_CUSTOM])->save();

        // Engine: core/app/Http/Controllers/User/Mysql/DatabaseController.php:247 -> rename (Engine 5xx)
        Http::fake(['engine.example.com/*' => Http::response(['message' => 'boom'], 500)]);

        // CA: packages/client-area/src/views/hosting/Databases.vue:787-790
        $this->actingAs($user)
            ->putJson("/api/server-accounts/{$application->id}/mysql/databases/site1_wp/name", ['name' => 'blog'], ['Accept' => 'application/json'])
            ->assertStatus(502);
    }

    public function test_rename_database_leaves_the_queued_rename_when_a_poll_hiccups(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $application->forceFill(['type' => Application::TYPE_CUSTOM])->save();

        Http::fake([
            // Engine: core/app/Http/Controllers/User/Mysql/DatabaseController.php:247 -> rename, 202 TaskResource
            'engine.example.com/api/projects/site1/mysql/databases/site1_wp/rename' => Http::response(['data' => [
                'id' => 57, 'job_type' => 'RenameMysqlDatabase', 'status' => 'queued',
            ]], 202),
            // Engine: core/app/Http/Controllers/TaskController.php:180 -> TaskController::show (Engine 5xx while polling)
            'engine.example.com/api/tasks/57*' => Http::response(['message' => 'boom'], 500),
        ]);

        // The rename is already queued Engine-side, so a poll hiccup never fails
        // the request.
        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:787-790
            ->putJson("/api/server-accounts/{$application->id}/mysql/databases/site1_wp/name", ['name' => 'blog'])
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Databases.vue:797 (body ignored, success alert)
            ->assertJson(['success' => true]);

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/projects/site1/mysql/databases/site1_wp/rename'));
    }

    public function test_rename_poll_interval_and_budget_are_pinned(): void
    {
        // The request-path watcher polls every 3 s with a
        // 30 s budget; the literals are pinned.
        $this->assertSame(3, ServerAccountService::RENAME_POLL_SECONDS);
        $this->assertSame(30, ServerAccountService::RENAME_WAIT_SECONDS);
    }

    public function test_server_info_returns_the_host_the_account_reaches(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/MysqlController.php:38 -> serverInfo()
        // answers the users-DB host the account's PHP resolves; the project's domain refuses 3306.
        Http::fake(['engine.example.com/api/projects/site1/mysql/server-info' => Http::response(['data' => [
            'host' => 'database-users.shared-hosting.palocal',
            'port' => '3306',
        ]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:1107
            ->getJson("/api/server-accounts/{$application->id}/mysql/server-info")
            ->assertOk()
// CA reads: packages/client-area/src/views/hosting/Databases.vue:1130
            ->assertJsonPath('data.host', 'database-users.shared-hosting.palocal')
// CA reads: packages/client-area/src/views/hosting/Databases.vue:1131
            ->assertJsonPath('data.port', '3306');
    }

    public function test_create_user_posts_the_ca_body_to_the_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Mysql/UserController.php:105 -> store()
        Http::fake(['engine.example.com/api/projects/site1/mysql/users' => Http::response(['data' => ['user' => 'site1_app']])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:964
            ->postJson("/api/server-accounts/{$application->id}/mysql/users", [
                'name' => 'app',
                'password' => 'Str0ng!Passw0rd',
            ])
            ->assertOk();

        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_ends_with($request->url(), '/mysql/users')
            && $request['name'] === 'app'
            && $request['password'] === 'Str0ng!Passw0rd');
    }

    public function test_create_user_refuses_a_name_the_dialog_refuses(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        Http::fake();

        // CA: packages/client-area/src/views/hosting/Databases.vue:964
        $this->actingAs($user)
            ->postJson("/api/server-accounts/{$application->id}/mysql/users", [
                'name' => str_repeat('a', 17),
                'password' => 'Str0ng!Passw0rd',
            ])
            ->assertStatus(422)
            // CA reads: packages/client-area/src/apis/Api.js:80 (the field errors under the field)
            ->assertJsonPath('errors.name.0', 'Username must be at most 16 characters long');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'mysql/users'));
    }

    public function test_create_user_accepts_a_name_of_the_dialog_limit(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Mysql/UserController.php:105 -> store()
        Http::fake(['engine.example.com/api/projects/site1/mysql/users' => Http::response(['data' => ['user' => 'site1_app']])]);

        // CA: packages/client-area/src/views/hosting/Databases.vue:964
        $this->actingAs($user)
            ->postJson("/api/server-accounts/{$application->id}/mysql/users", [
                'name' => str_repeat('a', 16),
                'password' => 'Str0ng!Passw0rd',
            ])
            ->assertOk();

        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_ends_with($request->url(), '/mysql/users')
            && $request['name'] === str_repeat('a', 16));
    }

    public function test_update_user_refuses_a_rename_the_dialog_refuses(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['mysql_prefix' => 'site1_']]);
        Http::fake();

        // CA: packages/client-area/src/views/hosting/Databases.vue:1076
        $this->actingAs($user)
            ->putJson("/api/server-accounts/{$application->id}/mysql/users/site1_app", [
                'name' => str_repeat('b', 17),
                'password' => null,
            ])
            ->assertStatus(422)
            // CA reads: packages/client-area/src/apis/Api.js:80 (the field errors under the field)
            ->assertJsonPath('errors.name.0', 'Username must be at most 16 characters long');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'mysql/users'));
    }

    public function test_update_user_renames_and_changes_the_password(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['mysql_prefix' => 'site1_']]);

        // Engine: core/app/Http/Controllers/User/Mysql/UserController.php:186 -> rename; :278 -> changePassword
        Http::fake(['engine.example.com/api/projects/site1/mysql/users/*' => Http::response(['data' => []])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:1076
            ->putJson("/api/server-accounts/{$application->id}/mysql/users/site1_app", [
                'name' => 'app2',
                'password' => 'New-Password1!',
            ])
            ->assertOk();

        // Rename first, then the password change on the new (post-rename) name:
        // the Engine looks the user up by its exact stored name.
        $recorded = Http::recorded();
        $this->assertCount(2, $recorded);
        $this->assertStringEndsWith('/mysql/users/site1_app/rename', $recorded[0][0]->url());
        $this->assertSame('app2', $recorded[0][0]['name']);
        $this->assertStringEndsWith('/mysql/users/site1_app2/change-password', $recorded[1][0]->url());
        $this->assertSame('New-Password1!', $recorded[1][0]['password']);
    }

    public function test_password_only_changes_the_password_on_the_current_name(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['mysql_prefix' => 'site1_']]);

        // Engine: core/app/Http/Controllers/User/Mysql/UserController.php:235 -> changePassword
        Http::fake(['engine.example.com/api/projects/site1/mysql/users/*' => Http::response(['data' => []])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:1076
            ->putJson("/api/server-accounts/{$application->id}/mysql/users/site1_app", [
                'name' => 'app',
                'password' => 'New-Password1!',
            ])
            ->assertOk();

        $recorded = Http::recorded();
        $this->assertCount(1, $recorded);
        $this->assertStringEndsWith('/mysql/users/site1_app/change-password', $recorded[0][0]->url());
        $this->assertSame('New-Password1!', $recorded[0][0]['password']);
    }

    public function test_rename_only_renames_without_a_password_change(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['mysql_prefix' => 'site1_']]);

        // Engine: core/app/Http/Controllers/User/Mysql/UserController.php:186 -> rename
        Http::fake(['engine.example.com/api/projects/site1/mysql/users/*' => Http::response(['data' => []])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:1076
            ->putJson("/api/server-accounts/{$application->id}/mysql/users/site1_app", [
                'name' => 'app2',
                'password' => null,
            ])
            ->assertOk();

        $recorded = Http::recorded();
        $this->assertCount(1, $recorded);
        $this->assertStringEndsWith('/mysql/users/site1_app/rename', $recorded[0][0]->url());
        $this->assertSame('app2', $recorded[0][0]['name']);
    }

    public function test_an_unchanged_name_and_a_null_password_make_no_engine_call(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user, 'site1', ['details' => ['mysql_prefix' => 'site1_']]);

        // A fresh fake so the sync's Engine request is not counted; the panel
        // must make no call of its own.
        // Engine: core/app/Http/Controllers/User/Mysql/UserController.php:186 -> rename; :278 -> changePassword
        Http::fake(['engine.example.com/api/projects/site1/mysql/users/*' => Http::response(['data' => []])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:1076
            ->putJson("/api/server-accounts/{$application->id}/mysql/users/site1_app", [
                'name' => 'app',
                'password' => null,
            ])
            ->assertOk();

        // Nothing changed: the CA's unprefixed name normalises to the route name.
        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'mysql/users'));
    }

    public function test_delete_user_calls_the_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Mysql/UserController.php:150 -> destroy()
        Http::fake(['engine.example.com/api/projects/site1/mysql/users/*' => Http::response(['data' => []])]);

        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:1290
            ->deleteJson("/api/server-accounts/{$application->id}/mysql/users/site1_app")
            ->assertOk();

        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_ends_with($request->url(), '/mysql/users/site1_app'));
    }

    public function test_revoke_privileges_calls_the_engine_delete(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/Mysql/PrivilegesController.php:137 -> destroy()
        Http::fake(['engine.example.com/api/projects/site1/mysql/privileges/*' => Http::response(['data' => []])]);

        // An empty preset makes the CA call DELETE with the joined empty list
        // (`Api.delete(url, {privileges: ''})`, Databases.vue:1477).
        $this->actingAs($user)
// CA: packages/client-area/src/views/hosting/Databases.vue:1477
            ->deleteJson("/api/server-accounts/{$application->id}/mysql/privileges/site1_wp/site1_wp", [
                'privileges' => '',
            ])
            ->assertOk();

        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_ends_with($request->url(), '/mysql/privileges/site1_wp/site1_wp'));
    }

    public function test_phpmyadmin_sso_returns_the_token(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/MysqlController.php:45 -> createPhpmyadminSsoToken()
        Http::fake(['engine.example.com/api/projects/site1/mysql/phpmyadmin-sso-token' => Http::response(['data' => ['url' => 'https://pma.example.com/t/abc']])]);

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/PHPMyAdminMixin.js:109
            ->postJson("/api/server-accounts/{$application->id}/mysql/phpmyadmin-sso-url")
            ->assertOk()
// CA reads: packages/client-area/src/mixins/PHPMyAdminMixin.js:111
            ->assertJsonPath('data.url', 'https://pma.example.com/t/abc');
    }

    public function test_mysql_hosting_requires_authentication_and_ownership(): void
    {
// CA: packages/client-area/src/views/hosting/Databases.vue:880
        $this->getJson('/api/server-accounts/1/mysql/databases')->assertUnauthorized();

        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:136 -> listAll()
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => []])]);

        $this->actingAs(User::factory()->create())
// CA: packages/client-area/src/views/hosting/Databases.vue:880
            ->getJson('/api/server-accounts/999/mysql/databases')
            ->assertNotFound();
    }
}
