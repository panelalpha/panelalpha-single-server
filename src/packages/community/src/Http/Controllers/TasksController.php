<?php

namespace PanelAlpha\Community\Http\Controllers;

use Illuminate\Contracts\Container\Container;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Validator;
use PanelAlpha\ClientArea\Access\SingleUserMode;
use PanelAlpha\Community\Tasks\EngineTaskList;

/**
 * The Engine's task list for the signed-in owner.
 */
class TasksController extends Controller
{
    public function index(Request $request, Container $container, EngineTaskList $tasks): JsonResponse
    {
        abort_unless(SingleUserMode::active($container), 404);

        $data = Validator::make($request->query(), [
            'page' => ['integer', 'min:1'],
            'per_page' => ['in:15,50,100'],
            'status' => ['in:active,queued,running,completed,failed,cancelled'],
            'action' => ['string', 'max:64', 'regex:/^[a-z_]+$/'],
        ])->validate();

        $filters = ['per_page' => (int) ($data['per_page'] ?? 50)];
        if (isset($data['page'])) {
            $filters['page'] = (int) $data['page'];
        }
        foreach (['status', 'action'] as $key) {
            if (isset($data[$key])) {
                $filters[$key] = (string) $data[$key];
            }
        }

        /** @var \Illuminate\Contracts\Auth\Authenticatable $user */
        $user = $request->user();

        return response()->json($tasks->page($user, $filters));
    }
}
