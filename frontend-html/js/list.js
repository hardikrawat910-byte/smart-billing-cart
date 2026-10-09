// Shopping list: plan the trip, follow the store map aisle by aisle, items tick off when scanned.
renderNav('home');
const main = document.getElementById('main');
const subtitle = document.getElementById('subtitle');
let list = null;
let catalogue = null;
let lastOrderId = null;
const SHORT = { 'Biscuits & Chocolates': 'Biscuits', 'Instant Food': 'Instant', 'Personal Care': 'Personal care', 'Electronics & Hobby': 'Electronics' };

async function load() {
  if (!Auth.require()) return;
  if (!list) main.innerHTML = Skel.rows(3);
  try {
    const first = !list;
    list = await api('/api/list');
    render();
    if (first) reveal(main);
  } catch (err) {
    main.innerHTML = `<p class="card small muted">${esc(err.message)}</p>`;
  }
}

function storeMap() {
  const todo = {};
  const any = {};
  list.items.forEach((i) => {
    if (!i.aisle) return;
    any[i.aisle] = true;
    if (!i.done) todo[i.aisle] = (todo[i.aisle] || 0) + 1;
  });
  const names = Object.entries(SECTION_AISLES);
  const aisle = ([name, n]) => {
    const col = (n - 1) % 4;
    const row = n <= 4 ? 0 : 1;
    const x = 12 + col * 86;
    const y = 14 + row * 70;
    const cls = todo[n] ? 'todo' : (any[n] ? 'done' : '');
    return `<g data-aisle="${n}" style="cursor:pointer"><rect class="aisle ${cls}" x="${x}" y="${y}" width="76" height="56" rx="8"/>
      <text x="${x + 10}" y="${y + 22}">Aisle ${n}</text><text class="sub" x="${x + 10}" y="${y + 38}">${esc(SHORT[name] || name)}</text>
      ${todo[n] ? `<circle class="badge-dot" cx="${x + 66}" cy="${y + 10}" r="9"/><text class="badge-text" x="${x + 66}" y="${y + 13.5}" text-anchor="middle">${todo[n]}</text>` : ''}
      ${!todo[n] && any[n] ? `<path d="M${x + 60} ${y + 12} l4 4 l7 -8" stroke="var(--olive)" stroke-width="2.4" fill="none"/>` : ''}</g>`;
  };
  return `<svg class="store-map" viewBox="0 0 356 196" role="img" aria-label="Store map: ${list.aisles_left.length ? `go to aisles ${list.aisles_left.join(', ')}` : 'nothing left to get'}">
    ${names.map(aisle).join('')}
    <rect x="12" y="160" width="100" height="26" rx="6" fill="none" stroke="var(--border)"/><text class="sub" x="62" y="177" text-anchor="middle">Entrance</text>
    <rect x="128" y="160" width="100" height="26" rx="6" fill="none" stroke="var(--border)"/><text class="sub" x="178" y="177" text-anchor="middle">Wallet counter</text>
    <rect x="244" y="160" width="100" height="26" rx="6" fill="none" stroke="var(--border)"/><text class="sub" x="294" y="177" text-anchor="middle">Exit gate (Pi)</text>
  </svg>`;
}

function itemRow(i) {
  return `<li class="card list-item${i.done ? ' done' : ''}" data-id="${i.id}">
    <span class="tick" aria-label="${i.done ? 'In your cart' : 'Still to get'}">${icon('check', 14)}</span>
    ${productImage(i, 'thumb')}
    <div class="grow" style="min-width:0">
      <p class="name clamp2 small" style="font-weight:600">${esc(i.name)}</p>
      <p class="xs muted">${money(i.price)}${i.mrp ? ` <s>${money(i.mrp).replace('.00', '')}</s>` : ''}${i.done ? ' &middot; in your cart' : (i.in_cart ? ` &middot; ${i.in_cart} of ${i.quantity} in cart` : '')}${i.in_stock ? '' : ' &middot; <span class="bad">sold out</span>'}</p>
    </div>
    <div class="qty" style="margin:0">
      <button type="button" class="btn btn-outline btn-icon" data-act="dec" aria-label="One less ${esc(i.name)}">${icon('minus', 14)}</button>
      <span>${i.quantity}</span>
      <button type="button" class="btn btn-outline btn-icon" data-act="inc" aria-label="One more ${esc(i.name)}" ${i.quantity >= 99 ? 'disabled' : ''}>${icon('plus', 14)}</button>
    </div>
  </li>`;
}

function render() {
  const left = list.count - list.done;
  subtitle.textContent = list.count
    ? (left ? `${left} to get${list.aisles_left.length ? ` in aisle${list.aisles_left.length === 1 ? '' : 's'} ${list.aisles_left.join(', ')}` : ''}` : 'Everything on your list is in the cart')
    : 'Plan your trip. Items tick off as you scan them.';
  const groups = {};
  list.items.filter((i) => !i.done).forEach((i) => { (groups[i.aisle || 0] = groups[i.aisle || 0] || []).push(i); });
  const done = list.items.filter((i) => i.done);
  main.innerHTML = `
    <div class="search" style="position:relative;margin-bottom:16px">
      ${icon('plus', 16)}
      <input id="add-input" class="input" type="search" placeholder="Add an item: soap, notebook, Maggi..." aria-label="Add an item to your list" autocomplete="off">
      <ul class="suggest" id="suggest" hidden></ul>
    </div>
    ${list.count ? `<div class="card" style="padding:12px">${storeMap()}
      <div class="row between small" style="margin-top:8px"><span class="muted">Estimated total</span><span class="tabular" style="font-weight:700">${money(list.estimate)}</span></div></div>` : ''}
    ${Object.keys(groups).sort((a, b) => a - b).map((a) => `
      <p class="aisle-head" id="aisle-${a}">${icon('pin', 16)} ${a > 0 ? `Aisle ${a}` : 'Other'} <span class="xs muted" style="font-weight:500">${esc(groups[a][0].category)}</span></p>
      <ul class="list">${groups[a].map(itemRow).join('')}</ul>`).join('')}
    ${done.length ? `<p class="aisle-head">${icon('check', 16)} In your cart <span class="xs muted" style="font-weight:500">${done.length}</span></p>
      <ul class="list">${done.map(itemRow).join('')}</ul>` : ''}
    ${list.count ? `<div class="row" style="gap:8px;margin-top:18px">
        <a class="btn" style="flex:1" href="scan.html">${icon('qr', 16)} Start scanning</a>
        ${done.length ? '<button type="button" class="btn btn-outline" id="clear-done">Clear ticked</button>' : ''}
      </div>
      <div class="center" style="margin-top:12px"><button type="button" class="btn-link small" id="clear-all">Empty the list</button></div>`
    : `<div class="card empty">${icon('list', 32)}
        <p class="small muted">Nothing on your list yet. Search above, tap a deal, or copy your last bill.</p>
        <div class="quick-chips" id="quick"></div>
        ${lastOrderId ? `<button type="button" class="btn btn-outline btn-sm" id="from-bill">${icon('repeat', 14)} Add everything from my last bill</button>` : ''}
      </div>`}
    <div style="height:64px"></div>`;
  wire();
}

function wire() {
  const input = document.getElementById('add-input');
  input.addEventListener('input', suggest);
  input.addEventListener('focus', suggest);
  document.getElementById('suggest').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-pid]');
    if (b) add(Number(b.dataset.pid));
  });
  main.querySelectorAll('.store-map [data-aisle]').forEach((g) => {
    g.onclick = () => { const el = document.getElementById(`aisle-${g.dataset.aisle}`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  });
  const clearDone = document.getElementById('clear-done');
  if (clearDone) clearDone.onclick = () => change(api('/api/list?done=1', { method: 'DELETE' }), 'Ticked items cleared');
  const clearAll = document.getElementById('clear-all');
  if (clearAll) clearAll.onclick = () => { if (confirm('Empty your whole shopping list?')) change(api('/api/list', { method: 'DELETE' }), 'List emptied'); };
  const fromBill = document.getElementById('from-bill');
  if (fromBill) fromBill.onclick = () => change(api(`/api/list/from-order/${lastOrderId}`, { method: 'POST', body: {} }), 'Added your last bill');
  const quick = document.getElementById('quick');
  if (quick && catalogue) {
    quick.innerHTML = catalogue.filter((p) => p.mrp).slice(0, 6).map((p) => `<button type="button" class="chip" data-pid="${p.id}" style="border:1px solid var(--border)">${icon('plus', 12)} ${esc(p.name.split(' ').slice(0, 3).join(' '))}</button>`).join('');
    quick.onclick = (e) => { const b = e.target.closest('[data-pid]'); if (b) add(Number(b.dataset.pid)); };
  }
}

function suggest() {
  const box = document.getElementById('suggest');
  const term = document.getElementById('add-input').value.trim().toLowerCase();
  if (!term || !catalogue) { box.hidden = true; return; }
  const on = new Set(list.items.map((i) => i.product_id));
  const hits = catalogue.filter((p) => [p.name, p.category].some((t) => t.toLowerCase().includes(term))).slice(0, 6);
  box.innerHTML = hits.length ? hits.map((p) => `<li><button type="button" data-pid="${p.id}">${productImage(p, 'thumb')}
      <span class="grow"><span class="small" style="font-weight:600;display:block">${esc(p.name)}</span>
      <span class="xs muted">${esc(aisleLabel(p.aisle))} &middot; ${money(p.price)}${on.has(p.id) ? ' &middot; on your list' : ''}</span></span>${icon('plus', 16)}</button></li>`).join('')
    : '<li class="xs muted" style="padding:10px">No item matches. Try another word.</li>';
  box.hidden = false;
}

async function add(productId) {
  await change(api('/api/list', { method: 'POST', body: { product_id: productId, quantity: 1, add: true } }), null);
  const p = catalogue && catalogue.find((x) => x.id === productId);
  if (p) toast(`${p.name} added (${aisleLabel(p.aisle)})`);
  const input = document.getElementById('add-input');
  if (input) input.focus();
}

async function change(request, message) {
  try {
    list = await request;
    render();
    if (message) toast(message);
  } catch (err) {
    toast(err.message, 'error');
  }
}

main.addEventListener('click', (e) => {
  const btn = e.target.closest('.list-item button[data-act]');
  if (!btn) return;
  const row = btn.closest('.list-item');
  const item = list.items.find((i) => String(i.id) === row.dataset.id);
  if (!item) return;
  const quantity = item.quantity + (btn.dataset.act === 'inc' ? 1 : -1);
  row.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  change(api(`/api/list/${item.id}`, { method: 'PATCH', body: { quantity } }), quantity === 0 ? `${item.name} removed` : null);
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search')) { const box = document.getElementById('suggest'); if (box) box.hidden = true; }
});

async function init() {
  await load();
  try {
    const [{ products }, { orders }] = await Promise.all([api('/api/products'), api('/api/orders')]);
    catalogue = products.sort((a, b) => (b.mrp ? b.mrp - b.price : 0) - (a.mrp ? a.mrp - a.price : 0));
    lastOrderId = orders.length ? orders[0].id : null;
    if (list && !list.count) render();
  } catch (e) { /* search suggestions just won't show */ }
  Help.mount('Shopping list');
}
init();
