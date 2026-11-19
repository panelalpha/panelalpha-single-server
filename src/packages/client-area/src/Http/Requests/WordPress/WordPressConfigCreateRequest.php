<?php

namespace PanelAlpha\ClientArea\Http\Requests\WordPress;

use Closure;
use Illuminate\Foundation\Http\FormRequest;
use PanelAlpha\ClientArea\Support\PhpIdentifier;
use PanelAlpha\ClientArea\Support\WpConfigValue;

/**
 * POST /projects/{application}/wordpress/config – add a wp-config constant
 * (the CA sends `{name, value, type}`; review S12). The name must be one the
 * Engine's `wp/config/{name}` route carries, or that call answers a routing 405
 * instead of adding the constant.
 */
final class WordPressConfigCreateRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255', 'regex:'.PhpIdentifier::PATTERN],
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

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return ['name.regex' => PhpIdentifier::REFUSAL];
    }
}
