# PULSE Studio - Clean Shell

This branch contains no audio processors. All previous DSP functions, legacy tools, dependencies and tool tests are absent from its file tree. Old code is recoverable from Git history and previous branches.

## Preserved
- PULSE visual identity and responsive two-column layout.
- Four main categories: ANALYZE, EDIT, EXPORT and AI STUDIO.
- Accessible category navigation and blank module slots.

## Add improved modules
1. Create a module at source/modules/<name>.mjs.
2. Export a mount function accepting {host, category}; return an optional cleanup callback.
3. Import and register it in source/modules/index.mjs as {id,category,label,mount}.
4. Update scripts/build.mjs to copy new module assets to public/modules.
5. Write and run module tests before release.

## Commands
- npm test
- npm run build
- Serve the public directory as a static website.

The previous production site stays unchanged until this branch is explicitly deployed there.
