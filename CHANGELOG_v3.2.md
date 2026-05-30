# v3.2 — Fix workspace + storage migration

## Bug rezolvat (CRITIC)

App-ul anterior nu pornea deloc — `app.js` importa 9 funcții care nu existau în `firebase.js`. Browserul arunca `SyntaxError` la load și întreg modulul ESM refuza să se linkeze, deci nici codul local-mode nu rula.

## Modificări

### `firebase.js` — rescriere completă

**Funcții noi (cele 9 lipsă):**
- `getUserWorkspaces()` — listă workspace-uri unde user-ul e member
- `getWorkspace(wsId)` — fetch workspace individual
- `createWorkspace(name)` — creează workspace cu user ca admin
- `setActiveWorkspace(wsId)` — setează workspace activ, oprește listeners vechi
- `addMemberByEmail(wsId, email)` — adaugă invite pentru email
- `removeMember(wsId, uid)` — elimină member (admin) / leave (self)
- `checkAndAcceptInvites()` — la login, acceptă invitațiile pending
- `getCurrentWsId()` — sync getter
- `getIsAdmin()` — sync getter

**Modelul de date Firestore (BREAKING):**

```
ÎNAINTE:                        DUPĂ:
/users/{uid}/sites/{sid}        /workspaces/{wsId}/sites/{sid}
/users/{uid}/entries/{eid}      /workspaces/{wsId}/entries/{eid}
                                /workspaces/{wsId} (members, adminUid, memberUids)
                                /invites/{email_lower} (pending: [...])
```

Datele vechi de la `/users/{uid}/*` rămân accesibile read-only pentru export manual.

**Bug-uri fix-uite în paralel:**
- `listenEntries` folosește acum `query(... where('siteId','==',siteId))` în loc de fetch-all + filter client-side (economisește quota Firestore)
- `listenSites` și `listenEntries` opresc listener-ul anterior înainte să atașeze unul nou (previne memory leaks la switch workspace)
- `fsDeleteSite` șterge cascadat și entries-urile asociate într-un singur batch (atomic, fast)
- `fsSaveEntry` forțează `siteId` ca string pentru consistență la query-uri
- `siteDoc/entryDoc` folosesc `String(id)` pentru a evita Firestore errors la ID-uri numerice

### `FIRESTORE_RULES.md` — fișier nou

Conține regulile Firestore actualizate pentru noul model. **OBLIGATORII** — fără ele, scrierile vor fi blocate cu `permission-denied`.

Regulile implementează:
- Members pot citi/scrie în workspace-ul lor
- Doar admin poate crea/șterge workspace sau invita/elimina members
- Invitee poate self-join în workspace doar dacă are invite valid
- Recipient invite poate citi/șterge propriile invitații

## Cum aplici

1. **Pull** modificările (sau copiază `firebase.js` peste cel vechi)
2. **Firebase Console** → Firestore Database → Rules → paste din `FIRESTORE_RULES.md` → Publish
3. **Refresh** browser (Ctrl+Shift+R pentru bypass cache SW vechi)
4. Login cu Google
5. App-ul îți va crea automat „Workspace Principal" și va sincroniza datele locale (dacă există)

## Test rapid (verificare)

În Chrome DevTools → Console, după login, ar trebui să vezi:
```
☁ Creez workspace-ul tău...   (dacă e prima dată)
```

În Firestore Console ar trebui să apară:
- `workspaces/ws_<timestamp>_<random>` cu un document care te conține în `memberUids`
- Eventual și `workspaces/.../sites/...` și `workspaces/.../entries/...` dacă aveai date locale

## Ce NU e fixat încă (rămâne pentru iterații următoare)

Din review-ul anterior, mai sunt deschise:
- 🔴 XSS prin innerHTML (urgent înainte de a invita pe cineva)
- 🟡 Service Worker — lipsesc `firebase.js` și `i18n.js` din ASSETS, cache cu strategie greșită pentru update-uri
- 🟡 App Check pentru Firebase
- 🟡 Typo `brinnen-tagesbuch` → `brunnen-tagesbuch` (necesită proiect Firebase nou)
- 🟢 `enableIndexedDbPersistence` deprecated, refactor minor cleanup, etc.
