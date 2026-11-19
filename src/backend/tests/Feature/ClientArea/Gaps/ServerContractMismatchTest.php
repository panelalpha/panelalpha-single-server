<?php

namespace Tests\Feature\ClientArea\Gaps;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Hosting\DomainValidation;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\ProjectService;
use PanelAlpha\ClientArea\Projects\StagingService;
use PanelAlpha\ClientArea\Projects\WordPressImportService;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Group;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The server half of the places where the Client Area form and the server
 * disagree. The green tests pin what the server does today; the red tests state
 * what the user is told or promised. The project delete's removal boxes are
 * enforced now: the delete refuses without all three.
 */
class ServerContractMismatchTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function application(User $user): Application
    {
        $application = $this->syncedApplication($user, 'site1', ['details' => ['template' => 'dind']]);
        // The deploy guard reads the newest deploy; nothing runs.
        $this->fakeEngineDeploys('site1');

        return $application;
    }

    // ---- Project delete acknowledgements --------------------------------

    public function test_delete_sends_the_engine_call_when_both_acknowledgements_are_given(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/UserController.php:1229 -> UserController::destroy
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(null, 204)]);

        $this->actingAs($user)
// CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$application->id}", ['remove_data' => true, 'remove_database' => true, 'confirm' => true])
            ->assertOk();

        Http::assertSent(fn ($request): bool => $request->method() === 'DELETE'
            && str_ends_with($request->url(), '/api/projects/site1'));
    }

    /**
     * The Engine delete has no keep option (`UserController::destroy` removes
     * everything), so the two old options are acknowledgements now and the
     * dialog's final confirmation is one too: a delete without all three is
     * refused and nothing reaches the Engine.
     *
     * @return array<string, array{array<string, bool|null>, list<string>}>
     */
    public static function refusedAcknowledgementsProvider(): array
    {
        return [
            'data cleared' => [['remove_data' => false, 'remove_database' => true, 'confirm' => true], ['remove_data']],
            'database cleared' => [['remove_data' => true, 'remove_database' => false, 'confirm' => true], ['remove_database']],
            'both untouched (null)' => [['remove_data' => null, 'remove_database' => null, 'confirm' => true], ['remove_data', 'remove_database']],
            'both missing' => [['confirm' => true], ['remove_data', 'remove_database']],
            'confirmation missing' => [['remove_data' => true, 'remove_database' => true], ['confirm']],
            'confirmation cleared' => [['remove_data' => true, 'remove_database' => true, 'confirm' => false], ['confirm']],
            'confirmation null' => [['remove_data' => true, 'remove_database' => true, 'confirm' => null], ['confirm']],
            'nothing sent' => [[], ['remove_data', 'remove_database', 'confirm']],
        ];
    }

    /**
     * @param  array<string, bool|null>  $flags
     * @param  list<string>  $fields
     */
    #[DataProvider('refusedAcknowledgementsProvider')]
    public function test_delete_without_all_acknowledgements_is_refused(array $flags, array $fields): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/UserController.php:1229 -> UserController::destroy
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(null, 204)]);

        $response = $this->actingAs($user)
// CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$application->id}", $flags)
            ->assertStatus(422)
// CA reads: src/mixins/InstanceActionsMixin.js:387
            ->assertJsonValidationErrors($fields);

        $this->assertStringContainsString('files and databases', (string) $response->json("errors.{$fields[0]}.0"));
        Http::assertNotSent(fn ($request): bool => $request->method() === 'DELETE');
        $this->assertDatabaseHas('applications', ['id' => $application->id]);
    }

    /**
     * The delete dialog used to offer "Remove Data" and "Remove Database" as
     * options. The Engine delete has no such option, so a user who cleared one
     * box lost the data anyway. The server now refuses the request it cannot
     * honour.
     *
     * @see src/packages/client-area/src/Http/Controllers/Project/ProjectController.php:88-90
     */
    public function test_delete_with_remove_data_cleared_is_refused_instead_of_removing_the_data(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/UserController.php:1229 -> UserController::destroy
        Http::fake(['engine.example.com/api/projects/site1' => Http::response(null, 204)]);

        $this->actingAs($user)
// CA: src/mixins/InstanceActionsMixin.js:386
            ->deleteJson("/api/projects/{$application->id}", ['remove_data' => false, 'remove_database' => false, 'confirm' => true])
            ->assertStatus(422);

        Http::assertNotSent(fn ($request): bool => $request->method() === 'DELETE');
        $this->assertDatabaseHas('applications', ['id' => $application->id]);
    }

    // ---- Deploy from files ---------------------------------------------

    /**
     * @return array<string, array{string}>
     */
    public static function offeredButRefusedFilesProvider(): array
    {
        return [
            'sql dump' => ['dump.sql'],
            'tgz' => ['site.tgz'],
            'plain tar' => ['site.tar'],
            'rar' => ['site.rar'],
            'bare gzip' => ['site.gz'],
        ];
    }

    #[DataProvider('offeredButRefusedFilesProvider')]
    public function test_upload_accepts_only_zip_and_tar_gz_archive_names(string $filename): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->actingAs($user)
// CA: src/components/modal/FilesUploadVersionModal.vue:500
            ->call('POST', "/api/projects/{$application->id}/deploy/upload?filename=".rawurlencode($filename), [], [], [], [
                'CONTENT_TYPE' => 'application/octet-stream',
            ], 'bytes')
            ->assertStatus(422);

        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), '/files/upload'));
    }

    /**
     * @return array<string, array{string}>
     */
    public static function acceptedArchiveProvider(): array
    {
        return [
            'zip' => ['site.zip'],
            'tar.gz' => ['site.tar.gz'],
            'upper case' => ['SITE.ZIP'],
        ];
    }

    #[DataProvider('acceptedArchiveProvider')]
    public function test_upload_accepts_a_zip_or_tar_gz_archive(string $filename): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/FileController.php:152 -> FileController::mkdir
            'engine.example.com/api/projects/site1/files/mkdir' => Http::response(['success' => true]),
            // Engine: core/app/Http/Controllers/User/FileController.php:706 -> FileController::upload
            'engine.example.com/api/projects/site1/files/upload' => Http::response(['success' => true]),
        ]);

        $this->actingAs($user)
// CA: src/components/modal/FilesUploadVersionModal.vue:500
            ->call('POST', "/api/projects/{$application->id}/deploy/upload?filename=".rawurlencode($filename), [], [], [], [
                'CONTENT_TYPE' => 'application/octet-stream',
            ], 'bytes')
            ->assertOk();

        Http::assertSent(fn ($request): bool => str_ends_with($request->url(), '/projects/site1/files/upload'));
    }

    // ---- Domain length -------------------------------------------------

    /**
     * @return array<string, array{string}>
     */
    public static function tooShortDomainProvider(): array
    {
        return [
            'one letter top level' => ['a.c'],
            'no top level' => ['abc'],
            'a single letter' => ['a'],
        ];
    }

    #[DataProvider('tooShortDomainProvider')]
    public function test_a_domain_shorter_than_four_characters_is_refused_by_the_server(string $domain): void
    {
        $user = User::factory()->create();
        $this->application($user);

        try {
            app(DomainValidation::class)->assertAvailable($user, $domain);
            $this->fail('A domain of fewer than four characters must be refused.');
        } catch (ValidationException $e) {
            $this->assertSame(['Invalid domain name.'], $e->errors()['domain']);
        }
    }

    public function test_the_shortest_valid_domain_has_four_characters(): void
    {
        $user = User::factory()->create();
        $this->application($user);

        app(DomainValidation::class)->assertAvailable($user, 'a.io');

        $this->addToAssertionCount(1);
    }

    // ---- File manager upload limit -------------------------------------

    public function test_the_upload_limit_is_checked_per_file_not_for_the_sum_of_the_request(): void
    {
        config(['client-area.upload_max_bytes' => 1048576]);
        $user = User::factory()->create();
        $application = $this->application($user);

        Http::fake([
            // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists
            'engine.example.com/api/projects/site1/files/exists*' => Http::response(['exists' => false]),
            // Engine: core/app/Http/Controllers/User/FileController.php:706 -> files/upload
            'engine.example.com/api/projects/site1/files/upload' => Http::response(['success' => true]),
        ]);

        // Two files of 700 KB: each is under the 1 MB limit, the sum is not.
        // The form blocks the sum (`fm-upload.ts:13-20`); the server does not.
        $files = [
            UploadedFile::fake()->create('a.bin', 700),
            UploadedFile::fake()->create('b.bin', 700),
        ];

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:9
            ->post("/api/file-manager/upload/{$application->id}", ['path' => 'public_html', 'files' => $files, 'names' => ['a.bin', 'b.bin']], ['Accept' => 'application/json'])
            ->assertOk();
    }

    public function test_a_file_over_the_limit_is_refused(): void
    {
        config(['client-area.upload_max_bytes' => 1048576]);
        $user = User::factory()->create();
        $application = $this->application($user);

        $this->actingAs($user)
// CA: packages/client-area/fm/src/http/post.js:9
            ->post("/api/file-manager/upload/{$application->id}", [
                'path' => 'public_html',
                'files' => [UploadedFile::fake()->create('big.bin', 2048)],
                'names' => ['big.bin'],
            ], ['Accept' => 'application/json'])
            ->assertStatus(422);
    }

    // ---- Add Domain aliases --------------------------------------------

    public function test_create_domain_forwards_the_aliases_the_form_never_sends(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        // Engine: core/app/Http/Controllers/User/DomainController.php:282 -> domains store
        Http::fake(['engine.example.com/api/projects/site1/domains*' => Http::response(['data' => ['id' => 1]])]);

        $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:269
            ->postJson("/api/server-accounts/{$application->id}/domains", [
                'domain' => 'shop.example.com',
                'type' => 'addon',
                'aliases' => ['www.shop.example.com'],
            ])
            ->assertOk();

        Http::assertSent(fn ($request): bool => $request->method() === 'POST'
            && str_ends_with($request->url(), '/domains')
            && $request['aliases'] === ['www.shop.example.com']);
    }

    public function test_create_domain_refuses_the_alias_type(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);

        $response = $this->actingAs($user)
// CA: packages/client-area/src/mixins/DomainsActionsMixin.js:269
            ->postJson("/api/server-accounts/{$application->id}/domains", ['domain' => 'shop.example.com', 'type' => 'alias']);

        $response->assertStatus(422);
        $this->assertArrayHasKey('type', $response->json('errors'));
    }

    // ---- Texts that still say "instance" --------------------------------

    /**
     * @return array<string, array{string}>
     */
    public static function userTextProvider(): array
    {
        return [
            'cannot create staging from staging' => [StagingService::CANNOT_CREATE_FROM_STAGING],
            'project already has a staging' => [StagingService::ALREADY_HAS_STAGING],
            'cannot retry installation' => [StagingService::CANNOT_RETRY],
            'import without a domain' => [WordPressImportService::NO_DOMAIN_FOR_IP],
        ];
    }

    /**
     * The product calls them projects; the user sees "instance".
     *
     * @see src/packages/client-area/src/Projects/StagingService.php:32,35
     * @see src/packages/client-area/src/Projects/WordPressImportService.php:65
     */
    #[Group('known-bug')]
    #[DataProvider('userTextProvider')]
    public function test_user_texts_say_project_not_instance(string $text): void
    {
        $this->assertStringNotContainsStringIgnoringCase('instance', $text);
    }

    /**
     * @see src/packages/client-area/src/Projects/ProjectService.php:54
     */
    #[Group('known-bug')]
    public function test_deleting_a_project_with_a_staging_says_project_not_instance(): void
    {
        $user = User::factory()->create();
        $application = $this->application($user);
        Application::query()->create([
            'engine_id' => $application->engine_id,
            'engine_username' => 'site1-staging',
            'domain' => 'staging.site1.example.com',
            'status' => 'active',
            'staging_of_id' => $application->id,
        ]);

        try {
            app(ProjectService::class)->delete($application->fresh());
            $this->fail('A project with a staging must not be deleted.');
        } catch (ValidationException $e) {
            $this->assertStringNotContainsStringIgnoringCase('instance', $e->errors()[0][0]);
        }
    }
}
