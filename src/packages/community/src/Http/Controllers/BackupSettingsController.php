<?php

namespace PanelAlpha\Community\Http\Controllers;

use Illuminate\Contracts\Container\Container;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use PanelAlpha\ClientArea\Access\SingleUserMode;
use PanelAlpha\Community\Backups\BackupDefaults;
use PanelAlpha\Community\Backups\BackupStoreManager;
use PanelAlpha\Community\Http\Requests\BackupSettingsRequest;
use PanelAlpha\Community\Http\Requests\BackupStoreRequest;

/**
 * The owner's backup settings: the active store and the defaults for new
 * projects' automatic backups.
 */
class BackupSettingsController extends Controller
{
    private const string DEFAULT_LOCAL_LOCATION = '/opt/panelalpha/backups/local';

    public function show(Container $container, BackupDefaults $defaults, BackupStoreManager $stores): JsonResponse
    {
        $this->gate($container);

        return response()->json($this->payload($defaults, $stores));
    }

    public function update(Request $request, Container $container, BackupDefaults $defaults, BackupStoreManager $stores): JsonResponse
    {
        $this->gate($container);

        /** @var array{auto_enable: bool, frequency: string, hour: int, day_of_week: int, day_of_month: int, keep_last: int} $data */
        $data = Validator::make($request->all(), (new BackupSettingsRequest)->rules())->validate();

        DB::transaction(fn () => $defaults->save($data));

        return response()->json($this->payload($defaults, $stores));
    }

    public function updateStore(Request $request, Container $container, BackupDefaults $defaults, BackupStoreManager $stores): JsonResponse
    {
        $this->gate($container);

        /** @var array{driver: string, location: string, credentials?: array<string, string|int|bool|null>|null} $data */
        $data = Validator::make($request->all(), (new BackupStoreRequest)->rules($request->all()))->validate();

        // The Engine is called outside a transaction; the one setting is written last.
        $saved = $stores->save($data);

        return response()->json($this->payload($defaults, $stores) + ['cleanup' => $saved['cleanup']]);
    }

    /**
     * Go back to the store the Engine uses when the panel chooses none.
     */
    public function removeStore(Container $container, BackupDefaults $defaults, BackupStoreManager $stores): JsonResponse
    {
        $this->gate($container);

        // Read the cleanup first: the payload answers the store that is active now.
        $cleanup = $stores->remove();

        return response()->json($this->payload($defaults, $stores) + ['cleanup' => $cleanup]);
    }

    /**
     * Per request, not at route registration: the edition can change.
     */
    private function gate(Container $container): void
    {
        if (! SingleUserMode::active($container)) {
            abort(404);
        }
    }

    /**
     * @return array{store: array{id: int, name: string, driver: string, location: string}|null, store_selected: bool, store_created: bool, defaults: array<string, mixed>, drivers: list<string>, default_local_location: string}
     */
    private function payload(BackupDefaults $defaults, BackupStoreManager $stores): array
    {
        return [
            'store' => $stores->current(),
            'store_selected' => $stores->selected(),
            'store_created' => $stores->createdHere(),
            'defaults' => $defaults->all(),
            'drivers' => ['local', 's3', 'sftp', 'ftp', 'ftps'],
            'default_local_location' => self::DEFAULT_LOCAL_LOCATION,
        ];
    }
}
