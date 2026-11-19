<?php

namespace PanelAlpha\ClientArea\Projects;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/** A checkout with local changes: the CA opens its Revert/Force dialog on this code. */
final class WorkingTreeDirtyException extends RuntimeException
{
    public const string ERROR_CODE = 'git_working_tree_dirty';

    public const string MESSAGE = 'This site has file changes that are not in the repository yet. Push them to the repository, or discard them before pulling or changing the branch.';

    public function __construct()
    {
        parent::__construct(self::MESSAGE);
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'message' => self::MESSAGE,
            'errors' => ['git' => [self::MESSAGE]],
            'error_code' => self::ERROR_CODE,
        ], 422);
    }

    /** An expected refusal of the request, not a failure of the panel. */
    public function report(): bool
    {
        return false;
    }
}
