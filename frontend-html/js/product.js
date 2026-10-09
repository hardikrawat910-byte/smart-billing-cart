renderNav('home');
const main = document.getElementById('main');

async function load() {
  const id = param('id');
  if (!id) { main.innerHTML = '<p class="card small muted">No product selected.</p>'; return; }
  main.innerHTML = Skel.wrap(`${Skel.block(220)}
    <div class="card" style="margin-top:16px">${Skel.line(30, 8)}${Skel.line(70, 18)}${Skel.line(35, 22)}
      <div style="margin-top:16px">${Skel.line(100)}${Skel.line(95)}${Skel.line(60)}</div></div>
    ${Skel.block(44, 'margin-top:16px')}`);
  try {
    const [{ product: p }, health] = await Promise.all([api(`/api/products/${encodeURIComponent(id)}`), api('/api/health')]);
    document.title = `${p.name} - SmartCart`;
    document.getElementById('title').textContent = p.category;
    const scanOnly = health.hardware_mode !== 'off';
    main.innerHTML = `
      ${productImage(p, 'hero-img')}
      <div class="card" style="margin-top:16px">
        <div class="row between" style="gap:8px">
          <span class="aisle-chip">${icon('pin', 13)} ${esc(aisleLabel(p.aisle) || p.category)}${p.aisle ? ` &middot; ${esc(p.category)}` : ''}</span>
          <span class="badge ${p.in_stock ? 'badge-primary' : 'badge-danger'}">${p.in_stock ? p.stock + ' in stock' : 'Sold out'}</span>
        </div>
        <h2 style="font-size:1.25rem;font-weight:700;margin:8px 0 6px">${esc(p.name)}</h2>
        <p>${priceHtml(p, true)}</p>
        ${p.mrp ? '<p class="xs muted" style="margin-top:4px">Offer price at SmartCart; MRP shown on the pack.</p>' : ''}
        <p class="small muted" style="margin-top:10px;line-height:1.6">${esc(p.description || '')}</p>
        <hr class="divider">
        <p class="xs muted">Code on the shelf label: <span class="mono">${esc(p.qr_code)}</span></p>
      </div>
      <div style="margin-top:16px" id="actions"></div>
      <div id="related" style="margin-top:24px"></div>`;
    reveal(main);
    renderActions(p, scanOnly);
    loadRelated(p);
  } catch (err) {
    main.innerHTML = `<p class="card small muted">${esc(err.status === 404 ? 'This product is not available.' : err.message)}</p>`;
  }
}

function renderActions(p, scanOnly) {
  const actions = document.getElementById('actions');
  const listBtn = `<button type="button" class="btn btn-outline btn-block" id="to-list" style="margin-top:10px">${icon('list', 18)} Add to my shopping list</button>`;
  if (scanOnly) {
    actions.innerHTML = `<a class="btn btn-block" href="scan.html">${icon('qr', 18)} Scan the item to add it</a>
      <p class="xs muted center" style="margin-top:8px">Weight + camera verification is on, so items can only be added by scanning them at the cart.</p>${listBtn}`;
  } else {
    actions.innerHTML = `<button class="btn btn-block" id="add" ${p.in_stock ? '' : 'disabled'}>${icon('cart', 18)} Add to cart</button>${listBtn}`;
    document.getElementById('add').onclick = async (e) => {
      if (!Auth.loggedIn()) { goToLogin(); return; }
      const btn = e.currentTarget;
      setBusy(btn, true);
      try {
        const cart = await api('/api/cart/items', { method: 'POST', body: { product_id: p.id, quantity: 1 } });
        refreshCartBadge(cart.item_count);
        Feedback.ok();
        toast(`${p.name} added to cart`);
      } catch (err) {
        toast(err.message, 'error');
      }
      setBusy(btn, false);
    };
  }
  document.getElementById('to-list').onclick = async (e) => {
    if (!Auth.loggedIn()) { goToLogin(); return; }
    const btn = e.currentTarget;
    setBusy(btn, true);
    try {
      const list = await api('/api/list', { method: 'POST', body: { product_id: p.id, quantity: 1, add: true } });
      toast(`On your list (${list.count - list.done} to get)`);
      btn.innerHTML = `${icon('check', 18)} On your list &middot; <u>open it</u>`;
      btn.disabled = false;
      btn.onclick = () => { location.href = 'list.html'; };
    } catch (err) {
      toast(err.message, 'error');
      setBusy(btn, false);
    }
  };
}

async function loadRelated(p) {
  try {
    const { products, from_bills: fromBills } = await api(`/api/products/${p.id}/related`);
    if (!products.length) return;
    const el = document.getElementById('related');
    el.innerHTML = `<div class="shelf-head"><h2>${icon(fromBills ? 'repeat' : sectionIcon(p.category), 18)} ${fromBills ? 'Often bought together' : `More in ${esc(p.category)}`}</h2></div>
      <ul class="shelf-row">${products.map((r) => `<li><a class="card product-card" href="product.html?id=${r.id}">
        ${r.mrp ? `<span class="deal-flag">-${Math.round((1 - r.price / r.mrp) * 100)}%</span>` : ''}
        ${productImage(r)}<div class="body"><span class="xs muted truncate">${esc(r.category)}</span>
        <p class="name">${esc(r.name)}</p><span class="badge">${money(r.price)}</span></div></a></li>`).join('')}</ul>`;
    reveal(el);
  } catch (e) { /* suggestions are optional */ }
}
load();
