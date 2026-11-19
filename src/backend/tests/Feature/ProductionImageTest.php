<?php

namespace Tests\Feature;

use Tests\Support\TestNetwork;
use Tests\TestCase;

/**
 * V1 is deployed as a PanelAlpha Engine `dockerfile` app. The
 * Engine builds `Dockerfile` with the **repository root** as the build
 * context and runs the last stage (`prod`) with only a volume on `/app/data`.
 *
 * The behaviour (`/api/home` 200, the built Client Area `index.html`, workers
 * RUNNING, APP_KEY and the database surviving a restart) is proven in the real
 * image by `backend/scripts/check-container-prod.sh`; this class pins the
 * wiring so it cannot be dropped silently, the way ContainerConfigCheckTest
 * pins the base-image check.
 *
 * The Engine copies every `.env.example` in the checkout to
 * `.env` before the build (`core/app/Lib/Deploy/Env/EnvExampleCopies.php:8-20`),
 * so the Client Area build (Vite, `src/frontend/client-area`) must strip the
 * copies before the build and `.dockerignore` must drop the Engine's `.env` /
 * `.env.local` pattern at any depth. `check-container-prod.sh` plants such
 * copies in its context and asserts the built bundle carries no `devpalpha`
 * and no absolute `VITE_API_URL` value.
 *
 * @see Dockerfile
 * @see .dockerignore
 * @see src/backend/scripts/check-container-prod.sh
 */
final class ProductionImageTest extends TestCase
{
    private function dockerfile(): string
    {
        return (string) file_get_contents(base_path('../../Dockerfile'));
    }

    private function prodCheck(): string
    {
        return (string) file_get_contents(base_path('scripts/check-container-prod.sh'));
    }

    /**
     * The `RUN` commands between the `.env` cleanup markers in the Dockerfile,
     * in order - the `.env*` cleanup and the guard - with the `RUN ` prefix
     * removed so a test can execute them against a temp tree.
     *
     * @return list<string>
     */
    private function clientAreaEnvCommands(): array
    {
        $dockerfile = $this->dockerfile();
        $start = strpos($dockerfile, "# >>> strip the Engine's .env copies >>>");
        $this->assertNotFalse($start, 'Dockerfile must open the .env cleanup block');
        $end = strpos($dockerfile, "# <<< strip the Engine's .env copies <<<", (int) $start);
        $this->assertNotFalse($end, 'Dockerfile must close the .env cleanup block');
        $block = substr($dockerfile, (int) $start, (int) $end - (int) $start);
        // Join the Dockerfile's `\`-continued lines so a multi-line guard is one
        // shell command.
        $block = (string) preg_replace('/\\\\\r?\n[ \t]*/', ' ', $block);

        $commands = [];
        foreach (preg_split('/\r?\n/', $block) ?: [] as $line) {
            if (str_starts_with($line, 'RUN ')) {
                $commands[] = trim(substr($line, 4));
            }
        }

        $this->assertCount(2, $commands, 'the .env block is the cleanup and its guard');

        return $commands;
    }

    /**
     * Run one Dockerfile shell fragment against a temp tree. The `VITE_*`
     * build variables the guard checks are removed from the environment so the
     * guard test can only fail because of a `.env*` file.
     */
    private function runShell(string $cwd, string $command): int
    {
        $env = getenv();
        $this->assertIsArray($env);
        foreach (['VITE_API_URL', 'VITE_WEBSOCKET_HOST', 'VITE_WEBSOCKET_PORT', 'VITE_WEBSOCKET_PATH', 'VITE_WEBSOCKET_AUTH_ENDPOINT'] as $key) {
            unset($env[$key]);
        }

        $pipes = [];
        $process = proc_open(
            ['/bin/sh', '-c', $command],
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
            $cwd,
            $env,
        );
        $this->assertIsResource($process);
        stream_get_contents($pipes[1]);
        stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);

        return proc_close($process);
    }

    /**
     * A tree shaped like the Engine leaves a checkout: a `.env` beside every
     * `.env.example` it finds (`core/app/Lib/Deploy/Env/EnvExampleCopies.php:
     * 19-21`), plus the mode files Vite loads (`.env.production`), in the
     * Client Area root and a nested directory.
     *
     * @return string the temp root
     */
    private function makeClientAreaEnvTree(): string
    {
        $root = sys_get_temp_dir().'/panelalpha-g10-'.bin2hex(random_bytes(8));
        $this->assertTrue(mkdir($root.'/e2e', 0777, true));
        foreach ([
            '.env' => "VITE_API_URL=https://api.devpalpha.com/api\n",
            '.env.local' => "VITE_API_URL=https://api.devpalpha.com/api\n",
            '.env.production' => "VITE_WEBSOCKET_HOST=devpalpha.com\n",
            '.env.production.local' => "VITE_API_URL=https://api.devpalpha.com/api\n",
            '.env.example' => "VITE_API_URL=https://api.devpalpha.com/api\n",
            '.env.local.example' => "VITE_API_URL=https://api.devpalpha.com/api\n",
            '.env.dev.example' => "DEV_HOST=\n",
            'e2e/.env' => "VITE_API_URL=https://api.devpalpha.com/api\n",
            'main.ts' => "window.location.hostname\n",
        ] as $file => $contents) {
            file_put_contents($root.'/'.$file, $contents);
        }

        return $root;
    }

    private function removeTree(string $path): void
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

    public function test_the_dockerfile_has_a_code_free_base_and_a_production_target(): void
    {
        $dockerfile = $this->dockerfile();

        $this->assertMatchesRegularExpression('/^FROM [^\n]+ AS base$/m', $dockerfile);
        $this->assertMatchesRegularExpression('/^FROM [^\n]+ AS prod$/m', $dockerfile);
        // The production target copies the code the build stages produced.
        $this->assertStringContainsString('COPY --from=backend-deps /build/src/backend /app/backend', $dockerfile);
        $this->assertStringContainsString('COPY --from=client-area /build/client-area/dist /app/frontend/dist', $dockerfile);
        $this->assertStringContainsString('VOLUME ["/app/data"]', $dockerfile);
        // Two build stages: the Client Area SPA (panelalpha-frontend, Vite on
        // the Node its `.nvmrc` pins; the legacy `fm/` SPA is gone) and the
        // Composer install.
        $this->assertMatchesRegularExpression('/^FROM node:24\.21\.0 AS client-area$/m', $dockerfile);
        $this->assertStringContainsString('COPY src/frontend/client-area/ ./', $dockerfile);
        $this->assertStringContainsString('npm run build-only', $dockerfile);
        $this->assertStringNotContainsString('cd fm', $dockerfile);
        $this->assertMatchesRegularExpression('/^FROM composer:2 AS backend-deps$/m', $dockerfile);
        // `prod` is the last stage, the one a build without `--target` produces.
        $this->assertMatchesRegularExpression('/^FROM runtime AS prod\n(?:(?!^FROM ).*\n)*\z/m', $dockerfile);
    }

    public function test_the_image_keeps_only_the_installed_packages(): void
    {
        // A checkout with more packages under src/packages (a paid edition's
        // submodules) builds the same image: the backend stage removes every
        // package directory Composer did not install.
        $dockerfile = (string) preg_replace('/\\\\\r?\n[ \t]*/', ' ', $this->dockerfile());

        $this->assertStringContainsString('for package in ../packages/*/; do', $dockerfile);
        $this->assertStringContainsString('[ -e "vendor/panelalpha/$name" ] || rm -rf "$package";', $dockerfile);
    }

    public function test_the_dockerfile_builds_only_the_community_product(): void
    {
        // The public Dockerfile builds one product: no build argument picks
        // another, and no stage, path or package of a paid edition is named.
        $dockerfile = $this->dockerfile();

        $this->assertDoesNotMatchRegularExpression('/^ARG /m', $dockerfile);
        foreach (['admin-area', 'Admin Area', 'edition-pro', 'edition-multi', 'vendor-pro', 'vendor-multi', 'PRODUCT=pro', 'paid'] as $needle) {
            $this->assertStringNotContainsStringIgnoringCase($needle, $dockerfile, "Dockerfile must not name {$needle}");
        }
    }


    public function test_the_dev_target_stays_code_free(): void
    {
        // The `base` stage must not copy the application: the dev compose and
        // check-container-config.sh mount the checkout over /app.
        $dockerfile = $this->dockerfile();
        $base = substr($dockerfile, (int) strpos($dockerfile, 'AS base'), (int) strpos($dockerfile, 'AS client-area') - (int) strpos($dockerfile, 'AS base'));

        $this->assertStringNotContainsString('COPY v1/', $base);
        $this->assertStringNotContainsString('COPY packages/', $base);
    }

    public function test_the_dev_compose_builds_the_base_target(): void
    {
        $compose = (string) file_get_contents(base_path('../docker-compose.yml'));

        $this->assertMatchesRegularExpression('/target:\s*base/', $compose);
    }

    public function test_check_container_config_builds_the_base_target(): void
    {
        $script = (string) file_get_contents(base_path('scripts/check-container-config.sh'));

        $this->assertStringContainsString('docker build --target base -f "$V1_ROOT/../Dockerfile" -t "$IMAGE" "$V1_ROOT"', $script);
    }

    public function test_the_production_check_is_executable_and_proves_the_runtime(): void
    {
        $path = base_path('scripts/check-container-prod.sh');
        $this->assertFileExists($path);
        $this->assertTrue(is_executable($path), 'check-container-prod.sh must be executable.');

        $script = $this->prodCheck();
        foreach ([
            'docker build --target prod -f "$CTX/Dockerfile" -t "$IMAGE" "$CTX"',
            'PANELALPHA_CLIENT_AREA_SRC',
            '-v "$VOLUME":/app/data',
            '/api/home',
            'supervisorctl',
            'queue:work',
            'APP_KEY',
            'docker restart',
            'database.sqlite',
            'index.html',
        ] as $needle) {
            $this->assertStringContainsString($needle, $script, "check-container-prod.sh must contain {$needle}");
        }
        $this->assertStringContainsString('needs Docker and curl', $script);
    }

    public function test_the_production_check_proves_a_250mb_upload(): void
    {
        // The CA advertises 256 MB; a 120 MB raw archive
        // upload answered a bare 500. The prod check uploads 250 MB through
        // nginx/php-fpm to a fake Engine upload endpoint and asserts the body
        // reached it. The byte literal is the CA limit's 250 MB test size.
        $script = $this->prodCheck();
        foreach ([
            'truncate -s 262144000',
            '/deploy/upload?filename=big.zip',
            '/tmp/fake-engine-upload.php',
            '/tmp/fake-upload-bytes.txt',
            '$received" -lt 262144000',
        ] as $needle) {
            $this->assertStringContainsString($needle, $script, "check-container-prod.sh must contain {$needle}");
        }
    }

    public function test_the_production_check_proves_web_request_logging(): void
    {
        // Php-fpm discarded worker output, so a web-request
        // failure was invisible. The prod check forces the Engine-not-configured
        // error on an authenticated request and looks for its log line both in
        // `docker logs` (the generated FPM catch_workers_output + stderr error
        // log) and in the daily file on the data volume (the stack channel).
        $script = $this->prodCheck();
        foreach ([
            '-e LOG_CHANNEL=stack',
            '-e LOG_STACK=stderr,daily',
            '/api/mcp-tokens',
            'log_marker=',
            'docker logs "$cid"',
            '/app/data/laravel/logs',
        ] as $needle) {
            $this->assertStringContainsString($needle, $script, "check-container-prod.sh must contain {$needle}");
        }
    }

    public function test_the_production_check_uses_unique_container_volume_and_image_names(): void
    {
        $script = $this->prodCheck();

        $this->assertStringContainsString('PANELALPHA_PROD_CONTAINER:-panelalpha-v1-prod-check-$$', $script);
        $this->assertStringContainsString('PANELALPHA_PROD_VOLUME:-panelalpha-v1-prod-data-$$', $script);
        // The image tag is unique per run too: a fixed tag lets a parallel gate
        // build over the image this run is about to test.
        $this->assertStringContainsString('PANELALPHA_PROD_IMAGE:-panelalpha-v1-prod-check-$$', $script);
    }

    public function test_the_production_check_logs_in_with_env_only_configuration(): void
    {
        // The production check must exercise the real CA login
        // with the runtime configuration supplied only as container env vars
        // (the bug passed every earlier check because /api/home returns 200 as
        // a guest and never started a stateful session).
        $script = $this->prodCheck();
        foreach ([
            'PANEL_HOST="panel-$$.example.test"',
            '-e APP_URL="http://$PANEL_HOST"',
            '-e SANCTUM_STATEFUL_DOMAINS="$PANEL_HOST"',
            '-e PANELALPHA_USER_EMAIL="$PANEL_EMAIL"',
            '/api/csrf-cookie',
            'X-XSRF-TOKEN',
            '/api/login',
            '/api/projects',
            '-H "Origin: http://$PANEL_HOST"',
        ] as $needle) {
            $this->assertStringContainsString($needle, $script, "check-container-prod.sh must contain {$needle}");
        }
    }

    public function test_the_production_check_proves_the_secure_session_cookie(): void
    {
        // The prod check must prove that a trusted front
        // proxy's X-Forwarded-Proto https makes the session cookie Secure and
        // that an untrusted one does not - the live deploy served both session
        // cookies without Secure over https.
        $script = $this->prodCheck();
        foreach ([
            'panelalpha_cookie_is_secure',
            'secure_cookie_state',
            'untrusted_secure="$(secure_cookie_state https '.TestNetwork::public2(9).')"',
            'trusted_secure="$(secure_cookie_state https '.TestNetwork::public(77).')"',
            // Pin the two guards: the real-image run is the behaviour proof, so
            // dropping a guard must fail here too.
            'if [[ "$untrusted_secure" != "insecure" ]]; then',
            'if [[ "$trusted_secure" != "secure" ]]; then',
            'X-Forwarded-Proto',
            'write-trusted-proxies.sh',
            'nginx -s reload -c /app/config/nginx.conf',
        ] as $needle) {
            $this->assertStringContainsString($needle, $script, "check-container-prod.sh must contain {$needle}");
        }
    }

    public function test_the_production_check_proves_both_secure_cookies(): void
    {
        // The Engine's app-lite proxy sends no
        // X-Forwarded-Proto, so with an env-only https APP_URL and
        // SESSION_SECURE_COOKIE=true the prod check must see both the session
        // and the XSRF-TOKEN cookie Secure on a request that carries no
        // forwarded proto.
        $script = $this->prodCheck();
        foreach ([
            'panelalpha_cookies_are_secure()',
            '-e SESSION_SECURE_COOKIE=true',
            '-e APP_URL="https://$PANEL_HOST"',
            'panelalpha_cookies_are_secure <<<"$h3_headers"',
            '/api/csrf-cookie',
        ] as $needle) {
            $this->assertStringContainsString($needle, $script, "check-container-prod.sh must contain {$needle}");
        }
    }

    public function test_the_production_check_proves_json_413(): void
    {
        // Nginx's client_max_body_size rejection answered its
        // HTML page. The prod check posts 300 MB and asserts a JSON 413 with a
        // `message` key and no HTML.
        $script = $this->prodCheck();
        foreach ([
            'truncate -s 314572800',
            "grep -q '\"message\"'",
            "grep -qi '<html'",
        ] as $needle) {
            $this->assertStringContainsString($needle, $script, "check-container-prod.sh must contain {$needle}");
        }
    }

    public function test_the_secure_cookie_probe_distinguishes_secure_from_insecure(): void
    {
        // Execute the probe's decision function (never grep the
        // script text) against a secure and a non-secure session cookie.
        $script = $this->prodCheck();
        $start = strpos($script, 'panelalpha_cookie_is_secure() {');
        $this->assertNotFalse($start, 'check-container-prod.sh must define panelalpha_cookie_is_secure().');
        $end = strpos($script, "\n}\n", (int) $start);
        $this->assertNotFalse($end, 'check-container-prod.sh must close panelalpha_cookie_is_secure().');
        $function = substr($script, (int) $start, (int) $end - (int) $start + 2);

        $fixture = <<<'BASH'
#!/usr/bin/env bash
@@FUNCTION@@
# No Secure on the session cookie, even though XSRF-TOKEN is Secure.
printf 'Set-Cookie: XSRF-TOKEN=abc; path=/; secure; samesite=lax\nSet-Cookie: laravel-session=xyz; path=/; httponly; samesite=lax\n' | panelalpha_cookie_is_secure
# The session cookie is Secure.
printf 'Set-Cookie: XSRF-TOKEN=abc; path=/; secure; samesite=lax\nSet-Cookie: laravel-session=xyz; path=/; httponly; samesite=lax; secure\n' | panelalpha_cookie_is_secure
BASH;
        $fixture = str_replace('@@FUNCTION@@', $function, $fixture);

        $file = tempnam(sys_get_temp_dir(), 'cookie');
        $this->assertIsString($file);
        file_put_contents($file, $fixture);

        try {
            $output = trim((string) shell_exec('bash '.escapeshellarg($file)));
        } finally {
            @unlink($file);
        }

        $this->assertSame("insecure\nsecure", $output);
    }

    public function test_the_production_check_mounts_only_the_data_volume(): void
    {
        // No code mount: the image must carry the application.
        $script = $this->prodCheck();
        $run = substr($script, (int) strpos($script, 'docker run -d --name "$CONTAINER"'), (int) strpos($script, 'container_ip()') - (int) strpos($script, 'docker run -d --name "$CONTAINER"'));

        $this->assertSame(1, preg_match_all('/-v /', $run));
        $this->assertStringContainsString('-v "$VOLUME":/app/data', $run);
    }

    public function test_the_build_context_ignore_keeps_local_state_out(): void
    {
        $ignore = (string) file_get_contents(base_path('../../.dockerignore'));

        foreach ([
            '.git',
            'src/data',
            'src/backend/vendor',
            'src/backend/.env',
            'node_modules',
            'src/frontend/client-area/dist',
            '.idea',
            '.aider*',
        ] as $entry) {
            $this->assertMatchesRegularExpression('/^'.preg_quote($entry, '/').'$/m', $ignore, "the .dockerignore must ignore {$entry}");
        }
        // The SPA sources and the Dockerfile stay in the context; only their
        // build outputs are ignored.
        $this->assertDoesNotMatchRegularExpression('/^app\/frontend\/client-area$/m', $ignore);
        $this->assertDoesNotMatchRegularExpression('/^app\/frontend$/m', $ignore);
        $this->assertDoesNotMatchRegularExpression('/^v1\/Dockerfile$/m', $ignore);
        // The paid and internal entries sit in a private block (opened and closed
        // by the marker lines below), which the public copy (Copybara) drops, so
        // they are checked only where it exists. The markers are split so that
        // this file names no marker line itself.
        $open = '# >>> '.'private';
        $close = '# <<< '.'private';
        if (str_contains($ignore, $open)) {
            foreach (['src/frontend/admin-area/dist', 'src/internal', 'src/backend/vendor-pro', 'src/backend/vendor-multi'] as $entry) {
                $this->assertMatchesRegularExpression('/^'.preg_quote($entry, '/').'$/m', $ignore, "the .dockerignore must ignore {$entry}");
            }
            $this->assertSame(substr_count($ignore, $open), substr_count($ignore, $close), 'every private block is closed');
        }
    }

    public function test_the_client_area_build_strips_engine_copied_env_files(): void
    {
        // The Engine copies every `.env.example` in the checkout
        // to `.env` before the build (`core/app/Lib/Deploy/Env/EnvExampleCopies.php:
        // 8-20`), so the Client Area stage must delete every such file - at
        // any depth, and the mode files Vite loads - before the build, keeping
        // the committed `*.example` templates and touching nothing else.
        [$cleanup] = $this->clientAreaEnvCommands();
        $root = $this->makeClientAreaEnvTree();

        try {
            $this->assertSame(0, $this->runShell($root, $cleanup), 'the cleanup must succeed');

            // Every Engine-created `.env*` is gone; `*.example` survives - the
            // glob stays `*.example`, not just `.env.example`, so an Engine
            // template such as `.env.local.example` (EnvExampleCopies.php
            // copies it to `.env.local`) is never deleted.
            $this->assertFileExists($root.'/.env.example');
            $this->assertFileExists($root.'/.env.local.example');
            $this->assertFileDoesNotExist($root.'/.env');
            $this->assertFileDoesNotExist($root.'/.env.local');
            $this->assertFileDoesNotExist($root.'/.env.production');
            $this->assertFileDoesNotExist($root.'/.env.production.local');
            $this->assertFileDoesNotExist($root.'/e2e/.env');
            // The dev server template stays: Vite never loads it.
            $this->assertFileExists($root.'/.env.dev.example');
            // A non-env file is untouched (the `-delete` is scoped).
            $this->assertFileExists($root.'/main.ts');
        } finally {
            $this->removeTree($root);
        }
    }

    public function test_the_client_area_env_cleanup_runs_before_the_spa_build(): void
    {
        // The cleanup and its guard must run before the build, or Vite loads
        // the Engine's `.env` copy into the bundle even though the file is
        // deleted afterwards.
        $dockerfile = $this->dockerfile();
        $cleanup = strpos($dockerfile, "# >>> strip the Engine's .env copies >>>");
        $build = strpos($dockerfile, 'RUN npm ci');
        $this->assertNotFalse($cleanup, 'Dockerfile must open the .env cleanup block');
        $this->assertNotFalse($build, 'Dockerfile must run npm ci for the Client Area');
        $this->assertLessThan((int) $build, (int) $cleanup, 'the .env cleanup must run before npm run build');
    }

    public function test_the_client_area_env_guard_fails_while_a_copy_survives(): void
    {
        // The `VITE_*` guard is the second line of defence - it
        // must fail the build when a `.env*` file survives the cleanup, not only
        // when a build variable is set.
        [, $guard] = $this->clientAreaEnvCommands();
        $root = sys_get_temp_dir().'/panelalpha-g10-'.bin2hex(random_bytes(8));
        $this->assertTrue(mkdir($root, 0777, true));
        file_put_contents($root.'/.env.production', "VITE_API_URL=https://api.devpalpha.com/api\n");

        try {
            $this->assertNotSame(0, $this->runShell($root, $guard), 'the guard must fail while a .env* copy is present');
            unlink($root.'/.env.production');
            // A `*.example` template never trips the guard
            // (`EnvTemplates::NAMES`); the guard only rejects a real copy.
            file_put_contents($root.'/.env.example', "VITE_API_URL=https://api.devpalpha.com/api\n");
            $this->assertSame(0, $this->runShell($root, $guard), 'the guard must pass on a clean tree');
        } finally {
            $this->removeTree($root);
        }
    }

    public function test_the_build_context_ignore_keeps_engine_copied_env_files_out(): void
    {
        // The Engine copies `.env.example` to `.env` (and
        // `.env.local.example` to `.env.local`) before the build, so the context
        // must drop every copy at any depth while keeping the templates.
        $ignore = (string) file_get_contents(base_path('../../.dockerignore'));

        foreach (['**/.env', '**/.env.local'] as $pattern) {
            $this->assertMatchesRegularExpression('/^'.preg_quote($pattern, '/').'$/m', $ignore, "the .dockerignore must ignore {$pattern}");
        }
        foreach (['.env.example', '*.example', '**/.env.example'] as $kept) {
            $this->assertDoesNotMatchRegularExpression('/^'.preg_quote($kept, '/').'\s*$/m', $ignore, "the .dockerignore must not exclude {$kept}");
        }
    }

    public function test_the_production_check_reproduces_the_engine_env_copy(): void
    {
        // The prod check must leave Engine-style `.env` copies in
        // the context (`EnvExampleCopies.php:8-20`; panelalpha-frontend ships no
        // `.env.example`, so the check plants them) and then prove the built
        // bundle carries neither the old host nor the absolute API value. The
        // scan covers the whole dist and first proves Vite's `dist/assets`
        // exists, so a changed bundle layout cannot make it pass vacuously.
        $script = $this->prodCheck();
        foreach ([
            'client_api_value="https://api.devpalpha.com/api"',
            'printf \'VITE_API_URL=%s\\n\' "$client_api_value" > "$CTX/src/frontend/client-area/.env"',
            '> "$CTX/src/frontend/client-area/.env.production"',
            'test -d /app/frontend/dist/assets',
            "grep -rqF 'devpalpha' /app/frontend/dist;",
            'grep -rqF "$client_api_value" /app/frontend/dist;',
        ] as $needle) {
            $this->assertStringContainsString($needle, $script, "check-container-prod.sh must contain {$needle}");
        }
    }

    public function test_the_dockerfile_names_every_engine_copied_env_example(): void
    {
        // The Engine copies every `.env.example` in the tree, so
        // the Dockerfile records which ones exist and which can reach an image.
        $dockerfile = $this->dockerfile();
        foreach ([
            'src/backend/.env.example',
        ] as $example) {
            $this->assertStringContainsString($example, $dockerfile, "Dockerfile must name {$example}");
        }
        $this->assertStringContainsString('EnvExampleCopies.php', $dockerfile);
    }

    public function test_the_base_image_drops_the_stock_nginx_site(): void
    {
        // Nginx.org's package ships
        // /etc/nginx/conf.d/default.conf with `server_name localhost`;
        // src/config/nginx.conf includes conf.d/*.conf and nginx prefers that
        // exact name over our `server_name _` default_server, so
        // `Host: localhost` /api/* answered the stock site's 404. The base
        // stage must remove the file; the real image's `Host: localhost`
        // `/api/home` 200 probe lives in check-container-prod.sh.
        $dockerfile = $this->dockerfile();
        $baseStart = (int) strpos($dockerfile, 'AS base');
        $base = substr($dockerfile, $baseStart, (int) strpos($dockerfile, 'AS client-area') - $baseStart);
        $this->assertMatchesRegularExpression(
            '/^RUN rm -f \/etc\/nginx\/conf\.d\/default\.conf$/m',
            $base,
            'the base stage must remove the stock nginx default.conf',
        );

        $script = $this->prodCheck();
        foreach ([
            "-H 'Host: localhost'",
            'Host: localhost /api/home answers 200',
        ] as $needle) {
            $this->assertStringContainsString($needle, $script, "check-container-prod.sh must contain {$needle}");
        }
    }
}
