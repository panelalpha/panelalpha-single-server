<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project\WordPress;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Install a plugin or theme by its wordpress.org slug (the route's `{name}`),
 * optionally with `force` to reinstall over an existing copy. (section H)
 *
 * The CA sends no body (PluginsActionsMixin.js:38, ThemesActionsMixin.js:30);
 * the old route read none either. A `url` (an archive to install) is refused:
 * the Engine installs by slug only (`WpPluginInstallRequest`, `Plugins::install`
 * runs `wp plugin install <slug> [--force]`) and drops unknown fields, so a URL
 * passed on would silently install the latest release of the slug instead.
 */
final class InstallAssetRequest extends FormRequest
{
    public const URL_REFUSAL = 'Installing from a URL is not available on PanelAlpha Engine: a plugin or theme is installed by its wordpress.org name.';

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'url' => ['prohibited'],
            'force' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return ['url.prohibited' => self::URL_REFUSAL];
    }
}
