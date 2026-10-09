renderNav('cart');
Help.mount('At the cart');
const main = document.getElementById('main');
const subtitle = document.getElementById('subtitle');
let cart = null;
let busyId = null;
let shownTotal = 0;

async function load() {
  if (!Auth.require()) return;
  if (!cart) main.innerHTML = Skel.rows(3) + Skel.wrap(`<div class="card" style="margin-top:8px">${Skel.line(100, 12)}<div style="margin-top:14px">${Skel.line(85, 8)}</div></div>`);
  try {
    const first = !cart;
    cart = await api('/api/cart');
    render();
    if (first) reveal(main);
  } catch (err) {
    main.innerHTML = `<p class="card small muted">${esc(err.message)}</p>`;
  }
}

function render() {
  refreshCartBadge(cart.item_count);
  const oldBar = document.getElementById('checkout-bar');
  if (oldBar) oldBar.remove();

  if (!cart.items.length) {
    subtitle.textContent = 'Nothing here yet.';
    main.innerHTML = `<div class="card empty">${icon('cart', 32)}
      <p class="small muted">Scan an item's barcode or browse the shop to start your order.</p>
      <a class="btn btn-sm" href="scan.html">Scan a code</a></div>
      <a class="card list-banner" href="list.html" style="margin-top:12px">${icon('list', 22)}<div class="grow"><p class="small" style="font-weight:700">Make a shopping list first</p>
        <p class="xs muted">It shows which aisles to visit and ticks items off as you scan.</p></div></a>
      ${budgetCard()}`;
    shownTotal = 0;
    wireBudget();
    return;
  }

  subtitle.textContent = `${cart.item_count} item${cart.item_count === 1 ? '' : 's'} ready`;
  const scanOnly = cart.hardware_mode !== 'off';
  main.innerHTML = `
    <a class="card list-banner" href="list.html" id="cart-list" hidden></a>
    <ul class="list">${cart.items.map((l) => `
      <li class="card row" style="padding:12px">
        ${productImage(l, 'thumb')}
        <div class="grow">
          <p class="truncate" style="font-weight:600;font-size:.875rem">${esc(l.name)}</p>
          <p class="small muted">${money(l.price)} each${l.mrp ? ` <s class="mrp">${money(l.mrp).replace('.00', '')}</s>` : ''}${l.line_saving ? ` <span class="save-pill">Save ${money(l.line_saving).replace('.00', '')}</span>` : ''}</p>
          <div class="qty">
            <button type="button" class="btn btn-outline btn-icon" data-act="dec" data-id="${l.id}" aria-label="Decrease ${esc(l.name)} quantity">${icon('minus', 14)}</button>
            <span>${l.quantity}</span>
            <button type="button" class="btn btn-outline btn-icon" data-act="inc" data-id="${l.id}" aria-label="Increase ${esc(l.name)} quantity"
              ${scanOnly || l.quantity >= Math.min(99, l.stock) ? 'disabled' : ''} title="${scanOnly ? 'Scan the item again to add another' : ''}">${icon('plus', 14)}</button>
            <button type="button" class="btn btn-ghost btn-icon" style="margin-left:auto" data-act="del" data-id="${l.id}" aria-label="Remove ${esc(l.name)}">${icon('trash', 16)}</button>
          </div>
        </div>
      </li>`).join('')}</ul>
    <div class="card" style="margin-top:20px">
      <div class="row between small"><span class="muted">Subtotal</span><span class="tabular" style="font-weight:600" id="subtotal">${money(shownTotal)}</span></div>
      ${cart.savings > 0 ? `<div class="row between small saving-row" style="margin-top:6px"><span>${icon('tag', 14)} You save on offers</span><span class="tabular">${money(cart.savings)}</span></div>` : ''}
      <hr class="divider">
      <div class="row between small" style="margin-top:8px"><span class="muted">${icon('wallet', 14)} Wallet balance</span><span class="tabular" style="font-weight:600">${money(cart.wallet_balance)}</span></div>
      <hr class="divider">
      <p class="xs muted">${scanOnly ? `Every item was verified by barcode + weight${cart.hardware_mode === 'full' ? ' + camera' : ''}. ` : ''}You pay from your SmartCart Wallet. The total is recalculated on the server from current prices when you pay.</p>
    </div>
    ${budgetCard()}
    <div style="height:84px"></div>`;

  const bar = document.createElement('div');
  bar.className = 'checkout-bar';
  bar.id = 'checkout-bar';
  bar.innerHTML = `<div class="inner">
      <div><p class="xs muted">Running total</p><p class="tabular" style="font-size:1.125rem;font-weight:700" id="bar-total">${money(shownTotal)}</p></div>
      <div id="pay-slot" style="margin-left:auto"></div>
    </div>`;
  document.body.appendChild(bar);
  renderPayButton();
  animateTotal(cart.subtotal);
  wireBudget();
  loadListProgress();
}

// Budget: a spending limit for this trip, like the running-total screens on smart carts.
function budgetCard() {
  if (cart.budget == null) {
    return `<div class="card row" style="margin-top:12px;padding:12px 14px" id="budget-card">
      <span style="color:var(--primary)">${icon('wallet', 18)}</span>
      <p class="small grow">Set a budget for this trip</p>
      <button type="button" class="btn btn-outline btn-sm" id="budget-edit">Set</button></div>`;
  }
  const used = cart.subtotal / cart.budget;
  const over = cart.subtotal - cart.budget;
  const cls = used > 1 ? 'over' : (used >= 0.9 ? 'warn' : '');
  const note = used > 1 ? `<span class="bad">${money(over)} over your budget</span>`
    : `${money(cart.budget - cart.subtotal)} left${used >= 0.9 ? ' - nearly there' : ''}`;
  return `<div class="card" style="margin-top:12px;padding:14px" id="budget-card">
    <div class="row between small"><span style="font-weight:600">${icon('wallet', 14)} Budget ${money(cart.budget).replace('.00', '')}</span>
      <button type="button" class="btn-link xs" id="budget-edit">Change</button></div>
    <div class="progress ${cls}" style="margin:10px 0 6px" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, Math.round(used * 100))}" aria-label="Budget used"><span style="width:${Math.min(100, used * 100)}%"></span></div>
    <p class="xs muted">${note}</p></div>`;
}

function wireBudget() {
  const btn = document.getElementById('budget-edit');
  if (!btn) return;
  btn.onclick = () => {
    const card = document.getElementById('budget-card');
    card.innerHTML = `<form class="row" id="budget-form" style="gap:8px;width:100%" novalidate>
      <input class="input" id="budget-input" type="number" inputmode="numeric" min="1" max="100000" step="1" placeholder="Budget in ₹" value="${cart.budget || ''}" aria-label="Budget in rupees">
      <button class="btn btn-sm" type="submit">Save</button>
      ${cart.budget != null ? '<button class="btn btn-ghost btn-sm" type="button" id="budget-clear">Remove</button>' : ''}</form>`;
    document.getElementById('budget-input').focus();
    const save = async (value) => {
      try {
        const { budget } = await api('/api/budget', { method: 'PUT', body: { budget: value } });
        cart.budget = budget;
        toast(budget ? `Budget set: ${money(budget).replace('.00', '')}` : 'Budget removed');
        render();
      } catch (err) { toast(err.message, 'error'); }
    };
    document.getElementById('budget-form').onsubmit = (e) => { e.preventDefault(); save(document.getElementById('budget-input').value); };
    const clear = document.getElementById('budget-clear');
    if (clear) clear.onclick = () => save(null);
  };
}

async function loadListProgress() {
  try {
    const list = await api('/api/list');
    const el = document.getElementById('cart-list');
    if (!el || !list.count) return;
    const left = list.count - list.done;
    el.innerHTML = `${icon('list', 22)}<div class="grow"><p class="small" style="font-weight:700">Shopping list: ${list.done} of ${list.count} in cart</p>
      <div class="progress" style="margin:6px 0 4px"><span style="width:${Math.round((list.done / list.count) * 100)}%"></span></div>
      <p class="xs muted">${left ? `Still to get: ${left} &middot; aisle${list.aisles_left.length === 1 ? '' : 's'} ${list.aisles_left.join(', ')}` : 'All done - ready to pay'}</p></div>`;
    el.hidden = false;
  } catch (e) { /* optional */ }
}

function animateTotal(target) {
  const from = shownTotal;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / 350);
    const value = from + (target - from) * (1 - (1 - t) ** 3);
    ['subtotal', 'bar-total'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = money(value);
    });
    if (t < 1) requestAnimationFrame(step);
    else shownTotal = target;
  };
  requestAnimationFrame(step);
}

main.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn || busyId) return;
  const line = cart.items.find((l) => String(l.id) === btn.dataset.id);
  if (!line) return;
  busyId = line.id;
  main.querySelectorAll(`button[data-id="${line.id}"]`).forEach((b) => { b.disabled = true; });
  try {
    if (btn.dataset.act === 'del') {
      cart = await api(`/api/cart/items/${line.id}`, { method: 'DELETE' });
    } else {
      const quantity = line.quantity + (btn.dataset.act === 'inc' ? 1 : -1);
      cart = await api(`/api/cart/items/${line.id}`, { method: 'PATCH', body: { quantity } });
    }
  } catch (err) {
    toast(err.message, 'error');
  }
  busyId = null;
  render();
});

// Enough money in the wallet -> "Pay"; otherwise send them to top up the difference.
function renderPayButton() {
  const slot = document.getElementById('pay-slot');
  if (!slot) return;
  const short = Math.round((cart.subtotal - cart.wallet_balance) * 100) / 100;
  if (short > 0) {
    const need = Math.ceil(short);
    slot.innerHTML = `<a class="btn btn-secondary" style="padding:0 16px" id="topup-btn" href="wallet.html?need=${need}">${icon('wallet', 16)} Add ${money(need).replace('.00', '')}</a>`;
  } else {
    slot.innerHTML = `<button type="button" class="btn" style="padding:0 20px" id="checkout-btn">${icon('wallet', 16)} Pay ${money(cart.subtotal)}</button>`;
    document.getElementById('checkout-btn').onclick = checkout;
  }
}

async function checkout() {
  const btn = document.getElementById('checkout-btn');
  // Same key is reused if the request is retried, so the server can never bill twice.
  let key = sessionStorage.getItem('checkout_key');
  if (!key) { key = uuid(); sessionStorage.setItem('checkout_key', key); }
  setBusy(btn, true);
  try {
    const { order } = await api('/api/checkout', { method: 'POST', body: { idempotency_key: key } });
    sessionStorage.removeItem('checkout_key');
    location.href = `order.html?id=${order.id}&paid=1`;
  } catch (err) {
    toast(err.status ? err.message : 'Payment failed. Your wallet has not been charged.', 'error');
    setBusy(btn, false);
    if (err.status === 409 || err.status === 400) load();
  }
}

load();
