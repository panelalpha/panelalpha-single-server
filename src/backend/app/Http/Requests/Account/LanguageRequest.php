<?php

namespace App\Http\Requests\Account;

use App\Services\Language\TranslationRepository;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * PUT /api/user/language – the CA picks one of the available languages.
 */
final class LanguageRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'language' => ['required', 'string', Rule::in(app(TranslationRepository::class)->availableLanguages())],
        ];
    }
}
