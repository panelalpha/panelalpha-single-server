<?php

namespace Tests\Feature\ClientArea\Gaps;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Hosting\FileManagerService;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\EngineClient\Exceptions\EngineRequestException;
use PHPUnit\Framework\Attributes\DataProvider;
use ReflectionMethod;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The service-level branches of the file manager that the route tests in
 * `Hosting/FileManagerTest` do not reach: skipped entries, non-400 Engine
 * answers that must stay errors, path and clipboard refusals, empty images and
 * the upload limit fallback.
 */
class FileManagerServiceGapsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    private function service(): FileManagerService
    {
        return app(FileManagerService::class);
    }

    private function application(): Application
    {
        return $this->syncedApplication(User::factory()->create());
    }

    public function test_content_skips_nameless_entries_and_symlinks(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/FileController.php:639 -> files/list
        Http::fake(['engine.example.com/api/projects/site1/files/list*' => Http::response([
            'data' => [
                ['name' => '', 'path' => '/public_html/x', 'type' => 'file', 'size' => 1, 'mtime' => 1700000000],
                ['name' => 'latest', 'path' => '/public_html/latest', 'type' => 'link', 'size' => 1, 'mtime' => 1700000000],
                ['name' => 'index.php', 'path' => '/public_html/index.php', 'type' => 'file', 'size' => 4, 'mtime' => 1700000000],
            ],
            'meta' => ['path' => '/public_html', 'truncated' => false, 'total' => 3],
        ])]);

        $result = $this->service()->content($application, 'public_html');

        $this->assertSame([], $result['directories']);
        $this->assertCount(1, $result['files']);
        $this->assertSame('index.php', $result['files'][0]['basename']);
    }

    public function test_upload_rethrows_an_engine_failure_that_is_not_a_400(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/FileController.php:706 -> files/upload (Engine 5xx)
        Http::fake(['engine.example.com/api/projects/site1/files/upload' => Http::response(['message' => 'boom'], 500)]);

        $this->expectException(EngineRequestException::class);

        $this->service()->upload($application, 'public_html', [['stream' => 'data', 'name' => 'a.txt']], true);
    }

    public function test_create_file_rethrows_an_existence_check_failure_that_is_not_a_400(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/FileController.php:54 -> files/exists (Engine 5xx)
        Http::fake(['engine.example.com/api/projects/site1/files/exists*' => Http::response(['message' => 'boom'], 500)]);

        $this->expectException(EngineRequestException::class);

        $this->service()->createFile($application, 'public_html', 'notes.txt');
    }

    public function test_create_directory_rejects_a_name_with_a_slash(): void
    {
        $application = $this->application();

        $this->expectException(ValidationException::class);

        $this->service()->createDirectory($application, 'public_html', 'a/b');
    }

    public function test_delete_skips_an_item_without_a_path(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/FileController.php:97 -> files/remove
        Http::fake(['engine.example.com/api/projects/site1/files/remove' => Http::response(['success' => true])]);

        $result = $this->service()->delete($application, [['path' => ''], ['path' => 'public_html/old.txt']]);

        $this->assertSame('deleted', $result['result']['message']);
        Http::assertSentCount(1);
    }

    public function test_rename_refuses_an_empty_path(): void
    {
        $application = $this->application();

        $this->expectException(ValidationException::class);

        $this->service()->rename($application, '', 'public_html/new.txt');
    }

    public function test_paste_refuses_an_unknown_clipboard_type(): void
    {
        $application = $this->application();

        $this->expectException(ValidationException::class);

        $this->service()->paste($application, 'public_html', ['type' => 'link', 'files' => ['a.txt']]);
    }

    public function test_paste_skips_an_empty_source_path(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/FileController.php:528 -> files/cp
        Http::fake(['engine.example.com/api/projects/site1/files/cp' => Http::response(['success' => true])]);

        $result = $this->service()->paste($application, 'public_html', ['type' => 'copy', 'files' => ['', 'public_html/a.txt']]);

        $this->assertSame('copied', $result['result']['message']);
        Http::assertSentCount(1);
    }

    public function test_zip_without_elements_answers_the_error_envelope(): void
    {
        $application = $this->application();

        $result = $this->service()->zip($application, 'public_html', 'out.zip', ['directories' => [], 'files' => []]);

        $this->assertSame('error', $result['result']['status']);
        $this->assertSame('Cannot create ZIP archive.', $result['result']['message']);
    }

    public function test_unzip_refuses_an_empty_archive_path(): void
    {
        $application = $this->application();

        $this->expectException(ValidationException::class);

        $this->service()->unzip($application, '', null);
    }

    public function test_preview_of_an_empty_image_answers_the_error_envelope(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/FileController.php:808 -> files/thumbnail, image/webp (empty body)
        Http::fake(['engine.example.com/api/projects/site1/files/thumbnail*' => Http::response('', 200, ['Content-Type' => 'image/webp'])]);

        $result = $this->service()->preview($application, 'public_html/a.png');

        $this->assertSame('Unable to generate preview.', $result['result']['message']);
    }

    public function test_thumbnail_of_an_empty_image_answers_the_error_envelope(): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/FileController.php:808 -> files/thumbnail, image/webp (empty body)
        Http::fake(['engine.example.com/api/projects/site1/files/thumbnail*' => Http::response('', 200, ['Content-Type' => 'image/webp'])]);

        $result = $this->service()->thumbnails($application, 'public_html/a.png');

        $this->assertSame('Unable to generate thumbnail.', $result['result']['message']);
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function nonImageMimeProvider(): array
    {
        return [
            'svg' => ['public_html/logo.svg', 'image/svg+xml'],
            'bmp' => ['public_html/logo.bmp', 'image/bmp'],
            'text' => ['public_html/notes.txt', 'application/octet-stream'],
        ];
    }

    #[DataProvider('nonImageMimeProvider')]
    public function test_preview_of_a_non_image_uses_the_download_and_its_mime(string $path, string $mime): void
    {
        $application = $this->application();

        // Engine: core/app/Http/Controllers/User/FileController.php:753 -> files/download
        Http::fake(['engine.example.com/api/projects/site1/files/download*' => Http::response('DATA', 200)]);

        $result = $this->service()->preview($application, $path);

        $this->assertSame('data:'.$mime.';base64,'.base64_encode('DATA'), $result['image']);
    }

    public function test_assert_safe_path_accepts_a_home_relative_path_and_refuses_an_escape(): void
    {
        $this->service()->assertSafePath('public_html/a/b');
        $this->addToAssertionCount(1);

        $this->expectException(ValidationException::class);

        $this->service()->assertSafePath('../etc');
    }

    public function test_normalize_path_resolves_a_parent_segment_inside_the_home(): void
    {
        $this->assertSame('public_html/c', $this->service()->normalizePath('public_html/a/../c'));
    }

    /**
     * @return array<string, array{string, int}>
     */
    public static function byteValueProvider(): array
    {
        return [
            'empty' => ['', 0],
            'plain bytes' => ['500', 500],
            'kilobytes' => ['4k', 4096],
            'megabytes' => ['3M', 3145728],
            'gigabytes' => ['2G', 2147483648],
        ];
    }

    #[DataProvider('byteValueProvider')]
    public function test_the_ini_upload_limit_is_converted_to_bytes(string $value, int $bytes): void
    {
        $method = new ReflectionMethod(FileManagerService::class, 'toBytes');

        $this->assertSame($bytes, $method->invoke($this->service(), $value));
    }

    public function test_initialize_falls_back_to_the_php_upload_limit_without_a_configured_one(): void
    {
        config(['client-area.upload_max_bytes' => 0]);
        $application = $this->application();

        $method = new ReflectionMethod(FileManagerService::class, 'toBytes');
        $expected = $method->invoke($this->service(), (string) ini_get('upload_max_filesize'));

        $this->assertSame($expected, $this->service()->initialize($application)['config']['uploadMaxFilesize']);
    }
}
