# Nasazení Pulse Studio 2.2

Projekt **pulse-studio-2** na Vercelu používá větev `main` repozitáře `veronikakupkovacreative/Pulse`.

## Frontend (Vercel)
- Build: `npm run build`
- Output Directory: `public`
- Po připojení GitHubu spustí nový commit nasazení automaticky, pokud je Git integrace aktivní.
- Ve Vercel → Deployments zrušte případný filtr `Author`, který může nové nasazení skrýt.
- Při selhání otevřete konkrétní deployment → Build Logs.

## YouTube API (Railway)
- Backend se nasazuje **samostatně** z tohoto repozitáře přes `Dockerfile`.
- Po vytvoření veřejné Railway domény je potřeba nastavit ve Vercelu `PULSE_API_BASE_URL` na její kompletní HTTPS adresu a spustit nové nasazení.
- V Railway nastavte `PULSE_ALLOWED_ORIGINS` podle skutečné veřejné adresy Vercel webu (případně více adres oddělených čárkou).
- Samotné připojení repozitáře k Vercelu **nezprovozní** online import YouTube; bez nasazeného API se zobrazí informace o nedostupné službě.

**Poznámka:** Reálný import YouTube audia z cloudového hostingu dosud není ověřený. Dodržujte podmínky služby a pracujte s obsahem, který smíte získávat.
