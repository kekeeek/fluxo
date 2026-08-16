// ============================================================
// Fluxo — web app logic
// Talks directly to the gofile API from the browser (CORS-enabled).
// No backend of its own: token, history and settings live in
// this browser's localStorage only.
// ============================================================

const LS_TOKEN = 'fluxo_token';
const LS_HISTORY = 'fluxo_history';
const LS_SETTINGS = 'fluxo_settings';
const GATE_KEY = 'fluxo-terms-accepted';

const DEFAULT_SETTINGS = { defaultPrivate: false, autoCopy: false, publicDomain: '' };

function getToken() { return localStorage.getItem(LS_TOKEN) || null; }
function setToken(t) { if (t) localStorage.setItem(LS_TOKEN, t); else localStorage.removeItem(LS_TOKEN); }

function getHistory() {
  try { return JSON.parse(localStorage.getItem(LS_HISTORY)) || []; } catch (e) { return []; }
}
function setHistory(h) { localStorage.setItem(LS_HISTORY, JSON.stringify(h)); }

function getSettings() {
  try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(LS_SETTINGS)) || {}) }; }
  catch (e) { return { ...DEFAULT_SETTINGS }; }
}
function setSettings(patch) {
  const merged = { ...getSettings(), ...patch };
  localStorage.setItem(LS_SETTINGS, JSON.stringify(merged));
  return merged;
}

async function gofileFetch(url, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.status !== 'ok') {
    throw new Error((data && data.status) || `Erreur ${res.status}`);
  }
  return data.data;
}

function uploadFileXHR(file, token, folderId, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file, file.name);
    if (token) form.append('token', token);
    if (token && folderId) form.append('folderId', folderId);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://upload.gofile.io/uploadfile');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (json.status === 'ok') resolve(json.data);
        else reject(new Error(json.status || 'Échec de l\'envoi'));
      } catch (e) {
        reject(new Error('Réponse invalide du serveur'));
      }
    };
    xhr.onerror = () => reject(new Error('Erreur réseau pendant l\'envoi'));
    xhr.send(form);
  });
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let i = 0;
  let val = bytes;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return `${val.toFixed(val < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ' · ' +
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add('hidden'), 2600);
}

// ---------- Terms content ----------
const TERMS_HTML = `
  <h3>1. Ce qu'est Fluxo</h3>
  <p>Fluxo est un site indépendant qui te permet d'envoyer et de partager des fichiers. Fluxo n'héberge aucun fichier lui-même : chaque envoi est transmis à <strong>gofile.io</strong>, un service tiers, via son API publique, directement depuis ton navigateur. Les fichiers sont physiquement stockés sur les serveurs de gofile.</p>

  <h3>2. Connexion à un compte</h3>
  <p>Si tu choisis de te connecter, tu utilises ton jeton API gofile, disponible sur ton profil gofile.io. Fluxo ne voit jamais ton mot de passe. Ce jeton est conservé uniquement dans ton navigateur (stockage local), jamais envoyé à un serveur Fluxo puisque Fluxo n'en possède pas.</p>

  <h3>3. Fichiers publics et privés</h3>
  <p>Sans connexion, les fichiers envoyés sont publics : toute personne disposant du lien peut y accéder. Avec un compte connecté, tu peux rendre tes fichiers privés ; ils restent toutefois soumis aux règles et à la modération de gofile.</p>

  <h3>4. Responsabilité du contenu</h3>
  <p>Tu es seul responsable des fichiers que tu envoies. Le contenu illégal, protégé par des droits que tu ne détiens pas, ou contraire aux <span class="link" data-url="https://gofile.io/terms">conditions d'utilisation de gofile</span> n'est pas autorisé.</p>

  <h3>5. Données conservées</h3>
  <p>Fluxo conserve, dans le stockage local de ton navigateur uniquement, l'historique de tes envois et ton jeton gofile si tu es connecté. Rien n'est envoyé à un serveur de Fluxo. Vider le cache de ton navigateur effacera ces données.</p>

  <h3>6. Aucune garantie</h3>
  <p>Fluxo dépend entièrement de la disponibilité et des règles de gofile.io. Fluxo ne peut garantir la disponibilité, la durée de conservation, ni la confidentialité des fichiers envoyés, celles-ci étant définies par gofile.</p>
`;

document.getElementById('termsBody').innerHTML = TERMS_HTML;
document.getElementById('gateBody').innerHTML = TERMS_HTML;

// ---------- First-launch terms gate ----------
const gateOverlay = document.getElementById('gateOverlay');
const gateCheckbox = document.getElementById('gateCheckbox');
const gateAcceptBtn = document.getElementById('gateAcceptBtn');

if (localStorage.getItem(GATE_KEY) === 'yes') gateOverlay.classList.add('hidden');

gateCheckbox.addEventListener('change', () => { gateAcceptBtn.disabled = !gateCheckbox.checked; });
gateAcceptBtn.addEventListener('click', () => {
  localStorage.setItem(GATE_KEY, 'yes');
  gateOverlay.classList.add('hidden');
});

// ---------- External links ----------
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-url]');
  if (el && !el.classList.contains('nav-item')) {
    e.preventDefault();
    window.open(el.dataset.url, '_blank', 'noopener');
  }
});

// ---------- Settings drawer ----------
const settingsOverlay = document.getElementById('settingsOverlay');
document.getElementById('settingsBtn').addEventListener('click', () => settingsOverlay.classList.remove('hidden'));
document.getElementById('closeSettingsBtn').addEventListener('click', () => settingsOverlay.classList.add('hidden'));

const termsOverlay = document.getElementById('termsOverlay');
document.getElementById('termsBtn').addEventListener('click', () => termsOverlay.classList.remove('hidden'));
document.getElementById('closeTermsBtn').addEventListener('click', () => termsOverlay.classList.add('hidden'));

// ---------- View switching ----------
const views = { home: 'view-home', filemanager: 'view-filemanager', faq: 'view-faq', openlink: 'view-openlink' };

function switchView(name) {
  Object.values(views).forEach((id) => document.getElementById(id).classList.add('hidden'));
  document.getElementById(views[name]).classList.remove('hidden');
  document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === name);
  });
  if (name === 'filemanager') loadFileManagerRoot();
  if (name === 'faq') renderFaq();
}

document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

document.getElementById('premiumNavBtn').addEventListener('click', () => {
  document.getElementById('premiumOverlay').classList.remove('hidden');
});
document.getElementById('premiumCancelBtn').addEventListener('click', () => {
  document.getElementById('premiumOverlay').classList.add('hidden');
});
document.getElementById('premiumContinueBtn').addEventListener('click', () => {
  window.open('https://gofile.io/premium', '_blank', 'noopener');
  document.getElementById('premiumOverlay').classList.add('hidden');
});

// ---------- Auth state ----------
const privacyToggle = document.getElementById('privacyToggle');
const privacyHint = document.getElementById('privacyHint');
const accountStatusText = document.getElementById('accountStatusText');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');

const sidebarAvatar = document.getElementById('sidebarAvatar');
const sidebarAccountName = document.getElementById('sidebarAccountName');
const sidebarAccountSub = document.getElementById('sidebarAccountSub');
const addAccountBox = document.getElementById('addAccountBox');
const accountMenuBtn = document.getElementById('accountMenuBtn');

let isConnected = false;

function applyConnectionState(connected, email) {
  isConnected = connected;
  if (connected) {
    sidebarAvatar.textContent = (email || 'G')[0].toUpperCase();
    sidebarAccountName.textContent = email || 'Compte gofile';
    sidebarAccountSub.textContent = 'Connecté';
    addAccountBox.classList.add('hidden');

    accountStatusText.textContent = `Connecté · ${email || 'compte gofile'}`;
    loginBtn.classList.add('hidden');
    logoutBtn.classList.remove('hidden');
    privacyToggle.disabled = false;
    privacyHint.textContent = 'Les fichiers privés ne sont visibles que depuis ton compte gofile connecté.';
  } else {
    sidebarAvatar.textContent = '?';
    sidebarAccountName.textContent = 'Invité';
    sidebarAccountSub.textContent = 'Compte invité';
    addAccountBox.classList.remove('hidden');

    accountStatusText.textContent = 'Non connecté';
    loginBtn.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
    privacyToggle.checked = false;
    privacyToggle.disabled = true;
    privacyHint.textContent = 'Connecte-toi à ton compte gofile pour rendre tes fichiers privés';
  }
}

async function refreshAuthStatus() {
  const token = getToken();
  if (!token) {
    applyConnectionState(false);
    await loadFolders();
    await loadUsage();
    return;
  }
  try {
    const idData = await gofileFetch('https://api.gofile.io/accounts/getid');
    const details = await gofileFetch(`https://api.gofile.io/accounts/${idData.id}`);
    applyConnectionState(true, details.email);
  } catch (e) {
    applyConnectionState(false);
  }
  await loadFolders();
  await loadUsage();
}

accountMenuBtn.addEventListener('click', () => settingsOverlay.classList.remove('hidden'));
addAccountBox.addEventListener('click', () => {
  settingsOverlay.classList.remove('hidden');
  document.getElementById('manualTokenInput').focus();
});

loginBtn.addEventListener('click', () => window.open('https://gofile.io/myProfile', '_blank', 'noopener'));
document.getElementById('fmLoginBtn').addEventListener('click', () => settingsOverlay.classList.remove('hidden'));

logoutBtn.addEventListener('click', () => {
  setToken(null);
  showToast('Déconnecté');
  applyConnectionState(false);
  loadFolders();
  loadUsage();
});

document.getElementById('manualTokenBtn').addEventListener('click', async () => {
  const input = document.getElementById('manualTokenInput');
  const value = input.value.trim();
  if (value.length < 5) { showToast('Jeton invalide'); return; }
  setToken(value);
  input.value = '';
  showToast('Connexion en cours…');
  await refreshAuthStatus();
  if (isConnected) showToast('Connecté à ton compte gofile');
  else { showToast('Jeton refusé par gofile'); setToken(null); }
});

// ---------- Settings ----------
const defaultPrivateToggle = document.getElementById('defaultPrivateToggle');
const autoCopyToggle = document.getElementById('autoCopyToggle');
const publicDomainInput = document.getElementById('publicDomainInput');
let autoCopyEnabled = false;
let publicDomain = '';

function loadSettingsUI() {
  const settings = getSettings();
  defaultPrivateToggle.checked = !!settings.defaultPrivate;
  autoCopyToggle.checked = !!settings.autoCopy;
  autoCopyEnabled = !!settings.autoCopy;
  publicDomain = settings.publicDomain || `${window.location.origin}${window.location.pathname.replace(/app\.html$/, '')}`;
  publicDomainInput.value = publicDomain;
  if (settings.defaultPrivate && isConnected) privacyToggle.checked = true;
}

defaultPrivateToggle.addEventListener('change', () => setSettings({ defaultPrivate: defaultPrivateToggle.checked }));
autoCopyToggle.addEventListener('change', () => {
  autoCopyEnabled = autoCopyToggle.checked;
  setSettings({ autoCopy: autoCopyEnabled });
});
publicDomainInput.addEventListener('change', () => {
  publicDomain = publicDomainInput.value.trim();
  setSettings({ publicDomain });
  refreshHistory();
});

function extractGofileCode(link) {
  if (!link) return null;
  const parts = link.split('/').filter(Boolean);
  return parts[parts.length - 1] || null;
}

function displayLinkFor(entry) {
  if (publicDomain && entry.link) {
    const code = extractGofileCode(entry.link);
    if (code) return `${publicDomain.replace(/\/$/, '')}/r/${code}`;
  }
  return entry.link;
}

// ---------- Storage usage ----------
const usageBlock = document.getElementById('usageBlock');
const usageText = document.getElementById('usageText');

async function loadUsage() {
  if (!isConnected) { usageBlock.style.display = 'none'; return; }
  try {
    const idData = await gofileFetch('https://api.gofile.io/accounts/getid');
    const details = await gofileFetch(`https://api.gofile.io/accounts/${idData.id}`);
    const stats = details.statsCurrent || {};
    if (stats.fileSize || stats.fileCount) {
      usageBlock.style.display = '';
      const parts = [];
      if (stats.fileCount !== undefined) parts.push(`${stats.fileCount} fichier(s)`);
      if (stats.fileSize) parts.push(formatSize(stats.fileSize));
      usageText.textContent = parts.join(' · ') || '—';
    } else {
      usageBlock.style.display = 'none';
    }
  } catch (e) {
    usageBlock.style.display = 'none';
  }
}

// ---------- Folders (destination on home view) ----------
const folderRow = document.getElementById('folderRow');
const folderSelect = document.getElementById('folderSelect');
const newFolderBtn = document.getElementById('newFolderBtn');
const folderOverlay = document.getElementById('folderOverlay');
const newFolderInput = document.getElementById('newFolderInput');

let rootFolderId = null;

async function loadFolders() {
  if (!isConnected) { folderRow.classList.add('hidden'); return; }
  try {
    const idData = await gofileFetch('https://api.gofile.io/accounts/getid');
    const details = await gofileFetch(`https://api.gofile.io/accounts/${idData.id}`);
    rootFolderId = details.rootFolder;
    const content = await gofileFetch(`https://api.gofile.io/contents/${rootFolderId}`);
    const children = Object.values(content.children || {});
    folderSelect.innerHTML = '<option value="">Racine</option>';
    children.filter((c) => c.type === 'folder').forEach((f) => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.name;
      folderSelect.appendChild(opt);
    });
    folderRow.classList.remove('hidden');
  } catch (e) {
    folderRow.classList.add('hidden');
  }
}

newFolderBtn.addEventListener('click', () => {
  newFolderInput.value = '';
  folderOverlay.classList.remove('hidden');
  newFolderInput.focus();
});
document.getElementById('closeFolderModalBtn').addEventListener('click', () => folderOverlay.classList.add('hidden'));

document.getElementById('createFolderConfirmBtn').addEventListener('click', async () => {
  const name = newFolderInput.value.trim();
  if (!name) return;
  const parent = folderSelect.value || rootFolderId;
  try {
    const folder = await gofileFetch('https://api.gofile.io/contents/createFolder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentFolderId: parent, folderName: name })
    });
    showToast('Dossier créé');
    folderOverlay.classList.add('hidden');
    await loadFolders();
    folderSelect.value = folder.id;
  } catch (e) {
    showToast(`Échec : ${e.message}`);
  }
});

// ---------- History ----------
const historyList = document.getElementById('historyList');
const historySearch = document.getElementById('historySearch');
const historySort = document.getElementById('historySort');
let fullHistory = [];

function renderHistoryItem(entry) {
  const item = document.createElement('div');
  item.className = 'history-item';
  item.dataset.id = entry.id;

  const badge = entry.private
    ? `<span class="badge badge-private">Privé</span>`
    : `<span class="badge badge-public">Public</span>`;

  item.innerHTML = `
    <div class="history-item-icon">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z"/></svg>
    </div>
    <div class="history-item-main">
      <div class="history-item-name">${entry.name}</div>
      <div class="history-item-meta">
        <span>${formatSize(entry.size)}</span>
        <span>${formatDate(entry.date)}</span>
        ${badge}
      </div>
    </div>
    <div class="history-item-actions">
      <button class="icon-btn qr-btn" aria-label="Afficher le QR code" title="QR code">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM19 14h2v2h-2zM14 19h2v2h-2zM19 19h2v2h-2z"/></svg>
      </button>
      <button class="icon-btn open-btn" aria-label="Ouvrir" title="Ouvrir">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>
      </button>
      <button class="icon-btn copy-btn" aria-label="Copier le lien" title="Copier le lien">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>
      <button class="icon-btn direct-btn" aria-label="Lien de téléchargement direct" title="Lien de téléchargement direct">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
      </button>
      <button class="icon-btn rename-btn" aria-label="Renommer" title="Renommer">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
      </button>
      <button class="icon-btn delete-btn" aria-label="Supprimer" title="Supprimer">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
      </button>
    </div>
  `;

  item.querySelector('.copy-btn').addEventListener('click', () => {
    const link = displayLinkFor(entry);
    if (link) { navigator.clipboard.writeText(link); showToast('Lien copié'); }
  });
  item.querySelector('.qr-btn').addEventListener('click', () => {
    const link = displayLinkFor(entry);
    if (link) openQr(link);
  });
  item.querySelector('.open-btn').addEventListener('click', () => {
    if (entry.link) window.open(entry.link, '_blank', 'noopener');
  });
  item.querySelector('.direct-btn').addEventListener('click', () => openDirectLink(entry.id));
  item.querySelector('.rename-btn').addEventListener('click', () => openRename(entry.id, entry.name));
  item.querySelector('.delete-btn').addEventListener('click', async () => {
    if (!entry.guest) {
      try {
        await fetch('https://api.gofile.io/contents', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ contentsId: entry.id })
        });
      } catch (e) {
        showToast(`Échec de la suppression : ${e.message}`);
        return;
      }
    }
    setHistory(getHistory().filter((h) => h.id !== entry.id));
    showToast('Supprimé');
    refreshHistory();
  });

  return item;
}

function applyHistoryFilters() {
  let list = [...fullHistory];
  const query = historySearch.value.trim().toLowerCase();
  if (query) list = list.filter((e) => e.name.toLowerCase().includes(query));

  const sort = historySort.value;
  list.sort((a, b) => {
    switch (sort) {
      case 'date-asc': return new Date(a.date) - new Date(b.date);
      case 'name-asc': return a.name.localeCompare(b.name);
      case 'name-desc': return b.name.localeCompare(a.name);
      case 'size-desc': return b.size - a.size;
      case 'size-asc': return a.size - b.size;
      default: return new Date(b.date) - new Date(a.date);
    }
  });

  historyList.innerHTML = '';
  if (!list.length) {
    historyList.innerHTML = `<p class="empty-state">${query ? 'Aucun résultat.' : "Aucun fichier envoyé pour le moment."}</p>`;
    return;
  }
  list.forEach((entry) => historyList.appendChild(renderHistoryItem(entry)));
}

historySearch.addEventListener('input', applyHistoryFilters);
historySort.addEventListener('change', applyHistoryFilters);

function refreshHistory() {
  fullHistory = getHistory();
  applyHistoryFilters();
}

document.getElementById('clearHistoryBtn').addEventListener('click', () => {
  setHistory([]);
  refreshHistory();
});

// ---------- QR code modal ----------
const qrOverlay = document.getElementById('qrOverlay');
const qrCanvas = document.getElementById('qrCanvas');
const qrLink = document.getElementById('qrLink');
let qrCurrentLink = null;

function openQr(link) {
  qrCurrentLink = link;
  qrCanvas.innerHTML = '';
  const qr = qrcode(0, 'M');
  qr.addData(link);
  qr.make();
  qrCanvas.innerHTML = qr.createImgTag(5, 8);
  qrLink.textContent = link;
  qrOverlay.classList.remove('hidden');
}
document.getElementById('closeQrBtn').addEventListener('click', () => qrOverlay.classList.add('hidden'));
document.getElementById('qrCopyBtn').addEventListener('click', () => {
  if (qrCurrentLink) { navigator.clipboard.writeText(qrCurrentLink); showToast('Lien copié'); }
});

// ---------- Rename modal ----------
const renameOverlay = document.getElementById('renameOverlay');
const renameInput = document.getElementById('renameInput');
let renameTargetId = null;

function openRename(id, currentName) {
  renameTargetId = id;
  renameInput.value = currentName;
  renameOverlay.classList.remove('hidden');
  renameInput.focus();
}
document.getElementById('closeRenameModalBtn').addEventListener('click', () => renameOverlay.classList.add('hidden'));

document.getElementById('renameConfirmBtn').addEventListener('click', async () => {
  const newName = renameInput.value.trim();
  if (!newName || !renameTargetId) return;
  try {
    await gofileFetch(`https://api.gofile.io/contents/${renameTargetId}/update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attribute: 'name', attributeValue: newName })
    });
    const history = getHistory().map((h) => (h.id === renameTargetId ? { ...h, name: newName } : h));
    setHistory(history);
    showToast('Fichier renommé');
    renameOverlay.classList.add('hidden');
    refreshHistory();
  } catch (e) {
    showToast(`Échec : ${e.message}`);
  }
});

// ---------- Upload ----------
const dropzone = document.getElementById('dropzone');
const browseBtn = document.getElementById('browseBtn');
const fileInput = document.getElementById('fileInput');

let dragCounter = 0;

dropzone.addEventListener('dragenter', (e) => { e.preventDefault(); dragCounter++; dropzone.classList.add('drag-over'); });
dropzone.addEventListener('dragover', (e) => e.preventDefault());
dropzone.addEventListener('dragleave', () => {
  dragCounter--;
  if (dragCounter <= 0) { dragCounter = 0; dropzone.classList.remove('drag-over'); }
});
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  dropzone.classList.remove('drag-over');
  Array.from(e.dataTransfer.files).forEach(uploadFile);
});

dropzone.addEventListener('click', (e) => {
  if (e.target.closest('#browseBtn')) return;
  fileInput.click();
});
browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
fileInput.addEventListener('change', () => {
  Array.from(fileInput.files).forEach(uploadFile);
  fileInput.value = '';
});

const pendingRows = new Map();

async function uploadFile(file) {
  const row = document.createElement('div');
  row.className = 'history-item';
  row.innerHTML = `
    <div class="history-item-icon">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12"/><path d="M7 8l5-5 5 5"/></svg>
    </div>
    <div class="history-item-main">
      <div class="history-item-name">${file.name}</div>
      <div class="history-item-meta"><span>Envoi en cours…</span></div>
      <div class="progress-bar"><div class="progress-bar-fill"></div></div>
    </div>
  `;
  if (historyList.querySelector('.empty-state')) historyList.innerHTML = '';
  historyList.prepend(row);
  pendingRows.set(file, row);

  const token = getToken();
  const makePrivate = isConnected && privacyToggle.checked;
  const folderId = isConnected ? folderSelect.value : '';

  try {
    const data = await uploadFileXHR(file, token, folderId, (percent) => {
      const fill = row.querySelector('.progress-bar-fill');
      const meta = row.querySelector('.history-item-meta span');
      if (fill) fill.style.width = `${percent}%`;
      if (meta) meta.textContent = `${percent}% envoyé`;
    });

    let isPrivate = false;
    if (token && makePrivate && data.parentFolder) {
      try {
        await gofileFetch(`https://api.gofile.io/contents/${data.parentFolder}/update`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attribute: 'public', attributeValue: 'false' })
        });
        isPrivate = true;
      } catch (e) { isPrivate = false; }
    }

    const entry = {
      id: data.id || data.code || Date.now().toString(),
      name: file.name,
      size: file.size,
      link: data.downloadPage || data.link || null,
      private: isPrivate,
      date: new Date().toISOString(),
      guest: !token
    };

    const history = getHistory();
    history.unshift(entry);
    setHistory(history);

    pendingRows.delete(file);
    row.remove();

    showToast('Fichier envoyé');
    if (autoCopyEnabled && entry.link) navigator.clipboard.writeText(displayLinkFor(entry));
    refreshHistory();
    loadUsage();
  } catch (e) {
    pendingRows.delete(file);
    row.remove();
    showToast(`Échec : ${e.message}`);
  }
}

// ---------- File manager ----------
const fmLoggedOut = document.getElementById('fmLoggedOut');
const fmLoggedIn = document.getElementById('fmLoggedIn');
const fmBreadcrumbs = document.getElementById('fmBreadcrumbs');
const fmList = document.getElementById('fmList');

let fmPath = [];

function fmIcon(isFolder) {
  return isFolder
    ? '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>'
    : '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z"/></svg>';
}

function renderBreadcrumbs() {
  fmBreadcrumbs.innerHTML = '';
  fmPath.forEach((step, i) => {
    const btn = document.createElement('button');
    btn.textContent = step.name;
    btn.addEventListener('click', () => { fmPath = fmPath.slice(0, i + 1); loadFmFolder(step.id); });
    fmBreadcrumbs.appendChild(btn);
    if (i < fmPath.length - 1) {
      const sep = document.createElement('span');
      sep.className = 'sep';
      sep.textContent = '/';
      fmBreadcrumbs.appendChild(sep);
    }
  });
}

async function loadFmFolder(folderId) {
  try {
    const data = await gofileFetch(`https://api.gofile.io/contents/${folderId}`);
    renderBreadcrumbs();
    fmList.innerHTML = '';
    const children = Object.values(data.children || {});
    if (!children.length) { fmList.innerHTML = '<p class="empty-state">Ce dossier est vide.</p>'; return; }
    children
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1))
      .forEach((item) => {
        const el = document.createElement('div');
        const isFolder = item.type === 'folder';
        el.className = `fm-item ${isFolder ? 'is-folder' : ''}`;
        el.innerHTML = `
          <span class="fm-item-icon">${fmIcon(isFolder)}</span>
          <span class="fm-item-name">${item.name}</span>
          ${!isFolder ? `<span class="fm-item-size">${formatSize(item.size)}</span>` : ''}
        `;
        if (isFolder) {
          el.addEventListener('click', () => { fmPath.push({ id: item.id, name: item.name }); loadFmFolder(item.id); });
        } else if (item.downloadPage) {
          el.addEventListener('click', () => window.open(item.downloadPage, '_blank', 'noopener'));
        }
        fmList.appendChild(el);
      });
  } catch (e) {
    fmList.innerHTML = `<p class="empty-state">Impossible de charger ce dossier : ${e.message}</p>`;
  }
}

async function loadFileManagerRoot() {
  if (!isConnected) {
    fmLoggedOut.classList.remove('hidden');
    fmLoggedIn.classList.add('hidden');
    return;
  }
  fmLoggedOut.classList.add('hidden');
  fmLoggedIn.classList.remove('hidden');
  try {
    const idData = await gofileFetch('https://api.gofile.io/accounts/getid');
    const details = await gofileFetch(`https://api.gofile.io/accounts/${idData.id}`);
    fmPath = [{ id: details.rootFolder, name: 'Racine' }];
    loadFmFolder(details.rootFolder);
  } catch (e) {
    fmList.innerHTML = `<p class="empty-state">Erreur : ${e.message}</p>`;
  }
}

// ---------- FAQ ----------
const FAQ_ITEMS = [
  { q: "Où sont stockés mes fichiers ?", a: "Fluxo n'héberge aucun fichier lui-même. Chaque envoi est transmis à gofile.io via son API publique : tes fichiers sont physiquement stockés sur les serveurs de gofile." },
  { q: "Mes fichiers sont-ils publics ?", a: "Sans connexion, oui : toute personne avec le lien peut y accéder. Connecte-toi à ton compte gofile pour pouvoir basculer un fichier en privé." },
  { q: "Combien de temps mes fichiers restent-ils en ligne ?", a: "Cela dépend des règles de gofile, pas de Fluxo : les comptes gratuits ont une durée de conservation limitée sauf téléchargement régulier, les comptes premium ont un stockage longue durée." },
  { q: "Puis-je utiliser un compte gofile que j'ai déjà ?", a: "Oui : ouvre ton profil gofile, copie ton jeton API, colle-le dans les paramètres de Fluxo." },
  { q: "Fluxo peut-il voir mon mot de passe gofile ?", a: "Non, jamais. Fluxo ne demande et ne voit que ton jeton d'accès, jamais ton mot de passe." },
  { q: "Mes données restent-elles si je change d'appareil ?", a: "Non : l'historique et le jeton sont stockés uniquement dans le navigateur utilisé, pas sur un serveur Fluxo." }
];

function renderFaq() {
  const list = document.getElementById('faqList');
  if (list.dataset.rendered) return;
  list.dataset.rendered = '1';
  FAQ_ITEMS.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'faq-item';
    el.innerHTML = `
      <button class="faq-question">
        <span>${item.q}</span>
        <svg class="faq-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <div class="faq-answer"><p>${item.a}</p></div>
    `;
    el.querySelector('.faq-question').addEventListener('click', () => el.classList.toggle('open'));
    list.appendChild(el);
  });
}

// ---------- Contact ----------
// Fill these in with your own free EmailJS account (emailjs.com) to enable
// silent sending. Until configured, the form falls back to opening the
// visitor's mail client so it still works with zero setup.
const EMAILJS_CONFIG = {
  serviceId: 'service_22dbifp',
  templateId: 'template_ur6xauc',
  publicKey: '8CzeN2rsQz08956dL',
  toEmail: 'adkip0@outlook.fr'
};

const contactOverlay = document.getElementById('contactOverlay');
const contactNavBtn = document.getElementById('contactNavBtn');
const closeContactBtn = document.getElementById('closeContactBtn');
const contactEmailInput = document.getElementById('contactEmailInput');
const contactMessageInput = document.getElementById('contactMessageInput');
const contactSendBtn = document.getElementById('contactSendBtn');

contactNavBtn.addEventListener('click', () => contactOverlay.classList.remove('hidden'));
closeContactBtn.addEventListener('click', () => contactOverlay.classList.add('hidden'));

contactSendBtn.addEventListener('click', async () => {
  const fromEmail = contactEmailInput.value.trim();
  const message = contactMessageInput.value.trim();
  if (!message) { showToast('Écris un message avant d\'envoyer'); return; }

  contactSendBtn.disabled = true;
  contactSendBtn.textContent = 'Envoi…';

  if (EMAILJS_CONFIG.serviceId.startsWith('YOUR_')) {
    const body = encodeURIComponent(`${message}\n\n— Répondre à : ${fromEmail || 'non précisé'}`);
    window.location.href = `mailto:${EMAILJS_CONFIG.toEmail}?subject=${encodeURIComponent('Message depuis Fluxo')}&body=${body}`;
    showToast('Ton client mail va s\'ouvrir pour envoyer le message');
    contactOverlay.classList.add('hidden');
  } else {
    try {
      await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: EMAILJS_CONFIG.serviceId,
          template_id: EMAILJS_CONFIG.templateId,
          user_id: EMAILJS_CONFIG.publicKey,
          template_params: { from_email: fromEmail, message, to_email: EMAILJS_CONFIG.toEmail }
        })
      });
      showToast('Message envoyé, merci !');
      contactEmailInput.value = '';
      contactMessageInput.value = '';
      contactOverlay.classList.add('hidden');
    } catch (e) {
      showToast(`Échec de l'envoi : ${e.message}`);
    }
  }

  contactSendBtn.disabled = false;
  contactSendBtn.textContent = 'Envoyer';
});

// ---------- Open a link tab ----------
document.getElementById('openLinkBtn').addEventListener('click', () => {
  const input = document.getElementById('openLinkInput');
  const raw = input.value.trim();
  if (!raw) return;
  const code = extractGofileCode(raw);
  if (!code) { showToast('Lien invalide'); return; }
  window.open(`https://gofile.io/d/${code}`, '_blank', 'noopener');
});

// ---------- Direct download link modal ----------
const directLinkOverlay = document.getElementById('directLinkOverlay');
const directLinkResult = document.getElementById('directLinkResult');
const directLinkCopyBtn = document.getElementById('directLinkCopyBtn');
let directLinkCurrent = null;

async function openDirectLink(contentId) {
  directLinkResult.textContent = 'Génération en cours…';
  directLinkCopyBtn.classList.add('hidden');
  directLinkOverlay.classList.remove('hidden');

  try {
    const data = await gofileFetch(`https://api.gofile.io/contents/${contentId}/directlinks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const link = data.directLink || data.link || data.url;
    if (!link) throw new Error('Réponse inattendue de gofile (compte premium requis ?)');
    directLinkCurrent = link;
    directLinkResult.textContent = link;
    directLinkCopyBtn.classList.remove('hidden');
  } catch (e) {
    directLinkResult.textContent = `Impossible de générer ce lien : ${e.message} (nécessite un compte gofile premium)`;
  }
}

document.getElementById('closeDirectLinkBtn').addEventListener('click', () => directLinkOverlay.classList.add('hidden'));
directLinkCopyBtn.addEventListener('click', () => {
  if (directLinkCurrent) { navigator.clipboard.writeText(directLinkCurrent); showToast('Lien copié'); }
});

// ---------- Init ----------
(async function init() {
  loadSettingsUI();
  refreshHistory();
  await refreshAuthStatus();
  loadSettingsUI();
})();
