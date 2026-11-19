<?php

namespace PanelAlpha\ClientArea\Hosting;

use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use PanelAlpha\EngineClient\Api\EnvVarsApi;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * The container project's `.env` editor.
 *
 * For a **container** project the Engine stores the env vars (since Engine
 * `29ae50bc0`): the read renders them as `KEY=value` lines and the
 * save replaces the stored map, applying on restart.
 * A **classic** project's real `.env` is read through `files/download`
 * (`FilesClassicEnvFileReader`) and saved with the file manager's `files/upload`
 * (`FileManagerService::updateFile()`): the Engine does not own that file, so
 * the user's edit is a user-driven file write like the file manager's. Only
 * files inside the project home are readable or writable.
 */
final class EnvFileService
{
    /** The old panel capped the path at 4096 bytes. */
    private const MAX_PATH_LENGTH = 4096;

    /**
     * The CA's default container env-file path. The CA loads it from
     * `meta.default_env_path` and sends it on read and save (`EnvFile.vue:329`,
     * `:356`, `:423`).
     */
    public const DEFAULT_ENV_PATH = 'project/.env';

    public function __construct(
        private readonly FilesClassicEnvFileReader $classicReader,
        private readonly FileManagerService $fileManager,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function meta(Application $application): array
    {
        $this->assertEditable($application);

        $isGit = $application->gitRepositoryUrl() !== null;
        $dir = $this->defaultEnvDir($application);

        return [
            'is_git_repo' => $isGit,
            // The Engine template field: classic has none, containers are dind.
            'is_dind' => $this->isDind($application),
            'supports_restart' => $this->isDind($application),
            'default_env_dir' => $dir,
            'default_env_path' => $dir.'/.env',
            'app_type' => (string) ($application->type ?? 'custom'),
        ];
    }

    /**
     * The directory the CA opens first. A container project's env file is the
     * Engine-stored `project/.env`. A classic project has no `~/project`, and
     * its home is root-owned, so nothing can create one there: the old panel
     * opened the site's own directory (`$application->path`), which on the
     * Engine is the main domain's directory above `public_html` (the app root
     * of a custom PHP app). The Engine's domain name, never the presented one.
     */
    private function defaultEnvDir(Application $application): string
    {
        $domain = (string) ($application->domain ?? '');

        return $this->isDind($application) || $domain === '' ? 'project' : $domain;
    }

    /**
     * @return array<string, mixed>
     */
    public function show(Application $application, string $path): array
    {
        $this->assertEditable($application);

        // Container projects store the env vars on the Engine; only the
        // project's own env file is editable, so a foreign path is refused
        // before it can replace the stored vars.
        if ($this->isDind($application)) {
            $this->assertContainerPath($path);

            return $this->showEnvVars($application, $path);
        }

        $resolved = $this->resolvePath($application, $path);

        $read = $this->classicReader->read($application, $resolved['engine']);

        return [
            // Old show() answered with the absolute path.
            'path' => $resolved['absolute'],
            'exists' => $read['exists'],
            'contents' => $read['contents'],
            'parsed' => EnvFileParser::parse($read['contents']),
        ];
    }

    /**
     * The Engine-stored env vars rendered as `KEY=value` lines.
     * Both CA edit modes round-trip through this text and `path` is ignored.
     *
     * @return array<string, mixed>
     */
    private function showEnvVars(Application $application, string $path): array
    {
        $vars = (new EnvVarsApi($application->engine()))->show($application->engineProject());
        $contents = $this->renderEnvVars($vars);

        // The store exists for every container project: an empty map is an
        // empty editor, not a missing file.
        return [
            'path' => $path,
            'exists' => true,
            'contents' => $contents,
            'parsed' => EnvFileParser::parse($contents),
        ];
    }

    /**
     * Render the Engine's `vars` list as `.env` text with the panel's own
     * parser, so a save round-trips. A malformed entry is skipped, not fatal
     * (external data is untrusted).
     *
     * @param  array<string, mixed>  $vars  the EnvVarsResource `data`
     */
    private function renderEnvVars(array $vars): string
    {
        $rows = [];
        foreach (Payload::objects($vars['vars'] ?? null) as $var) {
            $key = Payload::nullableString($var['key'] ?? null);
            if ($key === null || $key === '') {
                continue;
            }
            $rows[] = [
                'type' => 'variable',
                'key' => $key,
                'value' => Payload::nullableString($var['value'] ?? null) ?? '',
            ];
        }

        return $rows === [] ? '' : EnvFileParser::serialise($rows);
    }

    /**
     * Container projects replace the Engine's stored map; `restart` maps to
     * `apply: recreate` (202) versus `none` (200).
     * A classic project writes the CA's `contents` to its real file; it
     * has no restart, as in the old panel.
     *
     * @return array<string, mixed>
     */
    public function update(Application $application, string $path, string $contents, bool $restart = false): array
    {
        $this->assertEditable($application);

        if ($this->isDind($application)) {
            $this->assertContainerPath($path);
            $env = $this->parseEnvContents($contents);
            (new EnvVarsApi($application->engine()))->update($application->engineProject(), $env, $restart);

            return [
                'success' => true,
                // The CA displays `path` but the Engine ignores it for containers.
                'path' => $path,
                // The Engine accepted the write (200) or its apply (202); the old
                // save answered `restarted` so the CA picks its alert.
                'restarted' => $restart,
            ];
        }

        $resolved = $this->resolvePath($application, $path);
        $this->writeClassicFile($application, $resolved['engine'], $contents);

        return [
            'success' => true,
            // The old update() answered the absolute path, as show() does.
            'path' => $resolved['absolute'],
            // The old panel restarted only a dind service
            // (ServerAccount/Instance/EnvFileController.php:93-103,
            // :231-237); `meta.supports_restart` is false here.
            'restarted' => false,
        ];
    }

    /**
     * Save a classic project's `.env` as the old panel did – the CA's text as
     * it is, creating or replacing the file (`saveFileContents()`,
     * ServerAccount/Instance/EnvFileController.php:91) – through the file
     * manager's own save, `files/upload` of the file into its directory, so
     * there is one upload path. The fm save's failure envelope (an Engine 400)
     * becomes the key-0 422 the CA shows as an alert (`EnvFile.vue:413`).
     *
     * @param  string  $enginePath  the home-relative path `resolvePath()` returned
     */
    private function writeClassicFile(Application $application, string $enginePath, string $contents): void
    {
        // The home itself is a directory, never a file to write.
        if ($enginePath === '') {
            throw ValidationException::withMessages(['path' => ['Invalid file path.']]);
        }

        $slash = strrpos($enginePath, '/');
        $directory = $slash === false ? '' : substr($enginePath, 0, $slash);
        $filename = $slash === false ? $enginePath : substr($enginePath, $slash + 1);

        $result = Payload::object($this->fileManager->updateFile($application, $directory, $contents, $filename, strlen($contents))['result'] ?? null);
        if (($result['status'] ?? null) !== 'success') {
            throw ValidationException::withMessages([Payload::string($result['message'] ?? '')]);
        }
    }

    /**
     * Parse the CA's `.env` text into the Engine's `KEY=>value` map. Blank lines
     * and `#` comments are ignored; any other line must be `[export ]KEY=value`
     * or the save answers 422 keyed `contents` with the offending line number.
     *
     * @return array<string, string>
     */
    private function parseEnvContents(string $contents): array
    {
        $env = [];
        $lines = preg_split("/\r\n|\n|\r/", $contents) ?: [];
        foreach ($lines as $index => $line) {
            $trimmed = ltrim($line);
            if ($trimmed === '' || str_starts_with($trimmed, '#')) {
                continue;
            }

            // EnvFileParser is the panel's one `.env` line parser (it strips
            // quotes and inline comments); a line it does not read as a
            // variable is invalid for the Engine's KEY=>value map.
            $row = EnvFileParser::parse($line)[0] ?? null;
            if ($row === null || ($row['type'] ?? null) !== 'variable') {
                $number = $index + 1;
                throw ValidationException::withMessages([
                    'contents' => ["Line {$number} is not a KEY=value setting."],
                ]);
            }

            $env[(string) $row['key']] = (string) $row['value'];
        }

        return $env;
    }

    /**
     * For a container project only the project's own
     * env file is editable. The CA lets the user type the path (`EnvFile.vue:325`)
     * and sends it on read and save (`:356`, `:423`); any other path would make
     * the Engine replace the project's env vars from a file the user did not
     * open, so it answers 422 on `path` before any Engine call.
     */
    private function assertContainerPath(string $path): void
    {
        if ($path !== self::DEFAULT_ENV_PATH) {
            throw ValidationException::withMessages([
                'path' => ['Only the project environment file '.self::DEFAULT_ENV_PATH.' can be edited.'],
            ]);
        }
    }

    /**
     * Turn the CA's `path` into the path the Engine takes. Ported from the old
     * `validatedAbsolutePath()`: `.`/`..` are resolved, an
     * absolute path inside the home is accepted, anything escaping the home is
     * rejected before the Engine is called.
     *
     * @return array{engine: string, absolute: string}
     */
    public function resolvePath(Application $application, string $path): array
    {
        if (Str::contains($path, ["\0", "\n", "\t"])) {
            throw ValidationException::withMessages(['path' => ['Invalid file path.']]);
        }

        $home = $this->homeDir($application);
        $isAbsolute = str_starts_with($path, '/');
        $relative = $this->normalisePath($path);
        if ($relative === false) {
            throw ValidationException::withMessages(['path' => ['Invalid file path.']]);
        }

        if ($isAbsolute) {
            $full = '/'.$relative;
            if ($full === $home) {
                $relative = '';
            } elseif (str_starts_with($full.'/', $home.'/')) {
                $relative = ltrim(substr($full, strlen($home)), '/');
            } else {
                throw ValidationException::withMessages(['path' => ['Invalid file path.']]);
            }
        }

        if (strlen($relative) > self::MAX_PATH_LENGTH) {
            throw ValidationException::withMessages(['path' => ['Path too long.']]);
        }

        return [
            'engine' => $relative,
            'absolute' => $relative === '' ? $home : $home.'/'.$relative,
        ];
    }

    /**
     * The project home the Engine records (`config.home_dir` on the project
     * resource, `NewProjectDetails.php`), `/home/{username}` otherwise.
     */
    private function homeDir(Application $application): string
    {
        $payload = Payload::object($application->engine_payload ?? null);
        $config = Payload::object($payload['config'] ?? null);
        $details = Payload::object($payload['details'] ?? null);
        $home = Payload::nullableString($config['home_dir'] ?? ($details['home_dir'] ?? null));
        if ($home !== null && $home !== '') {
            return rtrim($home, '/');
        }

        return '/home/'.$application->engine_username;
    }

    /**
     * Resolve `.` and `..` segments; false when the path climbs above its own
     * start (the old `normalisePath()`).
     */
    private function normalisePath(string $path): string|false
    {
        $validParts = [];
        foreach (explode('/', $path) as $part) {
            if ($part === '' || $part === '.') {
                continue;
            }
            if ($part === '..') {
                if (count($validParts) < 1) {
                    return false;
                }
                array_pop($validParts);
                continue;
            }
            $validParts[] = $part;
        }

        return implode('/', $validParts);
    }

    /**
     * The old panel refuses the env editor for WordPress projects (the CA also
     * hides it).
     */
    private function assertEditable(Application $application): void
    {
        if ($application->type === Application::TYPE_WORDPRESS) {
            // Old text (ServerAccount/Instance/EnvFileController.php:148-150).
            throw ValidationException::withMessages(['app_type' => ['Environment file editing is not available for WordPress instances.']]);
        }
    }

    private function isDind(Application $application): bool
    {
        // Same kind check everywhere.
        return $application->isContainer();
    }
}
