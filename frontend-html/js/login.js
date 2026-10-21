let mode = 'login';
const form = document.getElementById('auth-form');
const submit = document.getElementById('submit');

function safeNext() {
  const next = param('next') || '';
  return /^[\w-]+\.html(\?[\w=&%.-]*)?$/.test(next) ? next : 'index.html';
}
if (Auth.loggedIn()) location.replace(safeNext());

function clearErrors() {
  document.querySelectorAll('.field-error').forEach((el) => { el.textContent = ''; });
}
function showErrors(fields) {
  Object.entries(fields || {}).forEach(([key, msg]) => {
    const el = document.querySelector(`.field-error[data-for="${key}"]`);
    if (el) el.textContent = msg;
  });
}

function setMode(next) {
  mode = next;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === mode));
  document.getElementById('name-field').hidden = mode !== 'signup';
  submit.textContent = mode === 'signup' ? 'Create account' : 'Login';
  document.getElementById('switch-text').textContent = mode === 'login' ? 'New to CartLess Checkout?' : 'Already registered?';
  document.getElementById('switch').textContent = mode === 'login' ? 'Create an account' : 'Login';
  document.getElementById('password').setAttribute('autocomplete', mode === 'signup' ? 'new-password' : 'current-password');
  clearErrors();
}

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));
document.getElementById('switch').addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();
  const full_name = document.getElementById('full_name').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  const errs = {};
  if (mode === 'signup' && full_name.length < 2) errs.full_name = 'Please enter your full name';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.email = 'Enter a valid email address';
  if (mode === 'signup' && password.length < 8) errs.password = 'Password must be at least 8 characters';
  if (mode === 'login' && !password) errs.password = 'Enter your password';
  if (Object.keys(errs).length) { showErrors(errs); return; }

  setBusy(submit, true);
  try {
    const signup = mode === 'signup';
    const data = await api(signup ? '/api/auth/register' : '/api/auth/login', {
      method: 'POST',
      body: signup ? { full_name, email, password } : { email, password },
      auth: false,
    });
    Auth.save(data.token, data.user);
    location.replace(safeNext());
  } catch (err) {
    showErrors(err.data && err.data.fields);
    toast(err.message, 'error');
    setBusy(submit, false);
  }
});

// ---- Google sign-in ----
// Google's button gives us a signed token; the server checks it with Google and logs in
// (or creates) the account. Google only allows https sites and localhost, not WiFi IPs.
async function setupGoogle() {
  let cfg;
  try { cfg = await api('/api/auth/config', { auth: false }); } catch (e) { return; }
  if (!cfg.google_client_id) return;
  const area = document.getElementById('google-area');
  const note = document.getElementById('google-note');
  area.hidden = false;
  const allowed = location.protocol === 'https:' || location.hostname === 'localhost';
  if (!allowed) {
    note.hidden = false;
    note.innerHTML = location.hostname === '127.0.0.1'
      ? 'For Google sign-in open <b>http://localhost:5000</b> instead of 127.0.0.1.'
      : 'Google sign-in works on the public https site (or on localhost), not on a WiFi address.';
    return;
  }
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.onload = () => {
    const holder = document.getElementById('google-btn');
    google.accounts.id.initialize({ client_id: cfg.google_client_id, callback: onGoogleCredential, ux_mode: 'popup' });
    google.accounts.id.renderButton(holder, {
      type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with',
      logo_alignment: 'center', width: Math.min(400, Math.max(220, holder.clientWidth)),
    });
  };
  script.onerror = () => { note.hidden = false; note.textContent = 'Google sign-in could not load (no internet?).'; };
  document.head.appendChild(script);
}

async function onGoogleCredential(response) {
  const note = document.getElementById('google-note');
  note.hidden = false;
  note.innerHTML = '<span class="spinner"></span> Signing in with Google&hellip;';
  try {
    const data = await api('/api/auth/google', { method: 'POST', body: { credential: response.credential }, auth: false });
    Auth.save(data.token, data.user);
    location.replace(safeNext());
  } catch (err) {
    note.textContent = '';
    note.hidden = true;
    toast(err.message, 'error');
  }
}
setupGoogle();
