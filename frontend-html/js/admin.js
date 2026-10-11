renderNav('user');

let products = [];
let productFilter = 'all';
let editingId = null;
let hwTimer = null;

const REASONS = {
  weight_mismatch: 'Weight does not match the scanned product',
  image_mismatch: 'Camera colour does not match the scanned product',
  no_weight_reference: 'Product has no reference weight (calibrate it)',
  no_image_reference: 'Product has no reference colour (calibrate it)',
};

function init() {
  // Show the scale parts of the admin page only when the server has a scale (SCALE_ENABLED).
  api('/api/health').then((h) => document.body.classList.toggle('no-scale', !h.scale)).catch(() => {});
  if (!Auth.require()) return;
  if (!Auth.isAdmin()) {
    document.getElementById('main').innerHTML = '<div class="card small muted center">This page is for admin accounts only.</div>';
    return;
  }
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
  document.getElementById('tab-products').addEventListener('click', onProductsClick);
  document.getElementById('tab-flags').addEventListener('click', onFlagsClick);
  document.getElementById('tab-hardware').addEventListener('click', onHardwareClick);
  setupForm();
  setupQuickPhoto();
  setupQrDialog();
  HelpDesk.start();
  const newCode = param('new');           // from the Scan page: "Add this product"
  showTab(newCode || param('tab') === 'products' ? 'products' : 'dashboard');
  loadFlagCount();
  if (newCode) {
    openForm(null);
    document.getElementById('f-qr').value = newCode;
    document.getElementById('f-status').value = 'published';
    document.getElementById('f-name').focus();
    history.replaceState(null, '', 'admin.html');
  }
}

function showTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  ['dashboard', 'products', 'flags', 'orders', 'hardware'].forEach((n) => { document.getElementById('tab-' + n).hidden = n !== name; });
  clearInterval(hwTimer);
  if (name === 'dashboard') loadDashboard();
  if (name === 'products') loadProducts();
  if (name === 'flags') loadFlags();
  if (name === 'orders') loadOrders();
  if (name === 'hardware') { renderHardware(); hwTimer = setInterval(refreshHardware, 1500); }
}

/* ---------------- dashboard: today at a glance ---------------- */

let dash = null;
let chartWatch = null;

function rupees(n) { return '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN'); }
function plural(n, word) { return `${n} ${word}${n === 1 ? '' : 's'}`; }

async function loadDashboard() {
  const el = document.getElementById('tab-dashboard');
  if (!dash) {
    const tile = `<div class="card stat-tile">${Skel.line(55, 8)}${Skel.line(40, 18)}</div>`;
    el.innerHTML = Skel.wrap(`<div class="card">${Skel.line(28, 8)}${Skel.line(50, 40)}${Skel.line(70, 8)}</div>
      <div class="stat-grid">${tile.repeat(4)}</div><div class="card" style="margin-top:12px;height:250px"></div>`);
  } else {
    el.classList.add('is-refreshing');          // keep the old numbers on screen while reloading
  }
  try {
    dash = await api('/api/admin/dashboard');
    renderDashboard(dash);
    reveal(el);
  } catch (err) {
    el.innerHTML = `<p class="card small muted">${esc(err.message)}</p>`;
  }
  el.classList.remove('is-refreshing');
}

function statTile(label, value, note) {
  return `<div class="card stat-tile"><p class="xs muted">${label}</p><p class="stat-figure">${value}</p><p class="xs muted">${note}</p></div>`;
}

function renderDashboard(d) {
  const t = d.today;
  const f = d.fraud;
  const el = document.getElementById('tab-dashboard');
  const topQty = Math.max(1, ...d.top_items.map((i) => i.qty));
  const waiting = f.open + f.unscanned_open;
  el.innerHTML = `
    <div class="card">
      <p class="xs muted">Sales today</p>
      <p class="hero-figure">${money(t.revenue)}</p>
      <p class="small muted">${plural(t.orders, 'bill')} &middot; ${plural(t.items, 'item')}${t.orders ? ` &middot; average ${money(t.average_bill)}` : ''}</p>
      ${t.savings > 0 ? `<p class="xs saving-row" style="margin-top:6px">${icon('tag', 13)} Shoppers saved ${money(t.savings)} on offers today</p>` : ''}
      <div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap">
        <button type="button" class="btn btn-outline btn-sm" id="csv-btn">${icon('download', 14)} Sales CSV (30 days)</button>
        ${t.help_open ? `<span class="small bad row" style="gap:4px;font-weight:600">${icon('hand', 14)} ${plural(t.help_open, 'shopper')} waiting for help</span>` : ''}
      </div>
    </div>
    <div class="stat-grid">
      ${statTile('Wallet top-ups today', rupees(t.topups_cash + t.topups_upi), `cash ${rupees(t.topups_cash)} &middot; UPI ${rupees(t.topups_upi)}`)}
      ${statTile('Bills checked at exit', t.exits, 'today, staff + Pi camera')}
      ${statTile('Money in wallets', rupees(d.wallet.total_balance), `${plural(d.wallet.pending_topups, 'token')} waiting to be paid`)}
      ${statTile('New customers', t.new_customers, 'signed up today')}
    </div>

    <div class="card" style="margin-top:12px">
      <p class="small" style="font-weight:600">Sales, last 7 days</p>
      <p class="xs muted">Paid bills, in rupees per day</p>
      <div class="chart" id="sales-chart"></div>
      <details class="chart-table">
        <summary class="xs">Show as a table</summary>
        <table><thead><tr><th>Day</th><th>Bills</th><th>Sales</th></tr></thead>
          <tbody>${d.days.map((day, i) => `<tr><td>${esc(dayName(day.date, i === d.days.length - 1, true))}</td><td>${day.orders}</td><td>${money(day.revenue)}</td></tr>`).join('')}</tbody></table>
      </details>
    </div>

    <div class="card scale-only" style="margin-top:12px">
      <p class="small" style="font-weight:600">${icon('shield', 16)} Caught by the cart this week</p>
      <dl class="kv">
        <dt>Scans stopped by the checks</dt><dd>${f.flags}</dd>
        <dt class="sub">weight did not match</dt><dd>${f.weight_mismatch}</dd>
        <dt class="sub">camera colour did not match</dt><dd>${f.image_mismatch}</dd>
        <dt>Items put in without scanning</dt><dd>${f.unscanned_alerts}</dd>
        <dt>Still waiting for staff</dt><dd>${waiting ? `<span class="bad">${waiting}</span>` : '0'}</dd>
      </dl>
      ${d.hardware_mode === 'off' ? '<p class="xs muted" style="margin-top:10px">Verification is off, so the scale and camera are not checking scans. Switch it on under Hardware.</p>' : ''}
      ${f.open ? '<button type="button" class="btn btn-outline btn-sm" style="margin-top:12px" data-go="flags">Review flags</button>' : ''}
    </div>

    <div class="card" style="margin-top:12px">
      <p class="small" style="font-weight:600">Best sellers this week</p>
      ${d.top_items.length ? `<ol class="rank">${d.top_items.map((it) => `
        <li><div class="row between" style="gap:10px"><span class="small truncate">${esc(it.name)}</span>
          <span class="small tabular" style="font-weight:600;flex-shrink:0">${it.qty} sold</span></div>
          <div class="row" style="gap:8px"><span class="rank-bar"><span style="width:${Math.max(4, Math.round((it.qty / topQty) * 100))}%"></span></span>
          <span class="xs muted tabular" style="flex-shrink:0">${rupees(it.revenue)}</span></div></li>`).join('')}</ol>`
        : '<p class="xs muted" style="margin-top:6px">Nothing sold yet this week.</p>'}
    </div>

    <div class="card" style="margin-top:12px">
      <p class="small" style="font-weight:600">Running low</p>
      ${d.low_stock.length ? `<ul class="low-stock">${d.low_stock.map((p) => `<li><span class="small truncate grow">${esc(p.name)}</span>
          <span class="badge ${p.stock === 0 ? 'badge-danger' : ''}" data-stock="${p.id}">${p.stock === 0 ? 'sold out' : `${p.stock} left`}</span>
          <button type="button" class="btn btn-outline btn-sm" data-restock="${p.id}" aria-label="Add 10 ${esc(p.name)} to stock">+10</button></li>`).join('')}</ul>
          <p class="xs muted" style="margin-top:8px">+10 adds a box of ten to the stock. Exact numbers: edit the item in Products.</p>`
        : '<p class="xs muted" style="margin-top:6px">Every item has more than 5 in stock.</p>'}
    </div>

    <details class="card danger-zone" style="margin-top:12px" id="reset-box">
      <summary><span class="grow"><span class="small" style="font-weight:600;display:block">Reset for demo</span>
        <span class="xs muted">Clear test orders, wallets and test accounts</span></span><span class="btn-link xs chev"></span></summary>
      <form id="reset-form" novalidate style="margin-top:12px">
        <p class="xs muted">Deletes every order, cart, wallet top-up and history, fraud flag, cart alert, hardware reading and customer account.
          Keeps admin accounts, products, stock and settings. <b>This cannot be undone.</b></p>
        <label class="check-row small"><input type="checkbox" id="reset-electronics"> Also remove the 6 sample electronics items from the first version (Raspberry Pi 5, webcam, SD card, LCD, buzzer kit, sensor pack)</label>
        <div class="field" style="margin-top:10px"><label class="label" for="reset-confirm">Type RESET to confirm</label>
          <input class="input" id="reset-confirm" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>
        <button type="submit" class="btn btn-danger" id="reset-btn" style="width:100%" disabled>Reset everything</button>
      </form>
    </details>`;

  el.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => showTab(b.dataset.go); });
  el.querySelectorAll('[data-restock]').forEach((b) => { b.onclick = () => restock(b); });
  document.getElementById('csv-btn').onclick = (e) => downloadCsv(e.currentTarget);
  setupReset();
  const box = document.getElementById('sales-chart');
  drawSalesChart(box, d.days);
  if (chartWatch) chartWatch.disconnect();
  if (window.ResizeObserver) {
    let lastWidth = box.clientWidth;
    chartWatch = new ResizeObserver(() => {
      if (box.isConnected && box.clientWidth !== lastWidth) { lastWidth = box.clientWidth; drawSalesChart(box, d.days); }
    });
    chartWatch.observe(box);
  }
}

// One tap when a box arrives: +10 to the stock
async function restock(btn) {
  setBusy(btn, true);
  try {
    const { product } = await api(`/api/admin/products/${btn.dataset.restock}/restock`, { method: 'POST', body: { add: 10 } });
    const badge = document.querySelector(`[data-stock="${product.id}"]`);
    if (badge) { badge.textContent = `${product.stock} left`; badge.classList.remove('badge-danger'); }
    toast(`${product.name}: ${product.stock} in stock`);
    const i = products.findIndex((x) => x.id === product.id);
    if (i >= 0) products[i] = product;
  } catch (err) { toast(err.message, 'error'); }
  setBusy(btn, false);
}

// Every line of every bill as a spreadsheet (opens in Excel / Google Sheets)
async function downloadCsv(btn) {
  setBusy(btn, true);
  try {
    const res = await fetch(API_BASE + '/api/admin/export/sales.csv?days=30', { headers: { Authorization: `Bearer ${Auth.token()}` } });
    if (!res.ok) throw new Error('Could not make the file - try again');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = (res.headers.get('Content-Disposition') || '').match(/filename="?([^"]+)"?/)?.[1] || 'smartcart-sales.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Sales file downloaded');
  } catch (err) { toast(err.message, 'error'); }
  setBusy(btn, false);
}

function dayName(iso, isToday, long) {
  const date = new Date(iso + 'T12:00:00');
  if (isToday) return long ? `Today, ${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'Today';
  return date.toLocaleDateString('en-IN', long ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'short' });
}

// y-axis steps on clean numbers (0 / 500 / 1,000 ...)
function niceScale(max) {
  if (!(max > 0)) return { top: 1000, step: 250 };
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw);
  return { top: Math.ceil(max / step) * step, step };
}

// column with a 4px rounded top and a square foot on the baseline
function columnPath(x, top, w, base) {
  const h = base - top;
  if (h <= 0) return '';
  const r = Math.min(4, h, w / 2);
  return `M${x},${base}V${top + r}A${r},${r} 0 0 1 ${x + r},${top}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${top + r}V${base}Z`;
}

function drawSalesChart(box, days) {
  const W = Math.max(260, Math.floor(box.clientWidth));
  const H = 196;
  const m = { top: 24, right: 4, bottom: 26, left: 50 };
  const pw = W - m.left - m.right;
  const ph = H - m.top - m.bottom;
  const values = days.map((d) => d.revenue);
  const max = Math.max(...values);
  const { top, step } = niceScale(max);
  const base = m.top + ph;
  const y = (v) => base - (v / top) * ph;
  const band = pw / days.length;
  const bw = Math.min(24, Math.floor(band * 0.55));
  const last = days.length - 1;
  const maxAt = values.indexOf(max);
  // label only today's column and the best day (if it is not right next to today)
  const labelled = new Set();
  if (values[last] > 0) labelled.add(last);
  if (max > 0 && (maxAt === last || last - maxAt >= 2)) labelled.add(maxAt);

  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">`;
  for (let v = 0; v <= top + 1e-9; v += step) {
    const gy = Math.round(y(v)) + 0.5;
    svg += `<line class="${v === 0 ? 'base' : 'grid'}" x1="${m.left}" x2="${W - m.right}" y1="${gy}" y2="${gy}"/>`;
    svg += `<text class="tick" x="${m.left - 8}" y="${gy + 4}" text-anchor="end">${rupees(v)}</text>`;
  }
  days.forEach((d, i) => {
    const cx = m.left + band * i + band / 2;
    const x = Math.round(cx - bw / 2);
    if (d.revenue > 0) svg += `<path class="bar" data-i="${i}" d="${columnPath(x, y(d.revenue), bw, base)}"/>`;
    svg += `<text class="tick${i === last ? ' strong' : ''}" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(dayName(d.date, i === last))}</text>`;
    if (labelled.has(i)) svg += `<text class="value" x="${cx}" y="${y(d.revenue) - 7}" text-anchor="middle">${rupees(d.revenue)}</text>`;
  });
  // hit targets: the whole day column, bigger than the bar
  days.forEach((d, i) => {
    const label = `${dayName(d.date, i === last, true)}: ${money(d.revenue)}, ${plural(d.orders, 'bill')}`;
    svg += `<rect class="hit" data-i="${i}" x="${m.left + band * i}" y="${m.top}" width="${band}" height="${ph}" tabindex="0" role="img" aria-label="${esc(label)}"/>`;
  });
  svg += '</svg>';
  box.innerHTML = svg + (max > 0 ? '' : '<p class="chart-empty xs muted">No paid bills in the last 7 days yet.</p>')
    + '<div class="chart-tip" role="tooltip" hidden><strong></strong><span></span></div>';

  const tip = box.querySelector('.chart-tip');
  const show = (i) => {
    const d = days[i];
    tip.querySelector('strong').textContent = money(d.revenue);
    tip.querySelector('span').textContent = `${dayName(d.date, i === last, true)} · ${plural(d.orders, 'bill')}`;
    tip.hidden = false;
    box.querySelectorAll('.bar').forEach((b) => b.classList.toggle('hot', b.dataset.i === String(i)));
    const cx = m.left + band * i + band / 2;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const above = y(d.revenue) - (labelled.has(i) ? 24 : 8);      // keep the value label visible
    if (above - th >= 0) {                                          // room above the column
      tip.style.transform = 'translate(-50%, -100%)';
      tip.style.left = `${Math.min(W - tw / 2, Math.max(tw / 2, cx))}px`;
      tip.style.top = `${above}px`;
    } else {                                                        // tall column: beside it
      tip.style.transform = 'none';
      const right = cx + bw / 2 + 8;
      tip.style.left = `${right + tw <= W ? right : Math.max(0, cx - bw / 2 - 8 - tw)}px`;
      tip.style.top = `${Math.max(0, Math.min(base - th, y(d.revenue)))}px`;
    }
  };
  const hide = () => { tip.hidden = true; box.querySelectorAll('.bar.hot').forEach((b) => b.classList.remove('hot')); };
  box.querySelectorAll('.hit').forEach((r) => {
    const i = Number(r.dataset.i);
    r.addEventListener('pointerenter', () => show(i));
    r.addEventListener('focus', () => show(i));
    r.addEventListener('pointerleave', hide);
    r.addEventListener('blur', hide);
  });
}

function setupReset() {
  const form = document.getElementById('reset-form');
  const input = document.getElementById('reset-confirm');
  const btn = document.getElementById('reset-btn');
  input.addEventListener('input', () => { btn.disabled = input.value.trim() !== 'RESET'; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (input.value.trim() !== 'RESET') return;
    setBusy(btn, true);
    try {
      const { removed } = await api('/api/admin/reset', {
        method: 'POST',
        body: { confirm: 'RESET', remove_sample_electronics: document.getElementById('reset-electronics').checked },
      });
      const people = removed.customer_accounts;
      toast(`Reset done: ${plural(removed.orders, 'order')} and ${plural(people, 'customer account')} removed`);
      products = [];
      dash = null;
      loadDashboard();
      loadFlagCount();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(btn, false);
    }
  });
}

/* ---------------- products ---------------- */

async function loadProducts() {
  const el = document.getElementById('tab-products');
  if (!products.length) el.innerHTML = Skel.rows(4);
  try {
    products = (await api('/api/admin/products')).products;
    renderProducts();
  } catch (err) {
    el.innerHTML = `<p class="card small muted">${esc(err.message)}</p>`;
  }
}

function renderProducts() {
  const rows = productFilter === 'all' ? products : products.filter((p) => p.status === productFilter);
  document.getElementById('tab-products').innerHTML = `
    <div class="row" style="margin-bottom:16px;gap:6px">
      ${['all', 'draft', 'published'].map((f) => `<button type="button" class="chip${f === productFilter ? ' active' : ''}" data-filter="${f}" style="padding:6px 12px;font-size:.75rem;text-transform:capitalize">${f}</button>`).join('')}
      <button type="button" class="btn btn-sm" style="margin-left:auto" id="new-product">${icon('plus', 14)} New</button>
    </div>
    ${rows.length ? `<ul class="list">${rows.map(productRow).join('')}</ul>` : '<p class="card small muted center">No products in this view yet.</p>'}`;
}

function productRow(p) {
  const weightRef = p.weight_min_g !== null ? `${p.weight_min_g}-${p.weight_max_g} g` : '<span class="bad">no weight ref</span>';
  const colorRef = p.ref_color ? `<span class="swatch" style="background:${esc(p.ref_color)}"></span> ${esc(p.ref_color)}` : '<span class="bad">no colour ref</span>';
  return `<li class="card row" style="padding:12px;align-items:flex-start">
    ${productImage(p, 'thumb')}
    <div class="grow">
      <div class="row" style="gap:8px"><p class="grow truncate small" style="font-weight:600">${esc(p.name)}</p>
        <span class="badge ${p.status === 'published' ? 'badge-solid' : ''}">${p.status}</span></div>
      <p class="xs muted">${esc(p.category)} &middot; ${money(p.price)}${p.mrp > p.price ? ` <s>${money(p.mrp).replace('.00', '')}</s> <span class="save-pill">Offer</span>` : ''} &middot; stock ${p.stock}</p>
      <p class="mono muted">${esc(p.qr_code)}</p>
      <p class="xs muted scale-only" style="margin-top:2px">${weightRef} &middot; ${colorRef}</p>
      <div class="row" style="gap:4px;margin-top:8px;flex-wrap:wrap">
        <button type="button" class="btn btn-outline btn-sm" data-act="edit" data-id="${p.id}">${icon('edit', 13)} Edit</button>
        <button type="button" class="btn btn-ghost btn-sm" data-act="toggle" data-id="${p.id}">${p.status === 'published' ? icon('eyeoff', 13) + ' Unpublish' : icon('eye', 13) + ' Publish'}</button>
        <button type="button" class="btn btn-ghost btn-sm" data-act="photo" data-id="${p.id}">${icon('camera2', 13)} ${(p.image_url || '').startsWith('/api/products/') ? 'Retake' : 'Photo'}</button>
        <button type="button" class="btn btn-ghost btn-sm scale-only" data-act="calibrate" data-id="${p.id}">${icon('scale', 13)} Calibrate</button>
        <button type="button" class="btn btn-ghost btn-sm" data-act="qr" data-id="${p.id}">${icon('qr', 13)} QR</button>
        <button type="button" class="btn btn-ghost btn-icon" style="margin-left:auto" data-act="delete" data-id="${p.id}" aria-label="Delete ${esc(p.name)}">${icon('trash', 15)}</button>
      </div>
    </div>
  </li>`;
}

async function onProductsClick(e) {
  const filter = e.target.closest('[data-filter]');
  if (filter) { productFilter = filter.dataset.filter; renderProducts(); return; }
  if (e.target.closest('#new-product')) { openForm(null); return; }
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const p = products.find((x) => String(x.id) === btn.dataset.id);
  if (!p) return;
  const act = btn.dataset.act;
  if (act === 'edit') { openForm(p); return; }
  if (act === 'photo') { quickPhoto(p, btn); return; }
  if (act === 'qr') { showQr(p); return; }
  if (act === 'delete' && !confirm(`Delete ${p.name}? It disappears from the catalogue and carts, but past orders keep their records.`)) return;
  if (act === 'calibrate' && !confirm(`Calibrate ${p.name} from the latest readings?\n\nPlace ONLY this item on the scale (and under the camera) first.`)) return;

  setBusy(btn, true);
  try {
    if (act === 'toggle') {
      const next = p.status === 'published' ? 'draft' : 'published';
      await api(`/api/admin/products/${p.id}/status`, { method: 'PATCH', body: { status: next } });
      toast(next === 'published' ? 'Product published' : 'Product unpublished');
    } else if (act === 'delete') {
      await api(`/api/admin/products/${p.id}`, { method: 'DELETE' });
      toast('Product deleted');
    } else if (act === 'calibrate') {
      const { calibrated } = await api(`/api/admin/products/${p.id}/calibrate`, { method: 'POST', body: {} });
      const parts = [];
      if (calibrated.weight) parts.push(`weight ${calibrated.weight.min_g}-${calibrated.weight.max_g} g`);
      if (calibrated.color) parts.push(`colour ${calibrated.color}`);
      toast('Calibrated: ' + parts.join(', '));
    }
    await loadProducts();
  } catch (err) {
    toast(err.message, 'error');
    setBusy(btn, false);
  }
}

function setupForm() {
  const dialog = document.getElementById('product-dialog');
  const form = document.getElementById('product-form');
  const picker = document.getElementById('f-color-picker');
  const colorInput = document.getElementById('f-color');
  picker.addEventListener('input', () => { colorInput.value = picker.value; });
  colorInput.addEventListener('input', () => {
    if (/^#[0-9a-f]{6}$/i.test(colorInput.value)) picker.value = colorInput.value.toLowerCase();
  });
  document.getElementById('form-cancel').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { stopCodeScan(); setPhotoPreview(null); });
  document.getElementById('f-qr-scan').onclick = toggleCodeScan;
  document.getElementById('f-photo-icon').outerHTML = icon('camera2', 15);
  document.getElementById('f-photo').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('Choose a photo (JPG or PNG)', 'error'); e.target.value = ''; return; }
    photo.file = file;
    photo.remove = false;
    setPhotoPreview(URL.createObjectURL(file));
  });
  document.getElementById('f-photo-remove').onclick = () => {
    photo.file = null;
    photo.remove = photo.stored;
    document.getElementById('f-photo').value = '';
    setPhotoPreview(null);
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.querySelectorAll('.field-error').forEach((el) => { el.textContent = ''; });
    const body = Object.fromEntries(new FormData(form).entries());
    const save = document.getElementById('form-save');
    setBusy(save, true);
    try {
      const { product } = editingId
        ? await api(`/api/admin/products/${editingId}`, { method: 'PUT', body })
        : await api('/api/admin/products', { method: 'POST', body });
      let note = '';
      try {
        if (photo.file) {
          const fd = new FormData();
          fd.append('photo', await shrinkPhoto(photo.file), 'photo.jpg');
          await api(`/api/admin/products/${product.id}/photo`, { method: 'POST', body: fd });
          note = ' with its photo';
        } else if (photo.remove) {
          await api(`/api/admin/products/${product.id}/photo`, { method: 'DELETE' });
        }
      } catch (photoErr) {
        toast(`Saved, but the photo did not upload: ${photoErr.message}`, 'error');
      }
      dialog.close();
      toast((editingId ? 'Product updated' : 'Product created') + note);
      loadProducts();
    } catch (err) {
      Object.entries(err.data.fields || {}).forEach(([key, msg]) => {
        const el = form.querySelector(`.field-error[data-for="${key}"]`);
        if (el) el.textContent = msg;
      });
      toast(err.message, 'error');
    }
    setBusy(save, false);
  });
}

// Fill the product code by scanning the pack's barcode (or an existing QR label).
let codeScanner = null;
async function toggleCodeScan() {
  if (codeScanner) { stopCodeScan(); return; }
  const box = document.getElementById('f-qr-box');
  const btn = document.getElementById('f-qr-scan');
  if (!window.isSecureContext) {
    toast('The camera needs https or localhost - type the number under the barcode instead.', 'error');
    return;
  }
  box.hidden = false;
  btn.textContent = 'Stop';
  try {
    codeScanner = await startCodeScanner('f-qr-reader', (text) => {
      document.getElementById('f-qr').value = text.trim();
      toast('Code scanned: ' + text.trim());
      stopCodeScan();
    });
  } catch (e) {
    toast(cameraHelp(e, 'type the number under the barcode'), 'error');
    stopCodeScan();
  }
}
function stopCodeScan() {
  const box = document.getElementById('f-qr-box');
  const btn = document.getElementById('f-qr-scan');
  const s = codeScanner;
  codeScanner = null;
  if (s) s.stop().then(() => s.clear()).catch(() => {});
  if (box) box.hidden = true;
  if (btn) btn.textContent = 'Scan';
}

function openForm(p) {
  editingId = p ? p.id : null;
  const form = document.getElementById('product-form');
  form.reset();
  form.querySelectorAll('.field-error').forEach((el) => { el.textContent = ''; });
  document.getElementById('form-title').textContent = p ? `Edit ${p.name}` : 'New product';
  const set = (id, value) => { document.getElementById(id).value = value == null ? '' : value; };
  set('f-name', p && p.name);
  set('f-category', p && p.category);
  set('f-status', p ? p.status : 'draft');
  set('f-price', p && p.price);
  set('f-mrp', p && p.mrp);
  set('f-stock', p ? p.stock : 0);
  set('f-qr', p && p.qr_code);
  set('f-image', p && p.image_url);
  set('f-desc', p && p.description);
  set('f-wmin', p && p.weight_min_g);
  set('f-wmax', p && p.weight_max_g);
  set('f-color', p && p.ref_color);
  document.getElementById('f-color-picker').value = (p && p.ref_color) || '#888888';
  const cats = sortSections([...new Set(products.map((x) => x.category))]);
  document.getElementById('category-list').innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join('');
  photo.file = null;
  photo.remove = false;
  photo.stored = Boolean(p && p.image_url && p.image_url.startsWith('/api/products/'));
  photo.current = p && p.image_url ? (p.image_url.startsWith('/api/') ? API_BASE + p.image_url : p.image_url) : null;
  setPhotoPreview(null);
  document.getElementById('product-dialog').showModal();
}

/* ---------------- product photo (taken on the phone, stored on the server) ---------------- */

// One tap in the product list: camera opens, the photo uploads, the list shows it. Quick for 48 items.
let quickTarget = null;
function quickPhoto(p, btn) {
  quickTarget = { product: p, btn };
  const input = document.getElementById('quick-photo');
  input.value = '';
  input.click();
}
function setupQuickPhoto() {
  document.getElementById('quick-photo').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    const target = quickTarget;
    quickTarget = null;
    if (!file || !target) return;
    if (!/^image\//.test(file.type)) { toast('Choose a photo (JPG or PNG)', 'error'); return; }
    setBusy(target.btn, true);
    try {
      const fd = new FormData();
      fd.append('photo', await shrinkPhoto(file), 'photo.jpg');
      await api(`/api/admin/products/${target.product.id}/photo`, { method: 'POST', body: fd });
      toast(`Photo saved for ${target.product.name}`);
      loadProducts();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(target.btn, false);
    }
  });
}

const photo = { file: null, remove: false, stored: false, current: null, objectUrl: null };

function setPhotoPreview(newUrl) {
  if (photo.objectUrl) URL.revokeObjectURL(photo.objectUrl);
  photo.objectUrl = newUrl;
  const shown = newUrl || (photo.remove ? null : photo.current);
  const box = document.getElementById('f-photo-preview');
  box.innerHTML = shown ? `<img src="${esc(shown)}" alt="Product photo">` : icon('camera2', 22);
  document.getElementById('f-photo-label').textContent = shown ? 'Change photo' : 'Add photo';
  document.getElementById('f-photo-remove').hidden = !(newUrl || (photo.stored && !photo.remove));
}

// Phone photos are 3-8 MB: shrink to 1280 px JPEG before uploading (the server re-encodes again).
async function shrinkPhoto(file) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    return blob || file;
  } catch (e) {
    return file;
  }
}

/* ---------------- printable QR labels ---------------- */

function setupQrDialog() {
  const dialog = document.getElementById('qr-dialog');
  document.getElementById('qr-close').onclick = () => dialog.close();
  document.getElementById('qr-download').onclick = () => {
    const canvas = document.querySelector('#qr-target canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${document.getElementById('qr-code-text').textContent}.png`;
    a.click();
  };
}

function showQr(p) {
  const target = document.getElementById('qr-target');
  target.innerHTML = '';
  document.getElementById('qr-title').textContent = p.name;
  document.getElementById('qr-code-text').textContent = p.qr_code;
  drawQr(target, p.qr_code, 200, 'QR code could not load - use the code below.');
  document.getElementById('qr-dialog').showModal();
}

/* ---------------- fraud flags ---------------- */

async function loadFlagCount() {
  try {
    const { flags } = await api('/api/admin/flags?status=open');
    document.getElementById('flag-count').textContent = flags.length ? `(${flags.length})` : '';
  } catch (e) { /* ignore */ }
}

async function loadFlags() {
  const el = document.getElementById('tab-flags');
  el.innerHTML = Skel.rows(2, false);
  try {
    const { flags } = await api('/api/admin/flags?status=all');
    el.innerHTML = flags.length
      ? `<ul class="list">${flags.map(flagRow).join('')}</ul>`
      : '<p class="card small muted center">No flagged scans. Every scan so far matched its weight and camera checks.</p>';
  } catch (err) {
    el.innerHTML = `<p class="card small muted">${esc(err.message)}</p>`;
  }
}

function flagRow(f) {
  const rows = f.reasons.map((r) => `<li><span>${esc(REASONS[r] || r)}</span><span class="bad">&#10007;</span></li>`);
  if (f.measured_weight_g !== null) {
    const exp = f.expected_weight_g[0] !== null ? ` (expected ${f.expected_weight_g[0]}-${f.expected_weight_g[1]} g)` : '';
    rows.push(`<li><span>Measured weight</span><span>${f.measured_weight_g} g${exp}</span></li>`);
  }
  if (f.measured_color) {
    const exp = f.expected_color ? ` vs <span class="swatch" style="background:${esc(f.expected_color)}"></span>` : '';
    rows.push(`<li><span>Camera colour</span><span><span class="swatch" style="background:${esc(f.measured_color)}"></span>${exp}</span></li>`);
  }
  const actions = f.status === 'open'
    ? `<div class="row" style="margin-top:12px;gap:8px">
         <button type="button" class="btn btn-sm" data-flag="${f.id}" data-action="approve">Approve &amp; add to cart</button>
         <button type="button" class="btn btn-outline btn-sm" data-flag="${f.id}" data-action="reject">Reject</button>
       </div>`
    : '';
  return `<li class="card" style="padding:14px">
    <div class="row between"><p class="small" style="font-weight:600">${esc(f.product_name)}</p>
      <span class="badge ${f.status === 'open' ? 'badge-danger' : ''}">${f.status}</span></div>
    <p class="xs muted">${esc(f.user_name)} &middot; ${esc(f.user_email)} &middot; ${fmtDate(f.created_at, true)}</p>
    <p class="mono muted">scanned: ${esc(f.scanned_code)}</p>
    <ul class="checks">${rows.join('')}</ul>
    ${actions}
  </li>`;
}

async function onFlagsClick(e) {
  const btn = e.target.closest('button[data-flag]');
  if (!btn) return;
  setBusy(btn, true);
  try {
    await api(`/api/admin/flags/${btn.dataset.flag}/resolve`, { method: 'POST', body: { action: btn.dataset.action } });
    toast(btn.dataset.action === 'approve' ? "Approved - item added to the shopper's cart" : 'Flag rejected');
    loadFlags();
    loadFlagCount();
  } catch (err) {
    toast(err.message, 'error');
    setBusy(btn, false);
  }
}

/* ---------------- all orders ---------------- */

async function loadOrders() {
  const el = document.getElementById('tab-orders');
  el.innerHTML = Skel.rows(4);
  try {
    const { orders } = await api('/api/admin/orders');
    el.innerHTML = orders.length
      ? `<ul class="list">${orders.map((o) => `
          <li><a class="card row" style="padding:12px;text-decoration:none" href="order.html?id=${o.id}">
            <span style="color:var(--primary)">${icon('receipt', 20)}</span>
            <div class="grow">
              <p class="small" style="font-weight:500">${esc(o.number)} &middot; ${fmtDate(o.created_at)}</p>
              <p class="xs muted truncate">${esc(o.user_name)} &middot; ${o.item_count} item${o.item_count === 1 ? '' : 's'} &middot; ${o.exited ? `<span class="ok">exited</span>${o.exit_by && o.exit_by.startsWith('Pi') ? ' (Pi camera)' : ''}` : 'not exited yet'}</p>
            </div>
            <span style="font-weight:600">${money(o.total_amount)}</span>
          </a></li>`).join('')}</ul>`
      : '<p class="card small muted center">No orders yet.</p>';
  } catch (err) {
    el.innerHTML = `<p class="card small muted">${esc(err.message)}</p>`;
  }
}

/* ---------------- hardware: mode, devices, memory cache, simulator ---------------- */

const MODE_TEXT = {
  off: 'Software only - the barcode/QR alone adds an item.',
  weight: 'Barcode + load-cell weight must agree.',
  full: 'Barcode + weight + camera colour must all agree.',
};

function renderHardware() {
  alertsKey = '';
  const el = document.getElementById('tab-hardware');
  el.innerHTML = `
    <div class="card scale-off-only">
      <p class="small" style="font-weight:600">${icon('scale', 16)} Cart scale: switched off</p>
      <p class="xs muted" style="margin-top:4px">Items are added by their barcode or QR code. The weight and camera-colour
        checks are built but switched off on this server (<span class="mono">SCALE_ENABLED</span>) until a working
        load cell is fitted. The Pi camera still checks bills at the exit and reads wallet top-up tokens.</p>
    </div>
    <div class="card scale-only">
      <p class="small" style="font-weight:600">Verification mode</p>
      <div class="segmented" id="mode-switch" role="group" aria-label="Verification mode">
        ${['off', 'weight', 'full'].map((m) => `<button type="button" data-mode="${m}">${m}</button>`).join('')}
      </div>
      <p class="xs muted" style="margin-top:8px" id="a-mode-text">&nbsp;</p>
    </div>
    <div class="card" style="margin-top:16px">
      <p class="small" style="font-weight:600">${icon('chip', 16)} Devices</p>
      <div id="a-devices" style="margin-top:8px">${Skel.line(70)}${Skel.line(50, 8)}</div>
    </div>
    <div class="card scale-only" style="margin-top:16px">
      <p class="small" style="font-weight:600">${icon('alert', 16)} Put in without scanning</p>
      <p class="xs muted" style="margin-top:4px">Weight landed on a cart's scale but no scan used it. These clear by themselves when the item is scanned or taken out.</p>
      <div id="a-alerts" style="margin-top:8px"><p class="xs muted">Checking&hellip;</p></div>
    </div>
    <div class="hw scale-only">
      <div class="card"><p class="xs muted">Latest weight</p><p class="value tabular" id="a-weight">-</p><p class="xs muted" id="a-weight-age"></p></div>
      <div class="card"><p class="xs muted">Latest camera</p><img class="cam-thumb" id="a-cam-img" alt="Latest camera capture" hidden><p class="xs muted" id="a-cam-age"></p></div>
    </div>
    <div class="card" style="margin-top:16px">
      <p class="small" style="font-weight:600">${icon('bolt', 16)} Memory cache</p>
      <p class="xs muted" style="margin-top:4px">Products are kept in the server's memory, so the shop and every scan skip the database.</p>
      <dl class="kv" id="a-cache"></dl>
    </div>
    <div class="card scale-only" style="margin-top:16px">
      <p class="small" style="font-weight:600">Simulator (demo without hardware)</p>
      <p class="xs muted" style="margin:4px 0 12px">Sends readings exactly like the Raspberry Pi would. Scan the item within <span id="a-age">15</span> seconds.</p>
      <div class="row"><input class="input" id="sim-weight" type="number" step="0.1" placeholder="Weight in grams"><button type="button" class="btn" id="sim-weight-btn">Send</button></div>
      <div class="row" style="margin-top:10px">
        <input type="color" id="sim-color" value="#c8323c" style="width:44px;height:44px;border:none;background:none;padding:0">
        <span class="small muted grow">Camera colour</span>
        <button type="button" class="btn" id="sim-color-btn">Send</button>
      </div>
    </div>`;
  document.getElementById('sim-weight-btn').onclick = (e) => simulate(e.currentTarget, { weight_g: document.getElementById('sim-weight').value });
  document.getElementById('sim-color-btn').onclick = (e) => simulate(e.currentTarget, { color_hex: document.getElementById('sim-color').value });
  document.getElementById('mode-switch').onclick = (e) => {
    const b = e.target.closest('button[data-mode]');
    if (b && !b.classList.contains('active')) setMode(b);
  };
  refreshHardware();
}

async function setMode(btn) {
  setBusy(btn, true);
  try {
    const { hardware_mode: mode } = await api('/api/admin/settings', { method: 'PUT', body: { hardware_mode: btn.dataset.mode } });
    toast(`Verification mode: ${mode}`);
  } catch (err) {
    toast(err.message, 'error');
  }
  setBusy(btn, false);
  refreshHardware();
}

async function simulate(btn, body) {
  setBusy(btn, true);
  try {
    await api('/api/hardware/simulate', { method: 'POST', body });
    toast('Reading sent - now scan the item');
    refreshHardware();
  } catch (err) {
    toast(err.message, 'error');
  }
  setBusy(btn, false);
}

function deviceRow(d) {
  const name = d.device_id.startsWith('rpi') ? `Raspberry Pi <span class="mono">(${esc(d.device_id)})</span>` : esc(d.device_id);
  const parts = [d.online ? `online &middot; ${ago(d.last_seen_sec)}` : `offline &middot; last seen ${ago(d.last_seen_sec)}`];
  if (d.roles) parts.push(esc([].concat(d.roles).join(' + ')));
  if (d.scale) parts.push('scale ' + esc(d.scale));
  if (d.camera) parts.push('camera ' + esc(d.camera));
  if (d.platform_weight_g != null) parts.push(`${d.platform_weight_g} g on platform`);
  if (d.version) parts.push('v' + esc(d.version));
  return `<div class="row" style="gap:10px;padding:6px 0;align-items:flex-start">
    <span class="dot ${d.online ? 'on' : 'off'}" style="margin-top:6px"></span>
    <div class="grow"><p class="small" style="font-weight:600">${name}</p><p class="xs muted">${parts.join(' &middot; ')}</p></div></div>`;
}

let alertsKey = '';
function renderAlerts(alerts, mode) {
  const box = document.getElementById('a-alerts');
  if (!box) return;
  const key = mode + alerts.map((a) => `${a.id}:${Math.floor(a.age_sec / 10)}`).join(',');
  if (key === alertsKey) return;            // unchanged: don't redraw under the staff's finger
  alertsKey = key;
  if (mode === 'off') {
    box.innerHTML = '<p class="xs muted">Only works when verification is on (weight or full), because it needs the scale.</p>';
    return;
  }
  box.innerHTML = alerts.length
    ? alerts.map((a) => `<div class="row alert-row">
        <span style="color:var(--destructive)">${icon('alert', 18)}</span>
        <div class="grow"><p class="small" style="font-weight:600">${a.weight_g} g not scanned</p>
          <p class="xs muted">${esc(a.device_id)} &middot; ${ago(a.age_sec)}</p></div>
        <button type="button" class="btn btn-outline btn-sm" data-dismiss="${a.id}">Dismiss</button></div>`).join('')
    : '<p class="xs muted">Nothing waiting. Every item on the scale was scanned.</p>';
}

async function onHardwareClick(e) {
  const btn = e.target.closest('button[data-dismiss]');
  if (!btn) return;
  setBusy(btn, true);
  try {
    await api(`/api/admin/alerts/${btn.dataset.dismiss}/dismiss`, { method: 'POST', body: {} });
    toast('Alert dismissed');
    alertsKey = '';
    refreshHardware();
  } catch (err) {
    toast(err.message, 'error');
    setBusy(btn, false);
  }
}

let lastSystem = 0;
async function refreshHardware() {
  if (!document.getElementById('a-mode-text')) return;
  try {
    const s = await api('/api/hardware/status');
    const stale = (r) => (r.age_sec > s.max_age_sec ? ' &middot; stale' : ' &middot; fresh');
    document.querySelectorAll('#mode-switch button').forEach((b) => {
      if (!b.disabled) b.classList.toggle('active', b.dataset.mode === s.mode);
    });
    document.getElementById('a-age').textContent = s.max_age_sec;
    const w = s.weight;
    document.getElementById('a-weight').textContent = w ? `${w.weight_g} g` : '-';
    document.getElementById('a-weight-age').innerHTML = w ? `${esc(w.device_id)} &middot; ${ago(w.age_sec)}${stale(w)}` : 'No reading yet';
    const im = s.image;
    const img = document.getElementById('a-cam-img');
    if (im && im.image_url) {
      const src = API_BASE + im.image_url;
      if (img.dataset.src !== src) { img.src = src; img.dataset.src = src; }
      img.hidden = false;
    }
    document.getElementById('a-cam-age').innerHTML = im
      ? `<span class="swatch" style="background:${esc(im.color_hex || '#ccc')}"></span> ${esc(im.color_hex || '')} &middot; ${ago(im.age_sec)}${stale(im)}`
      : 'No photo yet';
    renderAlerts(s.alerts || [], s.mode);
  } catch (e) { /* ignore polling errors */ }
  if (Date.now() - lastSystem < 2900) return;     // devices + cache: every 3 s is plenty
  lastSystem = Date.now();
  try {
    const sys = await api('/api/admin/system');
    document.getElementById('a-mode-text').innerHTML = `${esc(MODE_TEXT[sys.hardware_mode] || '')}<br><span class="muted">Set by: ${esc(sys.hardware_mode_source)}</span>`;
    document.getElementById('a-devices').innerHTML = sys.devices.length
      ? sys.devices.map(deviceRow).join('')
      : '<p class="xs muted">No device has connected yet. On the Pi run <span class="mono">python3 cart_agent.py run</span> (or switch the Pi on if auto-start is set up).</p>';
    const c = sys.cache;
    const rate = c.hit_rate_pct == null ? '-' : `${c.hit_rate_pct}%`;
    document.getElementById('a-cache').innerHTML = `
      <dt>Products in memory</dt><dd>${c.products_in_memory}</dd>
      <dt>Answered from memory</dt><dd>${rate} (${c.hits} of ${c.hits + c.misses})</dd>
      <dt>Read from MySQL</dt><dd>${c.misses} time${c.misses === 1 ? '' : 's'}</dd>
      <dt>Copy age</dt><dd>${c.age_sec == null ? '-' : ago(c.age_sec)} (refresh every ${Math.round(c.refresh_every_sec / 60)} min)</dd>
      <dt>Last cleared</dt><dd>${esc(c.last_cleared_because)}</dd>`;
  } catch (e) { /* ignore polling errors */ }
}

init();
