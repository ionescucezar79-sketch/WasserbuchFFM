# Brunnen Tagebuch v3.2 — PWA

Aplicație de evidență a citirilor de apometre (Wasserzähler) pe șantiere, cu sincronizare cloud opțională și colaborare multi-utilizator prin workspaces.

## Structura proiectului

```
wasserbuch/
├── index.html             ← Aplicația principală (UI)
├── app.js                 ← Logica aplicației
├── db.js                  ← Stocare locală IndexedDB
├── firebase.js            ← Logica de sincronizare cloud
├── firebase-config.js     ← ⚙ CONFIG — singurul fișier de editat
├── charts.js              ← Grafice Chart.js
├── i18n.js                ← Traduceri RO / DE
├── style.css              ← Stiluri
├── manifest.json          ← Config PWA (instalare)
├── sw.js                  ← Service Worker (offline + cache)
├── 404.html               ← Pagină eroare
├── icon-192/512.png, icon.svg, favicon.png, apple-touch-icon.png
│
├── FIREBASE_SETUP.md      ← 📖 GHID PAS CU PAS (începe aici)
├── FIRESTORE_RULES.md     ← Reguli de securitate Firestore (de publicat)
├── SW_NOTES.md            ← Detalii tehnice Service Worker
├── XSS_NOTES.md           ← Detalii tehnice securitate
└── CHANGELOG_v3.2.md      ← Ce s-a schimbat în v3.2
```

## Pornire rapidă

```powershell
python -m http.server 8080
```
Deschide http://localhost:8080 — funcționează imediat, local. Pentru cloud și publicare online, vezi **FIREBASE_SETUP.md**.

## Funcționalități

- Multi-șantier cu apometre configurabile per șantier
- Istoric citiri cu calcul automat al consumului (Δ)
- Grafice: evoluție în timp + consum lunar
- Filtre perioadă (7/30 zile, lună, an, custom)
- Export CSV (cu BOM pentru Excel)
- Bilingv RO / DE
- PWA instalabilă (Android, iOS, Windows), funcționează offline
- Sincronizare cloud opțională (Firebase) cu workspaces colaborative
- Stocare locală permanentă (IndexedDB) când cloud-ul e dezactivat

## Modul de funcționare

- **Fără config Firebase** (`firebase-config.js` necompletat): app-ul rulează 100% local, datele în IndexedDB pe device.
- **Cu config Firebase**: la login Google, datele se sincronizează în cloud și pot fi partajate cu alți membri ai workspace-ului.

## Versiune

v3.2 — fix workspace, Service Worker rescris, protecție XSS. Vezi `CHANGELOG_v3.2.md`.
