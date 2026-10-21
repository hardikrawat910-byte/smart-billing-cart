// Exit gate: the bill QR (signed, one-time) is checked before the customer leaves.
// The Raspberry Pi camera checks bills by itself; this page shows its results live
// and lets staff scan with the phone as well.
renderNav('user');

let busy = false;
let lastCode = '';        // a bill still in front of the camera is not checked twice
let missedFrames = 0;
let cooldownUntil = 0;
let lastEventId = null;   // live feed position (results from the Pi camera)

const LOOK = {
  ok: { cls: 'is-ok', icon: 'check', title: 'EXIT OK' },
  used: { cls: 'is-bad', icon: 'alert', title: 'BILL ALREADY USED' },
  invalid: { cls: 'is-bad', icon: 'alert', title: 'INVALID BILL' },
  hold: { cls: 'is-warn', icon: 'alert', title: 'HOLD CUSTOMER' },
};

function working(on) { document.getElementById('working').classList.toggle('show', on); }

function beep(ok) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = ok ? 'sine' : 'square';
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.15 : 0.45));
    osc.onended = () => ctx.close();
  } catch (e) { /* no sound available */ }
}

function renderResult(data, source) {
  const look = LOOK[data.result] || LOOK.invalid;
  const from = source === 'pi'
    ? `<p class="source-tag">${icon('camera', 14)} Pi camera${data.device_id ? ' &middot; ' + esc(data.device_id) : ''}</p>`
    : `<p class="source-tag">${icon('qr', 14)} This phone</p>`;
  const o = data.order;
  const checks = (data.checks || []).map((c) => `<li><span>${esc(c.name)}<br><span class="muted xs">${esc(c.detail || '')}${c.at ? ' &middot; ' + esc(fmtDate(c.at, true)) : ''}</span></span>
      <span class="${c.skipped ? 'muted' : (c.ok ? 'ok' : 'bad')}">${c.skipped ? '&ndash;' : (c.ok ? '&#10003;' : '&#10007;')}</span></li>`).join('');
  const who = o ? `<p class="small" style="font-weight:600">${esc(o.number)} &middot; ${esc(o.customer_name || '')} &middot; ${money(o.total_amount)}</p>
      <p class="xs muted">Paid ${esc(fmtDate(o.created_at, true))}</p>` : '';
  const items = o ? `<p class="small" style="font-weight:600;margin-top:14px">Check the bag (${o.item_count} item${o.item_count === 1 ? '' : 's'})</p>
      <ul class="checks">${o.items.map((i) => `<li><span>${esc(i.name)}</span><span style="font-weight:700">&times; ${i.quantity}</span></li>`).join('')}</ul>` : '';
  document.getElementById('result').innerHTML = `
    <div class="card exit-result ${look.cls} fade-in">
      ${from}
      <div class="sheet-icon ${look.cls === 'is-ok' ? '' : (look.cls === 'is-warn' ? 'warn' : 'danger')}">${icon(look.icon, 24)}</div>
      <p class="big">${look.title}</p>
      <p class="small" style="margin:4px 0 10px">${esc(data.message || '')}</p>
      ${who}
      <ul class="checks" style="text-align:left">${checks}</ul>
      <div style="text-align:left">${items}</div>
    </div>`;
  document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function verify(code) {
  busy = true;
  working(true);
  try {
    const data = await api('/api/exit/verify', { method: 'POST', body: { code } });
    renderResult(data, 'phone');
    beep(true);
    loadRecent();
  } catch (err) {
    if (err.data && err.data.result) { renderResult(err.data, 'phone'); beep(false); }
    else toast(err.message, 'error');
  } finally {
    working(false);
    busy = false;
    cooldownUntil = Date.now() + 1500;
  }
}

function onDecode(text) {
  missedFrames = 0;
  if (busy || Date.now() < cooldownUntil || text === lastCode) return;
  lastCode = text;
  verify(text);
}

function onNoCode() {
  missedFrames += 1;
  if (missedFrames >= 10) lastCode = '';   // bill has left the camera view
}

async function startCamera() {
  const status = document.getElementById('cam-status');
  document.getElementById('scanner-box').hidden = false;
  document.getElementById('scan-label').hidden = false;
  status.textContent = 'Starting camera...';
  // Firefox leaves the camera request waiting if its permission prompt is closed: say what to do.
  setTimeout(() => {
    if (status.textContent === 'Starting camera...') {
      status.textContent = 'The camera has not started: allow it in the address bar (camera icon) and reload, or type the bill code below.';
    }
  }, 12000);
  if (!window.isSecureContext) { status.textContent = 'The camera needs https or localhost - type the bill code below.'; return; }
  try {
    await startCodeScanner('reader', onDecode, onNoCode, { qrOnly: true });
    status.textContent = 'Ready - hold the customer\'s bill QR in the frame';
  } catch (err) {
    status.textContent = cameraHelp(err, 'type the bill code below');
  }
}

async function loadRecent() {
  const list = document.getElementById('recent');
  if (!list.children.length) list.innerHTML = Skel.rows(3, false);
  try {
    const { orders } = await api('/api/exit/recent');
    document.getElementById('recent').innerHTML = orders.length
      ? orders.map((o) => `<li class="card row between" style="padding:10px 12px">
          <span class="small"><b>${esc(o.number)}</b> &middot; ${esc(o.customer_name || '')}<br>
          <span class="xs muted">${esc(fmtDate(o.exit_verified_at, true))} &middot; ${esc(o.exit_staff || '')}</span></span>
          <span style="font-weight:600">${money(o.total_amount)}</span></li>`).join('')
      : '<li class="card small muted center">No customers checked out yet.</li>';
  } catch (e) { /* ignore */ }
}

document.getElementById('manual-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('manual-code');
  const code = input.value.trim();
  if (!code || busy) return;
  input.value = '';
  verify(code);
});

function init() {
  if (!Auth.require()) return;
  if (!Auth.isAdmin()) {
    document.getElementById('main').innerHTML = '<div class="card small muted center">The exit gate is for staff (admin) accounts only.</div>';
    return;
  }
  document.getElementById('gate-icon').innerHTML = icon('camera', 22);
  loadRecent();
  HelpDesk.start();
  if (!ON_PI) { cameraDecided = true; startCamera(); }
  else document.getElementById('cam-status').textContent = 'Checking the Pi program...';
  pollGate();
  setInterval(pollGate, 2000);
}

// On the Raspberry Pi the camera is the Pi program's: bills it reads show up here by themselves.
function piCameraNote() {
  document.getElementById('scanner-box').hidden = true;
  document.getElementById('scan-label').hidden = true;
  const status = document.getElementById('cam-status');
  status.innerHTML = `This is the Raspberry Pi: its camera is in use by the CartLess Checkout Pi program, and the bills it
    reads show up here by themselves. Or type the bill code below.
    <button type="button" class="btn-link small" id="cam-here">Use the camera in this browser instead (stop the Pi program first)</button>`;
  document.getElementById('cam-here').onclick = startCamera;
}

// ---- live results from the Raspberry Pi camera ----
let lastDeviceCheck = 0;
let cameraDecided = false;
async function pollGate() {
  try {
    const feed = await api(`/api/exit/events?after=${lastEventId == null ? 0 : lastEventId}`);
    if (lastEventId == null) {
      lastEventId = feed.last_id;               // first load: only show what happens from now on
    } else {
      feed.events.filter((e) => e.source === 'pi').forEach((e) => {
        renderResult(e, 'pi');
        beep(e.result === 'ok');
        if (e.result === 'ok') loadRecent();
      });
      lastEventId = feed.last_id;
    }
  } catch (e) { /* ignore polling errors */ }
  if (Date.now() - lastDeviceCheck < 4900) return;
  lastDeviceCheck = Date.now();
  try {
    const s = await api('/api/hardware/status');
    const pi = (s.devices_online || []).find((d) => d.startsWith('rpi'));
    document.getElementById('gate-dot').className = 'dot ' + (pi ? 'on' : 'off');
    document.getElementById('gate-text').textContent = pi
      ? `Online (${pi}) - customers hold the bill QR under the Pi camera.`
      : 'Pi not connected - scan bills with this phone below.';
    // On the Pi itself the camera is the Pi program's while it runs; otherwise use it here.
    if (!cameraDecided) { cameraDecided = true; if (pi) piCameraNote(); else startCamera(); }
  } catch (e) {
    if (!cameraDecided) { cameraDecided = true; startCamera(); }
  }
}
init();
