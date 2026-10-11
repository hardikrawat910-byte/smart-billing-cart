// For the small pages with no script of their own (privacy, terms, 404). Keeping scripts out of the
// HTML lets the Content-Security-Policy forbid inline scripts on every page.
(function () {
  const nav = document.body.dataset.nav;
  if (nav && window.renderNav) renderNav(nav);
  const path = document.getElementById('path');
  if (path) path.textContent = location.pathname;
}());
