# PULSE Studio — Unified Visual System

Applies to PULSE Studio toolkit. Reference UI: **04 / BEAT LAB**.

## Source of truth

- `source/modules/pulse-design-system.css` — canonical, last-loaded CSS for all RED toolkit panels.
- `source/modules/index.mjs` — appends that stylesheet **after** the existing UI/FX/AI CSS.
- `source/song/song-analyzer.css` — separate original top-page Song Analyzer. Do **not** globally override it.
- Existing module styles remain for specialized layout, waveform canvases, frequency response graphs and module-specific operations.

Do not introduce new color variants to individual modules. Add new shared rules to the canonical file and keep selectors scoped to `.tool-settings` to avoid recoloring the top-page Song Analyzer.

## Tokens

| Role | Value |
| --- | --- |
| Primary red | `--pulse-red: #FF2B20` |
| Ink / text / outline | `--pulse-ink: #191919` |
| White for black CTA text | `--pulse-white: #FFFFFF` |
| Off-white page background (outside toolkit) | `--pulse-paper: #F5F4F0` |
| Spacing rhythm | 8 / 12 / 16 / 24 / 32 / 48 px |
| Radius | 0 px |
| Font | Arial, Helvetica, sans-serif |

The red canvas uses black for all body text, small text, labels, values, lines and outlines. A white font is permitted **only inside a black surface** (primary CTA, selected tab/option, black audio graph). Never put gray-on-red, beige cards, gray text in metrics, or white body paragraphs directly on red.

## Hierarchy and casing

- **Meta and panel labels:** uppercase, 10 px, bold, tracked 0.08 em.
- **Headline:** natural sentence case, regular weight, `clamp(32px, 3.3vw, 52px)`, line-height ~1.06.
- **Body:** normal sentence case, 13 px/1.6; helper and status 12 px/1.6.
- **Buttons:** uppercase, 10–11 px bold, minimum 40–48 px hit area.
- **Numeric values:** natural notation, tabular numerals.
- **Controls:** square; 1 px black outline; visible black focus ring; black/red contrast preserved in dark mode.

## Component contracts

1. **Primary action**: black background, white uppercase text, black border.
2. **Secondary action**: red/transparent background, black uppercase text, black border.
3. **Selected control/preset**: black background, white uppercase text.
4. **Metric card**: transparent on red, 1 px black outline, black labels and values.
5. **Input/checkbox/radio/range**: transparent background, black label, black border/accent.
6. **Status and error**: black text on red; error additionally uses text/content and stronger weight, never color alone.
7. **FFT/waveform canvas**: black graphics background allowed with white labels for legibility; separate from red cards.
8. **Output/workspace actions**: red background; preview outlined; export black with white type.

## Boundaries

- Applies across ANALYSIS (toolkit panel), EDIT, EXPORT, AI STUDIO (all 8 tools), and VISUALS.
- All categories remain red. No module-specific black "card theme" except explicitly black functional canvases and primary controls.
- The original standalone Song Analyzer, located outside the RED toolkit, retains its existing black upload/workspace style.
- Both light and dark page themes leave toolkit panels red with black UI.
- Does not change DSP processors, audio data handling, or exported media.

## QA before merge

Run `npm test && npm run build`. Test the responsive layout at 390 / 768 / 1440 px, compare focused Song Analyzer with Beat Lab, and check native inputs, hover, focus, selected, error and disabled states. Check computed colors: `rgb(255,43,32)` red, `rgb(25,25,25)` black, `rgb(255,255,255)` text on black primary controls.

Contrast: `#191919` on `#FF2B20` reaches WCAG AA for regular text; white on black exceeds AAA. Always validate if palette tokens change.
