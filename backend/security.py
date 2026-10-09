"""Security helpers: login lockout, Google sign-in check, browser security headers."""
import threading
import time

from flask import current_app, request


def client_ip():
    # app.py applies ProxyFix, so behind Render's proxy this is the visitor's real address.
    return request.remote_addr or "unknown"


class LoginGuard:
    """Stops password guessing. Wrong passwords are counted per email address and per IP
    address; after too many within the lock window that email (or IP) has to wait.
    Kept in memory: a server restart forgets the counts, which is fine for this purpose."""

    IP_FACTOR = 4      # a whole campus or office shares one IP, so the IP limit is 4x the email limit

    def __init__(self):
        self._lock = threading.Lock()
        self._fails = {}

    def _limits(self):
        cfg = current_app.config
        return cfg["LOGIN_MAX_FAILURES"], cfg["LOGIN_LOCK_MINUTES"] * 60

    def _recent(self, key, window, now):
        stamps = [t for t in self._fails.get(key, []) if now - t < window]
        if stamps:
            self._fails[key] = stamps
        else:
            self._fails.pop(key, None)
        return stamps

    def wait_seconds(self, email):
        """0 if a login attempt is allowed, otherwise how long to wait."""
        limit, window = self._limits()
        now = time.time()
        with self._lock:
            waits = []
            for key, allowed in ((f"email:{email}", limit), (f"ip:{client_ip()}", limit * self.IP_FACTOR)):
                stamps = self._recent(key, window, now)
                if len(stamps) >= allowed:
                    waits.append(window - (now - stamps[-allowed]))
            return int(max(waits)) + 1 if waits else 0

    def failed(self, email):
        now = time.time()
        with self._lock:
            for key in (f"email:{email}", f"ip:{client_ip()}"):
                self._fails.setdefault(key, []).append(now)

    def succeeded(self, email):
        with self._lock:
            self._fails.pop(f"email:{email}", None)


login_guard = LoginGuard()


def verify_google_token(credential):
    """Checks a Google sign-in token (signature, audience = our client ID, issuer, expiry)
    with Google's public keys. Returns the token's claims or raises ValueError."""
    client_id = current_app.config["GOOGLE_CLIENT_ID"]
    if not client_id:
        raise ValueError("Google sign-in is not set up on this server (GOOGLE_CLIENT_ID is empty)")
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token
    claims = id_token.verify_oauth2_token(credential, google_requests.Request(), client_id,
                                          clock_skew_in_seconds=10)
    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise ValueError("Token was not issued by Google")
    if not claims.get("email") or not claims.get("email_verified"):
        raise ValueError("Your Google account email is not verified")
    return claims


STATIC_CACHE_SECONDS = 7 * 24 * 3600


def add_security_headers(response):
    """Headers that tell the browser to be stricter with this site."""
    h = response.headers
    h.setdefault("X-Content-Type-Options", "nosniff")          # don't guess file types
    h.setdefault("X-Frame-Options", "SAMEORIGIN")              # no hidden framing (clickjacking)
    # Google's sign-in button needs the page address on plain-http localhost (Google's guide)
    h.setdefault("Referrer-Policy", "strict-origin-when-cross-origin" if request.is_secure
                 else "no-referrer-when-downgrade")
    h.setdefault("Permissions-Policy", "camera=(self), microphone=(), geolocation=()")
    if request.is_secure:                                       # public https site: https only
        h.setdefault("Strict-Transport-Security", "max-age=15552000")
    path = request.path
    if path.startswith("/api/hardware/images/"):
        h["Cache-Control"] = "private, max-age=86400"           # camera photos never change
    elif path.startswith("/api/products/") and path.endswith("/photo"):
        h["Cache-Control"] = f"public, max-age={STATIC_CACHE_SECONDS}"   # URL has ?v=<time>
    elif path.startswith("/api/"):
        h["Cache-Control"] = "no-store"                         # personal data: never cache
    elif path.endswith((".css", ".js", ".svg", ".png", ".ico")) and request.args.get("v"):
        # pages link "js/app.js?v=2.5": the browser keeps it for a week; a new version
        # number in the link makes it fetch the new file.
        h["Cache-Control"] = f"public, max-age={STATIC_CACHE_SECONDS}"
    else:
        h["Cache-Control"] = "no-cache"                         # always check for a newer page
    return response
