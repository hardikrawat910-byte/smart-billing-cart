"""Entry point:  python app.py   ->  http://127.0.0.1:5000  (serves the API and the website)."""
import mimetypes
import os

from flask import Flask, jsonify, request, send_from_directory
from flask_compress import Compress
from flask_cors import CORS
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

from config import APP_VERSION, Config
from extensions import db, jwt
from routes import register_blueprints
from security import add_security_headers, rate_limiter
from services import hardware_mode

# Some Windows PCs map .js to text/plain in the registry, which can stop the pages' scripts.
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("application/manifest+json", ".webmanifest")   # "install as app"


@jwt.unauthorized_loader
def _missing_token(_reason):
    return jsonify(error="Please log in to continue"), 401


@jwt.invalid_token_loader
def _invalid_token(_reason):
    return jsonify(error="Your session is invalid. Please log in again."), 401


@jwt.expired_token_loader
def _expired_token(_header, _payload):
    return jsonify(error="Your session expired. Please log in again."), 401


def create_app():
    app = Flask(__name__, static_folder=None)
    app.config.from_object(Config)
    os.makedirs(app.config["UPLOAD_DIR"], exist_ok=True)
    # Online hosts (Render) sit behind a proxy: trust its X-Forwarded-For / -Proto headers,
    # so the real visitor IP (login lockout) and https (security headers) are known.
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    # JWT travels in the Authorization header (no cookies), so "*" is safe for local dev.
    # The site calls its own API (same address, no CORS needed). Only VS Code Live Server (port 5500)
    # serves the pages from elsewhere; CORS_ORIGINS can add more, comma separated.
    extra = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
    CORS(app, resources={r"/api/*": {"origins": ["http://127.0.0.1:5500", "http://localhost:5500", *extra]}})
    db.init_app(app)
    jwt.init_app(app)
    register_blueprints(app)
    app.after_request(add_security_headers)
    # gzip/brotli: the scanner library goes from 375 KB to about 100 KB on the wire
    app.config.setdefault("COMPRESS_MIMETYPES", ["text/html", "text/css", "application/javascript",
                                                  "text/javascript", "application/json", "image/svg+xml",
                                                  "application/manifest+json", "text/csv"])
    app.config.setdefault("COMPRESS_MIN_SIZE", 1024)
    app.config.setdefault("COMPRESS_ALGORITHM", ["br", "gzip", "deflate"])
    app.config.setdefault("COMPRESS_ALGORITHM_STREAMING", ["br", "gzip", "deflate"])   # files are streamed
    Compress(app)

    @app.before_request
    def limit_api_rate():
        if not request.path.startswith("/api/") or request.path == "/api/health":
            return None
        identity = None
        try:
            verify_jwt_in_request(optional=True)
            identity = get_jwt_identity()
        except Exception:                     # bad or expired token: the route itself will say so
            pass
        wait = rate_limiter.check(f"user:{identity}" if identity else None)
        if not wait:
            return None
        response = jsonify(error=f"Too many requests. Please wait {wait} seconds and try again.")
        response.status_code = 429
        response.headers["Retry-After"] = str(wait)
        return response

    @app.get("/api/health")
    def health():
        return jsonify(ok=True, hardware_mode=hardware_mode(), scale=bool(app.config["SCALE_ENABLED"]),
                       version=APP_VERSION)

    frontend = app.config["FRONTEND_DIR"]

    def not_found_page():
        response = send_from_directory(frontend, "404.html")
        response.status_code = 404
        return response

    @app.get("/")
    def index():
        return send_from_directory(frontend, "index.html")

    @app.get("/<path:path>")
    def frontend_files(path):
        if path.startswith("api/"):
            return jsonify(error="Not found"), 404
        return send_from_directory(frontend, path)

    @app.errorhandler(HTTPException)
    def http_error(exc):
        if request.path.startswith("/api/"):
            return jsonify(error=exc.description or exc.name), exc.code
        if exc.code == 404 and request.method == "GET":
            return not_found_page()
        return exc

    @app.errorhandler(Exception)
    def server_error(exc):
        app.logger.exception("Unhandled error")
        db.session.rollback()
        return jsonify(error="Something went wrong on the server"), 500

    return app


app = create_app()

if __name__ == "__main__":
    # host 0.0.0.0 so phones and the Raspberry Pi on the same WiFi can reach this laptop.
    # FLASK_DEBUG=1 in .env gives auto-reload while coding; keep it 0 when the site is public,
    # because the debugger lets whoever opens the error page run code on this PC.
    app.run(host="0.0.0.0", port=5000, debug=os.getenv("FLASK_DEBUG", "0") == "1")
