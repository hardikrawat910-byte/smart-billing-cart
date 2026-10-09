// Shared API helper - every page loads this first.
// Served by Flask (localhost, WiFi IP or a public https link) -> same origin, so ''.
// Only VS Code Live Server (port 5500) or a file opened from disk talks to :5000 directly.
const API_BASE = (location.port === '5500' || location.protocol === 'file:') ? 'http://127.0.0.1:5000' : '';
const TOKEN_KEY = 'smartcart_token';
const USER_KEY = 'smartcart_user';

// If one of our scripts breaks, say so on the page instead of leaving it half-drawn
// (a photo of the red line tells exactly what broke and where).
window.addEventListener('error', (e) => {
  if (!e.filename || !e.filename.startsWith(location.origin) || document.getElementById('page-error')) return;
  const bar = document.createElement('div');
  bar.id = 'page-error';
  bar.setAttribute('role', 'alert');
  bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9999;padding:8px 12px;background:#9b1c1c;color:#fff;font:13px/1.4 system-ui,sans-serif';
  const file = e.filename.slice(location.origin.length).split('?')[0];
  bar.textContent = `Part of this page did not run: ${e.message} (${file}:${e.lineno}). Reload with Ctrl+Shift+R; if it stays, send a photo of this line.`;
  (document.body || document.documentElement).appendChild(bar);
});

const Auth = {
  token() { return localStorage.getItem(TOKEN_KEY); },
  user() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; } },
  save(token, user) { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)); },
  setUser(user) { localStorage.setItem(USER_KEY, JSON.stringify(user)); },
  clear() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); },
  loggedIn() { return Boolean(this.token()); },
  isAdmin() { const u = this.user(); return Boolean(u && u.role === 'admin'); },
  require() {
    if (!this.loggedIn()) { goToLogin(); return false; }
    return true;
  },
};

function goToLogin() {
  const next = (location.pathname.split('/').pop() || 'index.html') + location.search;
  location.href = 'login.html?next=' + encodeURIComponent(next);
}

class ApiError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data || {}; }
}

// ---- connection banner: "server waking up" (free hosting sleeps when idle) and offline ----
const Net = {
  pending: 0,
  timer: null,
  el() {
    let el = document.getElementById('net-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'net-banner';
      el.className = 'net-banner';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    return el;
  },
  show(text, offline) {
    const el = this.el();
    el.innerHTML = (offline ? '' : '<span class="spinner"></span>') + text;
    el.classList.toggle('offline', Boolean(offline));
    el.classList.add('show');
  },
  hide() { const el = document.getElementById('net-banner'); if (el) el.classList.remove('show'); },
  start() {
    this.pending += 1;
    if (!this.timer && navigator.onLine !== false) {
      this.timer = setTimeout(() => this.show('Waking up the server&hellip; the first visit after a quiet spell takes up to a minute.'), 2500);
    }
  },
  done() {
    this.pending = Math.max(0, this.pending - 1);
    if (this.pending === 0) { clearTimeout(this.timer); this.timer = null; if (navigator.onLine !== false) this.hide(); }
  },
};
window.addEventListener('offline', () => Net.show('You are offline. Check the Wi-Fi or mobile data.', true));
window.addEventListener('online', () => Net.hide());

function isLocalServer() {
  return /^(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname) || API_BASE !== '';
}

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;   // photo uploads
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  const token = Auth.token();
  if (auth && token) headers.Authorization = 'Bearer ' + token;
  let res;
  Net.start();
  try {
    res = await fetch(API_BASE + path, { method, headers, body: isForm ? body : (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch (err) {
    throw new ApiError(isLocalServer()
      ? 'Cannot reach the server. Is Flask (python app.py) running?'
      : 'Cannot reach the server. Check your internet connection and try again.', 0);
  } finally {
    Net.done();
  }
  let data = {};
  try { data = await res.json(); } catch (e) { data = {}; }
  if (res.status === 401 && auth && token) { Auth.clear(); goToLogin(); }
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data);
  return data;
}

function money(n) {
  return '\u20B9' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function param(name) { return new URLSearchParams(location.search).get(name); }
function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}
function fmtDate(iso, withTime) {
  const d = new Date(iso);
  return withTime ? d.toLocaleString('en-IN') : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function ago(sec) {
  if (sec == null) return '';
  if (sec < 2) return 'just now';
  if (sec < 90) return `${Math.round(sec)}s ago`;
  if (sec < 5400) return `${Math.round(sec / 60)} min ago`;
  return `${Math.round(sec / 3600)} h ago`;
}
