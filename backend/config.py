import os
from datetime import timedelta
from urllib.parse import quote_plus

from dotenv import load_dotenv

APP_VERSION = "2.8.4"
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))


def _env(name, default=""):
    return (os.getenv(name) or default).strip()


DB_USER = _env("DB_USER", "root")
DB_PASSWORD = _env("DB_PASSWORD")
DB_HOST = _env("DB_HOST", "127.0.0.1")
try:
    DB_PORT = int(_env("DB_PORT", "3306"))
except ValueError:
    raise SystemExit(f"DB_PORT must be the MySQL port number (digits only), not {_env('DB_PORT')!r}. "
                     "Fix it in backend/.env or in the Render Environment settings.")
DB_NAME = _env("DB_NAME", "smart_billing")
DB_SSL = _env("DB_SSL", "0").lower() in ("1", "true", "yes", "required")
DB_SSL_CA = _env("DB_SSL_CA")


def db_ssl_args():
    """Online MySQL (Aiven etc.) only accepts encrypted connections.
    With a CA file the server's certificate is verified as well."""
    if DB_SSL_CA:
        return {"ca": DB_SSL_CA}
    if DB_SSL:
        return {"check_hostname": False}      # encrypted; certificate not verified
    return None


def _engine_options():
    options = {"pool_pre_ping": True, "pool_recycle": 280}
    if db_ssl_args():
        options["connect_args"] = {"ssl": db_ssl_args()}
    return options


class Config:
    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://{quote_plus(DB_USER)}:{quote_plus(DB_PASSWORD)}"
        f"@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = _engine_options()

    JWT_SECRET_KEY = _env("JWT_SECRET", "dev-only-change-me-dev-only-change-me")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=7)

    MAX_CONTENT_LENGTH = 5 * 1024 * 1024          # max upload (camera JPEGs)
    UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
    FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend-html"))

    DEVICE_KEY = _env("DEVICE_KEY", "esp32-shared-secret")
    HARDWARE_MODE = _env("HARDWARE_MODE", "off").lower()     # off | weight | full
    WEIGHT_TOLERANCE_PCT = float(_env("WEIGHT_TOLERANCE_PCT", "5"))
    MIN_ITEM_WEIGHT_G = float(_env("MIN_ITEM_WEIGHT_G", "2"))
    READING_MAX_AGE_SEC = int(_env("READING_MAX_AGE_SEC", "15"))
    COLOR_MAX_DISTANCE = float(_env("COLOR_MAX_DISTANCE", "70"))

    # Google sign-in (optional). Client ID from Google Cloud > APIs & Services > Credentials.
    # The project's own Google OAuth client (a client ID is public - it is in every login page).
    # Its authorised origin is https://smartcart-gkrx.onrender.com; set GOOGLE_CLIENT_ID to use another.
    GOOGLE_CLIENT_ID = _env("GOOGLE_CLIENT_ID",
                            "509721464654-jup11mkrmvqrctvipqm024sfti0t5j4a.apps.googleusercontent.com")
    # Google accounts that become admins when they sign in, comma separated.
    ADMIN_GOOGLE_EMAILS = {e.strip().lower() for e in _env("ADMIN_GOOGLE_EMAILS").split(",") if e.strip()}

    # Security: wrong passwords allowed per email (and per IP) before a 15-minute lock.
    LOGIN_MAX_FAILURES = int(_env("LOGIN_MAX_FAILURES", "5"))
    LOGIN_LOCK_MINUTES = int(_env("LOGIN_LOCK_MINUTES", "15"))

    # SmartCart Wallet: largest single top-up, and optional demo money for every new account
    WALLET_MAX_TOPUP = float(_env("WALLET_MAX_TOPUP", "10000"))
    WALLET_WELCOME_AMOUNT = float(_env("WALLET_WELCOME_AMOUNT", "0"))

    # Item-not-scanned alert: a weight placed on the cart and not scanned within this many seconds
    UNSCANNED_ALERT_SEC = int(_env("UNSCANNED_ALERT_SEC", "15"))
    # UPI for wallet top-ups (optional): the shop's UPI ID and the name shown in UPI apps
    UPI_ID = _env("UPI_ID")
    UPI_PAYEE_NAME = _env("UPI_PAYEE_NAME", "SmartCart")
    # Days and "today" on the dashboard use this time zone offset (India = +05:30)
    APP_UTC_OFFSET_MINUTES = int(_env("APP_UTC_OFFSET_MINUTES", "330"))

    # Memory cache: products are kept in RAM and re-read from MySQL at most this often.
    PRODUCT_CACHE_SECONDS = int(_env("PRODUCT_CACHE_SECONDS", "300"))
    # A device counts as online if it sent a heartbeat within this many seconds.
    DEVICE_ONLINE_SECONDS = int(_env("DEVICE_ONLINE_SECONDS", "90"))
