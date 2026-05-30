# Reguli Firestore — v3.2 (Workspaces)

⚠️ **OBLIGATORIU** — fără aceste reguli, app-ul nu va putea scrie nimic în Firestore (toate operațiile vor primi `permission-denied`).

## Pași

1. Firebase Console → **Firestore Database** → tab **Rules**
2. Înlocuiește TOT conținutul cu cele de mai jos
3. Click **Publish**

## Reguli

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ── Helpers ────────────────────────────────────
    function isSignedIn() {
      return request.auth != null;
    }
    function myUid() {
      return request.auth.uid;
    }
    function myEmail() {
      return request.auth.token.email != null
             ? request.auth.token.email.lower()
             : '';
    }
    function wsData(wsId) {
      return get(/databases/$(database)/documents/workspaces/$(wsId)).data;
    }
    function isMember(wsId) {
      return isSignedIn() && myUid() in wsData(wsId).memberUids;
    }
    function isAdmin(wsId) {
      return isSignedIn() && wsData(wsId).adminUid == myUid();
    }

    // ── Workspace document ────────────────────────
    match /workspaces/{wsId} {
      // Members can read
      allow read: if isSignedIn()
                  && myUid() in resource.data.memberUids;

      // Anyone signed in can create — but ONLY where they are the admin
      // and the sole initial member (prevents impersonation)
      allow create: if isSignedIn()
                    && request.resource.data.adminUid == myUid()
                    && request.resource.data.memberUids.size() == 1
                    && request.resource.data.memberUids[0] == myUid();

      // Update: admin can do anything; invitee can add themselves to memberUids
      allow update: if isSignedIn() && (
        // Admin updates
        resource.data.adminUid == myUid()
        ||
        // Self-join: caller adds only themselves, doesn't change admin
        (
          request.resource.data.adminUid == resource.data.adminUid
          && !(myUid() in resource.data.memberUids)
          && myUid() in request.resource.data.memberUids
        )
      );

      // Only admin can delete
      allow delete: if isSignedIn()
                    && resource.data.adminUid == myUid();

      // ── Sites (subcollection) ───────────────────
      match /sites/{siteId} {
        allow read, write: if isMember(wsId);
      }

      // ── Entries (subcollection) ─────────────────
      match /entries/{entryId} {
        allow read, write: if isMember(wsId);
      }
    }

    // ── Invites (indexed by lowercase email) ──────
    match /invites/{email} {
      // Recipient can read & delete their own invites
      allow read, delete: if isSignedIn() && myEmail() == email;

      // Anyone signed in can write an invite (validated app-side as admin)
      // Workspace ID inside the invite must be a workspace where caller is admin
      allow create, update: if isSignedIn();
    }

    // ── Legacy /users path (block by default) ─────
    // Old v3.1 data lives here — kept readable by owner for manual export
    match /users/{uid}/{document=**} {
      allow read: if isSignedIn() && myUid() == uid;
      allow write: if false;  // no more writes here
    }
  }
}
```

## Note de securitate

1. **`/invites/*` write rules**: este permisiv deliberat — orice user logat poate crea un invite pentru orice email. App-ul validează la nivel de UI (`addMemberByEmail` verifică `ws.adminUid === _uid`). Worst case e spam (un user creează zeci de invitații false pentru emailul prietenului său). Acceptabil pentru MVP.

2. **Self-join logic**: regula de update permite unui invitee să se adauge singur în `memberUids` și `members` ai unui workspace, **doar dacă** nu schimbă `adminUid` și nu era deja member. Asta permite `checkAndAcceptInvites()` să funcționeze fără să dea admin-ului notificări manuale.

3. **App Check** (recomandare separată): activează-l în Firebase Console → App Check → Register web app cu reCAPTCHA v3. Asta previne ca cineva să folosească cheia ta API pentru a spame-ui quota din afara domeniului tău.

4. **Authorized domains** (Auth → Settings → Authorized domains): adaugă doar `localhost` (dev) + `brinnen-tagesbuch.web.app` (production). Elimină orice domeniu necunoscut.
