// Shared UI: icons, bottom navigation, toasts, busy buttons, loading skeletons.
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM21 14v.01M14 21h.01M17 21h4v-4"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 2-1.5L22 7H6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><path d="M3 3l18 18"/>',
  scale: '<path d="M4 20h16M6 20l2-10h8l2 10M12 10V5M8 5h8"/>',
  alert: '<path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18h.01"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>',
  pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10V5.5a1.5 1.5 0 0 1 3 0V13"/><path d="M8 13v-1.5a1.5 1.5 0 0 0-3 0V14c0 4 3 7 7 7s7-3 7-7v-3a1.5 1.5 0 0 0-3 0"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  tag: '<path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16" cy="14.5" r="1.2"/>',
  barcode: '<path d="M4 5v14M7 5v14M11 5v14M14 5v14M17 5v14M20 5v14"/>',
  coins: '<circle cx="9" cy="9" r="6"/><path d="M15.5 9.5A6 6 0 1 1 9.5 15.5"/>',
  pencil: '<path d="M4 20l4-1L19 8l-3-3L5 16z"/><path d="M14 7l3 3"/>',
  snack: '<path d="M7 3h10l-1.5 4 1.5 5-1.5 5 1 4H8l1-4-1.5-5L9 7z"/><path d="M10 10h4M10 14h4"/>',
  cookie: '<circle cx="12" cy="12" r="9"/><path d="M9 9h.01M15 10h.01M10 15h.01M14.5 14.5h.01"/>',
  bottle: '<path d="M10 2h4v3l2 3v12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8l2-3z"/><path d="M8 13h8"/>',
  bowl: '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M9 7c0-2 2-2 2-4M13 7c0-2 2-2 2-4"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  spray: '<path d="M9 3h5v4H9z"/><path d="M8 7h7l1 4v9a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-9z"/><path d="M14 4h4M18 2v4"/>',
  camera2: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7l1.5-3h5L16 7"/><circle cx="12" cy="13.5" r="3.5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
};

const SECTION_ORDER = ['Stationery', 'Snacks', 'Biscuits & Chocolates', 'Beverages', 'Instant Food',
  'Personal Care', 'Household', 'Electronics & Hobby'];
const SECTION_ICONS = {
  Stationery: 'pencil', Snacks: 'snack', 'Biscuits & Chocolates': 'cookie', Beverages: 'bottle',
  'Instant Food': 'bowl', 'Personal Care': 'drop', Household: 'spray', 'Electronics & Hobby': 'chip',
};
function sectionIcon(category) { return SECTION_ICONS[category] || 'qr'; }
// Aisle of each section (same numbers as backend/store.py) - used for the store map.
const SECTION_AISLES = { Stationery: 1, Snacks: 2, 'Biscuits & Chocolates': 3, Beverages: 4, 'Instant Food': 5,
  'Personal Care': 6, Household: 7, 'Electronics & Hobby': 8 };
function sortSections(list) {
  return [...list].sort((a, b) => {
    const ia = SECTION_ORDER.indexOf(a); const ib = SECTION_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
}

// UPI "pay" link with the amount filled in: opens GPay / PhonePe / Paytm / BHIM on a phone, and the same
// text as a QR can be scanned by any UPI app. (The shop still confirms the money at the counter.)
function upiLink(upi, amount, note) {
  const pa = String(upi.id).replace(/[^\w.\-@]/g, '');
  return `upi://pay?pa=${pa}&pn=${encodeURIComponent(upi.name || 'CartLess Checkout')}&am=${Number(amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent(note || 'CartLess Checkout top-up')}`;
}

function icon(name, size = 20) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

function productImage(p, cls = '') {
  if (p.image_url) {
    const src = p.image_url.startsWith('/api/') ? API_BASE + p.image_url : p.image_url;
    return `<img src="${esc(src)}" alt="${esc(p.name)}" loading="lazy" class="product-img ${cls}" data-cls="${cls}" data-tint="${esc(p.tint || '')}" data-cat="${esc(p.category || '')}" data-name="${esc(p.name || '')}">`;
  }
  return imagePlaceholder(cls, p.tint, p.category, p.name);
}
// No photo yet: a drawn picture of the pack in its own colour (productArt, below),
// or for an item it can't draw, a tile with the section's icon.
function imagePlaceholder(cls = '', tint = '', category = '', name = '') {
  const style = /^#[0-9a-f]{6}$/i.test(tint || '') ? ` style="--tint:${tint}"` : '';
  const art = productArt(name, tint);
  if (art) return `<div class="img-placeholder art ${style ? 'tinted ' : ''}${cls}"${style} role="img" aria-label="${esc(name)}">${art}</div>`;
  return `<div class="img-placeholder ${style ? 'tinted ' : ''}${cls}"${style} aria-hidden="true">${icon(sectionIcon(category), 30)}</div>`;
}
// A broken photo URL (or no internet on demo day) shows the neutral placeholder, not alt text.
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img instanceof HTMLImageElement && img.classList.contains('product-img')) {
    img.outerHTML = imagePlaceholder(img.dataset.cls || '', img.dataset.tint, img.dataset.cat, img.dataset.name);
  }
}, true);

// ---- loading skeletons: grey shapes of the real layout, shown until the data arrives ----
const Skel = {
  line(width = 100, height = 10) { return `<span class="sk sk-line" style="width:${width}%;height:${height}px"></span>`; },
  wrap(html) { return `<div aria-busy="true">${html}<span class="sr-only">Loading&hellip;</span></div>`; },
  productCards(n = 6) {
    return Array.from({ length: n }, () => `<li class="card product-card sk-card" aria-hidden="true">
      <span class="sk sk-img"></span>
      <div class="body">${this.line(45, 8)}${this.line(92)}${this.line(70)}<span class="sk sk-pill"></span></div></li>`).join('');
  },
  rows(n = 3, thumb = true) {
    return this.wrap(Array.from({ length: n }, () => `<div class="card row sk-card" style="padding:12px;margin-bottom:12px">
      ${thumb ? '<span class="sk sk-thumb"></span>' : ''}
      <div class="grow">${this.line(60, 12)}${this.line(40)}${this.line(75, 8)}</div></div>`).join(''));
  },
  block(height, extra = '') { return `<span class="sk" style="height:${height}px;border-radius:16px;${extra}"></span>`; },
};

// Replays a short fade when real content replaces a skeleton.
function reveal(el) {
  if (!el) return;
  el.classList.remove('fade-in');
  void el.offsetWidth;
  el.classList.add('fade-in');
}

function toast(message, type = 'success') {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    root.className = 'toast-root';
    document.body.appendChild(root);
  }
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' error' : '');
  el.setAttribute('role', 'status');
  el.innerHTML = icon(type === 'error' ? 'alert' : 'check', 18) + '<span></span>';
  el.querySelector('span').textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function setBusy(btn, busy) {
  if (!btn) return;
  if (busy) {
    if (!btn.dataset.label) btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> ' + btn.dataset.label;
  } else {
    btn.disabled = false;
    if (btn.dataset.label) { btn.innerHTML = btn.dataset.label; delete btn.dataset.label; }
  }
}

// The scanner and QR libraries load only when a page needs them, and never block the page:
// if a network is slow or filters them, the rest of the page (and typing a code) still works.
const LIBS = {
  scanner: ['vendor/html5-qrcode.min.js?v=2.3.8', () => window.Html5Qrcode],
  qrcode: ['vendor/qrcode.min.js?v=1.0.0', () => window.QRCode],
};
const libLoads = {};
function loadLib(name, timeoutMs = 20000) {
  const [src, ready] = LIBS[name];
  if (ready()) return Promise.resolve(true);
  if (!libLoads[name]) {
    libLoads[name] = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = src;
      const timer = setTimeout(() => resolve(false), timeoutMs);
      s.onload = () => { clearTimeout(timer); resolve(Boolean(ready())); };
      s.onerror = () => { clearTimeout(timer); delete libLoads[name]; s.remove(); resolve(false); };
      document.head.appendChild(s);
    });
  }
  return libLoads[name].then((ok) => ok || Boolean(ready()));
}

// Draw a QR code into el. Shows `fallback` text instead if the QR library can't load.
async function drawQr(el, text, size, fallback) {
  if (!el) return false;
  const ok = await loadLib('qrcode');
  if (!el.isConnected) return false;
  if (!ok) { el.textContent = fallback || 'QR code could not load - use the code shown.'; return false; }
  el.innerHTML = '';
  new QRCode(el, { text, width: size, height: size, colorDark: '#1f1b12', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
  return true;
}

// A Raspberry Pi (or a similar ARM Linux board). Its camera belongs to the CartLess Checkout Pi program and
// its CPU is slow, so staff pages there don't open the camera by themselves, and scanning uses a
// smaller picture. (Chromium hides the CPU type in its user agent; navigator.platform still has it.)
const ON_PI = /Linux (aarch64|arm)/i.test(`${navigator.platform || ''} ${navigator.userAgent}`)
  && !/Android/i.test(navigator.userAgent);

// One camera scanner for everything on a pack: CartLess QR labels AND printed barcodes
// (EAN-13/8, UPC-A/E, Code 128/39). Phones with a built-in barcode detector use it.
async function startCodeScanner(elementId, onDecode, onNoCode, { qrOnly = false } = {}) {
  if (!(await loadLib('scanner'))) {
    const err = new Error('The scanner library did not load');
    err.name = 'LibraryMissing';
    throw err;
  }
  const F = window.Html5QrcodeSupportedFormats;
  const formats = qrOnly ? [F.QR_CODE]
    : [F.QR_CODE, F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39];
  // html5-qrcode decodes at the size the video is laid out, so lay it out at camera size
  // and only shrink it visually (a transform doesn't change the layout size).
  const el = document.getElementById(elementId);
  el.classList.add('scan-surface');
  // QR-only staff pages (wallet counter, exit gate) read a code held up close: a small picture a few
  // times a second is plenty and keeps slower computers (and Firefox) responsive. Barcodes on packs
  // need the big picture.
  const FIREFOX = /Firefox\//.test(navigator.userAgent);
  const [w, h, fps] = (ON_PI || qrOnly) ? [640, 480, 5] : (FIREFOX ? [1280, 720, 6] : [1280, 720, 12]);
  el.style.width = `${w}px`;
  const scanner = new Html5Qrcode(elementId, { verbose: false, formatsToSupport: formats, useBarCodeDetectorIfSupported: true });
  await scanner.start({ facingMode: 'environment' }, {
    fps,
    videoConstraints: { facingMode: 'environment', width: { ideal: w }, height: { ideal: h } },
  }, onDecode, onNoCode);
  const fit = () => {
    const box = el.parentElement;
    if (!box || !el.offsetWidth || !el.offsetHeight) return;
    const scale = Math.max(box.clientWidth / el.offsetWidth, box.clientHeight / el.offsetHeight);
    el.style.transform = `translate(-50%, -50%) scale(${scale})`;
  };
  fit();
  const video = el.querySelector('video');
  if (video) video.addEventListener('loadedmetadata', fit);
  window.addEventListener('resize', fit);
  [200, 800, 2000].forEach((ms) => setTimeout(fit, ms));
  return scanner;
}

// Why the camera did not start, in plain words. On the Raspberry Pi the camera can only be used by
// ONE program: while the CartLess Checkout Pi program runs, the browser cannot open it (and need not).
function cameraHelp(err, fallback) {
  const text = String((err && (err.name || err.message)) || err || '');
  if (/LibraryMissing/.test(text)) return `The scanner did not load on this network - ${fallback}.`;
  if (/NotReadable|in use|Could not start|TrackStart|busy/i.test(text)) {
    return `The camera is busy in another program. On the Pi, the CartLess Checkout Pi program is using it - `
      + `codes it reads appear on this page by themselves. Or ${fallback}.`;
  }
  if (/NotFound|no camera|Requested device not found|Overconstrained/i.test(text)) return `No camera found - ${fallback}.`;
  return `Allow camera access and reload, or ${fallback}.`;
}

function renderNav(active) {
  const tabs = [['index.html', 'Home', 'home'], ['scan.html', 'Scan', 'qr'], ['cart.html', 'Cart', 'cart'], ['wallet.html', 'Wallet', 'wallet'], ['profile.html', 'Profile', 'user']];
  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.setAttribute('aria-label', 'Main navigation');
  nav.innerHTML = '<ul>' + tabs.map(([href, label, ic]) => {
    const isCart = ic === 'cart';
    return `<li><a href="${href}" class="${active === ic ? 'active' : ''}">
      <span class="nav-icon"${isCart ? ' id="cart-icon"' : ''}>${icon(ic)}${isCart ? '<span class="nav-badge" id="cart-badge" hidden></span>' : ''}</span>${label}</a></li>`;
  }).join('') + '</ul>';
  document.body.appendChild(nav);
  refreshCartBadge();
}

let lastCartCount = null;
async function refreshCartBadge(count) {
  const badge = document.getElementById('cart-badge');
  if (!badge) return;
  if (count === undefined) {
    if (!Auth.loggedIn()) return;
    try { count = (await api('/api/cart')).item_count; } catch (e) { return; }
  }
  badge.hidden = count <= 0;
  badge.textContent = count > 99 ? '99+' : String(count);
  if (lastCartCount !== null && count > lastCartCount) {
    const el = document.getElementById('cart-icon');
    el.classList.remove('bounce');
    void el.offsetWidth;
    el.classList.add('bounce');
  }
  lastCartCount = count;
}

/* ---- install CartLess Checkout as an app (PWA): home-screen icon, opens full screen ---- */
let installPrompt = null;
if ('serviceWorker' in navigator && window.isSecureContext && API_BASE === '') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
window.addEventListener('beforeinstallprompt', (e) => {
  installPrompt = e;                       // Chrome / Edge / Samsung: we can show our own Install button
  document.dispatchEvent(new Event('smartcart:installable'));
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  document.querySelectorAll('.install-slot').forEach((el) => { el.innerHTML = ''; });
  toast('CartLess Checkout is on your home screen');
});
function isInstalledApp() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}
function installCard(slot) {
  if (!slot || isInstalledApp()) return;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const draw = () => {
    if (!installPrompt && !ios) { slot.innerHTML = ''; return; }
    slot.innerHTML = `<div class="card install-card">
      <img src="icons/icon-192.png" width="44" height="44" alt="">
      <div class="grow"><p class="small" style="font-weight:600">Install the CartLess Checkout app</p>
        <p class="xs muted">${installPrompt ? 'Opens full screen from your home screen, like a normal app.'
          : 'In Safari, tap the Share button, then <b>Add to Home Screen</b>.'}</p></div>
      ${installPrompt ? '<button type="button" class="btn btn-sm" data-install>Install</button>' : ''}</div>`;
    const btn = slot.querySelector('[data-install]');
    if (btn) {
      btn.onclick = async () => {
        const prompt = installPrompt;
        if (!prompt) return;
        prompt.prompt();
        const choice = await prompt.userChoice.catch(() => ({}));
        if (choice.outcome === 'accepted') { installPrompt = null; slot.innerHTML = ''; }
      };
    }
  };
  draw();
  document.addEventListener('smartcart:installable', draw);
}

/* ---- product pictures: until a real photo is added, each item shows a drawn picture of its pack,
   in the pack's own colour (generic shapes, no brand logos). Admin > Products > Photo replaces it. ---- */
const ART_RULES = [
  [/notebook/i, 'notebook'], [/\bpen\b/i, 'pen'], [/pencil/i, 'pencils'], [/eraser/i, 'eraser'],
  [/fevicol|glue/i, 'glue'], [/geometry/i, 'geobox'], [/highlighter|marker/i, 'highlighter'], [/stapler/i, 'stapler'],
  [/bhujia|namkeen|\bsev\b|mixture/i, 'pouch'], [/lay'?s|kurkure|bingo|chips|crisps/i, 'chips'],
  [/biscuit|cookie|marie|parle|cracker/i, 'biscuits'], [/dairy milk|kitkat|5 star|chocolate|wafer/i, 'chocolate'],
  [/water/i, 'water'], [/cola|coke|pepsi|sprite|soda/i, 'soda'], [/maaza|mango|juice|frooti/i, 'juice'],
  [/red bull|energy drink|\bcan\b/i, 'can'], [/\btea\b/i, 'teabox'], [/coffee|nescafe/i, 'jar'],
  [/noodle|maggi|yippee|pasta/i, 'noodles'], [/soup/i, 'soup'], [/ketchup|sauce/i, 'ketchup'],
  [/toothpaste/i, 'toothpaste'], [/shampoo/i, 'shampoo'], [/razor/i, 'razor'], [/dishwash/i, 'dishbar'],
  [/soap/i, 'soap'], [/detergent|washing powder/i, 'detergent'], [/toilet|cleaner/i, 'cleaner'], [/scrub/i, 'scrub'],
  [/batter/i, 'batteries'], [/bulb/i, 'bulb'], [/webcam|camera/i, 'webcam'], [/micro ?sd|sd card/i, 'sdcard'],
  [/lcd|display/i, 'lcd'], [/raspberry|board/i, 'board'], [/sensor/i, 'kitbox'], [/buzzer|jumper|wire/i, 'wires'],
];
const INK_WORDS = { blue: '#1e4fb0', red: '#c62828', black: '#262626', green: '#2e7d32', yellow: '#f2d43a' };

function hexMix(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  return '#' + [16, 8, 0].map((s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t)
    .toString(16).padStart(2, '0')).join('');
}
function hexLum(h) {
  const p = parseInt(h.slice(1), 16);
  return (0.2126 * ((p >> 16) & 255) + 0.7152 * ((p >> 8) & 255) + 0.0722 * (p & 255)) / 255;
}
function artKind(name) {
  const rule = ART_RULES.find(([re]) => re.test(name || ''));
  return rule ? rule[1] : null;
}

function bottleArt(c, liquid, label, cap) {
  return `<rect x="71" y="9" width="18" height="11" rx="2.5" fill="${cap}" ${c.s}/>
    <path d="M73 20 H87 L91 32 H69 Z" fill="${liquid}" ${c.s}/>
    <path d="M67 32 H93 Q100 40 99 52 V96 Q99 105 90 105 H70 Q61 105 61 96 V52 Q60 40 67 32 Z" fill="${liquid}" ${c.s}/>
    <rect x="61" y="56" width="38" height="24" fill="${label}" ${c.s}/>
    <path d="M65 88 H95 M65 94 H95" stroke="#ffffff" stroke-width="2" opacity=".35"/>
    <rect x="66" y="38" width="5" height="54" rx="2.5" fill="#ffffff" opacity=".22"/>`;
}

const ART = {
  notebook: (c) => `<rect x="52" y="14" width="60" height="90" rx="5" fill="${c.base}" ${c.s}/>
    <rect x="53" y="15" width="10" height="88" rx="3" fill="${c.dark}"/>
    ${[24, 34, 44, 54, 64, 74, 84, 94].map((y) => `<circle cx="58" cy="${y}" r="2.2" fill="${c.paper}"/>`).join('')}
    <rect x="70" y="34" width="34" height="24" rx="3" fill="${c.paper}" ${c.s}/>
    <path d="M75 43 H99 M75 50 H92" stroke="${c.ink}" stroke-width="1.8" stroke-linecap="round" opacity=".5"/>`,
  pen: (c) => `<g transform="translate(80 62) rotate(-30) scale(1.18) translate(-80 -62)">
    <rect x="30" y="55" width="84" height="13" rx="6.5" fill="${c.base}" ${c.s}/>
    <rect x="96" y="55" width="18" height="13" fill="${c.ink}" opacity=".18"/>
    <path d="M114 55.5 L130 61.5 L114 67.5 Z" fill="${c.paper}" ${c.s}/>
    <circle cx="131" cy="61.5" r="1.8" fill="${c.accent}"/>
    <rect x="24" y="53" width="30" height="17" rx="5" fill="${c.accent}" ${c.s}/>
    <rect x="28" y="47.5" width="24" height="5.5" rx="2.7" fill="${c.accent}" ${c.s}/></g>`,
  pencils: (c) => `<g transform="rotate(-18 80 62)">${[38, 56, 74].map((y, i) => `
    <rect x="28" y="${y}" width="76" height="12" fill="${i === 1 ? c.dark : c.base}" ${c.s}/>
    <rect x="28" y="${y + 4.5}" width="76" height="3" fill="${c.soft}" opacity=".6"/>
    <path d="M104 ${y} L124 ${y + 6} L104 ${y + 12} Z" fill="#ecd3a6" ${c.s}/>
    <path d="M118 ${y + 4.2} L124 ${y + 6} L118 ${y + 7.8} Z" fill="#2c2c2c"/>
    <rect x="22" y="${y}" width="7" height="12" rx="1.5" fill="#c4232b" ${c.s}/>`).join('')}</g>`,
  eraser: (c) => `<g transform="rotate(-12 80 64)">
    <rect x="40" y="46" width="76" height="34" rx="7" fill="${c.light ? '#fbfbf6' : c.soft}" ${c.s}/>
    <rect x="70" y="43" width="50" height="40" rx="4" fill="${c.accent}" ${c.s}/>
    <path d="M78 56 H110 M78 66 H102" stroke="${c.paper}" stroke-width="3" stroke-linecap="round" opacity=".85"/></g>`,
  glue: (c) => `<path d="M76 28 L78 10 H82 L84 28 Z" fill="${c.light ? '#e3892e' : c.dark}" ${c.s}/>
    <path d="M67 40 L72 28 H88 L93 40 Z" fill="${c.paper}" ${c.s}/>
    <rect x="58" y="40" width="44" height="65" rx="10" fill="${c.paper}" ${c.s}/>
    <rect x="58" y="58" width="44" height="28" fill="${c.light ? '#e3892e' : c.base}" ${c.s}/>
    <path d="M66 72 H94" stroke="${c.paper}" stroke-width="3" stroke-linecap="round"/>`,
  geobox: (c) => `<rect x="34" y="32" width="92" height="66" rx="8" fill="${c.base}" ${c.s}/>
    <rect x="35" y="33" width="90" height="12" rx="6" fill="${c.dark}"/>
    <rect x="44" y="58" width="50" height="12" rx="2" fill="${c.paper}" ${c.s}/>
    <path d="M50 58 v6 M56 58 v4 M62 58 v6 M68 58 v4 M74 58 v6 M80 58 v4 M86 58 v6" stroke="${c.ink}" stroke-width="1.4"/>
    <path d="M108 52 L100 88 M108 52 L116 88" stroke="${c.paper}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="108" cy="52" r="3.5" fill="${c.paper}"/>`,
  highlighter: (c) => `<g transform="rotate(-30 80 62)">
    <rect x="30" y="49" width="66" height="26" rx="6" fill="${c.base}" ${c.s}/>
    <rect x="94" y="47" width="28" height="30" rx="5" fill="${c.dark}" ${c.s}/>
    <rect x="24" y="54" width="8" height="16" rx="2" fill="${c.dark}" ${c.s}/>
    <rect x="40" y="56" width="42" height="11" rx="2" fill="${c.paper}" opacity=".75"/></g>`,
  stapler: (c) => `<rect x="30" y="86" width="100" height="12" rx="6" fill="#4b4d48" ${c.s}/>
    <path d="M36 84 C36 62 62 52 126 64 L128 78 C98 74 62 76 42 86 Z" fill="${c.base}" ${c.s}/>
    <path d="M60 70 C80 64 100 64 120 68" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity=".3"/>
    <circle cx="42" cy="81" r="6" fill="${c.dark}" ${c.s}/>`,
  chips: (c) => `<path d="M50 22 H110 C115 48 115 78 110 102 H50 C45 78 45 48 50 22 Z" fill="${c.base}" ${c.s}/>
    <rect x="47" y="15" width="66" height="12" rx="2" fill="${c.dark}" ${c.s}/>
    <rect x="47" y="97" width="66" height="12" rx="2" fill="${c.dark}" ${c.s}/>
    <path d="M53 15v12 M59 15v12 M65 15v12 M71 15v12 M77 15v12 M83 15v12 M89 15v12 M95 15v12 M101 15v12 M107 15v12 M53 97v12 M59 97v12 M65 97v12 M71 97v12 M77 97v12 M83 97v12 M89 97v12 M95 97v12 M101 97v12 M107 97v12" stroke="${c.ink}" stroke-width="1" opacity=".3"/>
    <ellipse cx="80" cy="64" rx="22" ry="18" fill="${c.paper}" ${c.s}/>
    <ellipse cx="72" cy="66" rx="9" ry="6" fill="#f0c55a" transform="rotate(-20 72 66)" ${c.s}/>
    <ellipse cx="88" cy="62" rx="9" ry="6" fill="#e9b94a" transform="rotate(25 88 62)" ${c.s}/>
    <ellipse cx="80" cy="72" rx="8" ry="5" fill="#f3cf6c" ${c.s}/>`,
  pouch: (c) => `<path d="M52 20 H108 L112 96 Q80 107 48 96 Z" fill="${c.base}" ${c.s}/>
    <path d="M53 30 H107" stroke="${c.dark}" stroke-width="3"/>
    <rect x="61" y="46" width="38" height="32" rx="9" fill="${c.paper}" ${c.s}/>
    ${[54, 61, 68].map((y) => `<path d="M65 ${y} q3.5 -4 7 0 t7 0 t7 0 t7 0" stroke="#cf8a2e" stroke-width="2.2" fill="none" stroke-linecap="round"/>`).join('')}
    <path d="M60 88 H100" stroke="${c.paper}" stroke-width="3" stroke-linecap="round" opacity=".6"/>`,
  biscuits: (c) => `<rect x="24" y="44" width="96" height="40" rx="8" fill="${c.base}" ${c.s}/>
    <rect x="24" y="56" width="96" height="14" fill="${c.paper}" opacity=".55"/>
    <rect x="114" y="45" width="20" height="38" rx="9" fill="${c.biscuit}" ${c.s}/>
    <path d="M118 52 H130 M118 59 H130 M118 66 H130 M118 73 H130" stroke="${c.ink}" stroke-width="1.2" opacity=".35"/>
    <rect x="38" y="51" width="26" height="26" rx="5" fill="${c.biscuit}" ${c.s}/>
    <circle cx="45" cy="58" r="1.6" fill="${c.ink}" opacity=".45"/><circle cx="57" cy="58" r="1.6" fill="${c.ink}" opacity=".45"/>
    <circle cx="45" cy="70" r="1.6" fill="${c.ink}" opacity=".45"/><circle cx="57" cy="70" r="1.6" fill="${c.ink}" opacity=".45"/>`,
  chocolate: (c) => `<g transform="rotate(-10 80 64)">
    <rect x="28" y="46" width="88" height="36" rx="5" fill="${c.base}" ${c.s}/>
    <path d="M28 72 H104" stroke="#f2d06b" stroke-width="3" opacity=".9"/>
    <rect x="102" y="43" width="30" height="42" rx="3" fill="#cfd3d6" ${c.s}/>
    <rect x="108" y="48" width="20" height="32" rx="2" fill="#5a3420"/>
    <path d="M118 48 V80 M108 58.7 H128 M108 69.3 H128" stroke="#3d2214" stroke-width="1.4"/></g>`,
  water: (c) => bottleArt(c, hexMix(c.base, '#ffffff', 0.72), c.base, c.dark),
  soda: (c) => bottleArt(c, '#3a1d14', c.base, c.base),
  juice: (c) => bottleArt(c, hexMix(c.base, '#ffffff', 0.2), c.paper, c.dark),
  can: (c) => `<rect x="61" y="22" width="38" height="82" rx="7" fill="${c.base}" ${c.s}/>
    <path d="M61 72 L99 50 V64 L61 86 Z" fill="#d4d8dc" opacity=".85"/>
    <ellipse cx="80" cy="24" rx="19" ry="4.5" fill="#c9ced3" ${c.s}/>
    <path d="M62 97 Q80 106 98 97" stroke="#c9ced3" stroke-width="4" fill="none"/>
    <rect x="66" y="30" width="5" height="64" rx="2.5" fill="#ffffff" opacity=".2"/>`,
  teabox: (c) => `<path d="M42 40 L58 30 H118 L102 40 Z" fill="${c.soft}" ${c.s}/>
    <path d="M102 40 L118 30 V94 L102 104 Z" fill="${c.dark}" ${c.s}/>
    <rect x="42" y="40" width="60" height="64" fill="${c.base}" ${c.s}/>
    <path d="M58 88 Q60 62 86 58 Q86 84 58 88 Z" fill="${c.paper}" opacity=".9"/>
    <path d="M60 86 Q70 72 84 60" stroke="${c.base}" stroke-width="1.6" fill="none"/>`,
  jar: (c) => `<rect x="57" y="18" width="46" height="15" rx="3" fill="${c.base}" ${c.s}/>
    <rect x="53" y="33" width="54" height="72" rx="11" fill="#4a2c1a" ${c.s}/>
    <rect x="53" y="52" width="54" height="30" fill="${c.paper}" ${c.s}/>
    <rect x="53" y="60" width="54" height="9" fill="${c.base}"/>
    <rect x="60" y="38" width="6" height="60" rx="3" fill="#ffffff" opacity=".16"/>`,
  noodles: (c) => `<rect x="36" y="26" width="88" height="74" rx="8" fill="${c.base}" ${c.s}/>
    <rect x="37" y="27" width="86" height="9" rx="4" fill="${c.dark}"/>
    <rect x="37" y="90" width="86" height="9" rx="4" fill="${c.dark}"/>
    <rect x="50" y="44" width="60" height="38" rx="17" fill="${c.paper}" ${c.s}/>
    ${[54, 62, 70].map((y) => `<path d="M58 ${y} q4 -5 8 0 t8 0 t8 0 t8 0 t8 0" stroke="#e2a63e" stroke-width="2.4" fill="none" stroke-linecap="round"/>`).join('')}`,
  soup: (c) => `<rect x="46" y="18" width="68" height="88" rx="4" fill="${c.base}" ${c.s}/>
    <rect x="47" y="19" width="66" height="9" fill="${c.dark}"/>
    <path d="M56 66 H104 Q102 90 80 90 Q58 90 56 66 Z" fill="${c.paper}" ${c.s}/>
    <ellipse cx="80" cy="66" rx="24" ry="4.5" fill="${c.soft}" ${c.s}/>
    <path d="M70 56 q-4 -6 0 -12 M80 56 q-4 -6 0 -12 M90 56 q-4 -6 0 -12" stroke="${c.paper}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
  ketchup: (c) => `<rect x="68" y="10" width="24" height="17" rx="4" fill="#f4f4ee" ${c.s}/>
    <path d="M66 27 H94 Q104 40 104 58 V96 Q104 105 95 105 H65 Q56 105 56 96 V58 Q56 40 66 27 Z" fill="${c.base}" ${c.s}/>
    <rect x="56" y="58" width="48" height="28" fill="${c.paper}" ${c.s}/>
    <circle cx="80" cy="73" r="8" fill="${c.base}"/><path d="M78 64 q2 -4 6 -3" stroke="#3d8b3d" stroke-width="2.4" fill="none"/>`,
  toothpaste: (c) => `<rect x="22" y="47" width="10" height="38" rx="1.5" fill="${c.paper}" ${c.s}/>
    <path d="M31 48 L106 54 V78 L31 84 Z" fill="${c.paper}" ${c.s}/>
    <path d="M31 58 L106 60 V72 L31 74 Z" fill="${c.base}"/>
    <rect x="106" y="55" width="22" height="22" rx="3" fill="${c.base}" ${c.s}/>
    <path d="M110 59 V73 M115 59 V73 M120 59 V73" stroke="${c.ink}" stroke-width="1" opacity=".35"/>`,
  soap: (c) => `<rect x="36" y="44" width="88" height="50" rx="21" fill="${c.base}" ${c.s}/>
    <rect x="46" y="50" width="68" height="13" rx="6.5" fill="#ffffff" opacity=".22"/>
    <ellipse cx="80" cy="72" rx="22" ry="12" fill="${c.paper}" ${c.s}/>
    <path d="M70 72 H90" stroke="${c.base}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="112" cy="36" r="6" fill="${c.paper}" ${c.s}/><circle cx="124" cy="28" r="4" fill="${c.paper}" ${c.s}/>`,
  shampoo: (c) => `<rect x="66" y="12" width="28" height="18" rx="5" fill="${c.dark}" ${c.s}/>
    <path d="M62 30 H98 Q106 30 106 40 V96 Q106 105 97 105 H63 Q54 105 54 96 V40 Q54 30 62 30 Z" fill="${c.base}" ${c.s}/>
    <rect x="62" y="50" width="36" height="36" rx="7" fill="${c.paper}" ${c.s}/>
    <path d="M80 56 Q90 68 80 78 Q70 68 80 56 Z" fill="${c.base}"/>`,
  razor: (c) => `<g transform="rotate(-35 80 62)">
    <rect x="20" y="56" width="84" height="12" rx="6" fill="${c.base}" ${c.s}/>
    <path d="M34 59 v6 M42 59 v6 M50 59 v6 M58 59 v6" stroke="${c.paper}" stroke-width="2" opacity=".6"/>
    <rect x="102" y="43" width="16" height="38" rx="4" fill="#d4d7da" ${c.s}/>
    <path d="M110 47 V77" stroke="#8a9096" stroke-width="2"/></g>`,
  dishbar: (c) => `<rect x="38" y="46" width="84" height="46" rx="10" fill="${c.base}" ${c.s}/>
    <rect x="38" y="80" width="84" height="5" fill="${c.paper}" opacity=".5"/>
    <ellipse cx="66" cy="66" rx="15" ry="12" fill="#f2d43a" ${c.s}/>
    <path d="M66 54 V78 M53 66 H79 M57 58 L75 74 M75 58 L57 74" stroke="#fff6b0" stroke-width="1.4"/>
    <path d="M90 60 H110 M90 68 H106" stroke="${c.paper}" stroke-width="3" stroke-linecap="round"/>`,
  detergent: (c) => `<path d="M42 20 H118 L122 98 Q80 107 38 98 Z" fill="${c.base}" ${c.s}/>
    <rect x="68" y="27" width="24" height="8" rx="4" fill="${c.paper}" ${c.s}/>
    <path d="M40 64 Q60 54 80 64 T121 64 L122 78 Q100 70 80 78 T39 78 Z" fill="${c.paper}" opacity=".9"/>
    <circle cx="60" cy="88" r="5" fill="${c.paper}" opacity=".8"/><circle cx="72" cy="92" r="3" fill="${c.paper}" opacity=".8"/><circle cx="100" cy="46" r="6" fill="${c.paper}" opacity=".8"/>`,
  cleaner: (c) => `<path d="M83 9 L104 17 L100 26 L80 18 Z" fill="#f4f4ee" ${c.s}/>
    <path d="M70 32 L82 16 L99 23 L91 38 Z" fill="${c.base}" ${c.s}/>
    <path d="M58 36 H96 Q104 40 104 50 V97 Q104 105 97 105 H61 Q54 105 54 97 V44 Q54 36 58 36 Z" fill="${c.base}" ${c.s}/>
    <rect x="60" y="54" width="38" height="34" rx="5" fill="${c.paper}" ${c.s}/>
    <path d="M64 76 Q72 68 80 76 T96 76" stroke="${c.base}" stroke-width="3" fill="none"/>`,
  scrub: (c) => `<rect x="38" y="60" width="84" height="30" rx="7" fill="#f2c94c" ${c.s}/>
    <rect x="38" y="44" width="84" height="20" rx="6" fill="${c.base}" ${c.s}/>
    ${[48, 60, 72, 84, 96, 108].map((x) => `<circle cx="${x}" cy="54" r="1.6" fill="${c.paper}" opacity=".7"/>`).join('')}
    <circle cx="56" cy="76" r="2" fill="#d9a92e"/><circle cx="76" cy="80" r="2" fill="#d9a92e"/><circle cx="98" cy="74" r="2" fill="#d9a92e"/>`,
  batteries: (c) => [44, 70].map((y) => `<rect x="30" y="${y}" width="84" height="20" rx="4" fill="#2b2b2b" ${c.s}/>
    <rect x="84" y="${y + 1}" width="30" height="18" fill="${c.base}"/>
    <rect x="114" y="${y + 5}" width="7" height="10" rx="1.5" fill="#c9ced3" ${c.s}/>
    <path d="M40 ${y + 10} H72" stroke="#ffffff" stroke-width="2" opacity=".25"/>`).join(''),
  bulb: (c) => `<path d="M80 12 v-4 M52 24 l-4 -4 M108 24 l4 -4 M44 48 h-6 M116 48 h6" stroke="#f2c94c" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M80 18 C96 18 108 30 108 46 C108 58 98 64 95 74 H65 C62 64 52 58 52 46 C52 30 64 18 80 18 Z" fill="#fffbe6" ${c.s}/>
    <rect x="67" y="74" width="26" height="20" rx="3" fill="#c9ced3" ${c.s}/>
    <path d="M67 80 H93 M67 86 H93" stroke="#8a9096" stroke-width="1.6"/>
    <path d="M72 94 H88 L84 102 H76 Z" fill="#4b4d48"/>`,
  webcam: (c) => `<path d="M72 78 L67 98 H93 L88 78 Z" fill="#3a3a3a" ${c.s}/>
    <ellipse cx="80" cy="99" rx="20" ry="4" fill="#3a3a3a"/>
    <rect x="38" y="32" width="84" height="46" rx="23" fill="#2b2b2b" ${c.s}/>
    <circle cx="80" cy="55" r="16" fill="#4d4d4d" ${c.s}/>
    <circle cx="80" cy="55" r="9" fill="#1b2a4a"/><circle cx="76.5" cy="51.5" r="2.6" fill="#ffffff" opacity=".7"/>
    <circle cx="106" cy="55" r="3" fill="${c.base}"/>`,
  sdcard: (c) => `<path d="M56 18 H96 L104 26 V56 L100 60 V102 Q100 106 96 106 H60 Q56 106 56 102 Z" fill="#2b2b2b" ${c.s}/>
    <rect x="61" y="28" width="34" height="44" rx="3" fill="${c.base}"/>
    <path d="M66 40 H90 M66 48 H84" stroke="${c.paper}" stroke-width="3" stroke-linecap="round"/>
    ${[62, 69, 76, 83, 90].map((x) => `<rect x="${x}" y="84" width="4" height="14" rx="1" fill="#d9b44a"/>`).join('')}`,
  lcd: (c) => `<rect x="22" y="32" width="116" height="68" rx="5" fill="${c.base}" ${c.s}/>
    ${[30, 38, 46, 54, 62, 70, 78, 86, 94, 102, 110, 118, 126].map((x) => `<circle cx="${x}" cy="38" r="1.6" fill="#d9b44a"/>`).join('')}
    <rect x="32" y="46" width="96" height="44" rx="3" fill="#1d1d1d"/>
    <rect x="37" y="51" width="86" height="34" fill="#9fd36d"/>
    ${[0, 1].map((r) => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `<rect x="${41 + i * 8}" y="${55 + r * 14}" width="6" height="10" fill="#2f4d1d" opacity="${(i + r) % 3 ? 0.55 : 0.18}"/>`).join('')).join('')}`,
  board: (c) => `<rect x="24" y="32" width="108" height="70" rx="6" fill="#2f7d4f" ${c.s}/>
    <rect x="32" y="37" width="72" height="9" rx="1" fill="#1f1f1f"/>
    ${[36, 43, 50, 57, 64, 71, 78, 85, 92, 99].map((x) => `<circle cx="${x}" cy="41.5" r="1.4" fill="#d9b44a"/>`).join('')}
    <rect x="52" y="58" width="24" height="24" rx="2" fill="#1f1f1f"/>
    <rect x="84" y="62" width="14" height="14" rx="1.5" fill="#1f1f1f"/>
    <rect x="120" y="50" width="20" height="16" rx="1.5" fill="#c9ced3" ${c.s}/>
    <rect x="120" y="72" width="20" height="16" rx="1.5" fill="#c9ced3" ${c.s}/>
    <circle cx="30" cy="96" r="2.6" fill="${c.paper}"/><circle cx="126" cy="38" r="2.6" fill="${c.paper}"/>
    <circle cx="40" cy="78" r="3" fill="${c.base}"/>`,
  kitbox: (c) => `<path d="M30 40 L46 30 H130 L114 40 Z" fill="${c.soft}" ${c.s}/>
    <path d="M114 40 L130 30 V92 L114 102 Z" fill="${c.dark}" ${c.s}/>
    <rect x="30" y="40" width="84" height="62" fill="${c.base}" ${c.s}/>
    ${[[38, 48], [62, 48], [86, 48], [38, 74], [62, 74], [86, 74]].map(([x, y]) => `<rect x="${x}" y="${y}" width="20" height="20" rx="2" fill="${c.paper}" ${c.s}/><rect x="${x + 6}" y="${y + 6}" width="8" height="8" fill="#2b2b2b"/>`).join('')}`,
  wires: (c) => `<path d="M76 40 C104 38 98 74 128 74" stroke="#d63b3b" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M76 52 C104 52 98 86 128 86" stroke="#2b2b2b" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M76 64 C100 64 100 98 128 98" stroke="${c.base}" stroke-width="4" fill="none" stroke-linecap="round"/>
    ${[74, 86, 98].map((y) => `<rect x="124" y="${y - 4}" width="12" height="8" rx="1.5" fill="#1f1f1f"/>`).join('')}
    <circle cx="52" cy="64" r="22" fill="#262626" ${c.s}/><circle cx="52" cy="64" r="15" fill="#333333"/><circle cx="52" cy="64" r="4" fill="#5a5a5a"/>`,
};

function productArt(name, tint) {
  const kind = artKind(name);
  if (!kind) return null;
  const base = /^#[0-9a-f]{6}$/i.test(tint || '') ? tint.toLowerCase() : '#8a9a5b';
  const light = hexLum(base) > 0.78;
  const word = (/\b(blue|red|black|green|yellow)\b/i.exec(name || '') || [])[1];
  const ink = light ? '#62675a' : hexMix(base, '#000000', 0.55);
  const c = {
    base, light, ink,
    dark: hexMix(base, '#000000', light ? 0.2 : 0.28),
    soft: hexMix(base, '#ffffff', 0.5),
    paper: '#fffdf6',
    accent: word ? INK_WORDS[word.toLowerCase()] : hexMix(base, '#000000', light ? 0.45 : 0.3),
    biscuit: /oreo|chocolate cream|bourbon/i.test(name) ? '#3d2b22' : '#d9a35a',
  };
  c.s = `stroke="${c.ink}" stroke-width="1.6" stroke-linejoin="round"`;
  return `<svg viewBox="16 2 128 114" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <ellipse cx="80" cy="109" rx="46" ry="5" fill="#000000" opacity=".09"/>${ART[kind](c)}</svg>`;
}


/* ---- v2.8: offers, aisles, sounds, Call staff, larger text ---- */

// Price with the MRP struck through and "Save Rs X" when the item is on offer.
function priceHtml(p, big = false) {
  const save = p.mrp && p.mrp > p.price ? p.mrp - p.price : 0;
  if (!save) return `<span class="price${big ? ' big' : ''}">${money(p.price)}</span>`;
  return `<span class="price${big ? ' big' : ''}">${money(p.price)}</span> <s class="mrp">${money(p.mrp).replace('.00', '')}</s>
    <span class="save-pill">Save ${money(save).replace('.00', '')}</span>`;
}
function aisleLabel(aisle) { return aisle ? `Aisle ${aisle}` : ''; }

// Short beeps like a shop scanner (and a buzz on phones that vibrate). Never throws.
const Feedback = {
  ctx: null,
  tone(freq, ms, when = 0, type = 'sine') {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = this.ctx || new AC();
      const t = this.ctx.currentTime + when;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + ms / 1000 + 0.02);
    } catch (e) { /* no sound: fine */ }
  },
  buzz(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* ignore */ } },
  ok() { this.tone(1046, 110); this.buzz(60); },
  bad() { this.tone(220, 180, 0, 'square'); this.tone(196, 220, 0.2, 'square'); this.buzz([120, 80, 120]); },
};

// Bigger text for anyone who wants it (Profile > Larger text). Remembered on this phone.
function largeText(on) {
  try {
    if (on === undefined) on = localStorage.getItem('smartcart_large_text') === '1';
    else localStorage.setItem('smartcart_large_text', on ? '1' : '0');
  } catch (e) { /* private mode: just this page */ }
  document.documentElement.classList.toggle('large-text', Boolean(on));
  return Boolean(on);
}
largeText();

/* Call staff: a button on the shopper's Scan, Cart and List pages. Staff answer from theirs. */
const HELP_REASONS = [
  ['wont_scan', "An item won't scan"], ['weight', 'The cart or exit gate is not working'],
  ['find', "I can't find an item"], ['payment', 'Wallet or payment'], ['other', 'Something else'],
];
const Help = {
  location: '',
  timer: null,
  current: null,
  mount(location) {
    if (!Auth.loggedIn() || Auth.isAdmin()) return;
    this.location = location || '';
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'help-fab';
    fab.id = 'help-fab';
    fab.innerHTML = `${icon('hand', 18)}<span>Call staff</span>`;
    fab.onclick = () => this.open();
    // Sits in the page header (top right), so it never covers the cart's Pay bar or list buttons
    const slot = document.getElementById('head-action');
    if (slot) slot.appendChild(fab); else document.body.appendChild(fab);
    const dlg = document.createElement('dialog');
    dlg.className = 'modal';
    dlg.id = 'help-dialog';
    document.body.appendChild(dlg);
    this.poll();
  },
  render() {
    const dlg = document.getElementById('help-dialog');
    const h = this.current;
    if (h) {
      const coming = h.status === 'coming';
      dlg.innerHTML = `<div class="modal-body center">
        <div class="sheet-icon">${icon(coming ? 'check' : 'hand', 24)}</div>
        <p class="sheet-title">${coming ? `${esc(h.staff_name || 'Staff')} is on the way` : 'Staff have been told'}</p>
        <p class="small muted">${esc(h.reason_text)}${h.location ? ` &middot; ${esc(h.location)}` : ''}</p>
        <p class="xs muted" style="margin-top:6px">${coming ? 'Stay where you are, help is coming.' : 'Someone will come to you shortly. This page updates by itself.'}</p>
        <div class="row" style="margin-top:16px;gap:8px"><button type="button" class="btn btn-outline" style="flex:1" data-help="cancel">Don't need it</button>
        <button type="button" class="btn" style="flex:1" data-help="close">OK</button></div></div>`;
    } else {
      dlg.innerHTML = `<div class="modal-body">
        <p class="sheet-title">Call a staff member</p>
        <p class="small muted center" style="margin-bottom:12px">They'll come to you${this.location ? ` (${esc(this.location)})` : ''}.</p>
        <div class="help-reasons">${HELP_REASONS.map(([k, t]) => `<button type="button" class="btn btn-outline" data-reason="${k}">${esc(t)}</button>`).join('')}</div>
        <button type="button" class="btn btn-ghost btn-block" style="margin-top:8px" data-help="close">Cancel</button></div>`;
    }
    dlg.onclick = (e) => this.onClick(e);
    const fab = document.getElementById('help-fab');
    if (fab) {
      fab.classList.toggle('waiting', Boolean(h));
      fab.querySelector('span').textContent = h ? (h.status === 'coming' ? 'Staff coming' : 'Staff called') : 'Call staff';
    }
  },
  open() { this.render(); document.getElementById('help-dialog').showModal(); },
  async onClick(e) {
    const dlg = document.getElementById('help-dialog');
    const reason = e.target.closest('[data-reason]');
    const act = e.target.closest('[data-help]');
    if (reason) {
      setBusy(reason, true);
      try {
        const { help } = await api('/api/help', { method: 'POST', body: { reason: reason.dataset.reason, location: this.location } });
        this.current = help;
        toast('Staff have been told - someone is coming');
        this.render();
        this.schedule();
      } catch (err) { toast(err.message, 'error'); setBusy(reason, false); }
    } else if (act && act.dataset.help === 'cancel' && this.current) {
      try { await api(`/api/help/${this.current.id}/cancel`, { method: 'POST', body: {} }); } catch (err) { /* ignore */ }
      this.current = null;
      dlg.close();
      this.render();
    } else if (act) {
      dlg.close();
    }
  },
  async poll() {
    try {
      const before = this.current && this.current.status;
      const { help } = await api('/api/help/mine');
      this.current = help;
      if (help && help.status === 'coming' && before === 'open') { Feedback.ok(); toast(`${help.staff_name || 'Staff'} is on the way`); }
      if (!help && before) toast('Staff marked your request as done');
      const dlg = document.getElementById('help-dialog');
      if (!dlg.open || help || before) this.render();
    } catch (e) { /* offline: try again later */ }
    this.schedule();
  },
  // Only watch the server while a call is open (no needless traffic otherwise)
  schedule() {
    clearTimeout(this.timer);
    if (this.current) this.timer = setTimeout(() => this.poll(), document.hidden ? 15000 : 5000);
  },
};

/* Staff pages (Admin, Wallet counter, Exit gate): shoppers asking for help appear at the top. */
const HelpDesk = {
  seen: new Set(),
  primed: false,
  start() {
    if (!Auth.isAdmin()) return;
    const box = document.createElement('div');
    box.id = 'help-desk';
    box.className = 'help-desk';
    box.hidden = true;
    const main = document.getElementById('main');
    main.parentNode.insertBefore(box, main);
    box.addEventListener('click', (e) => this.onClick(e));
    this.poll();
    setInterval(() => { if (!document.hidden) this.poll(); }, 6000);
  },
  async poll() {
    try {
      const { help } = await api('/api/admin/help');
      const fresh = help.filter((h) => !this.seen.has(h.id));
      if (fresh.length && this.primed) { Feedback.ok(); toast(`${fresh[0].user_name} needs help`); }
      help.forEach((h) => this.seen.add(h.id));
      this.primed = true;
      const box = document.getElementById('help-desk');
      box.hidden = !help.length;
      box.innerHTML = help.map((h) => `<div class="help-call${h.status === 'coming' ? ' coming' : ''}">
        ${icon('hand', 20)}
        <div class="grow"><p class="small" style="font-weight:700">${esc(h.user_name)} needs help</p>
          <p class="xs">${esc(h.reason_text)}${h.location ? ` &middot; ${esc(h.location)}` : ''} &middot; ${ago(h.age_sec)}${h.status === 'coming' ? ` &middot; ${esc(h.staff_name)} going` : ''}</p>
          ${h.note ? `<p class="xs muted">"${esc(h.note)}"</p>` : ''}</div>
        <div class="help-acts">${h.status === 'open' ? `<button type="button" class="btn btn-sm" data-call="${h.id}" data-do="coming">On my way</button>` : ''}
        <button type="button" class="btn btn-outline btn-sm" data-call="${h.id}" data-do="done">Done</button></div></div>`).join('');
    } catch (e) { /* ignore polling errors */ }
  },
  async onClick(e) {
    const btn = e.target.closest('button[data-call]');
    if (!btn) return;
    setBusy(btn, true);
    try {
      await api(`/api/admin/help/${btn.dataset.call}/${btn.dataset.do}`, { method: 'POST', body: {} });
      toast(btn.dataset.do === 'coming' ? 'The shopper sees you are on the way' : 'Marked as done');
    } catch (err) { toast(err.message, 'error'); }
    this.poll();
  },
};
