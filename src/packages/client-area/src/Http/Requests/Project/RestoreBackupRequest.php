<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /projects/{application}/wordpress/backups/{backupId}/restore – the old
 * `Requests/User/Instance/Wordpress/RestoreBackupRequest` rules (migration
 * section I, row 267). The two booleans pick the files/databases the CA's
 * restore modal offers; the Engine filters by name, so the service maps
 * directory-only to `only.files` and database-only to `exclude.files`.
 * `confirm` is the CA's modal confirmation: the CA never sends it (its modal
 * is the confirmation), so the service sends `confirm:true` itself and refuses
 * an explicit `false`.
 */
final class RestoreBackupRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'restoreDatabase' => ['nullable', 'boolean'],
            'restoreDirectory' => ['nullable', 'boolean'],
            'deleteExistingFiles' => ['nullable', 'boolean'],
            'confirm' => ['nullable', 'boolean'],
        ];
    }
}
