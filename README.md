# PULSE Studio

PULSE is a browser-based audio workspace. The visible UI is defined by `source/index.html` and `source/modules/studio-reference.css`; production audio processing lives in focused modules under `source/modules/`.

## Architecture

- `source/app.mjs` mounts the module registry and shared workspace.
- `source/modules/index.mjs` is the single registry for available tools and their styles.
- `source/modules/workspace.mjs` owns the single `01 / SOURCE AUDIO` buffer, playback, selection and undo history.
- `source/modules/prototype-runtime.mjs` connects the prototype screens to real tool modules.
- `source/modules/studio-redesign.mjs` owns Audio Editor controls and local DSP actions.
- `api/` contains only server-side provider gateways. API secrets stay server-side.
- `scripts/build.mjs` copies the active browser modules and pinned local runtimes into `public/`.

## Development

```sh
npm test
npm run build
```

Audio is processed locally unless a specific cloud tool asks for consent. The build runs the full test suite before creating `public/`.

The Vercel production domain is not changed by preview deployments.
