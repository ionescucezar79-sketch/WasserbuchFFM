# Ghid complet — Brunnen Tagebuch v3.2 (proiect Firebase NOU)

Timp total: ~25–30 minute. Nu necesită cunoștințe de programare.

---

## CUPRINS

1. Rulare locală (test rapid fără cloud)
2. Creare proiect Firebase nou
3. Activare Firestore + reguli
4. Activare Authentication (Google)
5. Obținere config + completare în aplicație
6. Test local cu cloud
7. Publicare online (Firebase Hosting)
8. Instalare ca aplicație pe telefon/PC

---

## PASUL 1 — Rulare locală (test rapid, fără cloud)

Înainte de orice configurare Firebase, verifică că aplicația pornește.

**Windows — PowerShell:**
```powershell
cd "C:\app wasserbuch\brunnen-pwa-v3\wasserbuch-git"
python -m http.server 8080
```

Dacă `python` nu e recunoscut, instalează Python de pe python.org (bifează „Add to PATH" la instalare) SAU folosește Node:
```powershell
npx serve .
```

Deschide în Chrome: **http://localhost:8080**

Ar trebui să vezi aplicația. Funcționează 100% local (datele se salvează în IndexedDB pe acest device). Cloud-ul îl activăm la pașii următori — e opțional.

**Oprire server:** `Ctrl+C` în PowerShell.

---

## PASUL 2 — Creează proiectul Firebase nou

1. Mergi la https://console.firebase.google.com
2. Click **„Add project"** / „Adaugă proiect"
3. Nume: `brunnen-tagebuch` (de data asta scris corect — fără typo)
4. **Dezactivează** Google Analytics (nu ai nevoie) → Continue
5. Click **„Create project"** → așteaptă ~30 sec → **Continue**

---

## PASUL 3 — Activează Firestore Database

1. Meniu stânga → **Build → Firestore Database**
2. Click **„Create database"**
3. Locație: **`eur3 (europe-west)`** sau **`europe-west3 (Frankfurt)`** — cel mai aproape de tine
4. Pornește în **Production mode** → **Next** → **Enable**

### Reguli de securitate

După ce s-a creat baza, mergi la tab-ul **Rules** și înlocuiește TOT cu conținutul din fișierul **`FIRESTORE_RULES.md`** (livrat separat în proiect). Apoi click **Publish**.

⚠ Fără aceste reguli, sincronizarea cloud nu va funcționa (orice scriere va fi respinsă).

---

## PASUL 4 — Activează Authentication (login Google)

1. Meniu stânga → **Build → Authentication**
2. Click **„Get started"**
3. Tab **„Sign-in method"**
4. Click pe **Google** din listă
5. Comutator **Enable** → ON
6. „Project support email": alege emailul tău
7. Click **Save**

---

## PASUL 5 — Obține config și pune-l în aplicație

1. În Firebase Console, click pe ⚙ (roata dințată, stânga sus) → **Project settings**
2. Scroll jos la secțiunea **„Your apps"**
3. Click pe iconița **`</>`** (Web)
4. App nickname: `brunnen-web` → **NU** bifa Firebase Hosting acum → **Register app**
5. Va apărea un bloc de cod cu `const firebaseConfig = { ... }`. Copiază valorile.

Acum deschide fișierul **`firebase-config.js`** din proiect (cu Notepad sau VS Code) și înlocuiește placeholder-ele:

```javascript
export const FIREBASE_CONFIG = {
  apiKey:            "AIza...valorile tale...",
  authDomain:        "brunnen-tagebuch.firebaseapp.com",
  projectId:         "brunnen-tagebuch",
  storageBucket:     "brunnen-tagebuch.firebasestorage.app",
  messagingSenderId: "123456789",
  appId:             "1:123...:web:abc...",
};
```

**Important:** copiază doar textul dintre ghilimele. Nu schimba numele cheilor (`apiKey`, `authDomain`, etc.). Salvează fișierul.

---

## PASUL 6 — Test local cu cloud activ

1. Pornește din nou serverul: `python -m http.server 8080`
2. Deschide http://localhost:8080
3. `Ctrl+Shift+R` (hard reload, să prindă noul config)
4. Mergi la **Setări** → buton **„Conectare cu Google"**
5. Alege contul Google → ar trebui să te logheze
6. Aplicația îți creează automat „Workspace Principal" și urcă datele locale în cloud
7. Verifică în Firebase Console → Firestore → ar trebui să apară `/workspaces/ws_...`

**Test multi-device:** deschide aplicația pe alt device (sau alt browser), loghează-te cu același cont → datele apar. Pentru a invita pe altcineva: Setări → Workspace → Admin → invită după email.

### Dacă login-ul dă eroare „unauthorized domain"
Firebase Console → Authentication → Settings → **Authorized domains** → verifică că `localhost` e în listă (de obicei e deja). După publicare (Pasul 7), adaugă și domeniul `.web.app`.

---

## PASUL 7 — Publicare online (Firebase Hosting)

Ca să accesezi aplicația de oriunde (nu doar local), o publici gratuit pe Firebase Hosting.

### Instalează Firebase CLI (o singură dată)
```powershell
npm install -g firebase-tools
```
(necesită Node.js instalat — de pe nodejs.org)

### Login + inițializare
```powershell
cd "C:\app wasserbuch\brunnen-pwa-v3\wasserbuch-git"
firebase login
```
(se deschide browser → autorizezi)

```powershell
firebase use --add
```
→ alege proiectul `brunnen-tagebuch` din listă → alias: `default`
(asta completează automat `.firebaserc`)

### Publicare
```powershell
firebase deploy --only hosting
```

După ~30 sec, vei primi un link de forma:
**https://brunnen-tagebuch.web.app**

### Adaugă domeniul în Authorized domains
Firebase Console → Authentication → Settings → Authorized domains → **Add domain** → `brunnen-tagebuch.web.app`. Altfel login-ul Google nu merge pe versiunea publicată.

### Re-publicare la modificări viitoare
De fiecare dată când schimbi ceva în cod:
1. Bump `VERSION` în `sw.js` (ex: `'v3.2.0'` → `'v3.2.1'`)
2. `firebase deploy --only hosting`

---

## PASUL 8 — Instalare ca aplicație

### Android (Chrome)
Deschide linkul `.web.app` → meniu ⋮ → **„Adaugă la ecranul de start"** / „Install app"

### iPhone (Safari)
Deschide linkul → buton Share (□↑) → **„Add to Home Screen"**

### Windows (Chrome/Edge)
Deschide linkul → iconița de instalare (📥) din bara de adrese → **Install**

---

## Limite gratuite Firebase (plan Spark)

| Resursă | Limită zilnică |
|---|---|
| Citiri Firestore | 50.000/zi |
| Scrieri Firestore | 20.000/zi |
| Ștergeri | 20.000/zi |
| Storage | 1 GB total |
| Hosting transfer | 10 GB/lună |

Pentru o aplicație de citiri apometre cu câțiva utilizatori: **100% gratuit**, cu marjă uriașă.

---

## Recomandări de securitate (după ce merge totul)

1. **App Check** — Firebase Console → App Check → înregistrează app-ul web cu reCAPTCHA v3. Previne abuzul cheii API din afara domeniului tău.
2. **Authorized domains** — păstrează în listă DOAR `localhost` și domeniul tău `.web.app`. Șterge orice altceva.
3. Vezi și `XSS_NOTES.md` și `SW_NOTES.md` pentru detalii tehnice despre protecțiile deja implementate.

---

## Depanare rapidă

| Simptom | Cauză probabilă | Soluție |
|---|---|---|
| Pagină albă | Config greșit / fișier lipsă | F12 → Console → citește eroarea |
| „Conectare" nu face nimic | Domeniu neautorizat | Adaugă domeniul în Authorized domains |
| Datele nu se sincronizează | Reguli Firestore nepublicate | Republică regulile din FIRESTORE_RULES.md |
| Modificările nu apar după deploy | Cache SW vechi | Bump VERSION în sw.js + redeploy |
| „python nu e recunoscut" | Python neinstalat/PATH | Instalează de pe python.org, bifează Add to PATH |
