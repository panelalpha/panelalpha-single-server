<?php

namespace App\Http\Controllers;

use App\Http\Requests\Account\DarkModeRequest;
use App\Http\Requests\Account\LanguageRequest;
use App\Services\Account\AccountService;
use App\Services\Language\TranslationRepository;
use Illuminate\Http\JsonResponse;

class LangController extends Controller
{
    public function __construct(
        private readonly TranslationRepository $translations,
        private readonly AccountService $accounts,
    ) {}

    /**
     * PUT /api/user/language – persist the user's language (section B).
     */
    public function setLanguage(LanguageRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $this->accounts->update($this->authenticatedUser($request), ['language' => $validated['language']]);

        return response()->json(['success' => true]);
    }

    /**
     * PUT /api/user/dark-mode – persist the user's dark-mode preference (section B).
     */
    public function setDarkMode(DarkModeRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $this->accounts->update($this->authenticatedUser($request), ['dark_mode' => $validated['dark_mode']]);

        return response()->json(['success' => true]);
    }

    /**
     * Serve client-area translations for the given language.
     * Always applies the single-server overlay (v1 is single-server only).
     */
    public function index(string $lang): JsonResponse
    {
        return response()->json(
            $this->translations->forLanguage($lang),
            200,
            [],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        );
    }
}
