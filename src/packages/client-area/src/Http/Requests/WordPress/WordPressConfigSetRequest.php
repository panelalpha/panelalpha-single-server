<?php

namespace PanelAlpha\ClientArea\Http\Requests\WordPress;

use Closure;
use Illuminate\Foundation\Http\FormRequest;
use PanelAlpha\ClientArea\Support\WpConfigValue;

/**
 * PUT /projects/{application}/wordpress/config/{name} – the old
 * `ConfigController::update` rules (`value` and `type`, both required; the CA's
 * edit form always sends them, `ConfigActionsMixin.js:192-201`).
 */
final class WordPressConfigSetRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'value' => [
                'required',
                'string',
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (WpConfigValue::isTooLong($value)) {
                        $fail(WpConfigValue::REFUSAL);
                    }
                },
            ],
            'type' => ['required', 'string', 'in:constant,variable'],
        ];
    }
}
