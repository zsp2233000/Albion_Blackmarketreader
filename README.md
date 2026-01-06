# Albion Blackmarket Reader

Modernes Albion-Market-Tool: Primär als gehostetes Web-UI (Landing + Dashboard). Daten kommen per automatischem Sync (GitHub Actions/Vercel) aus der Albion Online Data API.

## Nutzung
- Online (https://blackmarketreader.com): Deine Vercel-URL aufrufen. Kein lokaler Start nötig.
- Auth: Supabase (E-Mail/Passwort + Google). Avatar/Display-Name im Account-Panel anpassbar.
- Daten & letzte Aktualisierung siehst du direkt im Dashboard.

## Deployment (Vercel)
- Root: `ui`
- Env Vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- Build Command: erzeugt `env.js` aus Env Vars (siehe Vercel-Einstellungen; keine Keys im Repo).
- Output Directory: `.`
- `env.js` ist in `.gitignore`; nur `env.example.js` liegt im Repo.

## Lokale Entwicklung
```powershell
git clone https://github.com/LeonWWImmo/Albion_Blackmarketreader
cd Albion_Blackmarketreader/Albion_ProfitChecker/ui
# env.js lokal anlegen (nicht committen):
# window.env = { SUPABASE_URL: "...", SUPABASE_ANON_KEY: "..." };
```
Lokale EXE ist optional und nicht mehr der Hauptweg.

## Sync / Daten
- Datenquelle: west.albion-online-data.com (Rate Limits → Batches + Retries).
- Ergebnisse landen in `ui/results.js`, Fortschritt in `ui/progress.json`.
- Item-Basis: `Data/ItemList.json` (Codes), Übersetzungen separat.

## Struktur
- `Albion_ProfitChecker/ui/` – statisches Frontend (index.html, dashboard.html, styles.css, results.js, pictures).
- `Albion_ProfitChecker/Program.cs` – Kestrel-Host, Endpunkte `/refresh`, `/progress`, statische Auslieferung.
- `Data/` – Item-Listen.
- `.github/workflows/` – Sync-Actions (Topf 1/2/Merge etc. je nach Setup).


## Support
- Issues/PRs willkommen.
- Auth/Support-Mail im UI: `blackmarketreader@gmail.com`.
