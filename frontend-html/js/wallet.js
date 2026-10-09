// SmartCart Wallet: balance, top-up tokens (paid at the counter), history.
renderNav('wallet');
const main = document.getElementById('main');
let data = null;
let pollTimer = null;
const QUICK = [100, 200, 500, 1000];

const TXN_TEXT = {
  topup: (t) => `Top-up · ${t.method === 'upi' ? 'UPI' : 'Cash'} at the counter`,
  payment: (t) => `Bill ${t.order_number || ''}`,
  refund: () => 'Refund',
  adjust: (t) => (t.method === 'welcome' ? 'Welcome tokens' : (t.note || 'Added by staff')),
};

async function load(first) {
  if (!Auth.require()) return;
  if (first) {
    main.innerHTML = Skel.wrap(`<div class="card balance-card">${Skel.line(25, 8)}${Skel.line(45, 28)}${Skel.line(60, 8)}</div>
      <div class="card" style="margin-top:16px">${Skel.line(35, 12)}<div class="row" style="margin-top:12px;gap:8px">${Skel.block(36, 'flex:1;border-radius:999px')}${Skel.block(36, 'flex:1;border-radius:999px')}${Skel.block(36, 'flex:1;border-radius:999px')}</div>${Skel.block(44, 'margin-top:12px;border-radius:12px')}</div>`)
      + Skel.rows(3, false);
  }
  try {
    const before = data;
    data = await api('/api/wallet');
    if (before) announceChanges(before, data);
    render(first);
  } catch (err) {
    main.innerHTML = `<p class="card small muted">${esc(err.message)}</p>`;
  }
}

function announceChanges(before, after) {
  if (after.balance > before.balance) toast(`${money(after.balance - before.balance)} added to your wallet`);
}

function render(first) {
  const need = Number(param('need')) || 0;
  main.innerHTML = `
    <div class="card balance-card">
      <p class="kicker">SmartCart Wallet</p>
      <p class="amount" id="balance">${money(data.balance)}</p>
      <p class="xs" style="opacity:.85">Pay at the counter by cash or UPI to add money. Checkout takes the bill from here.</p>
    </div>

    <section class="card" style="margin-top:16px">
      <p class="small" style="font-weight:600;margin-bottom:10px">Add money</p>
      ${need ? `<p class="xs" style="margin:-4px 0 10px;color:var(--destructive);font-weight:600">You need ${money(need)} more for your cart.</p>` : ''}
      <div class="amount-chips">${QUICK.map((a) => `<button type="button" class="chip" data-amount="${a}">${money(a).replace('.00', '')}</button>`).join('')}</div>
      <form id="topup-form" class="row" style="gap:8px" novalidate>
        <input class="input" id="topup-amount" type="number" min="1" max="${data.max_topup}" step="1" inputmode="numeric" placeholder="Amount in ₹" value="${need || ''}" aria-label="Amount to add">
        <button class="btn" type="submit" id="topup-btn" style="flex-shrink:0">Get token</button>
      </form>
      <p class="field-error" data-for="amount"></p>
    </section>

    <div id="pending"></div>

    <h2 class="section-title">History</h2>
    <div class="card" style="padding:4px 16px">${data.transactions.length
      ? data.transactions.map(txnRow).join('')
      : '<p class="small muted center" style="padding:14px 0">No wallet activity yet.</p>'}</div>
    <p class="legal-links"><a href="terms.html">Terms</a> &middot; <a href="privacy.html">Privacy</a></p>`;

  main.querySelectorAll('.amount-chips .chip').forEach((b) => {
    b.onclick = () => { document.getElementById('topup-amount').value = b.dataset.amount; };
  });
  document.getElementById('topup-form').addEventListener('submit', createTopup);
  renderPending();
  if (first) reveal(main);
}

function txnRow(t) {
  const positive = t.amount > 0;
  const ic = t.kind === 'payment' ? 'receipt' : (t.kind === 'topup' ? 'wallet' : 'coins');
  const title = (TXN_TEXT[t.kind] || (() => t.kind))(t);
  const link = t.order_id ? `<a href="order.html?id=${t.order_id}" class="muted">${esc(title)}</a>` : esc(title);
  return `<div class="txn">
    <span class="txn-icon">${icon(ic, 16)}</span>
    <div class="grow"><p class="small" style="font-weight:600">${link}</p>
      <p class="xs muted">${esc(fmtDate(t.created_at, true))} &middot; ${esc(t.number)}${t.staff ? ' &middot; ' + esc(t.staff) : ''}</p></div>
    <div style="text-align:right"><p class="small tabular ${positive ? 'plus' : 'minus'}" style="font-weight:700">${positive ? '+' : '−'}${money(Math.abs(t.amount))}</p>
      <p class="xs muted tabular">${money(t.balance_after)}</p></div>
  </div>`;
}

function renderPending() {
  const el = document.getElementById('pending');
  if (!data.pending.length) { el.innerHTML = ''; stopPolling(); return; }
  el.innerHTML = data.pending.map((p) => `
    <section class="card token-card" style="margin-top:16px" data-id="${p.id}">
      <p class="kicker">Top-up token &middot; waiting for payment</p>
      <p class="token-number">${esc(p.number)}</p>
      <div class="qr-box" id="qr-${p.id}"></div>
      <p style="font-size:1.25rem;font-weight:800">${money(p.amount)}</p>
      <p class="small muted" style="max-width:300px">Show this at the counter and pay ${money(p.amount)} by cash or UPI. Staff scan it and your balance updates here by itself.</p>
      ${data.upi ? `<a class="btn btn-secondary upi-btn" href="${esc(upiLink(data.upi, p.amount, `SmartCart ${p.number}`))}">${icon('phone', 16)} Pay ${money(p.amount).replace('.00', '')} with a UPI app</a>
        <p class="xs muted" style="max-width:300px">Pays <span class="mono">${esc(data.upi.id)}</span> with the amount filled in. Then show the token: staff check the payment and press "UPI received".</p>` : ''}
      <button type="button" class="btn btn-ghost btn-sm" data-cancel="${p.id}">Cancel this token</button>
    </section>`).join('');
  data.pending.forEach((p) => {
    const box = document.getElementById(`qr-${p.id}`);
    drawQr(box, p.code, 168, p.number);
  });
  el.querySelectorAll('[data-cancel]').forEach((b) => {
    b.onclick = async () => {
      setBusy(b, true);
      try {
        await api(`/api/wallet/topups/${b.dataset.cancel}/cancel`, { method: 'POST', body: {} });
        toast('Token cancelled');
        await load(false);
      } catch (err) { toast(err.message, 'error'); setBusy(b, false); }
    };
  });
  startPolling();
}

async function createTopup(e) {
  e.preventDefault();
  const btn = document.getElementById('topup-btn');
  const err = document.querySelector('.field-error[data-for="amount"]');
  const amount = document.getElementById('topup-amount').value.trim();
  err.textContent = '';
  if (!amount || Number(amount) < 1) { err.textContent = 'Enter an amount, e.g. 500'; return; }
  setBusy(btn, true);
  try {
    await api('/api/wallet/topups', { method: 'POST', body: { amount } });
    history.replaceState(null, '', 'wallet.html');
    await load(false);
    document.getElementById('pending').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (ex) {
    err.textContent = (ex.data.fields && ex.data.fields.amount) || '';
    toast(ex.message, 'error');
    setBusy(btn, false);
  }
}

// While a token is waiting, check every 3 s whether the counter has confirmed it.
function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    if (document.hidden) return;
    const before = data;
    try {
      const fresh = await api('/api/wallet');
      if (fresh.balance !== before.balance || fresh.pending.length !== before.pending.length) {
        data = fresh;
        if (fresh.balance > before.balance) toast(`${money(fresh.balance - before.balance)} added to your wallet`);
        render(false);
      }
    } catch (e) { /* keep trying */ }
  }, 3000);
}
function stopPolling() { clearInterval(pollTimer); pollTimer = null; }

load(true);
