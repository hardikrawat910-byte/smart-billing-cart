renderNav('home');

// Home: today's deals, "buy again", then the store in sections (one shelf per section).
// A section chip, "See all" or a search shows a grid instead.
const DEALS = 'Deals';
const state = { products: [], categories: [], category: 'All', term: '', buyAgain: [] };
const grid = document.getElementById('grid');
const sectionsEl = document.getElementById('sections');

document.getElementById('search-icon').outerHTML = icon('search', 16);
document.getElementById('scan-link').innerHTML = icon('qr', 16) + ' Scan';
if (!Auth.loggedIn()) {
  document.getElementById('head-action').innerHTML = '<a class="btn btn-sm" href="login.html">Login</a>';
}
sectionsEl.innerHTML = Skel.wrap([0, 1].map(() => `<div class="shelf">${Skel.line(40, 14)}
  <ul class="shelf-row" style="margin-top:10px">${Skel.productCards(3)}</ul></div>`).join(''));
document.getElementById('featured').innerHTML = '<span class="sk" style="flex:0 0 88%;height:116px;border-radius:20px"></span>';
document.getElementById('chips').innerHTML = Array.from({ length: 4 }, () => '<span class="sk sk-chip"></span>').join('');

const searchInput = document.getElementById('search');
searchInput.addEventListener('input', (e) => {
  state.term = e.target.value.trim().toLowerCase();
  if (state.term && state.category !== 'All') { state.category = 'All'; renderChips(); }   // search the whole store
  render();
});
document.querySelector('[data-see="Deals"]').onclick = () => pick(DEALS);
setupVoiceSearch();

function card(p) {
  return `<li><a class="card product-card" href="product.html?id=${p.id}">
      ${p.mrp ? `<span class="deal-flag">-${Math.round((1 - p.price / p.mrp) * 100)}%</span>` : ''}
      ${productImage(p)}
      <div class="body">
        <div class="row between" style="gap:4px">
          <span class="xs muted truncate">${esc(p.category)}</span>
          ${p.in_stock ? '' : '<span class="badge badge-danger" style="font-size:10px">Sold out</span>'}
        </div>
        <p class="name">${esc(p.name)}</p>
        <div class="price-row"><span class="badge">${money(p.price)}</span>${p.mrp ? `<s class="mrp">${money(p.mrp).replace('.00', '')}</s>` : ''}</div>
      </div>
    </a></li>`;
}

function renderFeatured(items) {
  const el = document.getElementById('featured');
  document.getElementById('featured-head').hidden = !items.length;
  if (!items.length) { el.hidden = true; return; }
  el.innerHTML = items.map((p) => `
    <a href="product.html?id=${p.id}">
      ${productImage(p)}
      <div class="grow">
        <p class="kicker">Save ${money(p.mrp - p.price).replace('.00', '')} &middot; ${esc(aisleLabel(p.aisle))}</p>
        <p style="font-weight:700;margin:4px 0">${esc(p.name)}</p>
        <p class="small"><b>${money(p.price)}</b> <s style="opacity:.7">${money(p.mrp)}</s></p>
      </div>
    </a>`).join('');
}

function renderChips() {
  const el = document.getElementById('chips');
  const deals = state.products.some((p) => p.mrp) ? [DEALS] : [];
  el.innerHTML = ['All', ...deals, ...state.categories].map((c) => `<button type="button" class="chip${c === state.category ? ' active' : ''}" data-cat="${esc(c)}" aria-pressed="${c === state.category}">${c === DEALS ? icon('tag', 14) + ' ' : ''}${esc(c)}</button>`).join('');
  el.onclick = (e) => {
    const b = e.target.closest('.chip');
    if (b) pick(b.dataset.cat);
  };
}

function pick(category) {
  state.category = category;
  renderChips();
  render();
  if (category !== 'All') document.getElementById('chips').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function shelf(title, iconName, items, seeKey) {
  return `<section class="shelf" aria-label="${esc(title)}">
    <div class="row between shelf-head">
      <h2>${icon(iconName, 18)} ${esc(title)} <span class="xs muted" style="font-weight:500">${items.length}</span></h2>
      ${seeKey ? `<button type="button" class="btn-link small" data-see="${esc(seeKey)}">See all</button>` : ''}
    </div>
    <ul class="shelf-row">${items.slice(0, 10).map(card).join('')}</ul>
  </section>`;
}

function render() {
  const showShelves = state.category === 'All' && !state.term;
  sectionsEl.hidden = !showShelves;
  document.getElementById('grid-head').hidden = showShelves;
  document.getElementById('featured').hidden = !showShelves;
  document.getElementById('featured-head').hidden = !showShelves || !state.products.some((p) => p.mrp);
  if (showShelves) {
    grid.innerHTML = '';
    sectionsEl.innerHTML = (state.buyAgain.length ? shelf('Buy again', 'repeat', state.buyAgain, null) : '')
      + state.categories.map((c) => shelf(c, sectionIcon(c), state.products.filter((p) => p.category === c), c)).join('');
    sectionsEl.querySelectorAll('[data-see]').forEach((b) => { b.onclick = () => pick(b.dataset.see); });
    return;
  }
  const list = state.products.filter((p) => {
    if (state.category === DEALS && !p.mrp) return false;
    if (state.category !== 'All' && state.category !== DEALS && p.category !== state.category) return false;
    if (!state.term) return true;
    return [p.name, p.category, p.description || '', p.qr_code].some((t) => (t || '').toLowerCase().includes(state.term));
  });
  if (state.category === DEALS) list.sort((a, b) => (b.mrp - b.price) - (a.mrp - a.price));
  document.getElementById('grid-title').textContent = state.term
    ? `${list.length} result${list.length === 1 ? '' : 's'}`
    : `${state.category === DEALS ? "Today's deals" : state.category} · ${list.length}`;
  grid.innerHTML = list.length ? list.map(card).join('')
    : '<li class="card small muted center" style="grid-column:1/-1">No products found.</li>';
}

async function loadListBanner() {
  const el = document.getElementById('list-banner');
  if (!Auth.loggedIn()) return;
  try {
    const list = await api('/api/list');
    const left = list.count - list.done;
    el.innerHTML = `${icon('list', 22)}<div class="grow"><p class="small" style="font-weight:700">${list.count ? `My shopping list: ${left} to get` : 'Make a shopping list'}</p>
      <p class="xs muted">${list.count ? (left ? `Aisle${list.aisles_left.length === 1 ? '' : 's'} ${list.aisles_left.join(', ')} &middot; ticks itself off as you scan` : 'Everything is in your cart') : 'Plan your trip; items tick off as you scan them'}</p></div>
      <span class="btn-link small">Open</span>`;
    el.hidden = false;
  } catch (e) { /* not important */ }
}

async function load() {
  try {
    const recs = Auth.loggedIn() ? api('/api/recommendations').catch(() => null) : Promise.resolve(null);
    const { products } = await api('/api/products');
    state.products = products;
    state.categories = sortSections([...new Set(products.map((p) => p.category))]);
    const r = await recs;
    state.buyAgain = r ? r.buy_again : [];
    const deals = products.filter((p) => p.mrp).sort((a, b) => (b.mrp - b.price) - (a.mrp - a.price));
    renderFeatured(deals.slice(0, 4));
    renderChips();
    render();
    ['featured', 'chips', 'sections'].forEach((id) => reveal(document.getElementById(id)));
  } catch (err) {
    document.getElementById('featured').hidden = true;
    document.getElementById('chips').innerHTML = '';
    sectionsEl.innerHTML = `<div class="card small muted">${esc(err.message)}
      <button type="button" class="btn btn-secondary btn-sm" style="margin-top:10px" onclick="location.reload()">Try again</button></div>`;
  }
}

// Say "soap" instead of typing (Chrome on Android and desktop; hidden where not supported).
function setupVoiceSearch() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = document.getElementById('mic');
  if (!SR || !btn) return;
  btn.innerHTML = icon('mic', 18);
  btn.hidden = false;
  let rec = null;
  btn.onclick = () => {
    if (rec) { rec.stop(); return; }
    rec = new SR();
    rec.lang = 'en-IN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    btn.classList.add('listening');
    rec.onresult = (e) => {
      const said = (e.results[0][0].transcript || '').replace(/[.?!]$/, '');
      searchInput.value = said;
      searchInput.dispatchEvent(new Event('input'));
    };
    rec.onerror = (e) => { if (e.error !== 'aborted' && e.error !== 'no-speech') toast('Voice search needs the microphone - allow it, or type instead.', 'error'); };
    rec.onend = () => { btn.classList.remove('listening'); rec = null; };
    try { rec.start(); } catch (e) { btn.classList.remove('listening'); rec = null; }
  };
}

load();
loadListBanner();
