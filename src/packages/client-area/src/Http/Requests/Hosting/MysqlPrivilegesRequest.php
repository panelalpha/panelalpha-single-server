<?php

namespace PanelAlpha\ClientArea\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\ValidationException;

/**
 * PUT /server-accounts/{id}/mysql/privileges/{user}/{database} – the CA sends a
 * comma-joined list of MySQL privilege names (old PrivilegesUpdateRequest).
 */
final class MysqlPrivilegesRequest extends FormRequest
{
    /** @var list<string> */
    public const AVAILABLE = [
        'ALL PRIVILEGES',
        'ALTER',
        'ALTER ROUTINE',
        'CREATE',
        'CREATE ROUTINE',
        'CREATE TEMPORARY TABLES',
        'CREATE VIEW',
        'DELETE',
        'DROP',
        'EVENT',
        'EXECUTE',
        'INDEX',
        'INSERT',
        'LOCK TABLES',
        'REFERENCES',
        'SELECT',
        'SHOW VIEW',
        'TRIGGER',
        'UPDATE',
    ];

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'privileges' => ['required', 'string'],
        ];
    }

    protected function prepareForValidation(): void
    {
        // The whole string must be a comma-joined list of known privileges;
        // reject anything else before the Engine builds a GRANT from it.
        /** @var mixed $value */
        $value = $this->input('privileges');
        if (! is_string($value)) {
            return;
        }

        foreach (explode(',', $value) as $privilege) {
            $trimmed = trim($privilege);
            if (! in_array($trimmed, self::AVAILABLE, true)) {
                // Name the offending privilege, as the old panel's
                // `invalid_value_with_item` did (old api/custom_validation.php:17);
                // the old `The privileges field is required.` hid it.
                throw ValidationException::withMessages([
                    'privileges' => ['Invalid value '.$trimmed],
                ]);
            }
        }
    }
}
