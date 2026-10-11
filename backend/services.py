"""Shared helpers: JSON/auth helpers and the multi-layer item verification."""
import hmac
import math
import re
from datetime import timedelta
from functools import wraps

from flask import current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request
from PIL import Image

from extensions import db
from models import HardwareReading, User, utcnow

HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
MODES = ("off", "weight", "full")
BILL_RE = re.compile(r"^SCBILL-(\d{1,10})-([0-9a-f]{16})$")


def error(message, status=400, **extra):
    return jsonify(error=message, **extra), status


# ---------------- signed bill codes (exit gate) ----------------

def _bill_signature(order):
    """HMAC of the order's fixed details with the server secret: a bill QR can't be
    forged or made up for someone else's order number without knowing the secret."""
    import hashlib
    message = f"smartcart-bill:{order.id}:{order.user_id}".encode()
    key = current_app.config["JWT_SECRET_KEY"].encode()
    return hmac.new(key, message, hashlib.sha256).hexdigest()[:16]


def image_signature(filename):
    """Cart camera photos are served only with this signature in the link, which the server hands
    out to logged-in pages - a photo can't be opened by guessing its file name."""
    import hashlib
    key = current_app.config["JWT_SECRET_KEY"].encode()
    return hmac.new(key, f"smartcart-photo:{filename}".encode(), hashlib.sha256).hexdigest()[:20]


def image_url(filename):
    return f"/api/hardware/images/{filename}?sig={image_signature(filename)}" if filename else None


def bill_code(order):
    """Text inside the bill QR, e.g. SCBILL-12-3fa9c01b77d2e845."""
    return f"SCBILL-{order.id}-{_bill_signature(order)}"


def parse_bill_code(raw):
    """Returns (order_id, signature) or (None, None) if it isn't a SmartCart bill code."""
    match = BILL_RE.match(str(raw or "").strip().replace(" ", "").lower().replace("scbill", "SCBILL"))
    return (int(match.group(1)), match.group(2)) if match else (None, None)


def bill_signature_ok(order, signature):
    return hmac.compare_digest(_bill_signature(order), signature)


# ---------------- product codes: QR text or a printed barcode ----------------

def clean_code(raw):
    """Spaces/newlines removed; a scanned barcode and a typed one compare equal."""
    return re.sub(r"\s+", "", str(raw or ""))


def code_variants(raw):
    """The same pack can be read as UPC-A (12 digits) or EAN-13 (13 digits, leading 0)."""
    code = clean_code(raw)
    variants = [code]
    if code.isdigit():
        if len(code) == 12:
            variants.append("0" + code)
        elif len(code) == 13 and code.startswith("0"):
            variants.append(code[1:])
    return variants


def gtin_check_ok(code):
    """Last digit of an EAN-8 / UPC-A / EAN-13 / GTIN-14 barcode is a checksum of the others."""
    digits = [int(d) for d in code]
    body, check = digits[:-1], digits[-1]
    total = sum(d * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return (10 - total % 10) % 10 == check


def is_barcode_number(code):
    return code.isdigit() and len(code) in (8, 12, 13, 14)


# ---------------- signed codes (top-up tokens) ----------------

TOPUP_RE = re.compile(r"^SCTOP-(\d{1,10})-([0-9a-f]{16})$")


def _signature(kind, *parts):
    import hashlib
    message = ":".join(["smartcart-" + kind, *map(str, parts)]).encode()
    key = current_app.config["JWT_SECRET_KEY"].encode()
    return hmac.new(key, message, hashlib.sha256).hexdigest()[:16]


def topup_code(request_row):
    """Text inside a wallet top-up token QR, e.g. SCTOP-42-9c01b77d2e8453fa."""
    return f"SCTOP-{request_row.id}-{_signature('topup', request_row.id, request_row.user_id)}"


def parse_topup_code(raw):
    """Returns (request_id, signature or None). Accepts the QR text, or the short number
    staff can type: T-000042, T42 or 42 (signature None = typed, staff check the name)."""
    text = clean_code(raw)
    if text.upper().startswith("SCTOP-"):
        text = "SCTOP-" + text[6:].lower()
    match = TOPUP_RE.match(text)
    if match:
        return int(match.group(1)), match.group(2)
    short = re.match(r"^[Tt]-?0*(\d{1,10})$", text) or re.match(r"^0*(\d{1,10})$", text)
    return (int(short.group(1)), None) if short else (None, None)


def topup_signature_ok(request_row, signature):
    return hmac.compare_digest(_signature("topup", request_row.id, request_row.user_id), signature)


def json_body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def to_int(value, default=None):
    if isinstance(value, bool):
        return default
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def hardware_mode():
    """off | weight | full. The admin's choice on the website wins over HARDWARE_MODE in .env."""
    from cache import settings
    if not current_app.config.get("SCALE_ENABLED"):
        return "off"                      # no scale fitted: nothing to check weights or colours with
    mode = settings.get("hardware_mode") or current_app.config.get("HARDWARE_MODE", "off")
    return mode if mode in MODES else "off"


def hardware_mode_source():
    from cache import settings
    return "website setting" if settings.get("hardware_mode") in MODES else "HARDWARE_MODE in .env"


# ---------------- auth decorators ----------------

def _user_from_token():
    verify_jwt_in_request()
    try:
        return db.session.get(User, int(get_jwt_identity()))
    except (TypeError, ValueError):
        return None


def login_required(fn):
    """Needs a valid JWT. Passes the logged-in User as the first argument."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = _user_from_token()
        if user is None:
            return error("Your account was not found. Please log in again.", 401)
        return fn(user, *args, **kwargs)
    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = _user_from_token()
        if user is None:
            return error("Your account was not found. Please log in again.", 401)
        if user.role != "admin":
            return error("Admin access only", 403)
        return fn(user, *args, **kwargs)
    return wrapper


def device_id_from_request(default):
    data = request.get_json(silent=True) if request.is_json else None
    raw = (data or {}).get("device_id") if isinstance(data, dict) else None
    return str(raw or request.headers.get("X-Device-Id") or request.args.get("device_id") or default)[:40]


def device_required(fn):
    """Hardware endpoints: the Raspberry Pi (or ESP32 boards) send the shared key in the
    X-Device-Key header. Every accepted call also marks that device as online."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        sent = request.headers.get("X-Device-Key", "").encode()
        expected = current_app.config["DEVICE_KEY"].encode()
        if not hmac.compare_digest(sent, expected):
            return error("Invalid or missing X-Device-Key", 401)
        from cache import devices
        from security import client_ip
        device_id = device_id_from_request("")
        if device_id:
            devices.seen(device_id, ip=client_ip())
        return fn(*args, **kwargs)
    return wrapper


# ---------------- camera colour helpers ----------------

def hex_to_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def color_distance(a, b):
    """Straight-line distance between two colours in RGB space (0 = identical, 441 = max)."""
    return math.dist(hex_to_rgb(a), hex_to_rgb(b))


def dominant_color(path):
    """Average colour of the centre of the photo, where the item sits."""
    with Image.open(path) as img:
        img = img.convert("RGB")
        w, h = img.size
        centre = img.crop((w // 4, h // 4, w * 3 // 4, h * 3 // 4))
        r, g, b = centre.resize((1, 1), Image.Resampling.BOX).getpixel((0, 0))
    return f"#{r:02x}{g:02x}{b:02x}"


# ---------------- hardware readings ----------------

def latest_reading(kind, include_consumed=False):
    """Newest *fresh* reading that can be used to verify a scan."""
    cfg = current_app.config
    cutoff = utcnow() - timedelta(seconds=cfg["READING_MAX_AGE_SEC"])
    q = HardwareReading.query.filter(HardwareReading.kind == kind,
                                     HardwareReading.created_at >= cutoff)
    if kind == "weight":
        q = q.filter(HardwareReading.weight_g >= cfg["MIN_ITEM_WEIGHT_G"])
    if not include_consumed:
        q = q.filter(HardwareReading.consumed_at.is_(None))
    found = q.order_by(HardwareReading.id.desc()).first()
    if found is None and not include_consumed:
        found = alerted_reading(kind)
    return found


def alerted_reading(kind):
    """An item that raised a "not scanned" alert is still sitting in the cart, so its (older)
    reading may verify the scan that finally comes - that also closes the alert."""
    from models import CartAlert
    alert = CartAlert.query.filter_by(status="open").order_by(CartAlert.id.desc()).first()
    if alert is None:
        return None
    weight = db.session.get(HardwareReading, alert.reading_id)
    if weight is None or weight.consumed_at is not None:
        return None
    later = (HardwareReading.query
             .filter(HardwareReading.kind == "weight", HardwareReading.device_id == weight.device_id,
                     HardwareReading.id > weight.id).first())
    if later is not None:                 # the scale changed since: not the same item any more
        return None
    if kind == "weight":
        return weight
    # the photo the Pi took of that same placement (sent just before the weight)
    return (HardwareReading.query
            .filter(HardwareReading.kind == kind, HardwareReading.consumed_at.is_(None),
                    HardwareReading.created_at >= weight.created_at - timedelta(seconds=20),
                    HardwareReading.created_at <= weight.created_at + timedelta(seconds=5))
            .order_by(HardwareReading.id.desc()).first())


def latest_any(kind):
    """Newest reading of any age (for the live status panels)."""
    return HardwareReading.query.filter_by(kind=kind).order_by(HardwareReading.id.desc()).first()


# ---------------- the fraud check ----------------

def verify_item(product):
    """
    Multi-layer verification of one scanned item.
      layer 1: barcode/QR -> product lookup   (already passed when we get here)
      layer 2: load-cell weight within the product's expected range
      layer 3: camera colour close to the product's reference colour  (mode "full")
    Returns (result_dict, readings_used). result["status"] is passed | mismatch | waiting.
    """
    mode = hardware_mode()
    cfg = current_app.config
    checks = {"barcode": {"ok": True, "detail": f"{product.qr_code} = {product.name}"}}
    result = {"mode": mode, "checks": checks, "reasons": []}

    if mode == "off":
        result.update(status="passed", message="Hardware checks are off (software-only mode).")
        return result, []

    weight = latest_reading("weight")
    image = latest_reading("image") if mode == "full" else None
    missing = []
    if weight is None:
        missing.append("place the item on the scale")
    if mode == "full" and image is None:
        missing.append("hold it under the camera")
    if missing:
        msg = " and ".join(missing)
        result.update(status="waiting", message=msg[0].upper() + msg[1:] + ", then scan again.")
        return result, []

    reasons = []
    measured = float(weight.weight_g)
    if product.weight_min_g is None or product.weight_max_g is None:
        checks["weight"] = {"ok": False, "measured_g": measured,
                            "detail": "No reference weight saved for this product"}
        reasons.append("no_weight_reference")
    else:
        tol = cfg["WEIGHT_TOLERANCE_PCT"] / 100
        low = float(product.weight_min_g) * (1 - tol)
        high = float(product.weight_max_g) * (1 + tol)
        ok = low <= measured <= high
        checks["weight"] = {"ok": ok, "measured_g": measured, "allowed_g": [round(low, 1), round(high, 1)]}
        if not ok:
            reasons.append("weight_mismatch")

    if mode == "full":
        if not product.ref_color:
            checks["image"] = {"ok": False, "measured_color": image.color_hex,
                               "detail": "No reference colour saved for this product"}
            reasons.append("no_image_reference")
        else:
            dist = color_distance(image.color_hex, product.ref_color)
            ok = dist <= cfg["COLOR_MAX_DISTANCE"]
            checks["image"] = {"ok": ok, "measured_color": image.color_hex,
                               "expected_color": product.ref_color, "distance": round(dist, 1),
                               "max_distance": cfg["COLOR_MAX_DISTANCE"]}
            if not ok:
                reasons.append("image_mismatch")

    result["reasons"] = reasons
    if reasons:
        result.update(status="mismatch",
                      message="The item on the scale/camera does not match the scanned code.")
    else:
        result.update(status="passed", message="Barcode, weight" +
                      (" and camera" if mode == "full" else "") + " all agree.")
    return result, [r for r in (weight, image) if r is not None]
