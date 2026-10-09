// Wallet counter (staff): scan a top-up token, take cash/UPI, confirm -> the wallet is credited.
renderNav('user');
let busy = false;
let lastCode = '';
let missedFrames = 0;
let cooldownUntil = 0;
let piAfter = null;      // last Pi-camera token scan already shown
let cameraDecided = false;

function working(on) { document.getElementById('working').classList.toggle('show', on); }

let shopUpi = null;      // the shop's UPI ID (UPI_ID on the server), if set

function tokenCard(t, { big = false } = {}) {
  const pending = t.status === 'pending';
  const statusText = pending ? 'waiting for payment'
    : (t.status === 'paid' ? `paid by ${t.method === 'upi' ? 'UPI' : 'cash'} &middot; ${esc(t.confirmed_by || '')}` : 'cancelled by the customer');
  return `<div class="card ${big ? 'exit-result ' + (pending ? 'is-warn' : (t.status === 'paid' ? 'is-ok' : 'is-bad')) : ''}" style="${big ? '' : 'padding:12px;margin-bottom:10px'}">
    <div class="row between" style="align-items:flex-start">
      <div style="text-align:left"><p class="small" style="font-weight:700">${esc(t.user_name || '')}</p>
        <p class="xs muted">${esc(t.user_email || '')} &middot; wallet ${money(t.user_balance)}</p>
        <p class="xs muted"><span class="mono">${esc(t.number)}</span> &middot; ${statusText}</p></div>
      <p style="font-size:${big ? '1.5rem' : '1.1rem'};font-weight:800" class="tabular">${money(t.amount)}</p>
    </div>
    ${pending && big && shopUpi ? `<div class="upi-pay">
      <div class="qr-box" id="upi-qr"></div>
      <p class="xs" style="max-width:260px">Customer paying by UPI? They scan this with any UPI app: <b>${money(t.amount)}</b> to <span class="mono">${esc(shopUpi.id)}</span>, already filled in.
        Press <b>UPI received</b> only when the money shows in the shop's UPI app.</p></div>` : ''}
    ${pending ? `<div class="row" style="gap:8px;margin-top:12px">
      <button type="button" class="btn" style="flex:1" data-confirm="${t.id}" data-method="cash">Cash received</button>
      <button type="button" class="btn btn-secondary" style="flex:1" data-confirm="${t.id}" data-method="upi">UPI received</button></div>` : ''}
  </div>`;
}

async function lookup(code, { fromPi = false } = {}) {
  busy = true;
  working(true);
  try {
    const { topup, scanned, upi } = await api('/api/counter/lookup', { method: 'POST', body: { code } });
    shopUpi = upi;
    const note = fromPi ? `<p class="xs" style="margin-bottom:6px;font-weight:700">${icon('camera', 13)} Read by the Pi camera just now</p>`
      : (scanned ? '' : '<p class="xs muted" style="margin-bottom:6px">Typed number: check the name with the customer before taking money.</p>');
    document.getElementById('result').innerHTML = note + tokenCard(topup, { big: true });
    const qr = document.getElementById('upi-qr');
    if (qr) drawQr(qr, upiLink(upi, topup.amount, `SmartCart ${topup.number}`), 168).then((ok) => { if (!ok) qr.remove(); });
    document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    document.getElementById('result').innerHTML = `<div class="card exit-result is-bad"><p class="big">NOT A VALID TOKEN</p><p class="small">${esc(err.message)}</p></div>`;
  } finally {
    working(false);
    busy = false;
    cooldownUntil = Date.now() + 1500;
  }
}

async function confirmTopup(btn) {
  const method = btn.dataset.method;
  document.querySelectorAll(`[data-confirm="${btn.dataset.confirm}"]`).forEach((b) => { b.disabled = true; });
  setBusy(btn, true);
  try {
    const { topup, transaction } = await api(`/api/counter/topups/${btn.dataset.confirm}/confirm`, { method: 'POST', body: { method } });
    toast(`${money(topup.amount)} added to ${topup.user_name}'s wallet (${method === 'upi' ? 'UPI' : 'cash'})`);
    document.getElementById('result').innerHTML = `<div class="card exit-result is-ok">
      <div class="sheet-icon">${icon('check', 24)}</div><p class="big">ADDED ${money(topup.amount)}</p>
      <p class="small">${esc(topup.user_name)} &middot; new balance ${money(transaction.balance_after)} &middot; <span class="mono">${esc(transaction.number)}</span></p></div>`;
  } catch (err) {
    toast(err.message, 'error');
  }
  refresh();
}

document.getElementById('main').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-confirm]');
  if (btn) confirmTopup(btn);
});

function onDecode(text) {
  missedFrames = 0;
  if (busy || Date.now() < cooldownUntil || text === lastCode) return;
  lastCode = text;
  lookup(text);
}
function onNoCode() { missedFrames += 1; if (missedFrames >= 10) lastCode = ''; }

async function startCamera() {
  const status = document.getElementById('cam-status');
  document.getElementById('scanner-box').hidden = false;
  status.textContent = 'Starting camera...';
  if (!window.isSecureContext) { status.textContent = 'The camera needs https or localhost - type the token number below.'; return; }
  try {
    await startCodeScanner('reader', onDecode, onNoCode, { qrOnly: true });
    status.textContent = 'Ready - hold the customer\'s top-up token in the frame';
  } catch (err) {
    status.textContent = cameraHelp(err, 'type the token number below');
  }
}

async function refresh() {
  try {
    const o = await api('/api/counter/overview' + (piAfter === null ? '' : `?pi_after=${piAfter}`));
    // a top-up token held under the Pi camera opens here by itself
    showPi(o.pi);
    if (!cameraDecided) {
      // On the Pi itself the camera is the Pi program's while it runs; otherwise use it here.
      cameraDecided = true;
      if (ON_PI && o.pi && o.pi.online && o.pi.reads_codes) piCameraNote(); else startCamera();
    }
    if (piAfter === null) {
      piAfter = o.pi_last_id;
    } else if (o.pi_scans && o.pi_scans.length && !busy) {
      const latest = o.pi_scans[o.pi_scans.length - 1];
      piAfter = o.pi_last_id;
      Feedback.ok();
      lookup(latest.code, { fromPi: true });
    }
    document.getElementById('t-cash').textContent = money(o.today.cash);
    document.getElementById('t-upi').textContent = money(o.today.upi);
    setHtml('pending', o.pending.length
      ? o.pending.map((t) => tokenCard(t)).join('')
      : '<p class="card small muted center">No tokens waiting.</p>');
    setHtml('recent', o.recent.length ? o.recent.map((t) => `<div class="txn">
        <span class="txn-icon">${icon(t.kind === 'payment' ? 'receipt' : 'wallet', 16)}</span>
        <div class="grow"><p class="small" style="font-weight:600">${esc(t.user_name || '')}</p>
          <p class="xs muted">${esc(t.kind)}${t.method ? ' &middot; ' + esc(t.method) : ''} &middot; ${esc(fmtDate(t.created_at, true))}${t.order_number ? ' &middot; ' + esc(t.order_number) : ''}</p></div>
        <p class="small tabular ${t.amount > 0 ? 'plus' : 'minus'}" style="font-weight:700">${t.amount > 0 ? '+' : '−'}${money(Math.abs(t.amount))}</p></div>`).join('')
      : '<p class="small muted center" style="padding:14px 0">No wallet activity yet.</p>');
  } catch (e) {
    if (!cameraDecided) { cameraDecided = true; startCamera(); }
  }
}

// What the Pi program is doing, in one line: is it there, and will a token held under its camera open here?
function showPi(pi) {
  const dot = document.getElementById('pi-dot');
  const text = document.getElementById('pi-text');
  let msg;
  let ok = false;
  if (!pi || !pi.online) {
    msg = 'Not connected: the SmartCart Pi program is not running. Scan the token with the camera below, or type its number.';
  } else if (!pi.reads_codes) {
    msg = `Online (${pi.device_id}), but its camera reader is off: check camera and qr in cart_agent.ini. Scan below or type the number.`;
  } else if (!pi.reads_tokens) {
    msg = `Online (${pi.device_id}), but the Pi program is old (v${pi.version || '?'}) and may ignore tokens. `
      + 'Copy the new pi/cart_agent.py to the Pi and restart it.';
  } else {
    ok = true;
    msg = `Online (${pi.device_id}): hold the token under the Pi camera and it opens here by itself.`;
  }
  dot.className = 'dot ' + (ok ? 'on' : 'off');
  if (text.textContent !== msg) text.textContent = msg;
}

// Only touch the page when something changed, so buttons don't jump under the staff's finger.
function setHtml(id, html) {
  const el = document.getElementById(id);
  if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
}

document.getElementById('manual-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('manual-code');
  if (!input.value.trim() || busy) return;
  lookup(input.value.trim());
  input.value = '';
});

let searchTimer = null;
document.getElementById('c-email').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (q.length < 2) return;
  searchTimer = setTimeout(async () => {
    try {
      const { customers } = await api(`/api/counter/customers?q=${encodeURIComponent(q)}`);
      document.getElementById('c-list').innerHTML = customers.map((c) => `<option value="${esc(c.email)}">${esc(c.name)} - ${money(c.balance)}</option>`).join('');
    } catch (err) { /* ignore */ }
  }, 250);
});

document.getElementById('credit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('c-submit');
  document.querySelectorAll('#credit-form .field-error').forEach((el) => { el.textContent = ''; });
  setBusy(btn, true);
  try {
    const { transaction: t } = await api('/api/counter/credit', { method: 'POST', body: {
      email: document.getElementById('c-email').value.trim(),
      amount: document.getElementById('c-amount').value.trim(),
      note: document.getElementById('c-note').value.trim(),
    } });
    toast(`${money(t.amount)} added to ${t.user_name}'s wallet`);
    e.target.reset();
    refresh();
  } catch (err) {
    Object.entries(err.data.fields || {}).forEach(([k, msg]) => {
      const el = document.querySelector(`#credit-form .field-error[data-for="${k}"]`);
      if (el) el.textContent = msg;
    });
    toast(err.message, 'error');
  }
  setBusy(btn, false);
});

function init() {
  if (!Auth.require()) return;
  if (!Auth.isAdmin()) {
    document.getElementById('main').innerHTML = '<div class="card small muted center">The wallet counter is for staff (admin) accounts only.</div>';
    return;
  }
  document.getElementById('pending').innerHTML = Skel.rows(2, false);
  document.getElementById('pi-icon').innerHTML = icon('camera', 22);
  if (!ON_PI) { cameraDecided = true; startCamera(); }
  else document.getElementById('cam-status').textContent = 'Checking the Pi program...';
  refresh();
  HelpDesk.start();
  setInterval(() => { if (!document.hidden) refresh(); }, 2500);
}

// On the Raspberry Pi the camera is the Pi program's: tokens held under it open here by themselves.
function piCameraNote() {
  document.getElementById('scanner-box').hidden = true;
  const status = document.getElementById('cam-status');
  status.innerHTML = `This is the Raspberry Pi: its camera is in use by the SmartCart Pi program, so hold the token under it
    and it opens here by itself. Or type the token number below.
    <button type="button" class="btn-link small" id="cam-here">Use the camera in this browser instead (stop the Pi program first)</button>`;
  document.getElementById('cam-here').onclick = startCamera;
}
init();
