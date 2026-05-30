# Service Worker — v3.2 notes

## Ce s-a schimbat

### Bug-uri fix-uite

| # | Înainte | Acum |
|---|---|---|
| 1 | `firebase.js` și `i18n.js` lipseau din cache → offline rupt | Adăugate în `CORE_ASSETS` |
| 2 | Lipsea Firebase SDK CDN din cache | Cele 3 module Firebase precache-uite în `CDN_ASSETS` |
| 3 | Lipseau favicon-ul și toate icoanele | Toate cele 5 icoane în `CORE_ASSETS` |
| 4 | Cache-first universal → update-uri NU ajungeau la useri instalați | Strategie per tip resursă (vezi tabel jos) |
| 5 | Cache name fix `brunnen-v2` → coliziuni la update | `brunnen-${VERSION}` cu `VERSION='v3.2.0'` |
| 6 | Firebase API requests interceptate → break sync | `PASSTHROUGH_HOSTS` exclude `firestore.googleapis.com` etc. |
| 7 | Fără cleanup → cache-uri vechi se acumulau | Activate șterge toate cache-urile cu nume diferit |

### Strategia per resursă

| Tip request | Strategie | Comportament offline |
|---|---|---|
| `index.html`, navigare | Network-first | Fallback la `/index.html` cached |
| `/app.js`, `/style.css`, etc (same-origin) | Stale-while-revalidate | Servire instant din cache + update silent în background |
| Chart.js, Firebase SDK (CDN versionat) | Cache-first | Funcționează 100% offline după prima încărcare |
| Firestore/Auth API | **Passthrough** | Firebase SDK gestionează singur via IndexedDB |
| Orice altceva (gstatic dynamic, etc.) | Passthrough | Nu poluăm cache-ul |

### Update flow

1. Browser detectează `sw.js` schimbat (byte-different)
2. **Install**: precache `CORE_ASSETS` (strict — fail dacă lipsește vreunul) + `CDN_ASSETS` (best-effort)
3. `skipWaiting()` → activate imediat (nu așteaptă închiderea tab-urilor)
4. **Activate**: șterge cache-urile vechi (`brunnen-*` cu altă versiune)
5. **Prima instalare (no old caches)**: `clients.claim()` → controlează pagina curentă imediat
6. **Update (existau old caches)**: NU `claim` → tab-urile rulează codul vechi până la reload manual. Asta prevențiunește mismatch JS-in-memory vs cache-actualizat

## Workflow pentru deploy-uri viitoare

**OBLIGATORIU** la fiecare modificare a fișierelor cache-uite:

```javascript
// sw.js, linia 22
const VERSION = 'v3.2.0';  // → bump la 'v3.2.1', 'v3.3.0', etc.
```

Fără bump, userii rămân pe versiunea veche până șterg manual cache-ul.

**Pattern recomandat:**
- Fix bug: `v3.2.0` → `v3.2.1`
- Feature nou: `v3.2.x` → `v3.3.0`
- Breaking change: `v3.x.x` → `v4.0.0`

## Cum forțezi cache reset pe browser-ul tău (dezvoltare)

DevTools → Application → Service Workers → **Unregister**, apoi DevTools → Application → Storage → **Clear site data** → reload.

Sau direct din app: butonul `↺ Cache` din Setări → Despre (deja există în `index.html` linia 209).

## Cum forțează userii update-ul (dacă rămân stuck)

1. Spune-le: „Apasă Ctrl+Shift+R" (hard reload — bypass SW)
2. Sau: deschide app-ul → Setări → Despre → butonul `↺ Cache`
3. Caz extrem (Android instalat): dezinstalează PWA-ul, reinstalează

## Test rapid după deploy

```
DevTools → Application → Service Workers
```

Trebuie să vezi:
- Status: `activated and is running`
- Source: `sw.js` cu data recentă
- Scope: `/`

```
DevTools → Application → Cache Storage
```

Trebuie să vezi un singur cache: `brunnen-v3.2.0` (sau versiunea curentă) cu ~14 fișiere precache-uite + 4 din CDN după prima încărcare.

## Test offline

1. Încarcă app-ul o dată (cu internet)
2. DevTools → Network → **Offline**
3. Reload pagina (Ctrl+R)
4. App-ul trebuie să se încarce și să afișeze datele locale
5. Notă: login Google nu funcționează offline (necesită Auth API), dar datele cached din Firestore sunt disponibile via Firebase IndexedDB persistence

## Avertisment: schimbarea hostingului

Dacă vreodată muți de la `firebase.web.app` la `vercel.app` sau alt domeniu, vechiul SW va continua să servească cache de pe vechiul domeniu pentru userii instalați. Singura soluție: comunică schimbarea, fă noul site să auto-detecteze SW vechi și să-l forțeze să dezînregistreze:

```javascript
// În noul index.html
navigator.serviceWorker.getRegistrations().then(regs => {
  regs.forEach(r => {
    if (!r.scope.includes(location.host)) r.unregister();
  });
});
```

Nu se aplică acum, dar bine de știut.
