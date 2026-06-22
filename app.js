'use strict';

const icons = {
  qr: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><path d="M15 15h3v3h3v3h-6v-3m6-3v-3"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a6 6 0 0 1 3 5v2"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  copy: '<rect x="8" y="3" width="12" height="14" rx="2"/><path d="M16 21H6a2 2 0 0 1-2-2V8"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  link: '<path d="m10 13 4-4m-5 7-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 0 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 0)"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const $ = id => document.getElementById(id);
document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });

let qrData = [];
let qrById = new Map();
let activeTab = 'personal';
let searchKeyword = '';
let activeBankFilter = 'Tất cả';
let currentSelectedQR = null;
let dataReady = false;
let loading = false;
let returnFocus = null;
let closingHistory = false;
let toastTimer;
// Only entries created by this document can safely navigate back on explicit close.
const navigationToken = `${Date.now()}-${Math.random()}`;
const modal = $('qrModal');
const grids = { personal: $('personalGrid'), group: $('groupGrid') };
const tabs = { personal: $('tabPersonal'), group: $('tabGroup') };

function normalizeStr(value) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, '');
}

async function fetchData() {
  if (loading) return;
  loading = true;
  $('loadError').hidden = true;
  $('resultCount').textContent = 'Đang tải danh bạ…';
  grids[activeTab].setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('data.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data) || data.some(item => !item ||
      !['personal', 'group'].includes(item.type) ||
      ['owner', 'bank', 'accountNumber', 'qrImage'].some(key => typeof item[key] !== 'string' || !item[key].trim()))) {
      throw new Error('Invalid QR data');
    }
    qrData = data.sort((a, b) => a.owner.localeCompare(b.owner, 'vi', { sensitivity: 'accent' }));
    qrById = new Map();
    const duplicateIds = new Set();
    for (const item of qrData) {
      if (typeof item.id !== 'string' || !/^qr-[a-z0-9-]+$/.test(item.id)) continue;
      if (qrById.has(item.id)) duplicateIds.add(item.id);
      qrById.set(item.id, item);
    }
    // Ambiguous links must never choose the wrong recipient; keep their cards visible.
    duplicateIds.forEach(id => qrById.delete(id));
    dataReady = true;
    $('totalCount').textContent = `${qrData.length} mã QR`;
    for (const type of ['personal', 'group']) {
      $(`${type}Count`).textContent = qrData.filter(item => item.type === type).length;
    }
    generateBankFilters();
    renderAll();
    syncModalFromURL();
  } catch (error) {
    $('loadError').hidden = false;
    $('resultCount').textContent = 'Danh bạ chưa tải được';
    showToast('Không thể tải danh bạ QR. Vui lòng thử lại.');
  } finally {
    loading = false;
    Object.values(grids).forEach(grid => grid.setAttribute('aria-busy', 'false'));
  }
}

function generateBankFilters() {
  $('bankFilters').replaceChildren();
  const banks = [...new Set(qrData.map(item => item.bank))].sort((a, b) => a.localeCompare(b, 'vi'));
  for (const bank of ['Tất cả', ...banks]) {
    const button = document.createElement('button');
    button.className = 'filter-chip';
    button.textContent = bank;
    button.setAttribute('aria-pressed', String(bank === activeBankFilter));
    button.addEventListener('click', () => {
      activeBankFilter = bank;
      updateFilterStates();
      renderAll();
    });
    $('bankFilters').append(button);
  }
}

function updateFilterStates() {
  for (const button of $('bankFilters').children) {
    button.setAttribute('aria-pressed', String(button.textContent === activeBankFilter));
  }
}

function switchTab(type) {
  activeTab = type;
  renderAll();
}

function resetFilters() {
  searchKeyword = '';
  activeBankFilter = 'Tất cả';
  $('searchInput').value = '';
  updateFilterStates();
  renderAll();
  $('searchInput').focus();
}

function renderAll() {
  for (const type of ['personal', 'group']) {
    grids[type].hidden = type !== activeTab;
    tabs[type].setAttribute('aria-selected', String(type === activeTab));
    tabs[type].tabIndex = type === activeTab ? 0 : -1;
    grids[type].replaceChildren();
  }
  $('clearSearch').hidden = !searchKeyword;
  if (!dataReady) return;
  const query = normalizeStr(searchKeyword);
  const items = qrData.filter(item => item.type === activeTab &&
    (activeBankFilter === 'Tất cả' || item.bank === activeBankFilter) &&
    [item.owner, item.accountNumber, item.bank].some(value => normalizeStr(value).includes(query)));
  $('resultCount').textContent = `${items.length} mã QR ${activeTab === 'personal' ? 'cá nhân' : 'nhóm'}${activeBankFilter === 'Tất cả' ? '' : ` · ${activeBankFilter}`}`;
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `${icon('search')}<h2>Không tìm thấy mã QR</h2><p>Thử tên, số tài khoản hoặc chọn ngân hàng khác.</p><button class="button secondary">Xóa bộ lọc</button>`;
    empty.querySelector('button').addEventListener('click', resetFilters);
    grids[activeTab].append(empty);
  } else {
    grids[activeTab].append(...items.map(createQRCard));
  }
}

function createQRCard(item) {
  const card = document.createElement('article');
  card.className = 'qr-card';
  card.innerHTML = `<button class="card-open"><span class="bank-line"><span class="bank-dot"></span><span class="bank-name"></span></span><span class="card-title"></span><span class="card-image-frame"><img loading="lazy" decoding="async"><span class="image-error" hidden>Không tải được ảnh QR</span></span></button><div class="card-footer"><div><span class="field-label">Số tài khoản</span><span class="account-number"></span></div><button class="icon-button btn-copy">${icon('copy')}</button></div>`;
  card.querySelector('.bank-name').textContent = item.bank;
  card.querySelector('.card-title').textContent = item.owner;
  card.querySelector('.account-number').textContent = item.accountNumber;
  const open = card.querySelector('.card-open');
  open.setAttribute('aria-label', `Xem QR của ${item.owner} · ${item.bank}`);
  open.dataset.qrId = item.id || '';
  open.addEventListener('click', () => openQRModal(item));
  const img = card.querySelector('img');
  img.alt = `Mã QR ${item.owner}, ${item.bank}`;
  img.addEventListener('error', () => { img.hidden = true; img.nextElementSibling.hidden = false; });
  img.src = item.qrImage;
  const copy = card.querySelector('.btn-copy');
  copy.setAttribute('aria-label', `Sao chép số tài khoản của ${item.owner}`);
  copy.addEventListener('click', () => copyText(item.accountNumber.replace(/\s+/g, ''), 'Đã sao chép số tài khoản.'));
  // Preserve pointer access from the rest of the card without nesting interactive controls.
  card.addEventListener('click', event => { if (!event.target.closest('button')) open.click(); });
  return card;
}

function urlWithoutQR() {
  const url = new URL(location.href);
  url.searchParams.delete('qr');
  return url;
}

function openQRModal(item) {
  if (closingHistory) return;
  if (qrById.get(item.id) !== item) {
    showToast('Mã QR chưa có định danh duy nhất. Vui lòng kiểm tra dữ liệu.');
    return;
  }
  const url = new URL(location.href);
  if (url.searchParams.getAll('qr').length === 1 && url.searchParams.get('qr') === item.id) {
    syncModalFromURL();
    return;
  }
  const wasOpen = modal.open;
  const base = urlWithoutQR().href;
  url.searchParams.set('qr', item.id);
  if (wasOpen) {
    history.replaceState(history.state, '', url);
  } else {
    history.pushState({ ...history.state, qrHub: { token: navigationToken, base } }, '', url);
  }
  syncModalFromURL();
}

function syncModalFromURL() {
  if (!dataReady) return;
  const url = new URL(location.href);
  const values = url.searchParams.getAll('qr');
  if (!values.length) { hideModal(); return; }
  const item = values.length === 1 ? qrById.get(values[0]) : null;
  if (!item) {
    history.replaceState(history.state, '', urlWithoutQR());
    hideModal();
    showToast('Liên kết QR không hợp lệ hoặc không còn tồn tại.');
    return;
  }
  if (activeTab !== item.type) switchTab(item.type);
  renderModal(item);
}

function renderModal(item) {
  if (currentSelectedQR === item && modal.open) return;
  currentSelectedQR = item;
  $('modalName').textContent = item.owner;
  $('modalBank').textContent = item.bank;
  $('modalAccount').textContent = item.accountNumber;
  $('modalQR').alt = `Mã QR chuyển khoản của ${item.owner}, ${item.bank}`;
  $('modalQR').hidden = false;
  $('modalQR').nextElementSibling.hidden = true;
  $('modalQR').src = item.qrImage;
  if (!modal.open) {
    returnFocus = document.activeElement;
    $('toast').hidden = true;
    document.body.classList.add('modal-open');
    modal.showModal();
    modal.scrollTop = 0;
  }
}

function hideModal() {
  if (!modal.open) return;
  const selectedId = currentSelectedQR?.id;
  modal.close();
  currentSelectedQR = null;
  document.body.classList.remove('modal-open');
  $('modalToast').hidden = true;
  const matchingCard = [...document.querySelectorAll('.card-open')].find(el => el.dataset.qrId === selectedId);
  const target = returnFocus?.isConnected && returnFocus !== document.body ? returnFocus : matchingCard || tabs[activeTab];
  target.focus({ preventScroll: true });
  returnFocus = null;
}

function closeQRModal() {
  if (!modal.open || closingHistory) return;
  const marker = history.state?.qrHub;
  if (marker?.token === navigationToken && marker.base === urlWithoutQR().href) {
    closingHistory = true;
    history.back();
  } else {
    history.replaceState(history.state, '', urlWithoutQR());
    syncModalFromURL();
  }
}

async function copyText(text, successMessage) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    showToast(successMessage);
  } catch {
    // A selected textarea also supports older HTTP-hosted deployments.
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('aria-label', 'Nội dung sao chép');
    input.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none';
    const focused = document.activeElement;
    (modal.open ? modal : document.body).append(input);
    input.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { /* Report failure below. */ }
    input.remove();
    focused?.focus({ preventScroll: true });
    showToast(copied ? successMessage : 'Không thể sao chép. Hãy sao chép thủ công số tài khoản hoặc URL trên thanh địa chỉ.');
  }
}

async function downloadQRImage() {
  const item = currentSelectedQR;
  if (!item) return;
  $('btnDownloadQR').disabled = true;
  try {
    const response = await fetch(item.qrImage);
    if (!response.ok) throw new Error('Image unavailable');
    const blob = await response.blob();
    const objectURL = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectURL;
    const extension = new URL(item.qrImage, location.href).pathname.match(/\.(png|jpe?g|webp)$/i)?.[1].toLowerCase() || 'png';
    link.download = `${item.owner}_${item.bank}.${extension}`;
    modal.append(link);
    link.click();
    link.remove();
    // Let the browser consume the URL before releasing its blob.
    setTimeout(() => URL.revokeObjectURL(objectURL), 1000);
    showToast('Đã gửi ảnh QR gốc tới trình tải xuống.');
  } catch {
    showToast('Không thể tải ảnh QR. Vui lòng thử lại hoặc lưu trực tiếp ảnh đang hiển thị.');
  } finally { $('btnDownloadQR').disabled = false; }
}

function showToast(message) {
  clearTimeout(toastTimer);
  $('toast').hidden = true;
  $('modalToast').hidden = true;
  const toast = modal.open ? $('modalToast') : $('toast');
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
}

$('searchInput').addEventListener('input', event => { searchKeyword = event.target.value; renderAll(); });
$('clearSearch').addEventListener('click', () => { searchKeyword = ''; $('searchInput').value = ''; renderAll(); $('searchInput').focus(); });
$('retryLoad').addEventListener('click', fetchData);
for (const [type, tab] of Object.entries(tabs)) {
  tab.addEventListener('click', () => switchTab(type));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'personal' : event.key === 'End' ? 'group' : type === 'personal' ? 'group' : 'personal';
    switchTab(next);
    tabs[next].focus();
  });
}
$('closeModal').addEventListener('click', closeQRModal);
$('closeModalBottom').addEventListener('click', closeQRModal);
modal.addEventListener('cancel', event => { event.preventDefault(); closeQRModal(); });
modal.addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  const controls = [...modal.querySelectorAll('button:not(:disabled)')].filter(el => !el.hidden);
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
let pointerStartedOnBackdrop = false;
const isBackdrop = event => {
  const box = modal.getBoundingClientRect();
  return event.target === modal && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom);
};
modal.addEventListener('pointerdown', event => { pointerStartedOnBackdrop = isBackdrop(event); });
modal.addEventListener('click', event => { if (pointerStartedOnBackdrop && isBackdrop(event)) closeQRModal(); pointerStartedOnBackdrop = false; });
$('modalQR').addEventListener('error', () => { $('modalQR').hidden = true; $('modalQR').nextElementSibling.hidden = false; });
$('btnCopyModal').addEventListener('click', () => { if (currentSelectedQR) copyText(currentSelectedQR.accountNumber.replace(/\s+/g, ''), 'Đã sao chép số tài khoản.'); });
$('btnShareQR').addEventListener('click', () => { if (currentSelectedQR) copyText(location.href, 'Đã sao chép liên kết QR.'); });
$('btnDownloadQR').addEventListener('click', downloadQRImage);
window.addEventListener('popstate', () => { closingHistory = false; syncModalFromURL(); });
fetchData();
