# Fix XSS — v3.2

## Ce s-a schimbat

### 1. Funcție nouă `esc()` în `app.js`

Adăugată după declarațiile de state, înainte de `fmt()`:

```javascript
const _HTML_ESC = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => _HTML_ESC[c]);
}
```

Singura funcție necesară — escape-uiește 5 caractere HTML speciale care acoperă ambele contexte:
- **Content** (`<div>X</div>`) — `<`, `>`, `&`
- **Attribute** (`value="X"`, `onclick="f('X')"`) — `"`, `'`

### 2. Aplicat în 11 locații (toate template literals destinate `innerHTML`)

| Funcție | Câmpuri user-controlled escape-uite |
|---|---|
| `renderWorkspaceUI` | `ws.name`, `wsId` (×2 onclick) |
| `renderMemberList` | `m.name`, `m.email`, `ws.id`, `m.uid` |
| `renderSiteSelector` | `id`, `s.name` |
| `renderSiteList` | `s.name`, `m.label`, `m.serial`, `id` (×2 onclick) |
| `renderMeterEditor` | `m.label`, `m.serial` (în `value="..."`) |
| `renderChartToggles` | `m.key` (×2), `m.label` |
| `renderStats` | `m.label`, `m.serial` |
| `renderTable` (head) | `m.serial` (în `title=`), `m.label` |
| `renderTable` (body) | `e.datum`, `e.uhr`, `e.note` (×2), `eid` (×2 onclick) |
| `renderForm` | `m.label`, `m.serial`, `m.key` (în `id=`) |
| `openEdit` | `m.label`, `m.serial`, `m.key`, valoarea citirii |

### 3. Hardening suplimentar în `renderMemberList`

Câmpul `m.role` era folosit direct ca CSS class. Acum e whitelisted:

```javascript
const safeRole = m.role === 'admin' ? 'admin' : 'member';  // whitelist
```

Asta previne ca un atacator (care ar avea scris pe Firestore prin alte canale) să injecteze `admin"><script>...` ca rol și să scape din atribut.

### 4. Hardening suplimentar în `renderSiteList` și `renderWorkspaceUI`

Conversiile `.length` au fost forțate la `Number(...)` și fallback `|| 0`/`|| 1` mutate înăuntru, ca să previn cazul în care un obiect malițios are un `length` ne-numeric.

## De ce 5 caractere și nu mai multe

Modelul OWASP standard. Pentru contexte HTML (text și atribute), `&<>"'` sunt suficiente. Alte caractere (Unicode, NBSP, etc.) NU trebuie escaped — browser-ul le interpretează ca text obișnuit.

Dacă vrei vreodată să introduci URL-uri sau JavaScript dinamic, ai nevoie de funcții separate (`encodeURIComponent` pentru URL, NICIODATĂ nu inserezi date utilizator în JS-as-code).

## Test rapid

În browser, după pull + reload:

1. Adaugă un șantier cu numele literal: `<img src=x onerror=alert('test')>`
2. **Înainte de fix:** un alert apărea la fiecare render
3. **După fix:** numele apare scris pur și simplu ca text vizibil (nu se execută)

Test similar pentru meter labels, observații, nume workspace.

## Ce am NU am acoperit (intenționat)

### Stringuri `t(...)` din `i18n.js`
Nu sunt escaped — `i18n.js` e controlat de tine (developer), nu input utilizator. Dacă vreodată adaugi sursa de traduceri din altă parte (Crowdin, etc.), va trebui să escape-uiești și acolo.

### Inline event handlers (`onclick="..."`)
Toate butoanele folosesc `onclick="window.func('${id}')"`. Cu `esc(id)`, ghilimelele din id sunt neutralizate, dar pattern-ul rămâne fragil — orice eroare de escape viitoare se poate transforma în XSS. Refactor recomandat: data attributes + `addEventListener`:

```javascript
// Înainte
`<button onclick="window.openSiteEditor('${esc(id)}')">✎</button>`

// După (mai sigur structural)
`<button class="js-edit-site" data-id="${esc(id)}">✎</button>`
// + în init():
document.addEventListener('click', e => {
  const btn = e.target.closest('.js-edit-site');
  if (btn) window.openSiteEditor(btn.dataset.id);
});
```

Beneficii: o singură funcție de delegare, CSP-friendly (poți elimina `'unsafe-inline'`), zero risc de injection chiar dacă cineva uită `esc()`. Recomandat pentru iterația următoare.

### Content Security Policy (CSP)
Layer suplimentar care ar bloca chiar și un XSS reușit (nu poate face fetch la attacker.com, nu poate încărca scripturi externe). Nu l-am adăugat în această iterație pentru că:
- Necesită `'unsafe-inline'` din cauza handler-elor inline existente — diluează beneficiul
- Necesită whitelist pentru toate domeniile Firebase (poate sparge auth flow-ul) — necesită testare
- E mai eficient după refactor-ul de mai sus la addEventListener

Recomandare pentru viitor — adaugă în `<head>` din `index.html`:

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://www.gstatic.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com;
  frame-src https://*.firebaseapp.com https://accounts.google.com;
  object-src 'none';
  base-uri 'self';
">
```

Apoi testează login-ul Google și sincronizarea Firestore — dacă merg, ai un layer de protecție în plus.

## Status după fix-uri #1, #3, #2

| # | Problemă | Status |
|---|---|---|
| 1 | App nu pornea (workspace exports lipsă) | ✅ |
| 2 | XSS prin innerHTML | ✅ ACUM |
| 3 | Service Worker stricat | ✅ |
| 4 | Firestore rules pentru workspace | ✅ (în #1) |
| 5 | Performance Firestore query | ✅ (în #1) |
| 6 | App Check Firebase | ⏳ |
| 7 | Whitelist CSP | ⏳ |
| 8 | Refactor `addEventListener` | ⏳ (recomandat) |
| 9 | Cleanup minor (deprecated APIs, etc.) | ⏳ |
