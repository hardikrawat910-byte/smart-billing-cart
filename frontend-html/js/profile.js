renderNav('user');
const main = document.getElementById('main');

async function load() {
  if (!Auth.require()) return;
  if (!main.dataset.loaded) {
    main.innerHTML = Skel.wrap(`<div class="card">
        <div class="row"><span class="sk sk-circle"></span><div class="grow">${Skel.line(55, 12)}${Skel.line(75, 8)}</div></div>
        <div class="row" style="margin-top:14px;gap:8px">${Skel.block(52, 'flex:1;border-radius:12px')}${Skel.block(52, 'flex:1;border-radius:12px')}</div>
        <div style="margin-top:18px">${Skel.line(30, 8)}${Skel.block(44, 'margin-top:8px;border-radius:12px')}</div></div>
      <div style="margin-top:24px">${Skel.line(35, 12)}</div><div style="margin-top:12px"></div>`) + Skel.rows(2, false);
  }
  try {
    const [{ user, stats }, { orders }] = await Promise.all([api('/api/profile'), api('/api/orders')]);
    Auth.setUser(user);
    render(user, stats, orders);
    if (!main.dataset.loaded) reveal(main);
    main.dataset.loaded = '1';
  } catch (err) {
    main.innerHTML = `<p class="card small muted">${esc(err.message)}</p>`;
  }
}

function render(user, stats, orders) {
  document.getElementById('subtitle').textContent = user.email;
  const initials = (user.full_name || user.email || 'S').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const orderList = orders.length
    ? `<ul class="list">${orders.map((o) => `
        <li><a class="card row" style="padding:12px;text-decoration:none" href="order.html?id=${o.id}">
          <span style="color:var(--primary)">${icon('receipt', 20)}</span>
          <div class="grow">
            <p class="small" style="font-weight:500">${fmtDate(o.created_at)} &middot; ${esc(o.number)}</p>
            <p class="xs muted">${o.item_count} item${o.item_count === 1 ? '' : 's'} &middot; ${o.exited ? 'exited' : 'exit pass unused'}</p>
          </div>
          <span style="font-weight:600">${money(o.total_amount)}</span>
        </a></li>`).join('')}</ul>`
    : '<div class="card small muted center">No orders yet - scan an item to get started.</div>';

  main.innerHTML = `
    <div class="card">
      <div class="row">
        <div class="avatar">${esc(initials)}</div>
        <div class="grow"><p class="truncate" style="font-weight:600">${esc(user.full_name)}</p><p class="truncate small muted">${esc(user.email)}</p></div>
        <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
          ${user.role === 'admin' ? '<span class="badge badge-solid">Admin</span>' : ''}
          ${user.google_linked ? '<span class="badge" title="This account can sign in with Google">Google</span>' : ''}
        </div>
      </div>
      <div class="row" style="margin-top:14px;gap:8px">
        <div class="stat"><p class="xs muted">Orders</p><p class="stat-value">${stats.order_count}</p></div>
        <div class="stat"><p class="xs muted">Total spent</p><p class="stat-value">${money(stats.total_spent)}</p></div>
        <a class="stat" href="wallet.html" style="text-decoration:none"><p class="xs muted">Wallet</p><p class="stat-value">${money(user.wallet_balance)}</p></a>
      </div>
      <hr class="divider">
      <form id="profile-form">
        <div class="field"><label class="label" for="full_name">Full name</label>
          <input class="input" id="full_name" maxlength="120" value="${esc(user.full_name)}"></div>
        <div class="field"><label class="label" for="organization">Organisation</label>
          <input class="input" id="organization" maxlength="120" placeholder="Optional" value="${esc(user.organization || '')}"></div>
        <details class="field">
          <summary class="small" style="cursor:pointer;font-weight:600">${user.has_password ? 'Change password' : 'Set a password (optional)'}</summary>
          ${user.has_password
            ? '<input class="input" type="password" id="current_password" placeholder="Current password" autocomplete="current-password" style="margin-top:10px">'
            : '<p class="xs muted" style="margin-top:8px">You sign in with Google. A password also lets you log in with your email.</p>'}
          <input class="input" type="password" id="new_password" placeholder="New password (min 8 characters)" autocomplete="new-password" style="margin-top:10px">
        </details>
        <button class="btn btn-block" type="submit" id="save">Save changes</button>
      </form>
    </div>
    <div class="card stack" style="margin-top:16px;gap:12px">
      <a class="row between" href="list.html" style="text-decoration:none;color:inherit">
        <span class="row" style="gap:10px">${icon('list', 18)} <span><b>My shopping list</b><br><span class="xs muted">Ticks itself off as you scan, sorted by aisle</span></span></span>
        <span class="muted">&rsaquo;</span></a>
      <hr class="divider" style="margin:0">
      <div id="budget-row">
        <div class="row between">
          <span class="row" style="gap:10px">${icon('wallet', 18)} <span><b>Spending budget</b><br><span class="xs muted">${user.budget ? `${money(user.budget).replace('.00', '')} a trip - the cart warns you near it` : 'Not set - the cart can warn you before you overspend'}</span></span></span>
          <button type="button" class="btn btn-outline btn-sm" id="budget-edit">${user.budget ? 'Change' : 'Set'}</button></div>
        <form class="row" id="budget-form" style="gap:8px;margin-top:10px" hidden novalidate>
          <input class="input" id="budget-input" type="number" inputmode="numeric" min="1" max="100000" step="1" placeholder="Budget in ₹" value="${user.budget || ''}" aria-label="Budget in rupees">
          <button class="btn btn-sm" type="submit">Save</button>
          ${user.budget ? '<button class="btn btn-ghost btn-sm" type="button" id="budget-clear">Remove</button>' : ''}</form>
      </div>
      <hr class="divider" style="margin:0">
      <label class="row between" for="large-text" style="cursor:pointer">
        <span class="row" style="gap:10px"><span style="font-weight:800;width:18px;text-align:center">A<small>A</small></span> <span><b>Larger text</b><br><span class="xs muted">Bigger letters on every page of this phone</span></span></span>
        <input type="checkbox" class="switch" id="large-text" ${largeText() ? 'checked' : ''}></label>
    </div>
    ${user.role === 'admin' ? `<a class="btn btn-secondary btn-block" style="margin-top:16px" href="admin.html">${icon('shield', 16)} Admin - today's sales, products &amp; hardware</a>
      <a class="btn btn-outline btn-block" style="margin-top:8px" href="counter.html">${icon('wallet', 16)} Wallet counter - confirm top-ups</a>
      <a class="btn btn-outline btn-block" style="margin-top:8px" href="exit.html">${icon('qr', 16)} Exit gate - scan bills</a>` : ''}
    <div class="install-slot" id="install-slot" style="margin-top:16px"></div>
    <h2 class="section-title">Order history</h2>
    ${orderList}
    <button type="button" class="btn btn-outline btn-block" style="margin-top:24px" id="logout">${icon('logout', 16)} Sign out</button>
    <p class="legal-links"><a href="terms.html">Terms of use</a> &middot; <a href="privacy.html">Privacy policy</a></p>`;

  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('save');
    const body = {
      full_name: document.getElementById('full_name').value.trim(),
      organization: document.getElementById('organization').value.trim(),
    };
    const newPassword = document.getElementById('new_password').value;
    if (newPassword) {
      body.new_password = newPassword;
      const current = document.getElementById('current_password');
      if (current) body.current_password = current.value;
    }
    setBusy(btn, true);
    try {
      const { user: updated } = await api('/api/profile', { method: 'PUT', body });
      Auth.setUser(updated);
      toast('Profile updated');
      load();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(btn, false);
    }
  });

  installCard(document.getElementById('install-slot'));
  const budgetForm = document.getElementById('budget-form');
  document.getElementById('budget-edit').onclick = () => { budgetForm.hidden = false; document.getElementById('budget-input').focus(); };
  const saveBudget = async (value) => {
    try {
      const { budget } = await api('/api/budget', { method: 'PUT', body: { budget: value } });
      Auth.setUser({ ...Auth.user(), budget });
      toast(budget ? `Budget set: ${money(budget).replace('.00', '')}` : 'Budget removed');
      load();
    } catch (err) { toast(err.message, 'error'); }
  };
  budgetForm.onsubmit = (e) => { e.preventDefault(); saveBudget(document.getElementById('budget-input').value); };
  const clearBudget = document.getElementById('budget-clear');
  if (clearBudget) clearBudget.onclick = () => saveBudget(null);
  document.getElementById('large-text').onchange = (e) => {
    largeText(e.target.checked);
    toast(e.target.checked ? 'Larger text is on' : 'Normal text size');
  };

  document.getElementById('logout').onclick = () => {
    Auth.clear();
    location.href = 'login.html';
  };
}

load();
