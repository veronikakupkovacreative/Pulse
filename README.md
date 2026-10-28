# Pulse Studio 2.2 — Web + Cloud YouTube Audio

Tato verze řeší chybu **LOCAL HELPER OFFLINE**. Návštěvník veřejného webu **nic neinstaluje**. Web na Vercelu posílá pouze YouTube URL a zvolený výstupní formát cloudové API službě, která provede zpracování a vrátí soubor ke stažení.

**Stav:** Zdrojový kód je připravený, testovaný na syntetickém audiosouboru. Není nasazený na uživatelské Vercel ani Railway účty. Reálné YouTube stahování zatím nebylo ověřeno, protože YouTube může měnit způsob přístupu a omezovat cloudové IP.

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
