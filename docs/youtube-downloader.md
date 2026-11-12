# PULSE Studio — YouTube Downloader (owner-authorized beta)

Funkce je soucasti 03 / EXPORT -> Video to Audio -> YouTube Downloader. Zahrnuje skutecne stahovani videi a audia prostrednictvim samostatneho Docker workeru s yt-dlp, yt-dlp-ejs, Node.js a FFmpeg.

## Co je implementovane

- YouTube watch, Shorts, youtu.be a /live odkazy pro jedno video; URL se bezpecne validuje a kanonizuje.
- Format MP3 (128/192/256/320 kbps), WAV (16bit PCM 44.1kHz) nebo MP4.
- Stav queued/checking/downloading/encoding/ready/failed, procenta, CANCEL a docasny odkaz ke stazeni.
- Fronta s 1 aktivni a nejvyse 2 cekajicimi ulohami; limit 10 minut, 100 MB vstupu a 150 MB vystupu.
- Docasne soubory a download tickets expiruji po 15 minutach. Media soubory se stahuji primo z workeru, nikoli pres Vercel.
- Povinne overeni opravneni a owner access code. Public anonymous mode neni aktivovan.
- Zadna YouTube cookies, login, soukroma videa, playlisty ani obchazeni DRM.

YouTube podminky omezuji stahovani obsahu. Uzivatel musi mit nejen prava k obsahu, ale take opravneni ke zvolene metode ziskani podle podminek sluzby ci platneho prava. Dostupnost se muze menit.

## 1. Docker worker (Render/Railway/vlastni VPS)

Worker neni Vercel Function. Potrebuje samostatne Docker hostovani, FFmpeg, odchozi Internet, docasny disk a HTTPS domenu.

Build z rootu repozitare:

    docker build -f services/youtube-worker/Dockerfile -t pulse-youtube .

Worker environment secrets (nastavit pres dashboard hostingu, nikdy ne do kodu):

- PULSE_YT_SERVICE_TOKEN — dlouhy nahodny servisni klic, nejmene 24 znaku.
- PULSE_YT_PUBLIC_BASE_URL — HTTPS domena workeru, napr. https://pulse-worker.example.com
- PORT — volitelne (vychozi 8787).

Lokalni zkusebni spusteni:

    docker run --rm -p 8787:8787 \
      -e PULSE_YT_SERVICE_TOKEN="$PULSE_YT_SERVICE_TOKEN" \
      -e PULSE_YT_PUBLIC_BASE_URL="http://127.0.0.1:8787" \
      pulse-youtube

    curl http://127.0.0.1:8787/healthz

Worker zatim podporuje jen 1 repliku a ephemeral filesystem. Po restartu se rozpracovane ulohy zrusi. Pro verejny vysoky provoz by bylo nutne Redis + object storage + kvoty.

## 2. PULSE web na Vercelu

V projektu pulse-studio-2 nastavit pro Preview tyto 3 env promenne:

- PULSE_YT_WORKER_URL = stejna verejna HTTPS URL workeru
- PULSE_YT_SERVICE_TOKEN = STEJNY tajny servisni klic jako u workeru
- PULSE_YT_OWNER_TOKEN = JINY nahodny beta access code, nejmene 16 znaku

Tyto promenne patri pouze do secure settings hostingu. Nezadavat je do GitHubu nebo do chatu.

Vercel endpoint /api/pulse-youtube prenasi pouze male JSON zpravy. Neprenasi binarni video nebo audio, takze nenarazi na Vercel payload limit 4.5 MB.

## 3. Jak vyzkouset

1. Otevrit 03 / EXPORT -> Video to Audio.
2. Vlozit YouTube URL videa, u ktereho mas opravneni ke stazeni a zpracovani.
3. Vybrat MP3 / WAV / MP4, zadat beta access code a potvrdit opravneni.
4. Kliknout DOWNLOAD FROM YOUTUBE. Prohlizec sleduje prubeh ulohy.
5. Kliknout DOWNLOAD RESULT. Soubor jde z workeru primo do prohlizece.
6. Otestovat take CANCEL, chybejici pristup, nepristupna videa a limit delky.

MP4 vyzaduje dostupne kompatibilni video a audio streamy. Pri nepristupnem formatu worker vrati chybu, nikoli podvrzeny soubor. Nove audio exporty jsou prevadene pomoci FFmpeg a nelze jimi obnovit puvodne ztracenou kvalitu.

## Technicky obsah

- source/modules/youtube-ui.mjs — ovladaci panel, formaty, stavy a download.
- source/modules/youtube-client.mjs — polling a API requesty.
- source/modules/video-audio-tool.mjs — propojeni do existujici sekce EXPORT.
- api/pulse-youtube.js — owner-authenticated Vercel API.
- services/youtube-worker/server.mjs — token, fronta, cancel, status, expirovane download odkazy.
- services/youtube-worker/job-core.mjs — validace video ID, yt-dlp, FFmpeg a limity.
- services/youtube-worker/Dockerfile — nasazeni workeru.
- tests/youtube-*.test.mjs — unit a integrovane HTTP testy.

## QA

    npm install
    npm test
    npm run build

Testy pouzivaji simulovany zdrojovy soubor a overuji realne HTTP endpointy, nikoli skutecne stazeni z YouTube. Zive stazeni je nutne overit az na nasazenem workeru s videem, ke kteremu mas opravneni.

Bez PULSE_YT_WORKER_URL a odpovidajicich secretu UI ukaze, ze downloader neni nakonfigurovan. Nelze ho vydavat za funkcni verejnou sluzbu pred nasazenim workeru.
