<?php

namespace App\Services\Language;

use Illuminate\Support\Facades\File;
use Illuminate\Validation\ValidationException;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * Loads Client Area translation files from resources/lang and merges the
 * single-server overlay (/{lang}/translation.json).
 * Kept out of the controller so the file rules live in one place.
 */
final class TranslationRepository
{
    /**
     * @return array<string, mixed>
     *
     * @throws ValidationException unknown or malformed language
     */
    public function forLanguage(string $lang): array
    {
        $basePath = resource_path("lang/{$lang}/clientarea/translation.json");
        if (! File::exists($basePath)) {
            throw ValidationException::withMessages(['Invalid language']);
        }

        $decoded = self::decodeObject(json_decode(File::get($basePath), true));
        if ($decoded === null) {
            throw ValidationException::withMessages(['Invalid language']);
        }

        // v1 is single-server only, so the overlay always applies.
        $overlayPath = resource_path("lang/{$lang}/clientarea/translation.single-server.json");
        if (File::exists($overlayPath)) {
            $overrides = self::decodeObject(json_decode(File::get($overlayPath), true));
            if ($overrides !== null) {
                $decoded = $this->merge($decoded, $overrides);
            }
        }

        return $decoded;
    }

    /**
     * @return list<string>
     */
    public function availableLanguages(): array
    {
        $languages = [];
        foreach (Payload::strings(File::directories(resource_path('lang'))) as $directory) {
            $languages[] = basename($directory);
        }

        return $languages;
    }

    /**
     * @param  array<string, mixed>  $base
     * @param  array<string, mixed>  $overlay
     * @return array<string, mixed>
     */
    private function merge(array $base, array $overlay): array
    {
        return Payload::object(array_replace_recursive($base, $overlay));
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function decodeObject(mixed $value): ?array
    {
        return is_array($value) ? Payload::object($value) : null;
    }
}
