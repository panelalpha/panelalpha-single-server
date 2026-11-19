<?php

namespace PanelAlpha\Community\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use PanelAlpha\ClientArea\Contracts\PanelLanguages;
use PanelAlpha\ClientArea\Support\DateFormats;

/**
 * The three basic panel settings the owner can edit: the server name, the
 * default language and the default date format; and the default domain when
 * a client sends the whole General form at once.
 */
class SettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(?PanelLanguages $languages = null): array
    {
        $languages ??= app(PanelLanguages::class);

        return [
            'name' => ['required', 'string', 'max:255'],
            'default_language' => ['required', 'string', Rule::in($languages->codes())],
            'default_date_format' => ['required', 'string', Rule::in(DateFormats::ALL)],
            'sites_base_domain' => ['sometimes', 'nullable', 'string', 'max:253'],
        ];
    }
}
