renderNav('user');
const main = document.getElementById('main');

async function load() {
  if (!Auth.require()) return;
  const id = param('id');
  main.innerHTML = Skel.wrap(`${Skel.block(132)}
    <div class="card" style="margin-top:16px">${Skel.line(40, 8)}<div style="margin-top:14px">${Skel.line(80)}${Skel.line(65)}${Skel.line(72)}</div>
      <div style="margin-top:16px">${Skel.line(100, 14)}</div></div>
    <div class="card" style="margin-top:16px;display:flex;flex-direction:column;align-items:center;gap:10px">
      ${Skel.line(30, 10)}<span class="sk" style="width:176px;height:176px;border-radius:12px"></span>${Skel.line(60, 8)}</div>`);
  try {
    const { order: o } = await api(`/api/orders/${encodeURIComponent(id)}`);
    document.getElementById('subtitle').textContent = fmtDate(o.created_at, true);
    main.innerHTML = `
      <div class="print-only" style="text-align:center;margin-bottom:12px"><p style="font-weight:800;font-size:1.2rem">SmartCart</p>
        <p class="xs">Smart Billing Cart &middot; Bill ${esc(o.number)} &middot; ${esc(fmtDate(o.created_at, true))}</p></div>
      <div class="card confirm-card">${icon('check', 32)}
        <p style="font-size:1.125rem;font-weight:700">${param('paid') ? 'Payment successful' : 'Thanks for your order'}</p>
        <p class="small">${o.exited ? `Checked out at the exit gate on ${esc(fmtDate(o.exit_verified_at, true))}.` : 'Show the bill QR below at the exit gate.'}</p>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="row between xs muted" style="margin-bottom:12px"><span>Bill ${esc(o.number)}</span><span class="row" style="gap:6px">${o.exited ? '<span class="badge badge-solid">exited</span>' : ''}<span class="badge">${esc(o.status)}</span></span></div>
        <ul class="list">${o.items.map((i) => `
          <li class="row between small" style="align-items:flex-start">
            <span class="grow"><span class="truncate" style="display:block;font-weight:500">${esc(i.name)}</span>
              <span class="muted">${i.quantity} &times; ${money(i.unit_price)}${i.unit_mrp ? ` <s>${money(i.unit_mrp).replace('.00', '')}</s>` : ''}</span></span>
            <span style="font-weight:600">${money(i.line_total)}</span>
          </li>`).join('')}</ul>
        <hr class="divider">
        <div class="row between"><span class="small muted">Total charged</span>
          <span style="font-size:1.125rem;font-weight:700;color:var(--primary)">${money(o.total_amount)}</span></div>
        ${o.savings > 0 ? `<div class="row between small saving-row" style="margin-top:6px"><span>${icon('tag', 14)} You saved on offers</span><span>${money(o.savings)}</span></div>` : ''}
        ${o.payment && o.payment.method === 'wallet' ? `<p class="xs muted row" style="gap:6px;margin-top:8px">${icon('wallet', 14)} Paid from SmartCart Wallet &middot; <span class="mono">${esc(o.payment.ref)}</span></p>` : ''}
      </div>
      <div class="card" style="margin-top:16px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center">
        <p class="small" style="font-weight:600">Exit pass</p>
        <p class="xs muted">${o.exited ? 'This bill has already been used at the exit.' : 'Staff scan this at the exit gate. It works once.'}</p>
        <div class="qr-box" id="qr"${o.exited ? ' style="opacity:.35"' : ''}></div>
        <p class="mono muted">${esc(o.exit_code || o.number)}</p>
        <div class="row no-print" style="flex-wrap:wrap;justify-content:center;gap:8px">
          <button type="button" class="btn btn-sm" id="print">${icon('download', 14)} PDF receipt</button>
          <button type="button" class="btn btn-secondary btn-sm" id="share" hidden>${icon('share', 14)} Share</button>
          <button type="button" class="btn btn-secondary btn-sm" id="save-qr">Save QR</button>
        </div>
      </div>
      <div class="stack no-print" style="margin-top:20px">
        <button type="button" class="btn btn-outline btn-block" id="again">${icon('repeat', 16)} Put these items on my shopping list</button>
        <a class="btn btn-block" href="index.html">Continue shopping</a>
        <a class="btn btn-secondary btn-block" href="profile.html">View order history</a>
      </div>`;

    reveal(main);
    // Signed one-time code (checked by the server at the exit gate), not just the order number.
    const payload = o.exit_code;
    drawQr(document.getElementById('qr'), payload, 176, 'QR code could not load - staff can type the bill code.');
    // "Save as PDF" in the browser print dialog gives the PDF receipt
    document.getElementById('print').onclick = () => window.print();
    // Share the receipt as text (WhatsApp, email...) where the phone supports it
    const text = [`SmartCart bill ${o.number} - ${fmtDate(o.created_at, true)}`,
      ...o.items.map((i) => `${i.quantity} x ${i.name}  ${money(i.line_total)}`),
      `Total ${money(o.total_amount)}${o.savings > 0 ? ` (saved ${money(o.savings)})` : ''}`].join('\n');
    const share = document.getElementById('share');
    if (navigator.share) {
      share.hidden = false;
      share.onclick = () => navigator.share({ title: `SmartCart bill ${o.number}`, text }).catch(() => {});
    }
    document.getElementById('again').onclick = async (e) => {
      const btn = e.currentTarget;
      setBusy(btn, true);
      try {
        const res = await api(`/api/list/from-order/${o.id}`, { method: 'POST', body: {} });
        toast(res.added ? `${res.added} item${res.added === 1 ? '' : 's'} added to your list` : 'They are already on your list');
        location.href = 'list.html';
      } catch (err) { toast(err.message, 'error'); setBusy(btn, false); }
    };
    document.getElementById('save-qr').onclick = () => {
      const canvas = document.querySelector('#qr canvas');
      if (!canvas) return;
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `smartcart-bill-${o.number}.png`;
      a.click();
    };
  } catch (err) {
    main.innerHTML = `<p class="card small muted">${esc(err.status === 404 ? "We couldn't find this order." : err.message)}</p>`;
  }
}
load();
