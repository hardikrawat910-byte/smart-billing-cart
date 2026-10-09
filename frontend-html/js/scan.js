renderNav('qr');

let busy = false;
let sheetOpen = false;
let lastCode = '';     // the same code is ignored until it has left the camera view
let missedFrames = 0;
let cooldownUntil = 0; // short pause for the camera after each result
let hwMode = 'off';
const sheet = document.getElementById('sheet');
const backdrop = document.getElementById('sheet-backdrop');

function working(on) { document.getElementById('working').classList.toggle('show', on); }

async function init() {
  if (!Auth.require()) return;
  Help.mount('Scan page');
  try { hwMode = (await api('/api/health')).hardware_mode; } catch (e) { /* keep "off" */ }
  if (hwMode !== 'off') {
    document.getElementById('hw-panel').hidden = false;
    document.getElementById('hw-cam-card').hidden = hwMode !== 'full';
    document.getElementById('hw-mode').textContent = hwMode === 'full'
      ? 'Verification on: barcode + weight + camera must all agree.'
      : 'Verification on: barcode + weight must agree.';
    pollHardware();
    setInterval(pollHardware, 1500);
    if (Auth.isAdmin()) setupSimulator();
  }
  startCamera();
}

// Admins can fake the Raspberry Pi readings right here, so the demo needs only this one page.
function setupSimulator() {
  document.getElementById('hw-sim').hidden = false;
  const btn = document.getElementById('sim-send');
  btn.onclick = async () => {
    const body = { weight_g: document.getElementById('sim-weight').value };
    if (hwMode === 'full') body.color_hex = document.getElementById('sim-color').value;
    if (!String(body.weight_g).trim()) { toast('Enter a weight in grams first', 'error'); return; }
    setBusy(btn, true);
    try {
      await api('/api/hardware/simulate', { method: 'POST', body });
      lastCode = '';               // let the code already in view be read again
      toast('Reading sent - now scan the item');
      pollHardware();
    } catch (err) {
      toast(err.message, 'error');
    }
    setBusy(btn, false);
  };
  document.getElementById('sim-color').hidden = hwMode !== 'full';
}

async function startCamera() {
  if (!window.isSecureContext) {
    showDenied('Browsers only allow the camera on https:// or localhost. Open http://127.0.0.1:5000 on the laptop, or enter the code manually below.');
    return;
  }
  try {
    await startCodeScanner('reader', onDecode, onNoCode);
    document.getElementById('cam-status').textContent = 'Ready - barcode or QR code';
  } catch (err) {
    showDenied(err && err.name === 'LibraryMissing'
      ? 'The scanner did not load on this network. You can enter the code manually below.'
      : 'Allow camera access in your browser settings, then reload this page to start scanning.');
  }
}

function showDenied(text) {
  document.getElementById('denied').hidden = false;
  document.getElementById('denied-text').textContent = text;
  document.getElementById('cam-status').hidden = true;
  document.getElementById('manual-form').hidden = false;
}

function onDecode(text) {
  missedFrames = 0;
  // An item still held in front of the camera must not be added twice:
  // the same code only counts again after it has left the view for about a second.
  if (busy || sheetOpen || Date.now() < cooldownUntil || text === lastCode) return;
  lastCode = text;
  handleCode(text);
}

function onNoCode() {
  missedFrames += 1;
  if (missedFrames >= 10) lastCode = '';   // ~1 s at 10 fps with no code in view
}

async function handleCode(code) {
  busy = true;
  working(true);
  try {
    const data = await api('/api/scan', { method: 'POST', body: { code } });
    refreshCartBadge(data.cart.item_count);
    Feedback.ok();
    openSheet('success', data);
    afterAdd(data);
  } catch (err) {
    const v = err.data && err.data.verification;
    if (err.status === 409 && v && v.status === 'mismatch') { Feedback.bad(); openSheet('flagged', { message: err.message, verification: v }); }
    else if (err.status === 409 && v && v.status === 'waiting') { Feedback.tone(660, 120); openSheet('waiting', { message: err.message, verification: v }); }
    else if (err.status === 404 && err.data.can_add) { Feedback.bad(); openSheet('unknown', { message: err.message, code: err.data.code }); }
    else { Feedback.bad(); toast(err.message, 'error'); }
  } finally {
    working(false);
    busy = false;
    cooldownUntil = Date.now() + 1200;
  }
}

function checkRow(label, check, detail) {
  return `<li><span>${label}<br><span class="muted xs">${detail}</span></span>
    <span class="${check.ok ? 'ok' : 'bad'}">${check.ok ? '&#10003; Match' : '&#10007; Mismatch'}</span></li>`;
}

function renderChecks(v) {
  if (!v || !v.checks || v.mode === 'off') return '';
  const c = v.checks;
  const rows = [checkRow('Barcode / QR', c.barcode, esc(c.barcode.detail || ''))];
  if (c.weight) {
    let d = `${c.weight.measured_g} g`;
    if (c.weight.allowed_g) d += ` (allowed ${c.weight.allowed_g[0]}-${c.weight.allowed_g[1]} g)`;
    if (c.weight.detail) d += ' - ' + esc(c.weight.detail);
    rows.push(checkRow('Weight', c.weight, d));
  }
  if (c.image) {
    let d = `<span class="swatch" style="background:${esc(c.image.measured_color || '#ccc')}"></span>`;
    if (c.image.expected_color) d += ` vs <span class="swatch" style="background:${esc(c.image.expected_color)}"></span> (distance ${c.image.distance})`;
    if (c.image.detail) d += ' ' + esc(c.image.detail);
    rows.push(checkRow('Camera', c.image, d));
  }
  return `<ul class="checks">${rows.join('')}</ul>`;
}

function openSheet(kind, data) {
  sheetOpen = true;
  let html;
  if (kind === 'success') {
    html = `<div class="sheet-icon">${icon('check', 24)}</div>
      <h3 class="sheet-title">${esc(data.product.name)} added</h3>
      <p class="small muted center">${money(data.product.price)} each${data.product.mrp ? ` <s>${money(data.product.mrp).replace('.00', '')}</s> <span class="save-pill">Save ${money(data.product.mrp - data.product.price).replace('.00', '')}</span>` : ''} &middot; ${data.cart_item.quantity} in cart</p>
      <div id="sheet-extra" class="center" style="margin-top:8px"></div>`;
  } else if (kind === 'flagged') {
    html = `<div class="sheet-icon danger">${icon('alert', 24)}</div>
      <h3 class="sheet-title">Item flagged for review</h3>
      <p class="small muted center">${esc(data.message)}</p>`;
  } else if (kind === 'unknown') {
    // admins: a pack's barcode that isn't in the catalogue yet -> add it in one step
    html = `<div class="sheet-icon warn">${icon('barcode', 24)}</div>
      <h3 class="sheet-title">New item</h3>
      <p class="small muted center">${esc(data.message)}</p>
      <p class="mono muted center" style="margin-top:6px">${esc(data.code)}</p>
      <div class="stack" style="margin-top:20px">
        <a class="btn btn-block" href="admin.html?new=${encodeURIComponent(data.code)}">${icon('plus', 16)} Add this product</a>
        <button type="button" class="btn btn-secondary btn-block" id="sheet-primary">Scan something else</button>
      </div>`;
    sheet.innerHTML = html;
    sheet.classList.add('open');
    backdrop.classList.add('open');
    document.getElementById('sheet-primary').onclick = closeSheet;
    return;
  } else {
    html = `<div class="sheet-icon warn">${icon('scale', 24)}</div>
      <h3 class="sheet-title">Almost there</h3>
      <p class="small muted center">${esc(data.message)}</p>`;
  }
  html += renderChecks(data.verification);
  html += `<div class="stack" style="margin-top:20px">
      <button type="button" class="btn btn-block" id="sheet-primary">${kind === 'success' ? 'Keep scanning' : 'Scan again'}</button>
      <a class="btn btn-secondary btn-block" href="cart.html">Go to cart</a>
      ${kind === 'success' ? '<button type="button" class="btn btn-ghost btn-block" id="sheet-undo">Undo - take it out again</button>' : ''}
    </div>`;
  sheet.innerHTML = html;
  sheet.classList.add('open');
  backdrop.classList.add('open');
  document.getElementById('sheet-primary').onclick = closeSheet;
  const undo = document.getElementById('sheet-undo');
  if (undo) undo.onclick = () => undoAdd(data, undo);
}

// Scanned by mistake? One tap takes one off again (put the pack back on the shelf).
async function undoAdd(data, btn) {
  setBusy(btn, true);
  try {
    const line = data.cart_item;
    const cart = line.quantity > 1
      ? await api(`/api/cart/items/${line.id}`, { method: 'PATCH', body: { quantity: line.quantity - 1 } })
      : await api(`/api/cart/items/${line.id}`, { method: 'DELETE' });
    refreshCartBadge(cart.item_count);
    toast(`${data.product.name} taken out of your cart`);
    closeSheet();
  } catch (err) {
    toast(err.message, 'error');
    setBusy(btn, false);
  }
}

// After an item is added: tick it off the shopping list, and watch the budget.
async function afterAdd(data) {
  const notes = [];
  const c = data.cart;
  if (c.budget) {
    if (c.subtotal > c.budget) notes.push(`<p class="small bad">${icon('alert', 14)} ${money(c.subtotal - c.budget)} over your ${money(c.budget).replace('.00', '')} budget</p>`);
    else if (c.subtotal >= c.budget * 0.9) notes.push(`<p class="small" style="color:oklch(0.45 0.1 70);font-weight:600">${money(c.budget - c.subtotal)} left in your budget</p>`);
  }
  try {
    const list = await api('/api/list');
    const item = list.items.find((i) => i.product_id === data.product.id);
    if (item) {
      const left = list.count - list.done;
      notes.unshift(`<p class="small ok">${icon('check', 14)} ${item.done ? 'Ticked off your list' : `On your list (${item.in_cart} of ${item.quantity})`} &middot; ${left ? `${left} left` : 'list complete!'}</p>`);
    }
  } catch (e) { /* list is optional */ }
  const box = document.getElementById('sheet-extra');
  if (box && notes.length) box.innerHTML = notes.join('');
}

// The code that was just read stays blocked until it leaves the camera view, so a
// label still held up is not read again the moment the sheet closes.
function closeSheet() {
  sheet.classList.remove('open');
  backdrop.classList.remove('open');
  setTimeout(() => { sheetOpen = false; }, 500);
}
backdrop.onclick = closeSheet;

document.getElementById('manual-toggle').onclick = () => {
  const f = document.getElementById('manual-form');
  f.hidden = !f.hidden;
  if (!f.hidden) document.getElementById('manual-code').focus();
};
document.getElementById('manual-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('manual-code');
  const code = input.value.trim();
  if (!code || busy) return;
  input.value = '';
  handleCode(code);
});

async function pollHardware() {
  try {
    const s = await api('/api/hardware/status');
    const stale = (r) => (r.age_sec > s.max_age_sec ? ' &middot; stale' : '');
    const pi = (s.devices_online || []).find((d) => d.startsWith('rpi'));
    document.getElementById('hw-devices').innerHTML = `<span class="dot ${pi ? 'on' : 'off'}"></span> ${pi ? 'Cart Raspberry Pi online' : 'Cart Raspberry Pi offline'}`;
    const w = s.weight;
    document.getElementById('hw-weight').textContent = w ? `${w.weight_g} g` : '-';
    document.getElementById('hw-weight-age').innerHTML = w ? ago(w.age_sec) + stale(w) : 'Waiting for a reading...';
    const im = s.image;
    const img = document.getElementById('hw-cam-img');
    if (im && im.image_url) {
      const src = API_BASE + im.image_url;
      if (img.dataset.src !== src) { img.src = src; img.dataset.src = src; }
      img.hidden = false;
    }
    document.getElementById('hw-cam-age').innerHTML = im
      ? `<span class="swatch" style="background:${esc(im.color_hex || '#ccc')}"></span> ${esc(im.color_hex || '')} &middot; ${ago(im.age_sec)}${stale(im)}`
      : 'Waiting for a photo...';
    showUnscanned(s.alerts || []);
  } catch (e) { /* ignore polling errors */ }
}

// Something went onto the cart's scale but was never scanned (the Pi beeps too).
let alertedIds = '';
function showUnscanned(alerts) {
  const box = document.getElementById('unscanned');
  box.hidden = !alerts.length;
  if (!alerts.length) { alertedIds = ''; return; }
  const grams = alerts.map((a) => `${a.weight_g} g`).join(', ');
  box.innerHTML = `${icon('alert', 22)}<div><p class="small" style="font-weight:700">Item in the cart not scanned</p>
    <p class="xs" style="margin-top:2px">Something (${esc(grams)}) went into the cart without a scan. Scan its barcode now, or take it out of the cart.</p></div>`;
  const ids = alerts.map((a) => a.id).join(',');
  if (ids !== alertedIds) {
    alertedIds = ids;
    if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
  }
}

init();
