<?php

namespace App\Http\Controllers;

use App\Support\HomePayload;
use Illuminate\Http\JsonResponse;

class HomeController extends Controller
{
    public function __construct(private readonly HomePayload $home) {}

    /**
     * Guest-compatible /api/home for Client Area boot; includes user when authenticated.
     */
    public function show(): JsonResponse
    {
        return response()->json($this->home->build());
    }
}
