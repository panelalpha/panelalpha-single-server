<?php

namespace Tests\Feature\ClientArea\Hosting;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\ClientArea\EngineFixtures;
use Tests\TestCase;

/**
 * The file-manager upload limit the `fm` SPA is told
 * (`config.client-area.upload_max_bytes` → `initialize.config.uploadMaxFilesize`,
 * `FileManagerService::initialize`) must come from the same env var as PHP's
 * `upload_max_filesize`, and `post_max_size` must be above it (a multipart body
 * is larger than the file). entrypoint.sh writes both at container start.
 * @see src/entrypoint.sh (PHP limit derivation)
 * @see packages/client-area/fm/src/http/get.js:9 (GET api/file-manager/initialize/{id})
 * @see packages/client-area/fm/src/components/modals/views/UploadModal.vue:157 (reads settings.uploadMaxFilesize)
 */
class UploadLimitsTest extends TestCase
{
    use EngineFixtures, RefreshDatabase;

    public function test_initialize_reports_the_configured_upload_limit(): void
    {
        config(['client-area.upload_max_bytes' => 5242880]);

        $user = User::factory()->create();
        $application = $this->syncedApplication($user);

        // CA: packages/client-area/fm/src/http/get.js:9 (GET api/file-manager/initialize/{id})
        // CA reads: packages/client-area/fm/src/components/modals/views/UploadModal.vue:157 (this.$store.state.fm.settings.uploadMaxFilesize)
        $this->actingAs($user)
            ->getJson("/api/file-manager/initialize/{$application->id}")
            ->assertOk()
            ->assertJsonPath('config.uploadMaxFilesize', 5242880);
    }

    public function test_the_entrypoint_fragment_writes_the_derived_php_and_nginx_limits(): void
    {
        // Run the real fragment against a temp root instead of
        // grepping the script, so a hard-coded value or a wrong conf path fails.
        $script = (string) file_get_contents(base_path('../entrypoint.sh'));
        $this->assertSame(
            1,
            preg_match('/# --- upload limits: start ---(.*?)# --- upload limits: end ---/s', $script, $matches),
            'entrypoint.sh must keep the upload-limits markers for this test',
        );

        $root = sys_get_temp_dir().'/panelalpha-upload-'.bin2hex(random_bytes(6));
        mkdir($root.'/php', 0777, true);
        mkdir($root.'/nginx', 0777, true);
        $fragment = $root.'/fragment.sh';
        file_put_contents($fragment, "#!/bin/bash\nset -e\n".$matches[1]);

        try {
            // 3145729 bytes rounds **up** to 4 MB so a file at the byte limit is
            // accepted; post_max_size is one MB above it.
            $env = 'USER_APPLICATION_UPLOAD_MAX_BYTES=3145729'
                .' PHP_CONF_ROOT='.escapeshellarg($root.'/php')
                .' NGINX_CONF_ROOT='.escapeshellarg($root.'/nginx');
            exec($env.' bash '.escapeshellarg($fragment).' 2>&1', $output, $code);
            $this->assertSame(0, $code, implode("\n", $output));

            $expected = "upload_max_filesize=4M\npost_max_size=5M\n";
            $this->assertSame($expected, (string) file_get_contents($root.'/php/fpm/conf.d/99-panelalpha.ini'));
            $this->assertSame($expected, (string) file_get_contents($root.'/php/cli/conf.d/99-panelalpha.ini'));
            $this->assertSame(
                "client_max_body_size 5M;\n",
                (string) file_get_contents($root.'/nginx/conf.d/00-panelalpha-upload-limit.conf'),
            );
        } finally {
            $this->removeDirectory($root);
        }

        // The nginx fragment is included from the main config; never hard-coded there.
        $nginx = (string) file_get_contents(base_path('../config/nginx.conf'));
        $this->assertStringNotContainsString('client_max_body_size 1024M', $nginx);
        $this->assertStringContainsString('include /etc/nginx/conf.d/*.conf;', $nginx);
    }

    public function test_the_entrypoint_defaults_to_the_production_conf_roots(): void
    {
        // The temp-root override the test above passes must not
        // hide the production defaults; execute the fragment's own default
        // resolution with both variables unset and assert the literals.
        $script = (string) file_get_contents(base_path('../entrypoint.sh'));
        $this->assertSame(
            1,
            preg_match('/# --- upload limits: start ---(.*?)# --- upload limits: end ---/s', $script, $matches),
        );

        preg_match_all('/^(?:PHP_CONF_ROOT|NGINX_CONF_ROOT)=.*$/m', $matches[1], $defaults);
        $this->assertCount(2, $defaults[0], 'entrypoint.sh must keep the two *_CONF_ROOT defaults');

        $probe = "#!/bin/bash\nset -e\n"
            ."unset PHP_CONF_ROOT NGINX_CONF_ROOT\n"
            .implode("\n", $defaults[0])."\n"
            ."printf '%s\\n' \"\$PHP_CONF_ROOT\" \"\$NGINX_CONF_ROOT\"\n";
        $file = sys_get_temp_dir().'/panelalpha-roots-'.bin2hex(random_bytes(6)).'.sh';
        file_put_contents($file, $probe);

        try {
            exec('bash '.escapeshellarg($file).' 2>&1', $output, $code);
            $this->assertSame(0, $code, implode("\n", $output));
            $this->assertSame(['/etc/php/8.5', '/etc/nginx'], $output);
        } finally {
            if (is_file($file)) {
                unlink($file);
            }
        }
    }

    private function removeDirectory(string $path): void
    {
        if (! is_dir($path)) {
            return;
        }

        $items = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($path, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST,
        );
        foreach ($items as $item) {
            $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
        }
        rmdir($path);
    }
}
