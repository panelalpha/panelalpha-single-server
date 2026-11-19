<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * PUT /server-accounts/{id}/domains/{domain}/php-settings – the CA posts its
 * whole `phpSettings` list of `{directive, value}` rows
 * (PhpSettingsModal.vue:319-320), exactly as the old panel validated with
 * `*.directive` / `*.value` (ServerAccount/DomainController.php:481-483).
 */
final class PhpSettingsRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            '*.directive' => ['required', 'string', 'max:255'],
            '*.value' => ['sometimes', 'nullable', 'string', 'max:4096', 'not_regex:/[\r\n\x00]/'],
        ];
    }

    /**
     * The panel's own words for a value it cannot send on, as
     * `ServerAccountService::setPhpSettings` answers a caller that gets past the rules.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            '*.value.not_regex' => 'Invalid directive value.',
        ];
    }

    /**
     * The CA's row list mapped to the Engine's `directive => value` map
     * (`{settings: …}`, core/app/Http/Requests/DomainReplacePhpDirectivesRequest.php).
     *
     * @return array<string, string>
     */
    public function settings(): array
    {
        $settings = [];

        // `$this->all()` is the posted row list; `validated()` cannot rebuild
        // a bare top-level array from `*.directive` rules.
        /** @var array<int, mixed> $rows */
        $rows = $this->all();
        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }

            $directive = $row['directive'] ?? null;
            if (! is_string($directive) || $directive === '') {
                continue;
            }

            $settings[$directive] = Payload::nullableString($row['value'] ?? null) ?? '';
        }

        return $settings;
    }
}
