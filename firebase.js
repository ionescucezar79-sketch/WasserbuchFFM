// firebase.js — v3.2 stable | Workspaces edition
// Multi-user collaboration via workspace-scoped data

// ── SDK imports (ESM CDN) ─────────────────────────────
import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged,
  signInWithPopup, GoogleAuthProvider, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore, enableIndexedDbPersistence,
  collection, doc,
  getDoc, getDocs,
  setDoc, updateDoc, deleteDoc,
  onSnapshot, writeBatch,
  query, where, serverTimestamp,
  arrayUnion
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ─────────────────────────────────────────────────────
// CONFIGURAȚIE — proiectul WasserbuchFFM
// ─────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyD29XvC_MLLmb0RjoLVtxmjZpIrleCVWBA",
  authDomain:        "wasserbuchffm.firebaseapp.com",
  projectId:         "wasserbuchffm",
  storageBucket:     "wasserbuchffm.firebasestorage.app",
  messagingSenderId: "1097596794364",
  appId:             "1:1097596794364:web:c444cd22bb4c18cd93ae79"
};

// ── State ──────────────────────────────────────────
let _app   = null;
let _auth  = null;
let _db    = null;
let _uid   = null;
let _userEmail = null;
let _activeWsId = null;
let _activeWsAdminUid = null;
let _unsubSites   = null;
let _unsubEntries = null;

export let currentUser  = null;
export let isConfigured = false;

function checkConfigured() {
  const k = FIREBASE_CONFIG.apiKey || '';
  return k.length > 0 && !k.startsWith('PUNE_AICI');
}

// ── Init ───────────────────────────────────────────
export async function initFirebase(onUserChange) {
  if (!checkConfigured()) {
    isConfigured = false;
    onUserChange(null);
    return;
  }
  isConfigured = true;

  _app  = initializeApp(FIREBASE_CONFIG);
  _auth = getAuth(_app);
  _db   = getFirestore(_app);

  try {
    await enableIndexedDbPersistence(_db);
  } catch(e) { /* already enabled or multiple tabs */ }

  onAuthStateChanged(_auth, async user => {
    currentUser = user;
    _uid       = user?.uid || null;
    _userEmail = user?.email?.toLowerCase() || null;
    if (!user) {
      _activeWsId = null;
      _activeWsAdminUid = null;
    }
    onUserChange(user);
  });
}

// ── Auth ───────────────────────────────────────────
export async function loginGoogle() {
  const provider = new GoogleAuthProvider();
  await signInWithPopup(_auth, provider);
}

export async function logout() {
  stopListeners();
  _activeWsId = null;
  _activeWsAdminUid = null;
  await signOut(_auth);
}

// ── Firestore path helpers ─────────────────────────
const workspacesCol = ()   => collection(_db, 'workspaces');
const workspaceDoc  = id   => doc(_db, 'workspaces', String(id));
const sitesCol      = ()   => collection(_db, 'workspaces', String(_activeWsId), 'sites');
const entriesCol    = ()   => collection(_db, 'workspaces', String(_activeWsId), 'entries');
const siteDoc       = id   => doc(_db, 'workspaces', String(_activeWsId), 'sites',   String(id));
const entryDoc      = id   => doc(_db, 'workspaces', String(_activeWsId), 'entries', String(id));
const inviteDoc     = email=> doc(_db, 'invites', String(email).toLowerCase());

// ═══════════════════════════════════════════════════
// WORKSPACE MANAGEMENT
// ═══════════════════════════════════════════════════

export function getCurrentWsId() {
  return _activeWsId;
}

export function getIsAdmin() {
  return _uid != null && _activeWsAdminUid === _uid;
}

export async function setActiveWorkspace(wsId) {
  stopListeners();
  _activeWsId = wsId ? String(wsId) : null;
  if (_activeWsId) {
    const ws = await getWorkspace(_activeWsId).catch(() => null);
    _activeWsAdminUid = ws?.adminUid || null;
  } else {
    _activeWsAdminUid = null;
  }
}

export async function getUserWorkspaces() {
  if (!_uid) return [];
  const q = query(workspacesCol(), where('memberUids', 'array-contains', _uid));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getWorkspace(wsId) {
  if (!wsId) return null;
  const snap = await getDoc(workspaceDoc(wsId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function createWorkspace(name) {
  if (!_uid) throw new Error('not_logged_in');
  const wsId = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const me = {
    uid:   _uid,
    email: _userEmail || '',
    name:  currentUser?.displayName || _userEmail || '',
    role:  'admin'
  };
  await setDoc(workspaceDoc(wsId), {
    name:       String(name || 'Workspace').slice(0, 80),
    adminUid:   _uid,
    memberUids: [_uid],
    members:    [me],
    createdAt:  serverTimestamp()
  });
  return wsId;
}

export async function addMemberByEmail(wsId, email) {
  if (!_uid) return { error: 'not_logged_in' };
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { error: 'invalid_email' };
  }
  const ws = await getWorkspace(wsId);
  if (!ws)                                 return { error: 'workspace_not_found' };
  if (ws.adminUid !== _uid)                return { error: 'not_admin' };
  if ((ws.members || []).some(m => (m.email || '').toLowerCase() === cleanEmail)) {
    return { error: 'already_member' };
  }

  const invRef  = inviteDoc(cleanEmail);
  const invSnap = await getDoc(invRef);
  const existing = invSnap.exists() ? (invSnap.data().pending || []) : [];
  if (existing.some(p => p.wsId === wsId)) {
    return { error: 'already_invited' };
  }

  await setDoc(invRef, {
    email:   cleanEmail,
    pending: [...existing, {
      wsId,
      wsName:    ws.name,
      invitedBy: _userEmail || _uid,
      invitedAt: Date.now()
    }]
  });
  return { success: true };
}

export async function removeMember(wsId, uid) {
  if (!_uid) throw new Error('not_logged_in');
  const ws = await getWorkspace(wsId);
  if (!ws) throw new Error('workspace_not_found');
  if (ws.adminUid !== _uid && uid !== _uid) {
    throw new Error('not_admin');
  }
  if (uid === ws.adminUid) {
    throw new Error('cannot_remove_owner');
  }
  const newMembers    = (ws.members    || []).filter(m => m.uid !== uid);
  const newMemberUids = (ws.memberUids || []).filter(u => u    !== uid);
  await updateDoc(workspaceDoc(wsId), {
    members:    newMembers,
    memberUids: newMemberUids
  });
}

export async function checkAndAcceptInvites() {
  if (!_uid || !_userEmail) return [];
  const invRef = inviteDoc(_userEmail);
  const snap   = await getDoc(invRef);
  if (!snap.exists()) return [];

  const pending = snap.data().pending || [];
  if (!pending.length) return [];

  const accepted = [];
  for (const p of pending) {
    try {
      const wsRef  = workspaceDoc(p.wsId);
      const wsSnap = await getDoc(wsRef);
      if (!wsSnap.exists()) continue;
      const ws = wsSnap.data();
      if ((ws.memberUids || []).includes(_uid)) continue;
      const newMember = {
        uid:   _uid,
        email: _userEmail,
        name:  currentUser?.displayName || _userEmail,
        role:  'member'
      };
      await updateDoc(wsRef, {
        memberUids: arrayUnion(_uid),
        members:    arrayUnion(newMember)
      });
      accepted.push(p.wsName || p.wsId);
    } catch(e) {
      console.error('Invite accept error:', e);
    }
  }
  await deleteDoc(invRef).catch(() => {});
  return accepted;
}

// ═══════════════════════════════════════════════════
// REAL-TIME LISTENERS
// ═══════════════════════════════════════════════════

export function listenSites(callback) {
  if (!_activeWsId) return;
  _unsubSites?.();
  _unsubSites = onSnapshot(sitesCol(), snap => {
    const sites = snap.docs.map(d => ({ ...d.data(), _fid: d.id }));
    callback(sites);
  });
}

export function listenEntries(siteId, callback) {
  if (!_activeWsId) return;
  stopEntryListener();
  const q = query(entriesCol(), where('siteId', '==', String(siteId)));
  _unsubEntries = onSnapshot(q, snap => {
    const entries = snap.docs
      .map(d => ({ ...d.data(), _fid: d.id }))
      .sort((a, b) => (a.ts || 0) - (b.ts || 0));
    callback(entries);
  });
}

function stopListeners() {
  _unsubSites?.();
  _unsubEntries?.();
  _unsubSites   = null;
  _unsubEntries = null;
}

export function stopEntryListener() {
  _unsubEntries?.();
  _unsubEntries = null;
}

// ═══════════════════════════════════════════════════
// WRITE OPERATIONS (workspace-scoped)
// ═══════════════════════════════════════════════════

export async function fsSaveSite(site) {
  if (!_activeWsId) return;
  const id = String(site.id || site._fid || Date.now());
  await setDoc(siteDoc(id), sanitize({ ...site, id }));
}

export async function fsDeleteSite(siteId) {
  if (!_activeWsId) return;
  const id    = String(siteId);
  const batch = writeBatch(_db);
  const q     = query(entriesCol(), where('siteId', '==', id));
  const snap  = await getDocs(q);
  snap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(siteDoc(id));
  await batch.commit();
}

export async function fsSaveEntry(entry) {
  if (!_activeWsId) return;
  const id = String(entry.id || entry._fid || Date.now());
  await setDoc(entryDoc(id), sanitize({
    ...entry,
    id,
    siteId: String(entry.siteId)
  }));
}

export async function fsDeleteEntry(entryId) {
  if (!_activeWsId) return;
  await deleteDoc(entryDoc(entryId));
}

export async function uploadLocalData(localSites, localEntriesFn) {
  if (!_activeWsId || !localSites.length) return 0;
  const batch = writeBatch(_db);
  let count = 0;
  for (const site of localSites) {
    const sid = String(site.id);
    batch.set(siteDoc(sid), sanitize({ ...site, id: sid }));
    const entries = await localEntriesFn(site.id);
    for (const e of entries) {
      const eid = String(e.id);
      batch.set(entryDoc(eid), sanitize({
        ...e,
        id: eid,
        siteId: sid
      }));
      count++;
    }
  }
  await batch.commit();
  return count;
}

// ── Helpers ────────────────────────────────────────
function sanitize(obj) {
  return JSON.parse(JSON.stringify(obj, (_, v) => v === undefined ? null : v));
}
