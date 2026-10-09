"""Endpoints the Raspberry Pi calls, plus live status, not-scanned alerts and a simulator for demos."""
import math
import os
import secrets

from flask import Blueprint, current_app, jsonify, request, send_from_directory

from alerts import open_alerts, refresh_alerts
from cache import devices
from config import APP_VERSION
from extensions import db
from models import HardwareReading, utcnow
from services import (HEX_RE, admin_required, device_id_from_request, device_required,
                      dominant_color, error, hardware_mode, json_body, latest_any, login_required)

bp = Blueprint("hardware", __name__, url_prefix="/api/hardware")


def _grams(raw):
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    return round(value, 1) if math.isfinite(value) and -50000 <= value <= 50000 else None


@bp.post("/weight")
@device_required
def post_weight():
    """Raspberry Pi cart agent -> POST {"device_id": "rpi-cart", "weight_g": 104.6}"""
    data = json_body()
    grams = _grams(data.get("weight_g"))
    if grams is None:
        return error("weight_g must be a number of grams", 422)
    device = device_id_from_request("esp32-weight")
    devices.seen(device, last_weight_g=grams)
    reading = HardwareReading(device_id=device, kind="weight", weight_g=grams)
    db.session.add(reading)
    db.session.commit()
    return jsonify(ok=True, reading=reading.to_dict()), 201


@bp.post("/image")
@device_required
def post_image():
    """Pi camera -> raw JPEG body (Content-Type: image/jpeg) or multipart field 'image'."""
    upload = request.files.get("image")
    raw = upload.read() if upload else request.get_data()
    if not raw:
        return error("Send a JPEG as the request body or as form field 'image'", 422)
    folder = current_app.config["UPLOAD_DIR"]
    os.makedirs(folder, exist_ok=True)
    name = f"cam_{utcnow():%Y%m%d_%H%M%S}_{secrets.token_hex(3)}.jpg"
    path = os.path.join(folder, name)
    with open(path, "wb") as fh:
        fh.write(raw)
    try:
        color = dominant_color(path)
    except (OSError, ValueError):
        os.remove(path)
        return error("That file is not a readable JPEG image", 422)
    device = device_id_from_request("esp32-cam")
    devices.seen(device, last_color=color)
    reading = HardwareReading(device_id=device, kind="image", image_file=name, color_hex=color)
    db.session.add(reading)
    db.session.commit()
    return jsonify(ok=True, reading=reading.to_dict()), 201


@bp.post("/heartbeat")
@device_required
def heartbeat():
    """The Pi says "I'm alive" every 30 s (also keeps a sleeping free Render server awake).
    Body: {"device_id": "rpi-cart", "version": "2.5", "roles": ["cart", "exit"],
           "scale": "ok", "camera": "ok", "weight_g": 0.0, "uptime_sec": 1234}"""
    data = json_body()
    info = {key: data.get(key) for key in ("version", "roles", "scale", "camera", "qr", "uptime_sec")}
    grams = _grams(data.get("weight_g"))
    devices.seen(device_id_from_request("device"), platform_weight_g=grams, **info)
    refresh_alerts()
    return jsonify(ok=True, hardware_mode=hardware_mode(), server_version=APP_VERSION,
                   unscanned_alert_sec=current_app.config["UNSCANNED_ALERT_SEC"],
                   server_time=utcnow().isoformat(timespec="seconds") + "Z")


@bp.get("/status")
@login_required
def status(user):
    refresh_alerts()
    weight, image = latest_any("weight"), latest_any("image")
    online = [d["device_id"] for d in devices.list() if d["online"]]
    return jsonify(mode=hardware_mode(), max_age_sec=current_app.config["READING_MAX_AGE_SEC"],
                   weight=weight.to_dict() if weight else None,
                   image=image.to_dict() if image else None,
                   devices_online=online,
                   alerts=[a.to_dict() for a in open_alerts()])


@bp.get("/readings/<int:reading_id>")
@device_required
def reading_check(reading_id):
    """The Pi asks ~15 s after a placement: was it scanned? (if not, it buzzes)"""
    from models import CartAlert
    refresh_alerts()
    reading = db.session.get(HardwareReading, reading_id)
    if reading is None:
        return error("Reading not found", 404)
    alert = CartAlert.query.filter_by(reading_id=reading_id).first()
    return jsonify(consumed=reading.consumed_at is not None, alert=alert.status if alert else None)


@bp.get("/images/<path:filename>")
def image_file(filename):
    return send_from_directory(current_app.config["UPLOAD_DIR"], filename)


@bp.post("/simulate")
@admin_required
def simulate(user):
    """Admin-only fake readings, so the fraud flow can be demoed without hardware."""
    data = json_body()
    created = []
    if str(data.get("weight_g") or "").strip():
        grams = _grams(data.get("weight_g"))
        if grams is None:
            return error("weight_g must be a number", 422)
        created.append(HardwareReading(device_id="simulator", kind="weight", weight_g=grams))
    color = str(data.get("color_hex") or "").strip().lower()
    if color:
        if not HEX_RE.match(color):
            return error("color_hex must look like #a1b2c3", 422)
        created.append(HardwareReading(device_id="simulator", kind="image", color_hex=color))
    if not created:
        return error("Send weight_g and/or color_hex", 422)
    db.session.add_all(created)
    db.session.commit()
    return jsonify(readings=[r.to_dict() for r in created]), 201
