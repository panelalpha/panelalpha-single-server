<?php

namespace Tests\Feature\ClientArea\Hosting;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Hosting\FileManagerService;
use PanelAlpha\EngineClient\Api\FilesApi;
use PanelAlpha\ClientArea\Models\Application;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The file manager backing the `fm` SPA. Listing and
 * thumbnails/previews go to the native `files/list` / `files/thumbnail`
 * endpoints (in the Engine since `29ae`); writes go to the `files/*` endpoints.
 *
 * Contract:
 *  - CA call sites: `packages/client-area/fm/src/http/post.js`, `get.js` and
 *    `fm/src/store/actions.js:146,235,283,311,339,376,402` send
 *    `{disk, path, name, items[{path}], clipboard{type,directories[],files[]},
 *    elements{directories[],files[]}, overwrite}`; the `fm` SPA reads
 *    `result.status`/`result.message` (`FileManager.vue:156-165`) and falls
 *    back to the raw `message` when `lang.response` has no key (`en.js:162`).
 *  - Old answers: `packages/api/app/Http/Controllers/User/ServerAccount/FileManager.php`
 *    (upload `continue` + `notAllUploaded`; old texts in
 *    `packages/api/resources/lang/en/api/messages.php:173-190`).
 *  - Engine: `core/routes/api.php:233` → `core/app/Http/Controllers/User/FileController.php`
 *    (`files/list`:599, `files/thumbnail`:764; the rest `files/*`, 400 on a failed
 *    operation, 404 download, streamed BinaryFileResponse with Range support).
 */
class FileManagerTest extends TestCase
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

    public function test_initialize_returns_the_spa_config(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/get.js:9
            ->getJson("/api/file-manager/initialize/{$application->id}")
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'success')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonStructure(['config' => ['uploadMaxFilesize', 'lang', 'unsupportedActions']]);
    }

    public function test_content_lists_a_directory_through_the_native_files_list_endpoint(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:599 -> files/list, {data:[FileEntry], meta:{path,truncated,total}}
        Http::fake(['engine.example.com/api/projects/site1/files/list*' => Http::response([
            'data' => [
                [
                    'name' => 'wp-content', 'path' => '/public_html/wp-content', 'type' => 'dir', 'size' => 4096,
                    'mtime' => 1700000000, 'mode' => '0755', 'uid' => 1000, 'gid' => 1000,
                    'target' => null, 'target_type' => null, 'has_subdirectories' => true,
                ],
                [
                    'name' => 'index.php', 'path' => '/public_html/index.php', 'type' => 'file', 'size' => 42,
                    'mtime' => 1700000001, 'mode' => '0644', 'uid' => 1000, 'gid' => 1000,
                    'target' => null, 'target_type' => null, 'has_subdirectories' => null,
                ],
            ],
            'meta' => ['path' => '/public_html', 'truncated' => false, 'total' => 2],
        ])]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/get.js:43
            ->getJson("/api/file-manager/content/{$application->id}?path=".urlencode('public_html'))
            ->assertOk()
// CA reads: packages/client-area/fm/src/store/actions.js:24 (setDirectoryContent reads directories/files)
            ->assertJsonPath('result.status', 'success')
// CA reads: packages/client-area/fm/src/components/manager/TableView.vue:54 (directory.basename)
            ->assertJsonPath('directories.0.basename', 'wp-content')
// CA reads: packages/client-area/fm/src/components/tree/TreeBranch.vue:11 (directory.props.hasSubdirectories)
            ->assertJsonPath('directories.0.props.hasSubdirectories', true)
// CA reads: packages/client-area/fm/src/components/manager/TableView.vue:46 (directory.path)
            ->assertJsonPath('directories.0.path', 'public_html/wp-content')
// CA reads: packages/client-area/fm/src/components/manager/TableView.vue:72 (file.filename)
            ->assertJsonPath('files.0.filename', 'index.php')
// CA reads: packages/client-area/fm/src/components/manager/TableView.vue:66 (file.path)
            ->assertJsonPath('files.0.path', 'public_html/index.php')
// CA reads: packages/client-area/fm/src/components/manager/TableView.vue:76 (file.extension)
            ->assertJsonPath('files.0.extension', 'php')
// CA reads: packages/client-area/fm/src/components/modals/additions/SelectedFileList.vue:11 (item.size)
            ->assertJsonPath('files.0.size', 42)
// CA reads: packages/client-area/fm/src/components/manager/TableView.vue:59 (timestamp)
            ->assertJsonPath('files.0.timestamp', 1700000001);

        Http::assertSent(fn ($request) => str_contains($request->url(), '/files/list')
            && str_contains($request->url(), 'path=public_html')
            && str_contains($request->url(), 'show_hidden=1'));
    }

    public function test_content_of_the_home_root_sends_the_home_path(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // CA: `fm/src/http/get.js:42-43` always sends `{params: {disk, path}}`;
        // at the root the value is empty. The Engine turns '' into null and its
        // `required` rule answers 422, so the panel sends the project home as '/'.
        // Engine: core/app/Http/Controllers/User/FileController.php:599 -> files/list
        Http::fake(['engine.example.com/api/projects/site1/files/list*' => Http::response([
            'data' => [],
            'meta' => ['path' => '/', 'truncated' => false, 'total' => 0],
        ])]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/get.js:43
            ->getJson("/api/file-manager/content/{$application->id}")
            ->assertOk()
// CA reads: packages/client-area/fm/src/store/actions.js:24
            ->assertJsonPath('result.status', 'success');

        Http::assertSent(fn ($request) => str_contains($request->url(), '/files/list')
            && str_contains($request->url(), 'path=%2F'));
    }

    public function test_content_rejects_a_path_outside_home(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/get.js:43
            ->getJson("/api/file-manager/content/{$application->id}?path=".urlencode('../../etc'))
            ->assertStatus(422);
    }

    public function test_content_rejects_an_absolute_path(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Every path is home-relative; an absolute one is refused before the
        // Engine is asked.
        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/get.js:43
            ->getJson("/api/file-manager/content/{$application->id}?path=".urlencode('/etc/passwd'))
            ->assertStatus(422);
    }

    /**
     * Every file-manager read that takes a `path` validates it as a string, so a
     * `path[]` array answers 422 instead of being narrowed to the home root.
     *
     * @return array<string, array{string}>
     */
    public static function pathReadRoutes(): array
    {
        return [
            'content' => ['content'],
            'download' => ['download'],
            'stream-file' => ['stream-file'],
            'preview' => ['preview'],
            'thumbnails' => ['thumbnails'],
        ];
    }

    #[DataProvider('pathReadRoutes')]
    public function test_a_path_array_is_rejected_with_422(string $route): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Validation runs before any Engine call.
        $this->actingAs($user)
        // CA: packages/client-area/fm/src/store/actions.js:146 (`{disk, path}` query on every read)
            ->getJson("/api/file-manager/{$route}/{$application->id}?path[]=public_html")
            ->assertStatus(422)
            // CA reads: packages/client-area/fm/src/store/actions.js:146 (the SPA shows result.message)
            ->assertJsonValidationErrors('path');
    }

    #[DataProvider('pathReadRoutes')]
    public function test_a_disk_array_is_rejected_with_422(string $route): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // `disk` is validated as a string too, so a `disk[]` array answers 422
        // instead of reaching the Engine.
        $this->actingAs($user)
        // CA: packages/client-area/fm/src/http/get.js:42 (`{disk, path}` query on every read)
            ->getJson("/api/file-manager/{$route}/{$application->id}?disk[]=local")
            ->assertStatus(422)
            // CA reads: packages/client-area/fm/src/http/get.js:42 (the read query carries the disk)
            ->assertJsonValidationErrors('disk');
    }

    public function test_a_container_project_lists_through_the_same_native_endpoint(): void
    {
        $user = User::factory()->create();
        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> projects listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(10, 'site1', ['details' => ['template' => 'dind']]),
        ]])]);
// CA: packages/client-area/src/apis/Instances.js:76
        $this->actingAs($user)->getJson('/api/projects')->assertOk();
        $application = Application::query()->where('engine_username', 'site1')->firstOrFail();

        // The native listing is the same for a container project;
        // the ssh/command scan is gone.
        // Engine: core/app/Http/Controllers/User/FileController.php:599 -> files/list
        Http::fake(['engine.example.com/api/projects/site1/files/list*' => Http::response([
            'data' => [[
                'name' => 'assets', 'path' => '/assets', 'type' => 'dir', 'size' => 4096,
                'mtime' => 1700000000, 'mode' => '0755', 'uid' => 1000, 'gid' => 1000,
                'target' => null, 'target_type' => null, 'has_subdirectories' => false,
            ]],
            'meta' => ['path' => '/', 'truncated' => false, 'total' => 1],
        ])]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/get.js:43
            ->getJson("/api/file-manager/content/{$application->id}?path=public_html")
            ->assertOk()
// CA reads: packages/client-area/fm/src/components/manager/TableView.vue:54
            ->assertJsonPath('directories.0.basename', 'assets');

        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/ssh/command'));
    }

    public function test_create_directory_returns_directory_and_tree(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/*
        Http::fake(['engine.example.com/api/projects/site1/files/*' => Http::response(['success' => true])]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:33
            ->postJson("/api/file-manager/create-directory/{$application->id}", ['disk' => 'local', 'path' => 'public_html', 'name' => 'assets'])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'dirCreated')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('directory.type', 'dir')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('directory.path', 'public_html/assets')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('tree.0.basename', 'assets');

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/files/mkdir')
            && ($request['path'] ?? null) === 'public_html/assets');
    }

    /** PHP's upload part cuts a name at its last backslash, so a backslash is refused before any Engine call. */
    public function test_create_file_refuses_a_name_with_a_backslash(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:13
            ->postJson("/api/file-manager/create-file/{$application->id}", ['disk' => 'local', 'path' => 'public_html', 'name' => 'sub\\victim.txt'])
            ->assertStatus(422)
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonValidationErrors('name');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/files/'));
    }

    public function test_create_directory_refuses_a_name_with_a_backslash(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:33
            ->postJson("/api/file-manager/create-directory/{$application->id}", ['disk' => 'local', 'path' => 'public_html', 'name' => 'sub\\assets'])
            ->assertStatus(422)
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonValidationErrors('name');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/files/'));
    }

    /** Symfony already cuts the client name at a backslash, so these two are tested on the service. */
    public function test_update_file_refuses_a_name_with_a_backslash(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $stream = fopen('php://temp', 'rb+');

        try {
            app(FileManagerService::class)->updateFile($application, 'public_html', $stream, 'sub\\victim.txt');
            $this->fail('A name with a backslash was accepted.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('name', $e->errors());
        } finally {
            if (is_resource($stream)) {
                fclose($stream);
            }
        }

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/files/'));
    }

    public function test_upload_refuses_a_name_with_a_backslash_and_keeps_the_existing_file(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        $stream = fopen('php://temp', 'rb+');

        try {
            app(FileManagerService::class)->upload($application, 'public_html', [['stream' => $stream, 'name' => 'upl\\oad.txt']], true);
            $this->fail('A name with a backslash was accepted.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('name', $e->errors());
        } finally {
            if (is_resource($stream)) {
                fclose($stream);
            }
        }

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/files/'));
    }

    public function test_create_directory_maps_an_engine_400_to_the_old_text(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: FileController::mkdir 400 (core/app/Http/Controllers/User/FileController.php:158).
        // Old text: packages/api/resources/lang/en/api/messages.php:176.
        // Engine: core/app/Http/Controllers/User/FileController.php:149 -> files/mkdir
        Http::fake(['engine.example.com/api/projects/site1/files/mkdir' => Http::response(['message' => 'nope'], 400)]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:33
            ->postJson("/api/file-manager/create-directory/{$application->id}", ['disk' => 'local', 'path' => 'public_html', 'name' => 'assets'])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'error')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'Cannot create directory.');
    }

    /**
     * @return array<string, mixed>
     */
    private function notWritable(): array
    {
        // Engine: core/app/System/Project/FileManager.php:193 -> unwritableFolder (ProblemException 422)
        return [
            'message' => "/ is not a folder the project's account can write to: choose a folder inside the project.",
            'errors' => ['path' => ["/ is not a folder the project's account can write to: choose a folder inside the project."]],
            'problems' => [['field' => 'path', 'code' => 'not_writable', 'message' => "/ is not a folder the project's account can write to: choose a folder inside the project."]],
        ];
    }

    public function test_create_directory_in_a_folder_the_account_cannot_write_to_answers_the_engine_hint(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        // Engine: core/app/Http/Controllers/User/FileController.php:149 -> files/mkdir
        Http::fake(['engine.example.com/api/projects/site1/files/mkdir' => Http::response($this->notWritable(), 422)]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:33
            ->postJson("/api/file-manager/create-directory/{$application->id}", ['disk' => 'local', 'path' => '', 'name' => 'assets'])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'error')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', "/ is not a folder the project's account can write to: choose a folder inside the project.");
    }

    public function test_create_file_and_upload_in_a_folder_the_account_cannot_write_to_answer_the_engine_hint(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        Http::fake([
            // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => false]),
            // Engine: core/app/Http/Controllers/User/FileController.php:665 -> files/upload
            'engine.example.com/api/projects/site1/files/upload' => Http::response($this->notWritable(), 422),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:33
            ->postJson("/api/file-manager/create-file/{$application->id}", ['disk' => 'local', 'path' => '', 'name' => 'notes.txt'])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'error')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', "/ is not a folder the project's account can write to: choose a folder inside the project.");

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:44
            ->call('POST', "/api/file-manager/upload/{$application->id}", ['disk' => 'local', 'path' => '', 'overwrite' => '0', 'names' => ['a.txt']], [], [
                'files' => [UploadedFile::fake()->createWithContent('a.txt', 'x')],
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'error')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', "/ is not a folder the project's account can write to: choose a folder inside the project.");
    }

    public function test_another_engine_422_on_create_directory_is_not_turned_into_an_fm_error(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        // Engine: core/app/Http/Controllers/User/FileController.php:149 -> files/mkdir (a field refusal)
        Http::fake(['engine.example.com/api/projects/site1/files/mkdir' => Http::response(['message' => 'The path field is required.', 'errors' => ['path' => ['The path field is required.']]], 422)]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:33
            ->postJson("/api/file-manager/create-directory/{$application->id}", ['disk' => 'local', 'path' => 'public_html', 'name' => 'assets'])
            ->assertStatus(422);
    }

    public function test_delete_maps_an_engine_400_to_the_old_text(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: FileController::remove 400. Old text: messages.php:173.
        // Engine: core/app/Http/Controllers/User/FileController.php:95 -> files/remove
        Http::fake(['engine.example.com/api/projects/site1/files/remove' => Http::response(['message' => 'nope'], 400)]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:54
            ->postJson("/api/file-manager/delete/{$application->id}", [
                'disk' => 'local',
                'items' => [['type' => 'file', 'path' => 'public_html/a.txt']],
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'error')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'Cannot delete selected file(s).');
    }

    public function test_rename_maps_an_engine_400_to_the_old_text(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: FileController::mv 400. Old text: messages.php:185.
        // Engine: core/app/Http/Controllers/User/FileController.php:442 -> files/mv
        Http::fake(['engine.example.com/api/projects/site1/files/mv' => Http::response(['message' => 'nope'], 400)]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:64
            ->postJson("/api/file-manager/rename/{$application->id}", [
                'disk' => 'local',
                'oldName' => 'public_html/old.txt',
                'newName' => 'public_html/new.txt',
                'type' => 'file',
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'error')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'Cannot rename file.');
    }

    public function test_update_file_maps_an_engine_400_to_the_old_text(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: FileController::upload 400. Old text: messages.php:178.
        // Engine: core/app/Http/Controllers/User/FileController.php:665 -> files/upload
        Http::fake(['engine.example.com/api/projects/site1/files/upload' => Http::response(['message' => 'nope'], 400)]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:23
            ->call('POST', "/api/file-manager/update-file/{$application->id}", [
                'disk' => 'local',
                'path' => 'public_html',
                'name' => 'notes.txt',
            ], [], [
                'file' => UploadedFile::fake()->createWithContent('notes.txt', 'hello'),
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'error')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'Cannot update file.');
    }

    public function test_zip_and_unzip_map_an_engine_400_to_the_old_text(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: FileController::zip/unzip 400. Old texts: messages.php:186-187.
        // Engine: core/app/Http/Controllers/User/FileController.php:196 -> files/zip; :245 -> files/unzip
        Http::fake(['engine.example.com/api/projects/site1/files/*' => Http::response(['message' => 'nope'], 400)]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:84
            ->postJson("/api/file-manager/zip/{$application->id}", [
                'disk' => 'local',
                'path' => 'public_html',
                'name' => 'assets.zip',
                'elements' => ['directories' => ['public_html/assets'], 'files' => []],
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'error')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'Cannot create ZIP archive.');

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:94
            ->postJson("/api/file-manager/unzip/{$application->id}", [
                'disk' => 'local',
                'path' => 'public_html/archive.zip',
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'error')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'Cannot extract ZIP archive.');
    }

    public function test_content_maps_a_missing_directory_to_the_old_error_text(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: FileController::list answers 404 `Invalid path` for a missing
        // path and 422 `not_a_directory` for a file
        // (core/app/Http/Controllers/User/FileController.php:610-622, System/Project/FileManager.php:232).
        // Engine: core/app/Http/Controllers/User/FileController.php:599 -> files/list
        Http::fake(['engine.example.com/api/projects/site1/files/list*' => Http::response(['message' => 'Invalid path'], 404)]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/get.js:43
            ->getJson("/api/file-manager/content/{$application->id}?path=public_html/missing")
            ->assertOk()
// CA reads: packages/client-area/fm/src/store/manager/actions.js:56 (a `danger` result resets the manager to the root)
            ->assertJsonPath('result.status', 'danger')
// CA reads: packages/client-area/fm/src/store/manager/actions.js:56
            ->assertJsonPath('result.message', 'Unable to get content of directory.');
    }

    /**
     * A non-2xx Engine answer (a live run saw a 502 from a
     * develop route the panel did not call) becomes the fm SPA's `danger`
     * envelope, never a raw 502 carrying the Engine path.
     *
     * @param  int  $status
     */
    #[DataProvider('engineListingFailures')]
    public function test_a_non_2xx_listing_answer_becomes_the_danger_envelope(int $status): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:599 -> files/list
        Http::fake([
            'engine.example.com/api/projects/site1/files/list*' => Http::response(['message' => 'nope'], $status),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/get.js:43
            ->getJson("/api/file-manager/content/{$application->id}?path=public_html")
            ->assertOk()
// CA reads: packages/client-area/fm/src/store/manager/actions.js:56
            ->assertJsonPath('result.status', 'danger')
// CA reads: packages/client-area/fm/src/store/manager/actions.js:56
            ->assertJsonPath('result.message', 'Unable to get content of directory.');
    }

    /**
     * @return array<string, array{0: int}>
     */
    public static function engineListingFailures(): array
    {
        return ['an Engine 500' => [500], 'an Engine 422' => [422]];
    }

    public function test_create_file_uses_an_empty_upload_and_returns_file(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The Engine rejects `put-contents` with an empty body, so an empty
        // upload is used; the panel checks `files/exists` first so it never
        // truncates an existing file.
        // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists; :581 -> files/upload
        Http::fake([
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => false, 'path' => '/public_html/notes.txt']),
            'engine.example.com/api/projects/site1/files/upload' => Http::response(['success' => true]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:13
            ->postJson("/api/file-manager/create-file/{$application->id}", ['disk' => 'local', 'path' => 'public_html', 'name' => 'notes.txt'])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'fileCreated')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('file.type', 'file')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('file.path', 'public_html/notes.txt')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('file.size', 0);

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/files/upload'));
        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/files/put-contents'));
    }

    public function test_create_file_refuses_when_the_file_already_exists(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/routes/api.php:231-241 (files/*), GET files/exists -> {exists}.
        // Engine: core/app/Http/Controllers/User/FileController.php:54 -> exists
        Http::fake([
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => true, 'path' => '/public_html/notes.txt']),
        ]);

        // The old panel answered `cannot_create_file` instead of truncating the
        // existing file; the message is the old translated
        // text (messages.php:177).
        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:13
            ->postJson("/api/file-manager/create-file/{$application->id}", ['disk' => 'local', 'path' => 'public_html', 'name' => 'notes.txt'])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'error')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'Cannot create file.');

        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/files/upload'));
    }

    public function test_create_file_answers_the_old_error_when_the_exists_check_fails(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: FileController::exists 400 (FileController.php:60-64). A failed
        // existence check is never treated as "absent".
        // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists
        Http::fake([
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['message' => 'nope'], 400),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:13
            ->postJson("/api/file-manager/create-file/{$application->id}", ['disk' => 'local', 'path' => 'public_html', 'name' => 'notes.txt'])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'error')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'Cannot create file.');

        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/files/upload'));
    }

    public function test_create_file_answers_the_old_error_when_the_exists_body_is_malformed(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The 200 body must carry the boolean `exists`; without it the check
        // is malformed and answers the failed-check error, never "absent".
        // Engine: core/app/Http/Controllers/User/FileController.php:54
        Http::fake([
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['path' => '/public_html/notes.txt']),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:13
            ->postJson("/api/file-manager/create-file/{$application->id}", ['disk' => 'local', 'path' => 'public_html', 'name' => 'notes.txt'])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'error')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'Cannot create file.');

        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/files/upload'));
    }

    public function test_create_file_answers_the_old_error_when_the_empty_upload_fails(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: FileController::upload 400 (core/app/Http/Controllers/User/FileController.php:596-602)
        // for the empty file the create-file workaround sends. Old createFile
        // answered `cannot_create_file` on any failure
        // (packages/api/app/Http/Controllers/User/ServerAccount/FileManager.php:747-759).
        // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists; :581 -> files/upload
        Http::fake([
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => false]),
            'engine.example.com/api/projects/site1/files/upload' => Http::response(['message' => 'nope'], 400),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:13
            ->postJson("/api/file-manager/create-file/{$application->id}", ['disk' => 'local', 'path' => 'public_html', 'name' => 'notes.txt'])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'error')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'Cannot create file.');

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/files/upload'));
    }

    public function test_update_file_uploads_into_the_dirname_and_returns_file(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:665 -> files/upload
        Http::fake(['engine.example.com/api/projects/site1/files/upload' => Http::response(['success' => true])]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:23
            ->call('POST', "/api/file-manager/update-file/{$application->id}", [
                'disk' => 'local',
                'path' => 'public_html',
                'name' => 'notes.txt',
            ], [], [
                'file' => UploadedFile::fake()->createWithContent('notes.txt', 'hello'),
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('file.path', 'public_html/notes.txt')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('file.size', 5);

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/files/upload'));
    }

    public function test_create_file_keeps_a_name_with_a_double_quote_by_writing_it_under_a_temporary_one(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // A multipart `filename` header carries no double quote: the Engine's
        // parser cuts `filename="fmq"x.txt"` at the first quote and creates
        // `fmq`. The empty upload therefore goes under a temporary name and is
        // moved onto the name asked for, so the answer names the file that exists.
        // The multipart body is read in the fake: after the request its stream is consumed.
        $uploadBody = null;
        // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists; :582 -> files/stat; :581 -> files/upload; :442 -> files/mv
        Http::fake([
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => false]),
            'engine.example.com/api/projects/site1/files/stat*' => Http::response(['message' => 'Invalid path'], 404),
            'engine.example.com/api/projects/site1/files/mv' => Http::response(['success' => true]),
            'engine.example.com/api/projects/site1/files/upload' => function ($request) use (&$uploadBody) {
                $uploadBody = $request->body();

                // Engine: core/app/Http/Controllers/User/FileController.php:581 -> files/upload
                return Http::response(['success' => true]);
            },
        ]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:13
            ->postJson("/api/file-manager/create-file/{$application->id}", ['disk' => 'local', 'path' => 'public_html', 'name' => 'fmq"x.txt'])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'fileCreated')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('file.path', 'public_html/fmq"x.txt');

        Http::assertSent(fn ($request) => str_contains($request->url(), '/files/stat?')
            && str_contains(urldecode($request->url()), 'path=public_html/fmq"x.txt'));
        $this->assertIsString($uploadBody);
        $this->assertStringContainsString('filename=".panelalpha-upload-', $uploadBody);
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/files/mv')
            && $request['dest_path'] === 'public_html/fmq"x.txt'
            && preg_match('/^public_html\/\.panelalpha-upload-[0-9a-f]{16}$/', (string) $request['source_path']) === 1);
    }

    public function test_upload_writes_the_name_the_ca_gave_in_names_and_keeps_a_double_quote(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The browser escapes a `"` of a file name in the part header (`fmq%22x.txt`),
        // so the CA names the file in `names[]`; the quote then takes the same
        // temporary-name write as create-file.
        $uploadBody = null;
        // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists; :582 -> files/stat; :581 -> files/upload; :442 -> files/mv
        Http::fake([
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => false]),
            'engine.example.com/api/projects/site1/files/stat*' => Http::response(['message' => 'Invalid path'], 404),
            'engine.example.com/api/projects/site1/files/mv' => Http::response(['success' => true]),
            'engine.example.com/api/projects/site1/files/upload' => function ($request) use (&$uploadBody) {
                $uploadBody = $request->body();

                // Engine: core/app/Http/Controllers/User/FileController.php:581 -> files/upload
                return Http::response(['success' => true]);
            },
        ]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:44
            ->call('POST', "/api/file-manager/upload/{$application->id}", [
                'disk' => 'local',
                'path' => 'public_html',
                'overwrite' => '0',
                'names' => ['fmq"x.txt'],
            ], [], [
                'files' => [UploadedFile::fake()->createWithContent('fmq%22x.txt', 'x')],
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'uploaded');

        $this->assertNotNull($uploadBody);
        $this->assertStringContainsString('filename=".panelalpha-upload-', $uploadBody);
        $this->assertStringNotContainsString('fmq%22x.txt', (string) $uploadBody);
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/files/mv')
            && $request['dest_path'] === 'public_html/fmq"x.txt');
    }

    public function test_upload_refuses_a_file_without_its_name_and_writes_nothing(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The parser cuts `upl\oad.txt` to `oad.txt`, so an unnamed file is refused.
        Http::fake();

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:44
            ->call('POST', "/api/file-manager/upload/{$application->id}", [
                'disk' => 'local',
                'path' => 'public_html',
                'overwrite' => '1',
            ], [], [
                'files' => [UploadedFile::fake()->createWithContent('oad.txt', 'x')],
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/fm/src/FileManager.vue:196 (the 422's `message` in the notification)
            ->assertJsonValidationErrors('names')
            ->assertJsonPath('message', 'The name of every uploaded file is required.');

        Http::assertNothingSent();
    }

    public function test_upload_refuses_the_whole_request_when_one_file_has_no_name(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake();

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:44
            ->call('POST', "/api/file-manager/upload/{$application->id}", [
                'disk' => 'local',
                'path' => 'public_html',
                'overwrite' => '1',
                'names' => ['a.txt'],
            ], [], [
                'files' => [
                    UploadedFile::fake()->createWithContent('a.txt', 'x'),
                    UploadedFile::fake()->createWithContent('b.txt', 'x'),
                ],
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/fm/src/FileManager.vue:196 (the 422's `message` in the notification)
            ->assertJsonValidationErrors('names')
            ->assertJsonPath('message', 'The name of every uploaded file is required.');

        Http::assertNothingSent();
    }

    public function test_upload_refuses_a_blank_name_and_writes_nothing(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake();

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:44
            ->call('POST', "/api/file-manager/upload/{$application->id}", [
                'disk' => 'local',
                'path' => 'public_html',
                'names' => [''],
            ], [], [
                'files' => [UploadedFile::fake()->createWithContent('a.txt', 'x')],
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/fm/src/FileManager.vue:196 (the 422's `message` in the notification)
            ->assertJsonValidationErrors('names')
            ->assertJsonPath('message', 'The name of every uploaded file is required.');

        Http::assertNothingSent();
    }

    public function test_update_file_refuses_a_file_without_its_name_and_writes_nothing(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The parser cuts `upl\oad.txt` to `oad.txt`, so an unnamed write is refused.
        Http::fake();

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:23
            ->call('POST', "/api/file-manager/update-file/{$application->id}", [
                'disk' => 'local',
                'path' => 'public_html',
            ], [], [
                'file' => UploadedFile::fake()->createWithContent('oad.txt', 'x'),
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/fm/src/FileManager.vue:196 (the 422's `message` in the notification)
            ->assertJsonValidationErrors('name')
            ->assertJsonPath('message', 'The name of the file is required.');

        Http::assertNothingSent();
    }

    public function test_update_file_refuses_a_blank_name_and_writes_nothing(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake();

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:23
            ->call('POST', "/api/file-manager/update-file/{$application->id}", [
                'disk' => 'local',
                'path' => 'public_html',
                'name' => '',
            ], [], [
                'file' => UploadedFile::fake()->createWithContent('oad.txt', 'x'),
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/fm/src/FileManager.vue:196 (the 422's `message` in the notification)
            ->assertJsonValidationErrors('name')
            ->assertJsonPath('message', 'The name of the file is required.');

        Http::assertNothingSent();
    }

    public function test_update_file_writes_the_name_the_ca_gave_in_name_and_keeps_a_double_quote(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:582 -> files/stat; :581 -> files/upload; :442 -> files/mv
        Http::fake([
            'engine.example.com/api/projects/site1/files/stat*' => Http::response(['message' => 'Invalid path'], 404),
            'engine.example.com/api/projects/site1/files/upload' => Http::response(['success' => true]),
            'engine.example.com/api/projects/site1/files/mv' => Http::response(['success' => true]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:23
            ->call('POST', "/api/file-manager/update-file/{$application->id}", [
                'disk' => 'local',
                'path' => 'public_html',
                'name' => 'notes"draft.txt',
            ], [], [
                'file' => UploadedFile::fake()->createWithContent('notes%22draft.txt', 'hello'),
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'fileUpdated')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('file.path', 'public_html/notes"draft.txt');

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/files/mv')
            && $request['dest_path'] === 'public_html/notes"draft.txt');
    }

    public function test_a_quoted_name_taken_by_a_folder_answers_the_old_error_and_writes_nothing(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The Engine's `mv` moves a file into a folder of the same name instead of
        // replacing it, so the temporary upload is never sent.
        // Engine: core/app/Http/Controllers/User/FileController.php:582 -> files/stat
        Http::fake([
            'engine.example.com/api/projects/site1/files/stat*' => Http::response(['data' => ['name' => 'fmq"x', 'type' => 'dir']]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:23
            ->call('POST', "/api/file-manager/update-file/{$application->id}", [
                'disk' => 'local',
                'path' => 'public_html',
                'name' => 'fmq"x',
            ], [], [
                'file' => UploadedFile::fake()->createWithContent('fmq%22x', 'hello'),
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'error')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'Cannot update file.');

        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/files/upload'));
        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/files/mv'));
    }

    public function test_a_failed_move_removes_the_temporary_upload_and_answers_the_old_error(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $temporary = null;
        // Engine: core/app/Http/Controllers/User/FileController.php:582 -> files/stat; :581 -> files/upload; :442 -> files/mv; :95 -> files/remove
        Http::fake([
            'engine.example.com/api/projects/site1/files/stat*' => Http::response(['message' => 'Invalid path'], 404),
            'engine.example.com/api/projects/site1/files/upload' => Http::response(['success' => true]),
            'engine.example.com/api/projects/site1/files/remove' => Http::response(['success' => true]),
            'engine.example.com/api/projects/site1/files/mv' => function ($request) use (&$temporary) {
                $temporary = (string) $request['source_path'];

                // Engine: core/app/Http/Controllers/User/FileController.php:442 -> files/mv (400 on a failed move)
                return Http::response(['message' => 'nope'], 400);
            },
        ]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:23
            ->call('POST', "/api/file-manager/update-file/{$application->id}", [
                'disk' => 'local',
                'path' => 'public_html',
                'name' => 'notes"draft.txt',
            ], [], [
                'file' => UploadedFile::fake()->createWithContent('notes%22draft.txt', 'hello'),
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'Cannot update file.');

        $this->assertNotNull($temporary, 'the temporary upload was moved');
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/files/remove') && $request['path'] === $temporary);
    }

    public function test_update_file_answers_503_when_the_engine_is_down(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake(['engine.example.com/*' => fn () => throw new ConnectionException('down')]);

        // CA: packages/client-area/fm/src/http/post.js:23
        // CA reads: packages/client-area/fm/src/FileManager.vue:157
        $this->actingAs($user)
            ->call('POST', "/api/file-manager/update-file/{$application->id}", [
                'disk' => 'local',
                'path' => 'public_html',
                'name' => 'notes.txt',
            ], [], [
                'file' => UploadedFile::fake()->createWithContent('notes.txt', 'hello'),
            ], ['Accept' => 'application/json'])
            ->assertStatus(503);
    }

    public function test_update_file_answers_502_on_an_engine_5xx(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:665 -> files/upload (Engine 5xx)
        Http::fake(['engine.example.com/*' => Http::response(['message' => 'boom'], 500)]);

        // CA: packages/client-area/fm/src/http/post.js:23
        // CA reads: packages/client-area/fm/src/FileManager.vue:157
        $this->actingAs($user)
            ->call('POST', "/api/file-manager/update-file/{$application->id}", [
                'disk' => 'local',
                'path' => 'public_html',
                'name' => 'notes.txt',
            ], [], [
                'file' => UploadedFile::fake()->createWithContent('notes.txt', 'hello'),
            ], ['Accept' => 'application/json'])
            ->assertStatus(502);
    }

    public function test_delete_removes_each_selected_item(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:95 -> files/remove
        Http::fake(['engine.example.com/api/projects/site1/files/remove' => Http::response(['success' => true])]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:54
            ->postJson("/api/file-manager/delete/{$application->id}", [
                'disk' => 'local',
                'items' => [
                    ['type' => 'file', 'path' => 'public_html/a.txt'],
                    ['type' => 'dir', 'path' => 'public_html/assets'],
                ],
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'deleted');

        $this->assertEquals(2, Http::recorded(fn ($request) => str_ends_with($request->url(), '/files/remove'))->count());
    }

    public function test_rename_moves_old_name_to_new_name(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:442 -> files/mv
        Http::fake(['engine.example.com/api/projects/site1/files/mv' => Http::response(['success' => true])]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:64
            ->postJson("/api/file-manager/rename/{$application->id}", [
                'disk' => 'local',
                'oldName' => 'public_html/old.txt',
                'newName' => 'public_html/.new.txt',
                'type' => 'file',
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'renamed');

        // Dots must not be trimmed.
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/files/mv')
            && ($request['source_path'] ?? null) === 'public_html/old.txt'
            && ($request['dest_path'] ?? null) === 'public_html/.new.txt');
    }

    public function test_rename_refuses_a_new_name_with_a_backslash(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:64
            ->postJson("/api/file-manager/rename/{$application->id}", [
                'disk' => 'local',
                'oldName' => 'public_html/old.txt',
                'newName' => 'public_html/sub\\new.txt',
                'type' => 'file',
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonValidationErrors('path');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/files/'));
    }

    public function test_paste_refuses_a_clipboard_path_with_a_backslash(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:74
            ->postJson("/api/file-manager/paste/{$application->id}", [
                'disk' => 'local',
                'path' => 'public_html',
                'clipboard' => [
                    'type' => 'copy',
                    'directories' => [],
                    'files' => ['public_html/sub\\a.txt'],
                ],
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonValidationErrors('path');

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/files/'));
    }

    public function test_paste_copies_the_clipboard_directories_and_files(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:493 -> files/cp
        Http::fake(['engine.example.com/api/projects/site1/files/cp' => Http::response(['success' => true])]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:74
            ->postJson("/api/file-manager/paste/{$application->id}", [
                'disk' => 'local',
                'path' => 'public_html',
                'clipboard' => [
                    'type' => 'copy',
                    'directories' => ['public_html/assets'],
                    'files' => ['public_html/a.txt'],
                ],
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'copied');

        // The destination is the chosen directory, never `<dir>/<basename>`
        // (old `cp -R srcs… dir`).
        $sent = Http::recorded(fn ($request) => str_ends_with($request->url(), '/files/cp'));
        $this->assertCount(2, $sent);
        foreach ($sent as [$request]) {
            $this->assertSame('public_html', $request['dest_path']);
        }
    }

    public function test_paste_maps_an_engine_400_to_the_old_text(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: FileController::cp/mv 400. Old texts: messages.php:174-175.
        // Engine: core/app/Http/Controllers/User/FileController.php:493 -> files/cp; :427 -> files/mv
        Http::fake([
            'engine.example.com/api/projects/site1/files/cp' => Http::response(['message' => 'nope'], 400),
            'engine.example.com/api/projects/site1/files/mv' => Http::response(['message' => 'nope'], 400),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:74
            ->postJson("/api/file-manager/paste/{$application->id}", [
                'disk' => 'local',
                'path' => 'public_html',
                'clipboard' => ['type' => 'copy', 'directories' => ['public_html/a'], 'files' => []],
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'error')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'Cannot copy selected file(s).');

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:74
            ->postJson("/api/file-manager/paste/{$application->id}", [
                'disk' => 'local',
                'path' => 'public_html/assets',
                'clipboard' => ['type' => 'cut', 'directories' => ['public_html/a'], 'files' => []],
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'error')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'Cannot move selected file(s).');
    }

    public function test_paste_answers_moved_for_cut(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Old `file_moved` (messages.php:190) = "Moved!"; the Engine's mv takes
        // the destination directory (FileController::mv, FileController.php:427-456).
        // Engine: core/app/Http/Controllers/User/FileController.php:442 -> files/mv
        Http::fake(['engine.example.com/api/projects/site1/files/mv' => Http::response(['success' => true])]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:74
            ->postJson("/api/file-manager/paste/{$application->id}", [
                'disk' => 'local',
                'path' => 'public_html/assets',
                'clipboard' => ['type' => 'cut', 'directories' => ['public_html/a'], 'files' => []],
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'Moved!');

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/files/mv')
            && ($request['source_path'] ?? null) === 'public_html/a'
            && ($request['dest_path'] ?? null) === 'public_html/assets');
    }

    public function test_paste_and_zip_reject_non_string_entries(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:74
            ->postJson("/api/file-manager/paste/{$application->id}", [
                'disk' => 'local',
                'path' => 'public_html',
                'clipboard' => ['type' => 'copy', 'files' => [['path' => 'public_html/a.txt']]],
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonValidationErrors('clipboard.files.0');

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:84
            ->postJson("/api/file-manager/zip/{$application->id}", [
                'disk' => 'local',
                'path' => 'public_html',
                'name' => 'assets.zip',
                'elements' => ['directories' => [123], 'files' => []],
            ])
            ->assertStatus(422)
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonValidationErrors('elements.directories.0');
    }

    public function test_zip_maps_a_single_directory_and_rejects_multiple_elements(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:196 -> files/zip
        Http::fake(['engine.example.com/api/projects/site1/files/zip' => Http::response(['success' => true])]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:84
            ->postJson("/api/file-manager/zip/{$application->id}", [
                'disk' => 'local',
                'path' => 'public_html',
                'name' => 'assets.zip',
                'elements' => ['directories' => ['public_html/assets'], 'files' => []],
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'success');

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/files/zip')
            && ($request['zip_path'] ?? null) === 'public_html/assets.zip'
            && ($request['path'] ?? null) === 'public_html/assets');

        // Multiple elements: one `files/zip` per element, same `zip_path`
        // (the Engine appends).
        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:84
            ->postJson("/api/file-manager/zip/{$application->id}", [
                'path' => 'public_html',
                'name' => 'both.zip',
                'elements' => ['directories' => ['public_html/a', 'public_html/b'], 'files' => []],
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'success');

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/files/zip')
            && ($request['zip_path'] ?? null) === 'public_html/both.zip'
            && ($request['path'] ?? null) === 'public_html/b');
    }

    public function test_thumbnail_returns_the_engine_webp_as_a_data_uri(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The grid thumbnail is an 88x88 cover webp.
        // Engine: core/app/Http/Controllers/User/FileController.php:764 -> files/thumbnail, image/webp
        Http::fake(['engine.example.com/api/projects/site1/files/thumbnail*' => Http::response('WEBPBYTES', 200, ['Content-Type' => 'image/webp'])]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/get.js:96-99
            ->getJson("/api/file-manager/thumbnails/{$application->id}?path=".urlencode('public_html/a.png'))
            ->assertOk()
// CA reads: packages/client-area/fm/src/components/manager/Thumbnail.vue:68 (this.src = response.data.image)
            ->assertJsonPath('result.status', 'success')
// CA reads: packages/client-area/fm/src/components/manager/Thumbnail.vue:68
            ->assertJsonPath('image', 'data:image/webp;base64,'.base64_encode('WEBPBYTES'));

        Http::assertSent(fn ($request) => str_contains($request->url(), '/files/thumbnail')
            && str_contains($request->url(), 'width=88')
            && str_contains($request->url(), 'height=88')
            && str_contains($request->url(), 'fit=cover'));
    }

    public function test_preview_of_an_image_is_resized_by_the_engine(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // An image preview uses files/thumbnail in the
        // Engine's largest box (1024 px) with fit=contain.
        // Engine: core/app/Http/Controllers/User/FileController.php:764 -> files/thumbnail, image/webp
        Http::fake(['engine.example.com/api/projects/site1/files/thumbnail*' => Http::response('WEBPPREVIEW', 200, ['Content-Type' => 'image/webp'])]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/get.js:110
            ->getJson("/api/file-manager/preview/{$application->id}?path=".urlencode('public_html/a.png'))
            ->assertOk()
// CA reads: packages/client-area/fm/src/components/modals/views/PreviewModal.vue:134 (this.imgSrc = response.data.image)
            ->assertJsonPath('image', 'data:image/webp;base64,'.base64_encode('WEBPPREVIEW'));

        Http::assertSent(fn ($request) => str_contains($request->url(), '/files/thumbnail')
            && str_contains($request->url(), 'width=1024')
            && str_contains($request->url(), 'height=1024')
            && str_contains($request->url(), 'fit=contain'));
        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/files/download'));
    }

    public function test_preview_of_a_non_image_streams_the_download(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // A non-image keeps the whole-file download.
        // Engine: core/app/Http/Controllers/User/FileController.php:709 -> files/download
        Http::fake(['engine.example.com/api/projects/site1/files/download*' => Http::response('TEXTDATA', 200)]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/get.js:110
            ->getJson("/api/file-manager/preview/{$application->id}?path=".urlencode('public_html/a.txt'))
            ->assertOk()
// CA reads: packages/client-area/fm/src/components/modals/views/PreviewModal.vue:134
            ->assertJsonPath('image', 'data:application/octet-stream;base64,'.base64_encode('TEXTDATA'));

        Http::assertNotSent(fn ($request) => str_contains($request->url(), '/files/thumbnail'));
    }

    public function test_preview_failure_returns_the_old_error_envelope(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Old text: packages/api/resources/lang/en/api/messages.php:183.
        // Engine: core/app/Http/Controllers/User/FileController.php:764 -> files/thumbnail (422 `unsupported_image`)
        Http::fake(['engine.example.com/api/projects/site1/files/thumbnail*' => Http::response(['message' => 'nope'], 422)]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/get.js:110
            ->getJson("/api/file-manager/preview/{$application->id}?path=".urlencode('public_html/a.png'))
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'error')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'Unable to generate preview.');
    }

    public function test_thumbnail_failure_returns_the_old_error_envelope(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Old text: packages/api/resources/lang/en/api/messages.php:182.
        // Engine: core/app/Http/Controllers/User/FileController.php:764 -> files/thumbnail (422 `unsupported_image`)
        Http::fake(['engine.example.com/api/projects/site1/files/thumbnail*' => Http::response(['message' => 'nope'], 422)]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/get.js:96-99
            ->getJson("/api/file-manager/thumbnails/{$application->id}?path=".urlencode('public_html/a.txt'))
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'error')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'Unable to generate thumbnail.');
    }

    public function test_upload_skips_existing_files_when_overwrite_is_off(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // CA: `fm/src/store/actions.js:242` sends `overwrite` (0/1) plus
        // `files[]`; `UploadModal.vue:121` defaults to 0. Old
        // FileManager::upload skipped the existing file and still answered
        // `uploaded` (FileManager.php:213-217, fm en.js:179).
        // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists; :581 -> files/upload
        Http::fake([
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => true]),
            'engine.example.com/api/projects/site1/files/upload' => Http::response(['success' => true]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:44
            ->call('POST', "/api/file-manager/upload/{$application->id}", ['disk' => 'local', 'path' => 'public_html', 'overwrite' => '0', 'names' => ['a.txt']], [], [
                'files' => [UploadedFile::fake()->createWithContent('a.txt', 'x')],
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'success')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'uploaded');

        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/files/upload'));
    }

    public function test_upload_overwrites_when_overwrite_is_on(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists; :581 -> files/upload
        Http::fake([
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => true]),
            'engine.example.com/api/projects/site1/files/upload' => Http::response(['success' => true]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:44
            ->call('POST', "/api/file-manager/upload/{$application->id}", ['disk' => 'local', 'path' => 'public_html', 'overwrite' => '1', 'names' => ['a.txt']], [], [
                'files' => [UploadedFile::fake()->createWithContent('a.txt', 'x')],
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'uploaded');

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/files/upload'));
    }

    public function test_upload_answers_the_old_warning_when_the_engine_rejects_a_file(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: FileController::upload 400. Old upload caught the failure and
        // answered `{status:'warning',message:'notAllUploaded'}` (FileManager.php:239-247).
        // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists; :581 -> files/upload
        Http::fake([
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => false]),
            'engine.example.com/api/projects/site1/files/upload' => Http::response(['message' => 'nope'], 400),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:44
            ->call('POST', "/api/file-manager/upload/{$application->id}", ['disk' => 'local', 'path' => 'public_html', 'overwrite' => '0', 'names' => ['a.txt']], [], [
                'files' => [UploadedFile::fake()->createWithContent('a.txt', 'x')],
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'warning')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'notAllUploaded');
    }

    public function test_upload_does_not_treat_a_failed_exists_check_as_absent(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: FileController::exists 400. The old upload caught it and
        // answered the warning (FileManager.php:213-217); it never overwrote an
        // unknown file.
        // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists
        Http::fake([
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['message' => 'nope'], 400),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:44
            ->call('POST', "/api/file-manager/upload/{$application->id}", ['disk' => 'local', 'path' => 'public_html', 'overwrite' => '0', 'names' => ['a.txt']], [], [
                'files' => [UploadedFile::fake()->createWithContent('a.txt', 'x')],
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'warning')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'notAllUploaded');

        Http::assertNotSent(fn ($request) => str_ends_with($request->url(), '/files/upload'));
    }

    public function test_download_forwards_the_range_status_and_headers(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: `response()->download($source)` (FileController.php:625-651)
        // honours Range and answers 206 with the Content-Range headers.
        // Engine: core/app/Http/Controllers/User/FileController.php:709 -> files/download
        Http::fake(['engine.example.com/api/projects/site1/files/download*' => Http::response('BYTES', 206, [
            'Content-Type' => 'application/octet-stream',
            'Content-Length' => '5',
            'Content-Range' => 'bytes 0-4/10',
            'Accept-Ranges' => 'bytes',
        ])]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/get.js:71-72
            ->get("/api/file-manager/download/{$application->id}?path=".urlencode('public_html/a.bin'), ['Range' => 'bytes=0-4'])
            ->assertStatus(206)
            ->assertHeader('Content-Type', 'application/octet-stream')
            ->assertHeader('Content-Range', 'bytes 0-4/10')
            ->assertHeader('Accept-Ranges', 'bytes')
            // HeaderUtils::makeDisposition output.
            ->assertHeader('Content-Disposition', 'attachment; filename=a.bin');

        Http::assertSent(fn ($request) => $request->hasHeader('Range', 'bytes=0-4'));
    }

    public function test_stream_file_keeps_the_engine_status_without_content_disposition(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // CA: `fm/src/components/modals/views/AudioPlayerModal.vue:132`,
        // `VideoPlayerModal.vue:37` open the route as a media source.
        // Engine: core/app/Http/Controllers/User/FileController.php:709 -> files/download
        Http::fake(['engine.example.com/api/projects/site1/files/download*' => Http::response('BYTES', 206, [
            'Content-Range' => 'bytes 0-4/10',
        ])]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/components/modals/views/AudioPlayerModal.vue:132
            ->get("/api/file-manager/stream-file/{$application->id}?path=".urlencode('public_html/a.mp4'))
            ->assertStatus(206)
            ->assertHeader('Content-Range', 'bytes 0-4/10')
            ->assertHeaderMissing('Content-Disposition');
    }

    public function test_download_keeps_an_engine_404(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: FileController::download answers 404 for a missing file
        // (FileController.php:638-640); the stream is opened before the response
        // so the status survives.
        // Engine: core/app/Http/Controllers/User/FileController.php:724 -> files/download
        Http::fake(['engine.example.com/api/projects/site1/files/download*' => Http::response(['message' => 'Invalid path'], 404)]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/get.js:71-72
            ->get("/api/file-manager/download/{$application->id}?path=".urlencode('public_html/missing.bin'))
            ->assertStatus(404);
    }

    public function test_unzip_extracts_into_the_folder(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:252 -> files/unzip
        Http::fake(['engine.example.com/api/projects/site1/files/unzip' => Http::response(['success' => true])]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:94
            ->postJson("/api/file-manager/unzip/{$application->id}", [
                'disk' => 'local',
                'path' => 'public_html/archive.zip',
                'folder' => 'extracted',
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'success');

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/files/unzip')
            && ($request['zip_path'] ?? null) === 'public_html/archive.zip'
            && ($request['path'] ?? null) === 'public_html/extracted');
    }

    public function test_upload_into_the_home_root_sends_the_slash_path(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The fm SPA leaves `path` empty at the root (`fm/src/http/get.js:42`
        // sends the current directory); the Engine turns '' into null and its
        // `required` rule then answers 422, so the panel sends '/' for the project
        // home.
        // The multipart body is read in the fake: after the request the stream is
        // consumed.
        $sentPath = null;
        // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists; :581 -> files/upload
        Http::fake([
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => false]),
            'engine.example.com/api/projects/site1/files/upload' => function ($request) use (&$sentPath) {
                if (preg_match('/name="path"[\s\S]*?\r\n\r\n([^\r\n]*)/', $request->body(), $matches) === 1) {
                    $sentPath = $matches[1];
                }

                // Engine: core/app/Http/Controllers/User/FileController.php:665 -> files/upload
                return Http::response(['success' => true]);
            },
        ]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:44
            ->call('POST', "/api/file-manager/upload/{$application->id}", ['disk' => 'local', 'path' => '', 'overwrite' => '1', 'names' => ['a.txt']], [], [
                'files' => [UploadedFile::fake()->createWithContent('a.txt', 'x')],
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'uploaded');

        $this->assertSame('/', $sentPath);
    }

    public function test_create_directory_at_the_home_root_sends_the_new_path(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Old `FileManager::createDirectory` created `{dir}/{name}`; at the root
        // the Engine must receive the new directory, never the empty parent.
        // Engine: core/app/Http/Controllers/User/FileController.php:149 -> files/mkdir
        Http::fake(['engine.example.com/api/projects/site1/files/mkdir' => Http::response(['success' => true])]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:33
            ->postJson("/api/file-manager/create-directory/{$application->id}", [
                'disk' => 'local',
                'path' => '',
                'name' => 'assets',
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'dirCreated')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('directory.path', 'assets');

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/files/mkdir')
            && ($request['path'] ?? null) === 'assets');
    }

    public function test_paste_into_the_home_root_sends_the_slash_destination(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The paste target is the chosen directory; at the root that is the
        // project home, the Engine receives '/'.
        // Engine: core/app/Http/Controllers/User/FileController.php:493 -> files/cp
        Http::fake(['engine.example.com/api/projects/site1/files/cp' => Http::response(['success' => true])]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:74
            ->postJson("/api/file-manager/paste/{$application->id}", [
                'disk' => 'local',
                'path' => '',
                'clipboard' => [
                    'type' => 'copy',
                    'directories' => [],
                    'files' => ['public_html/a.txt'],
                ],
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'copied');

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/files/cp')
            && ($request['source_path'] ?? null) === 'public_html/a.txt'
            && ($request['dest_path'] ?? null) === '/');
    }

    public function test_delete_treats_an_engine_404_as_already_deleted(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The old `rm -rf` was idempotent: removing a path that is already gone
        // answered success.
        // Engine: core/app/Http/Controllers/User/FileController.php:95 -> files/remove
        Http::fake(['engine.example.com/api/projects/site1/files/remove' => Http::response(['message' => 'Invalid path'], 404)]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:54
            ->postJson("/api/file-manager/delete/{$application->id}", [
                'disk' => 'local',
                'items' => [['type' => 'file', 'path' => 'public_html/gone.txt']],
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'success')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'deleted');
    }

    public function test_delete_continues_past_an_already_deleted_item(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The first path is already gone (`Invalid path`, the Engine's per-path
        // 404), the second still exists: the loop must continue and remove it.
        // Engine: core/app/Http/Controllers/User/FileController.php:95 -> files/remove
        Http::fake([
            'engine.example.com/api/projects/site1/files/remove' => Http::sequence()
                ->push(['message' => 'Invalid path'], 404)
                ->push(['success' => true]),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:54
            ->postJson("/api/file-manager/delete/{$application->id}", [
                'disk' => 'local',
                'items' => [
                    ['type' => 'file', 'path' => 'public_html/gone.txt'],
                    ['type' => 'file', 'path' => 'public_html/kept.txt'],
                ],
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'success');

        $this->assertSame(2, Http::recorded(fn ($request) => str_ends_with($request->url(), '/files/remove'))->count());
    }

    public function test_delete_does_not_treat_a_project_level_404_as_success(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // A 404 that is not the Engine's per-path `Invalid path` (here the
        // project is gone) is not success and stops the loop before the second
        // item is deleted.
        // Engine: core/app/Http/Controllers/User/FileController.php:95 -> files/remove
        Http::fake([
            'engine.example.com/api/projects/site1/files/remove' => Http::sequence()
                ->push(['message' => 'Project not found.'], 404),
        ]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:54
            ->postJson("/api/file-manager/delete/{$application->id}", [
                'disk' => 'local',
                'items' => [
                    ['type' => 'file', 'path' => 'public_html/gone.txt'],
                    ['type' => 'file', 'path' => 'public_html/kept.txt'],
                ],
            ])
            ->assertStatus(404);

        $this->assertSame(1, Http::recorded(fn ($request) => str_ends_with($request->url(), '/files/remove'))->count());
    }

    public function test_create_file_at_the_home_root_sends_the_slash_path(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The fm SPA sends `path: ''` at the home root; the multipart directory
        // must be '/' because the Engine turns '' into null and its `required`
        // rule answers 422.
        $sentPath = null;
        // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists; :581 -> files/upload
        Http::fake([
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => false]),
            'engine.example.com/api/projects/site1/files/upload' => function ($request) use (&$sentPath) {
                if (preg_match('/name="path"[\s\S]*?\r\n\r\n([^\r\n]*)/', $request->body(), $matches) === 1) {
                    $sentPath = $matches[1];
                }

                // Engine: core/app/Http/Controllers/User/FileController.php:665 -> files/upload
                return Http::response(['success' => true]);
            },
        ]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:13
            ->postJson("/api/file-manager/create-file/{$application->id}", ['disk' => 'local', 'path' => '', 'name' => 'notes.txt'])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'fileCreated')
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('file.path', 'notes.txt');

        $this->assertSame('/', $sentPath);
    }

    public function test_unzip_at_the_home_root_sends_the_slash_target(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // An archive at the home root extracts beside itself: `folder` empty and
        // dirname '' must reach the Engine as '/'.
        // Engine: core/app/Http/Controllers/User/FileController.php:252 -> files/unzip
        Http::fake(['engine.example.com/api/projects/site1/files/unzip' => Http::response(['success' => true])]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:94
            ->postJson("/api/file-manager/unzip/{$application->id}", [
                'disk' => 'local',
                'path' => 'archive.zip',
                'folder' => null,
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.status', 'success');

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/files/unzip')
            && ($request['zip_path'] ?? null) === 'archive.zip'
            && ($request['path'] ?? null) === '/');
    }

    public function test_download_disposition_handles_a_non_ascii_filename(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The old panel used `streamDownload`, whose Content-Disposition is
        // built with HeaderUtils: non-ASCII names get an encoded `filename*`
        // plus an ASCII fallback.
        // Engine: core/app/Http/Controllers/User/FileController.php:709 -> files/download
        Http::fake(['engine.example.com/api/projects/site1/files/download*' => Http::response('BYTES', 200)]);

        $response = $this->actingAs($user)
// CA: packages/client-area/fm/src/http/get.js:71-72
            ->get("/api/file-manager/download/{$application->id}?disk=local&path=".urlencode('dokumenty/zażółć.txt'));

        $response->assertOk();
        $this->assertStringContainsString(
            "filename*=utf-8''za%C5%BC%C3%B3%C5%82%C4%87.txt",
            (string) $response->headers->get('Content-Disposition'),
        );
    }

    public function test_file_manager_requires_authentication(): void
    {
// CA: packages/client-area/fm/src/http/get.js:9
        $this->getJson('/api/file-manager/initialize/1')->assertUnauthorized();
    }

    public function test_cut_into_the_home_root_sends_the_slash_destination(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // The cut branch must send the same root destination as the copy branch:
        // '' is the project home, the Engine takes '/'.
        // Engine: core/app/Http/Controllers/User/FileController.php:442 -> files/mv
        // Engine: core/app/Http/Controllers/User/FileController.php:442 -> files/mv
        Http::fake(['engine.example.com/api/projects/site1/files/mv' => Http::response(['success' => true])]);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:74
            ->postJson("/api/file-manager/paste/{$application->id}", [
                'disk' => 'local',
                'path' => '',
                'clipboard' => [
                    'type' => 'cut',
                    'directories' => [],
                    'files' => ['public_html/a.txt'],
                ],
            ])
            ->assertOk()
// CA reads: packages/client-area/fm/src/FileManager.vue:157
            ->assertJsonPath('result.message', 'Moved!');

        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/files/mv')
            && ($request['source_path'] ?? null) === 'public_html/a.txt'
            && ($request['dest_path'] ?? null) === '/');
    }

    /**
     * `GET files/stat` now wraps its FileEntry in `data`
     * (FileController::stat); the pre-29ae bare `{file_name,size,…}` object is
     * gone. The wrapper has no route caller yet, so it is asserted directly.
     */
    public function test_files_stat_reads_the_data_envelope(): void
    {
        $user = User::factory()->create();
        $application = $this->syncedApplication($user);

        // Engine: core/app/Http/Controllers/User/FileController.php:540 -> stat, {data:FileEntry}
        Http::fake(['engine.example.com/api/projects/site1/files/stat*' => Http::response(['data' => [
            'name' => 'index.php',
            'path' => 'public_html/index.php',
            'type' => 'file',
            'size' => 12,
            'mtime' => 1700000000,
            'mode' => '0644',
            'uid' => 1000,
            'gid' => 1000,
            'target' => null,
            'target_type' => null,
            'has_subdirectories' => false,
        ]])]);

        $stat = (new FilesApi($application->engine()))->stat($application->engineProject(), 'public_html/index.php');

        $this->assertSame('public_html/index.php', $stat['path']);
        $this->assertSame(12, $stat['size']);
        $this->assertSame('0644', $stat['mode']);
        $this->assertFalse($stat['has_subdirectories']);
    }
}
