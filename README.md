# Zero Training Video Generator

A static dashboard that turns a concept + audience + framework into a fully-narrated, fully-animated explainer video — composed by AI, voiced by ElevenLabs, rendered as a single self-contained HTML file.

The whole thing is plain static files. No build step, no server, no `node_modules`. Open it locally or push to GitHub Pages and it just runs.

---

## What you get

Three inputs:

- **Concept** — what the video teaches (e.g. "Root Cause Analysis").
- **Audience** — who it's for (e.g. "Business Analyst").
- **Framework** — the *structure* the script must follow. This is the source of truth: the AI doesn't have a default beat order. Whatever sections you list, in whatever order, with whatever sub-bullets — that's the structure of the output. A purely tonal framework like "make it a hilarious mentor with crazy examples" works too; the AI proposes its own sensible arc and applies the tone.

The dashboard then walks through four steps:

1. **Brief** — three inputs above, plus pick a model.
2. **Script** — AI returns a structured `scenes[]` array. Each scene gets a `kind` from a fixed visual vocabulary (`title`, `bullets`, `cards`, `keywords`, `steps`, `comparison`, `analogy`, `number-pop`, `quote`, `recap`, `cta`) — that vocabulary is the *only* hardcoded thing in the system. The screenplay renders on the right; tweak the framework and regenerate as many times as you want.
3. **Voice** — pick an ElevenLabs voice ID, give it stylistic direction. ElevenLabs v3 reads bracketed cues like `[laugh]`, `[pause]`, `[emphasize]` as real voice direction. Audio comes back with character-level timestamps.
4. **Render** — the dashboard extracts a per-scene anchor map from the audio alignment and assembles a single self-contained HTML file with GSAP animations pinned to `audio.currentTime` as the master clock. Scrub, seek, change playback speed — every reveal stays synced.

---

## Quick start (local)

```bash
# Mac
./run.command

# Windows
run.bat
```

Both launchers prefer Node 18+ (gives you the Ollama Cloud proxy). They fall back to Python's `http.server` if Node isn't installed — Claude / Gemini / Mock all work in either mode; only Kimi (via Ollama Cloud) needs the Node proxy because Ollama Cloud doesn't ship CORS headers for browser-direct fetch.

The dashboard opens at `http://localhost:8000`.

---

## Providers

Drop API keys into Settings (top right of the dashboard). Keys are kept in your browser's `localStorage` only — never committed, never sent anywhere except directly to the provider.

| Provider | Source | Where it lives                                |
|----------|--------|-----------------------------------------------|
| Claude   | console.anthropic.com | direct browser fetch (anthropic-dangerous-direct-browser-access header) |
| Gemini   | aistudio.google.com   | direct browser fetch                          |
| Kimi     | ollama.com            | local Node proxy (`/api/proxy/ollama/*`) — needs the Node launcher |
| ElevenLabs | elevenlabs.io       | direct browser fetch (for voice)              |
| Mock     | bundled               | no key, no network, hardcoded sample          |

Supabase is optional — sessions persist in `localStorage` if Supabase isn't configured. If you do connect Supabase, run the SQL in `SUPABASE_SETUP.sql` once to create the `sessions` table + storage buckets.

---

## Deploy to GitHub Pages

```bash
./deploy.command
```

That script (and `deploy.bat` on Windows) uses the GitHub CLI (`gh`) to create a public repo and enable Pages. After ~1 minute the dashboard is live at `https://<your-username>.github.io/zero-training-video-generator/`.

**Caveat:** GitHub Pages only serves static files, so the Ollama proxy isn't available there. On the hosted version, use Claude or Gemini for generation. If you want Kimi via Ollama Cloud, run locally with `./run.command` (Node mode) where the proxy works.

---

## Project structure

```
zero-training-video-generator/
├── index.html              # the dashboard shell
├── styles.css              # Zero design tokens
├── app.js                  # orchestration, state, routing
├── server.js               # local Node static server + Ollama proxy
├── run.command / run.bat   # double-click launchers
├── deploy.command          # one-shot GitHub Pages deploy
├── lib/
│   ├── settings.js         # localStorage keys + Supabase config
│   ├── sessions.js         # session CRUD with Supabase + localStorage fallback
│   ├── supabase.js         # thin REST wrapper
│   ├── scriptShape.js      # new scenes[] schema + legacy adapter
│   ├── screenplay.js       # script JSON → screenplay text
│   ├── loaders.js          # contextual loader sequencer
│   ├── previewRenderer.js  # right-pane preview HTML
│   ├── mockScript.js       # bundled mock template
│   └── ai/
│       ├── systemPrompt.js     # framework-driven prompt + visual vocabulary
│       ├── scriptGenerator.js  # Claude / OpenAI / Gemini / Ollama direct calls
│       ├── voicePipeline.js    # ElevenLabs /with-timestamps
│       ├── anchorExtractor.js  # finds the exact second each scene speaks
│       └── videoAssembler.js   # emits the single self-contained HTML video
├── mock-assets/            # bundled MP3 + sample video for mock mode
├── SUPABASE_SETUP.sql      # paste into Supabase SQL editor
├── SETUP.md                # walkthrough — keys, Supabase, first run
├── QUICKSTART.md           # 30-second onboarding
└── DEPLOY.md               # extra deployment notes
```

---

## Architecture notes

- **No build step.** ES modules everywhere, native imports. Modify a file, refresh the browser.
- **Framework drives structure.** The `scenes[]` array in the script JSON has whatever count, names, and order the framework asks for. The 11-kind visual vocabulary is the only structural constant.
- **Audio is the clock.** The video assembler builds a GSAP timeline that mirrors `audio.currentTime`. Every animation pin (scene activate, card reveal, number pop) is keyed to a character-level anchor extracted from ElevenLabs' alignment data.
- **Backwards-compat shim.** `lib/scriptShape.js`'s `normalizeScript()` adapts old 10-beat scripts to the new shape on read — sessions you generated yesterday still render today.
