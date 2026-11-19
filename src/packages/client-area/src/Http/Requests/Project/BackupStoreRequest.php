<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;
use PanelAlpha\ClientArea\Support\Payload;

/**
 * POST /projects/{application}/wordpress/backups – the old
 * `Requests/User/Instance/Wordpress/BackupRequest` rules. `backupType`
 * is the wp-cloud select the CA maps onto the two booleans; `retry_id` /
 * `convert_from_id` are accepted for CA compatibility but the Engine has no
 * retry/convert endpoint (the create always makes a new backup).
 */
final class BackupStoreRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'backupDirectory' => ['nullable', 'boolean'],
            'backupDatabase' => ['nullable', 'boolean'],
            'backupType' => ['nullable', 'string', 'in:database,directory'],
            'backupNote' => ['nullable', 'string'],
            'retry_id' => ['nullable', 'integer'],
            'convert_from_id' => ['nullable', 'integer'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $type = Payload::nullableString($this->input('backupType'));

        if ($type === 'database') {
            $this->merge(['backupDirectory' => false, 'backupDatabase' => true]);
        } elseif ($type === 'directory') {
            $this->merge(['backupDirectory' => true, 'backupDatabase' => false]);
        }
    }
}
