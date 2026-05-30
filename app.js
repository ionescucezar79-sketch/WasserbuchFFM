// app.js — v3.2 stable
import {
  getAllSites, getSite, saveSite, deleteSite,
  getEntriesBySite, addEntry, updateEntry, deleteEntry,
  deleteEntriesBySite, clearAllEntries, migrateFromLocalStorage
} from './db.js';
import { renderLineChart, renderBarChart } from './charts.js';
import { t, getLang, setLang } from './i18n.js';
import {
  initFirebase, loginGoogle, logout, uploadLocalData,
  listenSites, listenEntries, stopEntryListener,
  fsSaveSite, fsDeleteSite, fsSaveEntry, fsDeleteEntry,
  currentUser, isConfigured,
  getUserWorkspaces, createWorkspace, setActiveWorkspace,
  addMemberByEmail, removeMember, checkAndAcceptInvites,
  getWorkspace, getIsAdmin, getCurrentWsId
} from './firebase.js';

// ── State ──────────────────────────────────────────
let sites        = [];
let activeSiteId = null;
let entries      = [];
let activePage   = 'dashboard';
let activeBrunnen= [];
let filterFrom   = '', filterTo = '';
let deferredInstallPrompt = null;
let editingEntry = null;
let editingSite  = null;
let siteMeters   = [];
let fbMode       = false;
let workspaces   = [];
let activeWs     = null;

const COLORS = ['#185FA5','#3B6D11','#A32D2D','#7B4FA6','#C27A1A','#C2671A','#1AA5A5','#A51A85'];

// ── Boot ───────────────────────────────────────────
async function init() {
  try {
    applyLang();
    setDate();
    setDefaultTime();

    const migrated = await migrateFromLocalStorage();
    if (migrated > 0) showToast(t('toast_migrated', migrated));

    await initFirebase(onAuthChange);

    if (!isConfigured) {
      hideAuthUI();
      await loadLocal();
    }

    if ('serviceWorker' in navigator)
      navigator.serviceWorker.register('/sw.js').catch(() => {});

    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      deferredInstallPrompt = e;
      document.getElementById('install-banner')?.classList.add('visible');
    });
  } catch(err) {
    console.error('Init error:', err);
    // Fallback to local mode on any error
    hideAuthUI();
    await loadLocal();
  }
}

// ── Auth ───────────────────────────────────────────
async function onAuthChange(user) {
  try {
    updateAuthUI(user);
    if (user) {
      fbMode = true;
      const accepted = await checkAndAcceptInvites().catch(() => []);
      if (accepted.length) showToast(t('ws_accepted', accepted.join(', ')));
      await loadWorkspaces();
    } else {
      fbMode = false;
      workspaces = []; activeWs = null;
      stopEntryListener();
      renderWorkspaceUI();
      await loadLocal();
    }
  } catch(err) {
    console.error('Auth change error:', err);
    fbMode = false;
    await loadLocal();
  }
}

function hideAuthUI() {
  document.getElementById('auth-section')?.style && (document.getElementById('auth-section').style.display = 'none');
  document.getElementById('cloud-status')?.style && (document.getElementById('cloud-status').style.display = 'none');
}

function updateAuthUI(user) {
  const loginBtn  = document.getElementById('btn-login');
  const logoutBtn = document.getElementById('btn-logout');
  const userInfo  = document.getElementById('user-info');
  const cloudDot  = document.getElementById('cloud-dot');
  const cloudLbl  = document.getElementById('cloud-label');
  const wsCard    = document.getElementById('ws-card');

  if (user) {
    if (loginBtn)  loginBtn.style.display  = 'none';
    if (logoutBtn) logoutBtn.style.display = '';
    if (userInfo)  { userInfo.textContent = user.email; userInfo.style.display = ''; }
    if (cloudDot)  cloudDot.className = 'sync-dot online';
    if (cloudLbl)  { cloudLbl.textContent = '☁ Cloud'; cloudLbl.style.display = ''; }
    if (wsCard)    wsCard.style.display = '';
  } else {
    if (loginBtn)  loginBtn.style.display  = '';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (userInfo)  userInfo.style.display  = 'none';
    if (cloudDot)  cloudDot.className = 'sync-dot';
    if (cloudLbl)  cloudLbl.style.display  = 'none';
    if (wsCard)    wsCard.style.display = 'none';
  }
}

function showSyncing(active) {
  const dot = document.getElementById('cloud-dot');
  if (dot) dot.className = active ? 'sync-dot syncing' : 'sync-dot online';
}

// ── Workspace ──────────────────────────────────────
async function loadWorkspaces() {
  try {
    workspaces = await getUserWorkspaces();
    if (!workspaces.length) {
      showToast('☁ Creez workspace-ul tău...');
      const wsId = await createWorkspace('Workspace Principal');
      await setActiveWorkspace(wsId);
      activeWs = await getWorkspace(wsId);
      workspaces = [activeWs];
      await syncLocalToCloud();
    } else {
      const savedWsId = localStorage.getItem('brunnen-active-ws');
      const ws = workspaces.find(w => w.id === savedWsId) || workspaces[0];
      await setActiveWorkspace(ws.id);
      activeWs = ws;
    }
    renderWorkspaceUI();
    startCloudListeners();
  } catch(err) {
    console.error('loadWorkspaces error:', err);
    await loadLocal();
  }
}

async function syncLocalToCloud() {
  const localSites = await getAllSites();
  if (!localSites.length) return;
  showSyncing(true);
  try {
    const n = await uploadLocalData(localSites, getEntriesBySite);
    if (n > 0) showToast(`☁ ${n} înregistrări sincronizate!`);
  } catch(e) { console.error('Sync error', e); }
  showSyncing(false);
}

function startCloudListeners() {
  try {
    listenSites(cloudSites => {
      sites = cloudSites;
      renderSiteSelector();
      renderSiteList();
      if (!activeSiteId && sites.length) {
        const id = sites[0].id || sites[0]._fid;
        selectSiteById(id);
      }
      renderAll();
    });
    if (activeSiteId) {
      listenEntries(activeSiteId, cloudEntries => {
        entries = sortEntries(cloudEntries);
        renderAll();
      });
    }
  } catch(err) {
    console.error('Cloud listeners error:', err);
  }
}

function renderWorkspaceUI() {
  const el = document.getElementById('ws-selector-wrap');
  if (!el) return;
  if (!workspaces.length) {
    el.innerHTML = `<div class="empty-block">${t('ws_no_ws')}</div>`;
    return;
  }
  el.innerHTML = workspaces.map(ws => {
    const wsId    = ws.id || ws._fid;
    const isActive = wsId === getCurrentWsId();
    const isMine  = ws.adminUid === currentUser?.uid;
    return `<div class="ws-card ${isActive ? 'active' : ''}">
      <div class="ws-card-info">
        <div class="ws-card-name">${esc(ws.name)}
          ${isActive ? `<span class="ws-active-badge">${t('ws_active')}</span>` : ''}
        </div>
        <div class="ws-card-meta">
          ${Number(ws.members?.length) || 1} ${getLang()==='de'?'Mitglieder':'membri'}
          · ${isMine ? t('ws_role_admin') : t('ws_role_member')}
        </div>
      </div>
      <div class="ws-card-actions">
        ${!isActive ? `<button class="small" onclick="window.switchWorkspace('${esc(wsId)}')">${t('ws_switch')}</button>` : ''}
        ${isMine   ? `<button class="small primary" onclick="window.openWsAdmin('${esc(wsId)}')">⚙ Admin</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

window.switchWorkspace = async function(wsId) {
  localStorage.setItem('brunnen-active-ws', wsId);
  await setActiveWorkspace(wsId);
  activeWs = workspaces.find(w => (w.id||w._fid) === wsId);
  sites = []; entries = []; activeSiteId = null;
  renderWorkspaceUI();
  renderSiteSelector();
  renderAll();
  startCloudListeners();
};

// ── Workspace Admin ────────────────────────────────
window.openWsAdmin = async function(wsId) {
  try {
    const ws = await getWorkspace(wsId);
    if (!ws) return;
    document.getElementById('ws-admin-title').textContent = ws.name;
    document.getElementById('ws-admin-id').value = wsId;
    renderMemberList(ws);
    document.getElementById('ws-admin-modal').classList.add('open');
  } catch(e) { console.error(e); }
};

window.closeWsAdmin = () =>
  document.getElementById('ws-admin-modal')?.classList.remove('open');

function renderMemberList(ws) {
  const el = document.getElementById('ws-member-list');
  if (!el || !ws.members?.length) { if(el) el.innerHTML=''; return; }
  el.innerHTML = ws.members.map(m => {
    const safeRole = m.role === 'admin' ? 'admin' : 'member';  // whitelist
    return `
    <div class="member-row">
      <div class="member-info">
        <div class="member-name">${esc(m.name || m.email)}</div>
        <div class="member-email">${esc(m.email)}
          <span class="member-role ${safeRole}">${safeRole==='admin'?t('ws_role_admin'):t('ws_role_member')}</span>
        </div>
      </div>
      ${m.uid !== ws.adminUid
        ? `<button class="small danger" onclick="window.doRemoveMember('${esc(ws.id)}','${esc(m.uid)}')">${t('ws_remove')}</button>`
        : '<span style="font-size:11px;color:var(--muted)">owner</span>'}
    </div>`;
  }).join('');
}

window.doInviteMember = async function() {
  const wsId  = document.getElementById('ws-admin-id').value;
  const email = document.getElementById('ws-invite-email').value.trim();
  if (!email) return;
  showSyncing(true);
  const result = await addMemberByEmail(wsId, email).catch(e => ({ error: e.message }));
  showSyncing(false);
  if (result.success) {
    document.getElementById('ws-invite-email').value = '';
    showToast(t('ws_invite_sent'));
  } else if (result.error === 'already_member') {
    showToast('⚠ ' + t('ws_invite_error_exists'));
  } else {
    showToast('⚠ ' + result.error);
  }
};

window.doRemoveMember = async function(wsId, uid) {
  if (!confirm(t('ws_remove') + '?')) return;
  showSyncing(true);
  await removeMember(wsId, uid).catch(console.error);
  const ws = await getWorkspace(wsId).catch(() => null);
  if (ws) renderMemberList(ws);
  await loadWorkspaces();
  renderWorkspaceUI();
  showSyncing(false);
  showToast(t('ws_removed'));
};

window.doCreateWorkspace = async function() {
  const name = document.getElementById('new-ws-name')?.value.trim();
  if (!name) return;
  showSyncing(true);
  await createWorkspace(name).catch(console.error);
  await loadWorkspaces();
  renderWorkspaceUI();
  if (document.getElementById('new-ws-name')) document.getElementById('new-ws-name').value = '';
  if (document.getElementById('new-ws-form')) document.getElementById('new-ws-form').style.display = 'none';
  showSyncing(false);
  showToast(t('ws_created'));
};

window.toggleNewWsForm = () => {
  const f = document.getElementById('new-ws-form');
  if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
};

// ── Auth actions ───────────────────────────────────
window.doLogin = async function() {
  try { await loginGoogle(); }
  catch(e) { showToast('⚠ Login eșuat: ' + e.message); }
};

window.doLogout = async function() {
  await logout().catch(console.error);
  showToast(getLang()==='de' ? 'Erfolgreich abgemeldet.' : 'Deconectat cu succes.');
};

// ── Language ───────────────────────────────────────
function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key  = el.getAttribute('data-i18n');
    const attr = el.getAttribute('data-i18n-attr');
    if (attr) el.setAttribute(attr, t(key));
    else el.textContent = t(key);
  });
  document.querySelectorAll('.lang-btn,.lang-choice-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.lang === getLang()));
}

window.switchLang = lang => { setLang(lang); renderAll(); };

// ── Local mode ─────────────────────────────────────
async function loadLocal() {
  try {
    sites = await getAllSites();
    if (sites.length) await selectSite(sites[0].id);
    renderSiteSelector();
    renderSiteList();
    renderAll();
  } catch(e) { console.error('loadLocal error:', e); }
}

// ── Site selector ──────────────────────────────────
function renderSiteSelector() {
  const sel = document.getElementById('site-selector');
  if (!sel) return;
  if (!sites.length) {
    sel.innerHTML = `<option value="">${t('empty_sites')}</option>`; return;
  }
  sel.innerHTML = sites.map(s => {
    const id = s.id || s._fid;
    return `<option value="${esc(id)}" ${id == activeSiteId ? 'selected':''}>${esc(s.name)}</option>`;
  }).join('');
}

window.onSiteChange = async function() {
  const id = document.getElementById('site-selector').value;
  await selectSiteById(id);
  renderAll();
};

async function selectSiteById(id) {
  activeSiteId = isNaN(id) ? id : Number(id);
  const site   = sites.find(s => (s.id||s._fid) == id);
  if (!site) return;
  activeBrunnen = site.meters.map(m => m.key);
  renderChartToggles(site);
  if (fbMode) {
    listenEntries(id, cloudEntries => {
      entries = sortEntries(cloudEntries);
      renderAll();
    });
  } else {
    entries = sortEntries(await getEntriesBySite(activeSiteId));
  }
}

async function selectSite(id) { await selectSiteById(id); }

function currentSite() {
  return sites.find(s => (s.id||s._fid) == activeSiteId);
}

function sortEntries(arr) {
  return [...arr].sort((a,b) => {
    const toK = d => { if(!d||!d.includes('.')) return ''; const p=d.split('.'); return p[2]+p[1]+p[0]; };
    return toK(a.datum).localeCompare(toK(b.datum)) || (a.ts||0)-(b.ts||0);
  });
}

// ── Site list ──────────────────────────────────────
function renderSiteList() {
  const el = document.getElementById('site-list');
  if (!el) return;
  if (!sites.length) { el.innerHTML = `<div class="empty-block">${t('empty_sites')}</div>`; return; }
  el.innerHTML = sites.map(s => {
    const id = s.id||s._fid;
    return `<div class="site-card">
      <div class="site-card-info">
        <div class="site-card-name">${esc(s.name)}</div>
        <div class="site-card-meta">
          ${Number(s.meters?.length) || 0} ${getLang()==='de'?'Wasserzähler':'apometre'}
          ${(s.meters||[]).map(m=>`<span class="meter-tag">${esc(m.label)}${m.serial?` <span class="serial">${esc(m.serial)}</span>`:''}</span>`).join('')}
        </div>
      </div>
      <div class="site-card-actions">
        <button class="small" onclick="window.openSiteEditor('${esc(id)}')">✎</button>
        <button class="small danger" onclick="window.deleteSiteConfirm('${esc(id)}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

// ── Site editor ────────────────────────────────────
window.openSiteEditor = async function(id) {
  if (id && id !== 'null') {
    editingSite = sites.find(s => (s.id||s._fid) == id);
    siteMeters  = JSON.parse(JSON.stringify(editingSite?.meters || []));
    document.getElementById('se-name').value = editingSite?.name || '';
    document.getElementById('site-editor-title').textContent = t('title_edit_site');
    document.getElementById('se-delete-btn').style.display = '';
  } else {
    editingSite = null; siteMeters = [];
    document.getElementById('se-name').value = '';
    document.getElementById('site-editor-title').textContent = t('title_new_site');
    document.getElementById('se-delete-btn').style.display = 'none';
  }
  renderMeterEditor();
  document.getElementById('site-editor-modal').classList.add('open');
};

window.closeSiteEditor = () =>
  document.getElementById('site-editor-modal')?.classList.remove('open');

function renderMeterEditor() {
  const el = document.getElementById('meter-editor-list');
  if (!el) return;
  if (!siteMeters.length) { el.innerHTML = `<div class="empty-block" style="padding:.75rem">${t('no_meters')}</div>`; return; }
  el.innerHTML = siteMeters.map((m,i) => `
    <div class="meter-row">
      <div class="meter-inputs">
        <div class="form-group">
          <label>${t('label_meter_label')}</label>
          <input type="text" value="${esc(m.label)}" onchange="window.updateMeter(${i},'label',this.value)" placeholder="ex: Br.20">
        </div>
        <div class="form-group">
          <label>${t('label_meter_serial')}</label>
          <input type="text" value="${esc(m.serial||'')}" onchange="window.updateMeter(${i},'serial',this.value)" placeholder="ex: WZ-12345">
        </div>
      </div>
      <button class="icon-btn danger-icon" onclick="window.removeMeter(${i})">✕</button>
    </div>`).join('');
}

window.updateMeter = (i,f,v) => { siteMeters[i][f]=v; };
window.addMeter    = () => { siteMeters.push({key:'m_'+Date.now(),label:'',serial:''}); renderMeterEditor(); };
window.removeMeter = i  => { siteMeters.splice(i,1); renderMeterEditor(); };

window.saveSiteEditor = async function() {
  const name = document.getElementById('se-name').value.trim();
  if (!name) { showToast('⚠ ' + t('label_site_name') + '!'); return; }
  const meters = siteMeters.map(m => ({
    key: m.key||'m_'+Date.now()+Math.random(), label:m.label||'?', serial:m.serial||''
  }));
  const site = { name, meters };
  if (editingSite) site.id = editingSite.id||editingSite._fid;
  showSyncing(true);
  try {
    if (fbMode) {
      site.id = site.id || Date.now();
      await fsSaveSite(site);
    } else {
      await saveSite(site);
      sites = await getAllSites();
      renderSiteSelector(); renderSiteList(); renderAll();
    }
  } catch(e) { console.error(e); showToast('⚠ Eroare salvare!'); }
  showSyncing(false);
  closeSiteEditor();
  showToast(t('toast_site_saved'));
};

window.deleteSiteConfirm = async function(id) {
  if (!confirm(t('confirm_site'))) return;
  showSyncing(true);
  try {
    if (fbMode) {
      await fsDeleteSite(id);
    } else {
      await deleteEntriesBySite(Number(id));
      await deleteSite(Number(id));
      sites = await getAllSites();
      if (sites.length) await selectSite(sites[0].id);
      else { activeSiteId=null; entries=[]; activeBrunnen=[]; }
      renderSiteSelector(); renderSiteList(); renderAll();
    }
  } catch(e) { console.error(e); }
  showSyncing(false);
  showToast(t('toast_site_deleted'));
};

// ── Chart toggles ──────────────────────────────────
function renderChartToggles(site) {
  const el = document.getElementById('brunnen-toggle');
  if (!el || !site?.meters.length) { if(el) el.innerHTML=''; return; }
  el.innerHTML = site.meters.map((m,i) =>
    `<button class="br-chip on" data-br="${esc(m.key)}" onclick="window.toggleBrunnen('${esc(m.key)}')"
      style="--chip-color:${COLORS[i%COLORS.length]}">${esc(m.label)}</button>`
  ).join('');
}

window.toggleBrunnen = function(key) {
  const chip = document.querySelector(`.br-chip[data-br="${key}"]`);
  if (activeBrunnen.includes(key)) {
    if (activeBrunnen.length===1) return;
    activeBrunnen = activeBrunnen.filter(k=>k!==key);
    chip?.classList.remove('on');
  } else {
    activeBrunnen.push(key);
    chip?.classList.add('on');
  }
  renderCharts();
};

// ── Render ─────────────────────────────────────────
function renderAll() {
  applyLang();
  updateEntryCount();
  renderStats();
  renderTable();
  renderCharts();
  renderForm();
}

function filteredEntries() {
  if (!filterFrom && !filterTo) return entries;
  return entries.filter(e => {
    const p=e.datum.split('.');
    if(p.length<3) return true;
    const d=`${p[2]}-${p[1]}-${p[0]}`;
    return (!filterFrom||d>=filterFrom)&&(!filterTo||d<=filterTo);
  });
}

// ── Security: escape user input for safe HTML interpolation ──
// Used everywhere we inject untrusted data (site names, meter labels,
// notes, workspace names, member emails) into innerHTML templates.
// Handles both content context (<div>X</div>) and attribute context
// (<input value="X"> / onclick="f('X')") with the same 5-char escape set.
const _HTML_ESC = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => _HTML_ESC[c]);
}

function fmt(v) {
  if(v===''||v===null||v===undefined) return '—';
  const n=Number(v); return isNaN(n)?String(v):n.toLocaleString('de-DE');
}

function diffCell(val,prev) {
  if(val===''||val===null||prev===null||prev===''||prev===undefined) return '<td class="d-neu">—</td>';
  const d=Number(val)-Number(prev);
  if(isNaN(d)) return '<td>—</td>';
  const cls=d>0?'d-pos':d<0?'d-neg':'d-neu';
  return `<td class="${cls}">${d>0?'+':''}${d.toLocaleString('de-DE')}</td>`;
}

function renderStats() {
  const container=document.getElementById('stats-grid'), site=currentSite();
  if(!container) return;
  if(!entries.length||!site){container.style.display='none';return;}
  container.style.display='grid';
  const last=entries[entries.length-1], prev=entries.length>1?entries[entries.length-2]:null;
  container.innerHTML=site.meters.map(m=>{
    const v=last.readings?.[m.key], p=prev?.readings?.[m.key];
    let dh='';
    if(v!=null&&v!==''&&p!=null&&p!==''){
      const d=Number(v)-Number(p);
      if(!isNaN(d)){const cls=d>0?'d-pos':d<0?'d-neg':'d-neu';
        dh=`<div class="stat-diff ${cls}">${d>0?'+':''}${d.toLocaleString('de-DE')} <span style="font-size:10px;opacity:.7">${t('stat_vs_prev')}</span></div>`;}
    }
    return `<div class="stat-card">
      <div class="stat-label">${esc(m.label)}${m.serial?`<span class="stat-serial"> · ${esc(m.serial)}</span>`:''}</div>
      <div class="stat-val">${fmt(v)}</div>${dh}</div>`;
  }).join('');
}

function renderTable() {
  const site=currentSite();
  const body=document.getElementById('entries-body');
  const head=document.getElementById('entries-head');
  if(!body||!head) return;
  if(!site){
    head.innerHTML='';
    body.innerHTML=`<tr><td colspan="4" class="empty">${t('no_site_selected')}</td></tr>`;return;}
  head.innerHTML=`
    <th>${t('th_datum')}</th><th>${t('th_uhr')}</th>
    ${site.meters.map(m=>`<th title="${esc(m.serial||'')}">${esc(m.label)}</th><th>Δ</th>`).join('')}
    <th>${t('th_note')}</th><th></th>`;
  const fe=filteredEntries();
  if(!fe.length){
    body.innerHTML=`<tr><td colspan="${4+site.meters.length*2}" class="empty">${t('empty')}</td></tr>`;return;}
  const sorted=[...fe].reverse();
  body.innerHTML=sorted.map(e=>{
    const origIdx=entries.findIndex(x=>x.id===e.id||x._fid===e._fid);
    const prev=origIdx>0?entries[origIdx-1]:null;
    const meters=site.meters.map(m=>{const v=e.readings?.[m.key],p=prev?.readings?.[m.key];return`<td>${fmt(v)}</td>${diffCell(v,p)}`;}).join('');
    const eid=e.id||e._fid;
    return `<tr>
      <td>${esc(e.datum)}</td><td>${esc(e.uhr||'—')}</td>${meters}
      <td class="note-cell" title="${esc(e.note||'')}">${esc(e.note||'')}</td>
      <td class="action-cell">
        <button class="edit-btn" onclick="window.openEdit('${esc(eid)}')">✎</button>
        <button class="del-btn"  onclick="window.delEntry('${esc(eid)}')">✕</button>
      </td></tr>`;
  }).join('');
}

function renderCharts() {
  if(activePage!=='charts') return;
  const site=currentSite();
  if(!site||!entries.length) return;
  const fe=filteredEntries();
  if(!fe.length) return;
  try {
    renderLineChart(fe, activeBrunnen, site.meters);
    renderBarChart(fe,  activeBrunnen, site.meters);
  } catch(e) { console.error('Chart error:', e); }
}

function renderForm() {
  const site=currentSite();
  const container=document.getElementById('meter-inputs-form');
  if(!container) return;
  if(!site||!site.meters.length){
    container.innerHTML=`<div class="empty-block">${t('no_site_selected')}</div>`;return;}
  container.innerHTML=site.meters.map(m=>`
    <div class="form-group">
      <label>${esc(m.label)}${m.serial?`<span class="serial-hint"> · ${esc(m.serial)}</span>`:''}</label>
      <input type="number" id="fi-${esc(m.key)}" placeholder="—" inputmode="numeric">
    </div>`).join('');
}

function updateEntryCount(){
  const el=document.getElementById('entry-count');
  if(el) el.textContent=t('entries_count',entries.length);
}

// ── Save entry ─────────────────────────────────────
window.saveEntry = async function() {
  const site=currentSite();
  if(!site){showToast(t('toast_select_site'));return;}
  const readings={};let hasValue=false;
  for(const m of site.meters){
    const val=document.getElementById('fi-'+m.key)?.value||'';
    readings[m.key]=val; if(val!=='')hasValue=true;
  }
  if(!hasValue){showToast(t('toast_no_value'));return;}
  const entry={
    siteId:activeSiteId,
    datum: isoToDE(document.getElementById('f-datum').value),
    uhr:   document.getElementById('f-uhr').value,
    note:  document.getElementById('f-note').value.trim(),
    readings, ts:Date.now()
  };
  showSyncing(true);
  try {
    if(fbMode){entry.id=Date.now();await fsSaveEntry(entry);}
    else{await addEntry(entry);entries=sortEntries(await getEntriesBySite(activeSiteId));renderAll();}
  } catch(e){console.error(e);showToast('⚠ Eroare salvare!');}
  showSyncing(false);
  clearForm();showToast(t('toast_saved'));
};

// ── Edit entry ─────────────────────────────────────
window.openEdit = function(eid) {
  const site=currentSite();
  editingEntry=entries.find(e=>(e.id==eid||e._fid==eid));
  if(!editingEntry||!site) return;
  document.getElementById('e-datum').value=deToISO(editingEntry.datum);
  document.getElementById('e-uhr').value=editingEntry.uhr||'';
  document.getElementById('e-note-edit').value=editingEntry.note||'';
  const el=document.getElementById('edit-meter-inputs');
  if(el) el.innerHTML=site.meters.map(m=>`
    <div class="form-group">
      <label>${esc(m.label)}${m.serial?`<span class="serial-hint"> · ${esc(m.serial)}</span>`:''}</label>
      <input type="number" id="ei-${esc(m.key)}" value="${esc(editingEntry.readings?.[m.key]||'')}" placeholder="—" inputmode="numeric">
    </div>`).join('');
  document.getElementById('edit-modal').classList.add('open');
};

window.closeEdit=()=>{document.getElementById('edit-modal')?.classList.remove('open');editingEntry=null;};

window.saveEdit=async function(){
  const site=currentSite();
  if(!editingEntry||!site) return;
  const readings={};
  for(const m of site.meters) readings[m.key]=document.getElementById('ei-'+m.key)?.value||'';
  const updated={...editingEntry,
    datum:isoToDE(document.getElementById('e-datum').value),
    uhr:document.getElementById('e-uhr').value,
    note:document.getElementById('e-note-edit').value.trim(),readings};
  showSyncing(true);
  try {
    if(fbMode){await fsSaveEntry(updated);}
    else{await updateEntry(updated);entries=sortEntries(await getEntriesBySite(activeSiteId));renderAll();}
  } catch(e){console.error(e);}
  showSyncing(false);
  window.closeEdit();showToast(t('toast_updated'));
};

// ── Delete ─────────────────────────────────────────
window.delEntry=async function(eid){
  if(!confirm(t('confirm_delete')))return;
  showSyncing(true);
  try {
    if(fbMode){await fsDeleteEntry(eid);}
    else{await deleteEntry(Number(eid));entries=sortEntries(await getEntriesBySite(activeSiteId));renderAll();}
  } catch(e){console.error(e);}
  showSyncing(false);
  showToast(t('toast_deleted'));
};

window.clearAll=async function(){
  if(!confirm(t('confirm_all')))return;
  await clearAllEntries().catch(console.error);
  entries=[];renderAll();showToast(t('toast_cleared'));
};

// ── Export CSV ─────────────────────────────────────
window.exportCSV=function(){
  const site=currentSite();
  if(!entries.length||!site){showToast(t('toast_no_data'));return;}
  const mH=site.meters.map(m=>m.label+(m.serial?` (${m.serial})`:'')  ).join(';');
  const hdr=`Datum;Uhr;${mH};Bemerkung\n`;
  const rows=filteredEntries().map(e=>{
    const vals=site.meters.map(m=>e.readings?.[m.key]||'').join(';');
    return`${e.datum};${e.uhr||''};${vals};${e.note||''}`;
  }).join('\n');
  const blob=new Blob(['\uFEFF'+hdr+rows],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;
  a.download=`brunnen-${site.name.replace(/\s+/g,'-')}-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();URL.revokeObjectURL(url);showToast(t('toast_exported'));
};

// ── Date helpers ───────────────────────────────────
function todayISO(){return new Date().toISOString().slice(0,10);}
function isoToDE(iso){if(!iso)return'';const[y,m,d]=iso.split('-');return`${d}.${m}.${y}`;}
function deToISO(de){if(!de||!de.includes('.'))return todayISO();const p=de.split('.');return`${p[2]}-${p[1]}-${p[0]}`;}
function setDate(){const el=document.getElementById('f-datum');if(el)el.value=todayISO();}
function setDefaultTime(){const el=document.getElementById('f-uhr');if(el)el.value=new Date().toTimeString().slice(0,5);}

window.clearForm=function(){
  const site=currentSite();
  const uhr=document.getElementById('f-uhr');if(uhr)uhr.value='';
  const note=document.getElementById('f-note');if(note)note.value='';
  if(site)site.meters.forEach(m=>{const el=document.getElementById('fi-'+m.key);if(el)el.value='';});
  setDate();setDefaultTime();
};

// ── Navigation ─────────────────────────────────────
window.showPage=function(page){
  activePage=page;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b=>b.classList.remove('active'));
  document.getElementById('page-'+page)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  if(page==='charts')renderCharts();
};

// ── Filters ────────────────────────────────────────
window.setFilter=function(preset){
  const now=new Date(),pad=n=>String(n).padStart(2,'0');
  const fmtD=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  document.querySelectorAll('.filter-chip').forEach(c=>c.classList.remove('active'));
  document.querySelector(`[data-filter="${preset}"]`)?.classList.add('active');
  if(preset==='all'){filterFrom='';filterTo='';}
  else if(preset==='7d'){const d=new Date(now);d.setDate(d.getDate()-7);filterFrom=fmtD(d);filterTo='';}
  else if(preset==='30d'){const d=new Date(now);d.setDate(d.getDate()-30);filterFrom=fmtD(d);filterTo='';}
  else if(preset==='month'){filterFrom=`${now.getFullYear()}-${pad(now.getMonth()+1)}-01`;filterTo='';}
  else if(preset==='year'){filterFrom=`${now.getFullYear()}-01-01`;filterTo='';}
  const ff=document.getElementById('filter-from');const ft=document.getElementById('filter-to');
  if(ff)ff.value=filterFrom;if(ft)ft.value=filterTo;
  renderTable();if(activePage==='charts')renderCharts();
};

window.applyCustomFilter=function(){
  const ff=document.getElementById('filter-from');
  const ft=document.getElementById('filter-to');
  filterFrom=ff?.value||''; filterTo=ft?.value||'';
  document.querySelectorAll('.filter-chip').forEach(c=>c.classList.remove('active'));
  renderTable();if(activePage==='charts')renderCharts();
};

// ── Install PWA ────────────────────────────────────
window.installApp=async function(){
  if(!deferredInstallPrompt)return;
  deferredInstallPrompt.prompt();
  const{outcome}=await deferredInstallPrompt.userChoice;
  if(outcome==='accepted'){
    document.getElementById('install-banner')?.classList.remove('visible');
    showToast(t('toast_installed'));
  }
  deferredInstallPrompt=null;
};

// ── Toast ──────────────────────────────────────────
function showToast(msg){
  const el=document.getElementById('toast');
  if(!el)return;
  el.textContent=msg;el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),2800);
}

// ── Keyboard ───────────────────────────────────────
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){
    if(document.getElementById('edit-modal')?.classList.contains('open')) window.saveEdit();
    else if(document.getElementById('site-editor-modal')?.classList.contains('open')) window.saveSiteEditor();
    else window.saveEntry();
  }
  if(e.key==='Escape'){
    window.closeEdit?.();
    window.closeSiteEditor?.();
    window.closeWsAdmin?.();
  }
});

document.getElementById('edit-modal')?.addEventListener('click',e=>{
  if(e.target===document.getElementById('edit-modal'))window.closeEdit();
});
document.getElementById('site-editor-modal')?.addEventListener('click',e=>{
  if(e.target===document.getElementById('site-editor-modal'))window.closeSiteEditor();
});
document.getElementById('ws-admin-modal')?.addEventListener('click',e=>{
  if(e.target===document.getElementById('ws-admin-modal'))window.closeWsAdmin();
});

setDate();setDefaultTime();init();
