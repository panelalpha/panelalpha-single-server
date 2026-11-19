<?php

namespace PanelAlpha\EngineClient\Api;

use PanelAlpha\EngineClient\EngineClient;
use PanelAlpha\EngineClient\Support\Payload;

/**
 * Archives uploaded before any project takes them (Engine 2.3.0;
 * only on an Engine that lists `project_source`). An upload is named by its
 * id as `source.upload_id` on a create or `ProjectsApi::setSource()`; the
 * Engine moves the file into the project and deletes the upload. An unused
 * upload expires after 24 h. An Upload is `{id: "upl_…", filename, size,
 * claimed_by, created_at, expires_at}`.
 *
 * Engine: core/routes/api.php:137-139 -> UploadController.
 */
final class UploadsApi
{
    public function __construct(readonly EngineClient $engine) {}

    /**
     * `POST /uploads` (multipart `file`, a name ending in .zip, .tar.gz or
     * .tgz): 201 + Upload; 422 `file_not_an_archive` on `file`. Nothing is
     * answered until the whole file is stored, so give the client a long
     * timeout for a large archive.
     *
     * @param  resource|string  $contents
     * @return array<string, mixed>
     */
    public function store($contents, string $filename): array
    {
        return Payload::object($this->engine->upload('uploads', [], [
            'name' => 'file',
            'contents' => $contents,
            'filename' => $filename,
        ])->json('data'));
    }

    /**
     * `GET /uploads/{id}`: the Upload; 404 when unknown, consumed or expired.
     *
     * @return array<string, mixed>
     */
    public function show(string $id): array
    {
        return Payload::object($this->engine->get('uploads/'.rawurlencode($id))->json('data'));
    }

    /**
     * `DELETE /uploads/{id}`: 204; 404 unknown; 409 `upload_claimed` when a
     * create claimed it.
     */
    public function delete(string $id): void
    {
        $this->engine->delete('uploads/'.rawurlencode($id));
    }
}
