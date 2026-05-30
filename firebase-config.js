// ═══════════════════════════════════════════════════════════════
//  CONFIGURARE FIREBASE — SINGURUL FIȘIER PE CARE TREBUIE SĂ-L EDITEZI
// ═══════════════════════════════════════════════════════════════
//
//  Înlocuiește valorile de mai jos cu cele din proiectul tău Firebase.
//  Le găsești în: Firebase Console → ⚙ Project Settings → Your apps →
//  secțiunea "SDK setup and configuration" → opțiunea "Config".
//
//  Copiază DOAR valorile dintre ghilimele (nu schimba numele cheilor).
//
//  ─────────────────────────────────────────────────────────────
//  ⚠ DACĂ NU COMPLETEZI = aplicația merge LOCAL (IndexedDB), fără cloud.
//     Asta e perfect valid — cloud-ul e opțional.
//  ─────────────────────────────────────────────────────────────

export const FIREBASE_CONFIG = {
  apiKey:            "PUNE_AICI_apiKey",
  authDomain:        "PUNE_AICI_authDomain",        // ex: proiectul-tau.firebaseapp.com
  projectId:         "PUNE_AICI_projectId",         // ex: proiectul-tau
  storageBucket:     "PUNE_AICI_storageBucket",     // ex: proiectul-tau.firebasestorage.app
  messagingSenderId: "PUNE_AICI_messagingSenderId",
  appId:             "PUNE_AICI_appId",
  // measurementId e opțional — lasă-l doar dacă ai activat Analytics:
  // measurementId:  "PUNE_AICI_measurementId",
};
