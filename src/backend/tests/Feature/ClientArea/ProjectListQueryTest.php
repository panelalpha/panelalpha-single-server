<?php

namespace Tests\Feature\ClientArea;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use PanelAlpha\ClientArea\Models\Application;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The query rules of `GET /api/projects`: parameter validation, the sort-key
 * fallback, paging, the search and the label filter combined.
 *
 * Contract:
 * - CA: `packages/client-area/src/apis/Instances.js:76` (list), `:61-71` (the `labels=a,b` filter).
 * - Engine: `core/app/Http/Controllers/UserController.php:122` (`listAll`, the project mirror).
 */
final class ProjectListQueryTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->configureEngine();
        // Engine: core/app/Http/Controllers/UserController.php:122 -> UserController::listAll
        Http::fake(['engine.example.com/api/projects/all*' => Http::response(['data' => [
            $this->engineProject(1, 'alpha'),
            $this->engineProject(2, 'beta'),
            $this->engineProject(3, 'gamma'),
        ]])]);
        $this->user = User::factory()->create();
        // CA: packages/client-area/src/apis/Instances.js:76
        $this->actingAs($this->user)->getJson('/api/projects')->assertOk();
    }

    /**
     * @return array<string, array{string}>
     */
    public static function invalidQueries(): array
    {
        return [
            'page zero' => ['page=0'],
            'more than 100 per page' => ['per_page=101'],
            'unknown sort direction' => ['sort_dir=sideways'],
            'search term over 255 characters' => ['search_term='.str_repeat('a', 256)],
        ];
    }

    #[DataProvider('invalidQueries')]
    public function test_a_user_listing_projects_with_an_invalid_query_gets_422(string $query): void
    {
        // CA: packages/client-area/src/apis/Instances.js:76
        $this->actingAs($this->user)->getJson('/api/projects?'.$query)->assertUnprocessable();
    }

    public function test_a_user_sorting_by_an_unknown_field_gets_the_default_newest_first_order(): void
    {
        // CA: packages/client-area/src/apis/Instances.js:76
        $response = $this->actingAs($this->user)
            ->getJson('/api/projects?sort_by=password')
            ->assertOk()
            // CA reads: packages/client-area/src/apis/Instances.js:77-80
            ->assertJsonPath('meta.sort_by', 'created_at')
            ->assertJsonPath('meta.sort_dir', 'desc');

        $this->assertSame(['gamma.example.com', 'beta.example.com', 'alpha.example.com'], array_column($response->json('data'), 'domain'));
    }

    public function test_a_user_asking_for_the_second_page_gets_the_rest_of_the_list(): void
    {
        // CA: packages/client-area/src/apis/Instances.js:76
        $this->actingAs($this->user)
            ->getJson('/api/projects?per_page=2&page=2&sort_by=domain&sort_dir=asc')
            ->assertOk()
            // CA reads: packages/client-area/src/apis/Instances.js:77-80
            ->assertJsonPath('meta.total', 3)
            ->assertJsonPath('meta.current_page', 2)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.domain', 'gamma.example.com');
    }

    public function test_a_user_asking_for_a_page_past_the_end_gets_an_empty_page_with_the_total(): void
    {
        // CA: packages/client-area/src/apis/Instances.js:76
        $this->actingAs($this->user)
            ->getJson('/api/projects?per_page=2&page=5')
            ->assertOk()
            // CA reads: packages/client-area/src/apis/Instances.js:77-80
            ->assertJsonCount(0, 'data')
            ->assertJsonPath('meta.total', 3);
    }

    public function test_a_user_searching_in_upper_case_finds_the_project_by_its_name(): void
    {
        // CA: packages/client-area/src/apis/Instances.js:76
        $this->actingAs($this->user)
            ->getJson('/api/projects?search_term=%20GAMM')
            ->assertOk()
            // CA reads: packages/client-area/src/apis/Instances.js:77-80
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.domain', 'gamma.example.com');
    }

    public function test_a_user_filtering_by_two_labels_gets_the_projects_with_either_of_them(): void
    {
        $this->label('alpha', 'Prod');
        $this->label('beta', 'Staging');
        $this->label('gamma', 'Other');

        // CA: packages/client-area/src/apis/Instances.js:61-71
        $response = $this->actingAs($this->user)
            ->getJson('/api/projects?labels=Prod,%20Staging,&sort_by=domain&sort_dir=asc')
            ->assertOk()
            // CA reads: packages/client-area/src/apis/Instances.js:77-80
            ->assertJsonPath('meta.total', 2);

        $this->assertSame(['alpha.example.com', 'beta.example.com'], array_column($response->json('data'), 'domain'));
    }

    public function test_a_user_combining_search_and_label_gets_only_the_projects_matching_both(): void
    {
        $this->label('alpha', 'Prod');
        $this->label('beta', 'Prod');

        // CA: packages/client-area/src/apis/Instances.js:61-71
        $this->actingAs($this->user)
            ->getJson('/api/projects?labels=Prod&search_term=beta')
            ->assertOk()
            // CA reads: packages/client-area/src/apis/Instances.js:77-80
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.domain', 'beta.example.com');
    }

    public function test_a_user_sorting_by_storage_gets_the_largest_first_and_an_unmeasured_project_last(): void
    {
        $this->measured('alpha', ['total_bytes' => 900, 'limit_bytes' => -1]);
        $this->measured('beta', ['total_bytes' => 300, 'limit_bytes' => -1]);

        // CA: packages/client-area/src/views/Instances.vue:296-311 (the numeric columns the sort sends as `sort_by`)
        $response = $this->actingAs($this->user)
            ->getJson('/api/projects?sort_by=storage&sort_dir=desc')
            ->assertOk()
            // CA reads: packages/client-area/src/apis/Instances.js:77-80
            ->assertJsonPath('meta.sort_by', 'storage')
            ->assertJsonPath('meta.sort_dir', 'desc');
        // gamma has no `disk` measurement: it is listed after the measured projects.
        $this->assertSame(['alpha.example.com', 'beta.example.com', 'gamma.example.com'], array_column($response->json('data'), 'domain'));

        // CA: packages/client-area/src/views/Instances.vue:296-311
        $response = $this->actingAs($this->user)
            ->getJson('/api/projects?sort_by=storage&sort_dir=asc')
            ->assertOk()
            // CA reads: packages/client-area/src/apis/Instances.js:77-80
            ->assertJsonPath('meta.sort_by', 'storage');
        $this->assertSame(['beta.example.com', 'alpha.example.com', 'gamma.example.com'], array_column($response->json('data'), 'domain'));
    }

    public function test_a_user_sorting_by_bandwidth_gets_the_heaviest_first_and_an_unmeasured_project_last(): void
    {
        $this->bandwidth('alpha', 5000);
        $this->bandwidth('gamma', 100_000);

        // CA: packages/client-area/src/views/Instances.vue:296-311
        $response = $this->actingAs($this->user)
            ->getJson('/api/projects?sort_by=bandwidth&sort_dir=desc')
            ->assertOk()
            // CA reads: packages/client-area/src/apis/Instances.js:77-80
            ->assertJsonPath('meta.sort_by', 'bandwidth');
        $this->assertSame(['gamma.example.com', 'alpha.example.com', 'beta.example.com'], array_column($response->json('data'), 'domain'));

        // CA: packages/client-area/src/views/Instances.vue:296-311
        $response = $this->actingAs($this->user)
            ->getJson('/api/projects?sort_by=bandwidth&sort_dir=asc')
            ->assertOk()
            // CA reads: packages/client-area/src/apis/Instances.js:77-80
            ->assertJsonPath('meta.sort_by', 'bandwidth');
        $this->assertSame(['alpha.example.com', 'gamma.example.com', 'beta.example.com'], array_column($response->json('data'), 'domain'));
    }

    private function label(string $username, string $title): void
    {
        Application::query()->where('engine_username', $username)->firstOrFail()
            ->applicationLabels()->create(['title' => $title, 'color' => '#ff0000']);
    }

    /**
     * The Engine's stored disk measurement of a mirrored project (`UserResource::disk()`, the `stats.storage` source).
     *
     * @param  array<string, mixed>  $disk
     */
    private function measured(string $username, array $disk): void
    {
        $this->payload($username, ['disk' => $disk]);
    }

    /**
     * The Engine's transfer measurement of this UTC month (`bandwidth`, the `stats.bandwidth` source).
     */
    private function bandwidth(string $username, int $usedBytes): void
    {
        $this->payload($username, ['bandwidth' => [
            'month' => Carbon::now('UTC')->format('Y-m'),
            'used_bytes' => $usedBytes,
            'limit_bytes' => -1,
        ]]);
    }

    /**
     * @param  array<string, mixed>  $values
     */
    private function payload(string $username, array $values): void
    {
        $application = Application::query()->where('engine_username', $username)->firstOrFail();
        $application->engine_payload = array_merge($application->engine_payload ?? [], $values);
        $application->save();
    }
}
