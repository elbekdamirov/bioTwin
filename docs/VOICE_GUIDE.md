# Lime redesign and VoiceLab guide

## Changed files

- `src/biotwin/lime.css` applies the Midnight Black #0B0B0C, Pure White #FFFFFF and Lime Green #C6F432 palette across the white welcome/library and dark studio. Existing local typography and renderer remain in use. A/B also differs by dashed versus solid lines.
- `App.tsx` adds stable tour anchors and a replay entry. `main.tsx` imports the visual layer.
- `tour/scripts.ts` is the shared typed source for nine English and Uzbek narration steps.
- `tour/VoiceTour.tsx` supplies the contextual caption console, patient gate, keyboard dismissal, volume, mute, pause and replay. First entry offers the guide without autoplay. The versioned completion key stores the tour state only. Changing steps, language or visibility cancels the obsolete browser request and audio.
- `server/voice.ts` discovers models and compatible voices, caches catalog choices for one hour, coalesces duplicate requests and caches generated audio in memory. It accepts curated language and step identifiers only. The route uses a 1 KB request cap, per-IP rate limit and bounded synthesis/polling. A request attempt retains its idempotency key and job ID for retries. Signed audio downloads omit authentication. Provider error bodies are not relayed.
- `server/index.ts` mounts the router at `/api/tour` before the existing body parser. Existing API routes retain their behavior.
- `tests/voice.test.ts` mocks provider calls. `e2e/tour.spec.ts` tests first visit, captions, patient gate, language, audio controls, cancellation and focus. Existing simulator browser tests dismiss the first-visit guide.

## Run

In the project root, run `npm run dev:full`. Vite uses port 5173 and Express uses 8787. The frontend requests `/api/tour/audio` through the existing Vite proxy. A blank `VOICELAB_API_KEY=` placeholder is in `.env.example`. The configured key stays in the ignored root `.env`. Rotate the credential shared in the chat and replace that local value with the new key.

The guide asks for a click before audio starts. VoiceLab receives the curated product narration only. Profile inputs, histories, biomarkers and treatment parameters are excluded. If the key, catalog permission, voice permission, connection or audio playback fails, captions and manual progression remain available. Use the header guide button to restart.

## Verification

The live catalog returned compatible English and Uzbek model choices. A deliberate smoke request produced 200 audio/wav with a valid RIFF/WAVE header for each welcome clip. The English clip reached browser playback in Chromium and the installed Brave executable. Brave loaded the actual 3D patient with no page errors in the smoke session. Listening quality and Uzbek pronunciation require a human review.

The automated provider tests cover input validation, 200 WAV, 202 polling, no authorization on signed downloads, 401/403/429/500, timeout, failed jobs, invalid audio, cache reuse and missing configuration. They use mocked provider responses. Simulator integration tests cover the original independent A/B behavior, reports and restore.

Screenshots use `docs/screenshots/lime-*` at desktop, tablet, 390px and 360px widths. Initial QA found a welcome console exceeding the viewport. Placement, height constraints and a sticky phone action row were adjusted. Core calculations, model presets, worker state and treatment payload logic were outside this change.

Official integration references are the [VoiceLab TTS API](https://docs.voicelab.uz/api/tts), [authentication guide](https://docs.voicelab.uz/api/authentication), and [getting started guide](https://docs.voicelab.uz/guide/getting-started).


Final command results on November 18, 2026: npm install completed; typecheck, lint and build passed; Vitest reported 63 passed across six files; Playwright reported six passed across the simulator and tour workflows. Three focused tour tests were rerun after the final cancellation-state fix. The inherited dependency audit reports 21 findings. The full app remains running with Vite on 5173 and Express on 8787. A source/build scan found no configured credential in the client or source directories. The real credential is excluded from deliverable archives.

## Preferred narrator update

Narration now selects the catalog entry named Dilnoza — Velvet explicitly, searching the models enabled for the requested language. It never falls back to the first catalog entry. Live discovery found this voice for Uzbek under both available models and no compatible English entry. The Uzbek welcome generated valid WAV successfully. English therefore uses captions with a configuration message. The narration version was advanced to invalidate older clip caches.

The landing now uses theme-specific surfaces and a restrained lower lime illumination. Regression browser assertions check the actual landing background before and after switching themes and after reload.

English narration restored to the original catalog-default selection (currently Claire Sterling). Uzbek keeps the explicit Dilnoza — Velvet selection. Narration cache version advanced for the language-specific voices.
