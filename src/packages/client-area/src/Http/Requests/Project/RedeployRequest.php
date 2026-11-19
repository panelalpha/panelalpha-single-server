<?php

namespace PanelAlpha\ClientArea\Http\Requests\Project;

use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use PanelAlpha\ClientArea\Models\Application;
use PanelAlpha\ClientArea\Projects\DeployService;
use Throwable;

/**
 * POST /projects/{application}/redeploy – the old panel's RedeployStoreRequest
 * rules. The same body serves a git redeploy (branch,
 * strategy) and a files redeploy (remote_filepath, mode).
 */
final class RedeployRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'deploy_staging' => ['sometimes', 'boolean'],
            'remote_filepath' => ['sometimes', 'nullable', 'string'],
            'mode' => ['sometimes', 'nullable', 'in:overwrite,replace'],
            'branch' => ['sometimes', 'nullable', 'string', 'max:255'],
            'strategy' => ['sometimes', 'nullable', 'in:force,push_first'],
            // Panel categories left out of this one deploy (see DeploySkip).
            'skip' => ['sometimes', 'nullable', 'array'],
            'skip.*' => ['string', 'distinct', 'in:dependencies,build,migrations'],
        ];
    }

    /**
     * v1's own validation refused the files redeploy after the CA uploaded the
     * archive, so the Engine's staging folder must not keep it.
     * Runs before `parent::failedValidation()` throws; a cleanup failure never
     * hides the 422.
     */
    protected function failedValidation(Validator $validator): void
    {
        $this->discardRefusedArchive();

        parent::failedValidation($validator);
    }

    private function discardRefusedArchive(): void
    {
        $archive = $this->input('remote_filepath');
        $application = $this->route('application');
        if (! is_string($archive) || $archive === '' || ! $application instanceof Application) {
            return;
        }

        try {
            app(DeployService::class)->discardRefusedArchive($application, $archive);
        } catch (Throwable $e) {
            // The validation error is the answer; a cleanup failure must not
            // change it.
            report($e);
        }
    }
}
