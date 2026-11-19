<?php

namespace App\Http\Requests\Account;

use App\Support\DeviceDetection;
use App\Support\HomePayload;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * PUT /api/user/edit – the old panel's profile rules. `language` is one of the
 * available languages and
 * `new_device_detection` one of the old enum's signal sets. Both names are
 * required and at most 20 characters, as the guide says and the form already
 * enforces (`account-form.ts` `NAME_MAX_LENGTH`).
 */
final class ProfileUpdateRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'first_name' => ['required', 'string', 'max:20'],
            'last_name' => ['required', 'string', 'max:20'],
            'company_name' => ['nullable', 'string', 'max:255'],
            'language' => ['nullable', 'string', Rule::in(HomePayload::languages())],
            'new_device_detection' => ['nullable', 'string', Rule::in(DeviceDetection::SIGNALS)],
        ];
    }
}
