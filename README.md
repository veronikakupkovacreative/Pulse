# PULSE STUDIO 3.1 — Smart Master + Grouped Toolkit

New in this development version: **ANALYZE / EDIT / EXPORT / AI STUDIO** navigation and a functional local **Smart Master v1** using adaptive DSP, real LUFS measurement, before/after preview, and 24-bit WAV export. AI Mix is still planned. See [implementation and limitations](docs/ai-studio-master-v1.md).

```bash
npm test
npm run build
python3 -m http.server 8080 --directory public
```

---

# Pulse Studio 2.2 — Web + Cloud YouTube Audio

Tato verze řeší chybu **LOCAL HELPER OFFLINE**. Návštěvník veřejného webu **nic neinstaluje**. Web na Vercelu posílá pouze YouTube URL a zvolený výstupní formát cloudové API službě, která provede zpracování a vrátí soubor ke stažení.

**Stav:** Zdrojový kód je připravený, testovaný na syntetickém audiosouboru. Není nasazený na uživatelské Vercel ani Railway účty. Reálné YouTube stahování zatím nebylo ověřeno, protože YouTube může měnit způsob přístupu a omezovat cloudové IP.

## Aktuální veřejný stav (YouTube Audio — Coming soon)

YouTube Audio je v uživatelském rozhraní **disabled / Coming soon**. Návštěvník nemůže vložit odkaz ani spustit import a web při otevření nevolá YouTube API. Důvod: YouTube vyžaduje na cloudovém serveru ověření proti automatizaci; funkční stahování není možné garantovat. BPM Analyzer, Converter, Key Finder a Loop Cutter zůstávají aktivní. Cloudové API je ponechané pro další interní vývoj, není však veřejně nabízeno jako funkční downloader.

## Co se změnilo

- V rozhraní už není návod na instalaci Mac helperu ani adresa `127.0.0.1:8765`.
- Web se připojuje ke cloud API definovanému při sestavení proměnnou `PULSE_API_BASE_URL`.
- API běží s Python FastAPI, yt-dlp s EJS, Deno a FFmpeg v Docker kontejneru. Připravené pro Railway.
- Žádný YouTube stream neprochází přes Vercel Functions: soubor jde přímo z cloudového API do uživatelova prohlížeče.
- Podporované výstupy: původní (nejvěrnější), WAV 16-bit, WAV 24-bit, MP3 320 kb/s.
- Zůstávají: BPM, Key Finder, Converter, Loop Cutter a jejich lokální zpracování.

## Jednorázové nasazení pro provozovatele (žádná instalace návštěvníkům)

1. Umísti obsah této složky do GitHub repozitáře, který používáš pro web (nebo do nového repozitáře).
2. Na **Railway** vytvoř `New Project` → `Deploy from GitHub repo`, vyber repozitář. Railway díky `Dockerfile` a `railway.json` sestaví server s FFmpeg, yt-dlp/EJS a Deno.
3. U Railway služby v `Variables` nastav:

   ```
   PULSE_ALLOWED_ORIGINS=https://pulse-rose-theta-57.vercel.app
   ```

   Pokud web provozuješ i na vlastní doméně, přidej ji oddělenou čárkou. Za koncem domény nedávej lomítko.
4. V Railway v `Settings` → `Networking` klikni na **Generate Domain**. Například obdržíš `https://pulse-api-production.up.railway.app` (skutečný název bude jiný). Ověř `https://TVOJE-DOMENA/api/youtube/health` — měla by vracet `"ready":true`.
5. Ve Vercel projektu (který obsluhuje `pulse-rose-theta-57.vercel.app`) nastav v `Settings` → `Environment Variables`:

   ```
   PULSE_API_BASE_URL=https://TVOJE-SKUTECNA-DOMENA.up.railway.app
   ```

   Nezadávej koncové `/`, `/api` ani vymyšlený příklad domény. Po uložení **Redeploy** (nebo nový deploy) — protože Vercel dosazuje hodnotu do statického HTML během `npm run build`.
6. Ve Vercelu ponech existující projekt se soubory `package.json`, `vercel.json`, `source/` a `scripts/build.mjs`. Build příkaz je `npm run build`, výstup `public/`. Není třeba instalovat nic u návštěvníků.
7. Na veřejném webu otevři **YouTube → WAV**, vlož URL k videu, které smíš stahovat, zvol formát a klikni **Stáhnout**.

### Důležitá omezení

- **WAV neobnovuje ztracenou kvalitu** původního YouTube audio streamu. Nejvyšší věrnost zdroji nabízí varianta *Původní YouTube stream* bez nového kódování. WAV 16/24 bit má výhodu pro DAW, ne lepší zvukové informace.
- YouTube může cloudové servery blokovat, omezovat některá videa či vyžadovat ověření. Nelze zaručit, že bude fungovat každá URL.
- Veřejný downloader spotřebovává serverové zdroje; pro větší návštěvnost přidej centrální rate limiting, plánování úloh, monitoring nákladů a externí úložiště.
- Limity základní verze: délka max. 20 min, zdroj max. 200 MB, výstup max. 420 MB, dva paralelní převody, nanejvýš 12 připravených souborů současně, platnost tokenu 10 minut. Server ukládá připravené soubory do dočasného úložiště.
- Používej pouze videa, k jejichž stažení máš oprávnění. YouTube podmínky mohou stahování omezovat i u materiálu, který vlastníš.

## Vývoj / testy

```sh
npm test
PULSE_API_BASE_URL=http://127.0.0.1:8000 npm run build
python3 -m unittest discover -s tests -p 'test_*.py' -v
python3 scripts/test_youtube_browser.py
```

Pro produkční Vercel build se `PULSE_API_BASE_URL` nastavuje přímo v prostředí Vercelu (viz výše). `server.py` obsahuje původní logiku získání a převodu zvuku, importovanou cloudovým modulem `backend/api.py`. Místní spuštění `server.py` není v produkci potřebné.

Soubory:
- `source/index.html` + `source/style.css` + `.mjs` — upravitelný web
- `scripts/build.mjs` — generuje samostatný `public/index.html`
- `backend/api.py` — veřejné Cloud API s CORS, jednoduchými limity a soubory ke stažení
- `Dockerfile`, `railway.json` — cloudové nasazení Railway
- `server.py` — sdílené funkce yt-dlp/FFmpeg
- `vercel.json` — statický web
- `tests/` — automatické testy

---

## PULSE 3.0 — Phase 1: Quick Tools (development)

New production features: Audio Reverse, Silence Trimmer, BPM Calculator,
Peak / LUFS Audio Normalizer, and shared working audio with Undo/Redo and
Reset to Original. See [`docs/phase-1.md`](docs/phase-1.md) for capabilities,
tests, and limitations.

The new features use browser-side Web Audio and local DSP. YouTube Audio
remains disabled. The $1 purchase is **lifetime, one-time**, but checkout and
server-enforced access are not yet live; Phase 1 does not add fake billing.

## Pulse Studio 3.0 — Phase 2 (development)

Pitch & Time (WSOLA-like offline DSP), 808 Tuner (YIN-derived estimation), and Sample Slicer (transient markers, manual edits, WAV/ZIP exports) now build on the Phase 1 shared audio workspace. All processing runs in the browser; the supplied YouTube importer remains disabled.

Read [Phase 2 implementation notes](docs/phase-2.md). The $1 one-time lifetime payment remains a separate prototype and is **not enabled** in this branch; production access is not gated.

## PULSE 3.2 - Waveform playhead

The BPM waveform and the shared producer-tool waveform now support direct click-to-seek and scrub-to-seek. A high-contrast vertical playhead and red position marker indicate the current transport position. While playing, the cursor animates with Web Audio timing; on pause it stays at the selected position.

- **Click**: seek and play from the selected location; **drag**: scrub and resume from the release point.
- **Keyboard focus on the producer waveform**: arrows move +/- 1 second, Shift+arrows +/- 5 seconds, Home/End jump to the track edges, Space toggles Play/Pause.
- **Loop Cutter**: normal click seeks, Shift+click adjusts a selection edge, while START/END sliders remain available.
- **Sample Slicer**: normal click seeks; dragging a nearby marker moves it; Shift+click inserts/deletes markers.
- Preview playback for Quick Tools, Pitch & Time, 808 Tuner and Smart Master follows the transport position where practical. The source/working audio remains immutable.

See `docs/playhead-v1.md` for integration and regression checks. No billing configuration, YouTube access, or deployment change is required.
