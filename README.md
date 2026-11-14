# PULSE Studio

Browser-first audio workspace for analysis, editing, conversion, mastering, AI workflows and visualization.

## Current architecture

- `source/index.html` — visible prototype-based screens and hidden compatibility host for audio controls.
- `source/modules/prototype-runtime.mjs` — routes visible screens and connects them to the shared `AudioWorkspace`.
- `source/modules/workspace.mjs` — single audio source, transport, waveform, selection and history.
- `source/app.mjs` and `source/modules/index.mjs` — active tool registry and tool mounting.
- `source/modules/studio-reference.css` — canonical dark design from the approved HTML.
- `source/modules/ui.css` and feature CSS — styles still required by active legacy modules.
- `api/` — existing protected provider gateways; API secrets must stay on the server.

## Development

```bash
npm install
npm test
npm run build
```

Vercel executes `npm test && npm run build` and publishes `public/`.

## Cleanup policy

The legacy host is deliberately retained **only** for active audio controls until migrated. It must not become a second user-facing UI. Previous standalone Song Analyzer UI, unused red-theme overlay, obsolete theme toggle and one-time installer scripts have been removed. The historical `source/song` DSP code remains test-only, and is not shipped in the browser build.
