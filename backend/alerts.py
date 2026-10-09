"""Item-not-scanned alerts.

Real smart carts (Amazon Dash Cart, Instacart Caper) warn when something goes into the cart
without being scanned. Here: a weight placed on the cart's scale that no scan uses within
UNSCANNED_ALERT_SEC seconds becomes an alert. The shopper's Scan page shows it, staff see it
under Admin, and the Raspberry Pi buzzes. It closes by itself when the item is scanned or
taken off the scale. Checked "lazily" (whenever someone asks), so no background job is needed.
"""
from datetime import timedelta

from flask import current_app

from extensions import db
from models import CartAlert, HardwareReading, utcnow
from services import hardware_mode

LOOKBACK_MIN = 10       # only recent placements can raise an alert


def refresh_alerts():
    """Create alerts for unscanned placements and close the ones that were dealt with."""
    if hardware_mode() == "off":
        return
    cfg = current_app.config
    wait = timedelta(seconds=cfg["UNSCANNED_ALERT_SEC"])
    minimum = cfg["MIN_ITEM_WEIGHT_G"]
    now = utcnow()
    changed = False

    candidates = (HardwareReading.query
                  .filter(HardwareReading.kind == "weight", HardwareReading.weight_g >= minimum,
                          HardwareReading.consumed_at.is_(None),
                          HardwareReading.created_at <= now - wait,
                          HardwareReading.created_at >= now - timedelta(minutes=LOOKBACK_MIN))
                  .order_by(HardwareReading.id).all())
    if candidates:
        known = {a.reading_id for a in CartAlert.query.filter(
            CartAlert.reading_id.in_([r.id for r in candidates])).all()}
        for reading in candidates:
            if reading.id in known:
                continue
            # taken off (or replaced) quickly = no alert
            followed = (HardwareReading.query
                        .filter(HardwareReading.kind == "weight", HardwareReading.device_id == reading.device_id,
                                HardwareReading.id > reading.id,
                                HardwareReading.created_at <= reading.created_at + wait).first())
            if followed is not None:
                continue
            db.session.add(CartAlert(reading_id=reading.id, device_id=reading.device_id,
                                     weight_g=reading.weight_g, status="open",
                                     created_at=reading.created_at + wait))
            changed = True

    for alert in CartAlert.query.filter_by(status="open").all():
        reading = db.session.get(HardwareReading, alert.reading_id)
        if reading is None or reading.consumed_at is not None:
            alert.status, alert.resolved_at = "scanned", now
            changed = True
            continue
        later = (HardwareReading.query
                 .filter(HardwareReading.kind == "weight", HardwareReading.device_id == alert.device_id,
                         HardwareReading.id > alert.reading_id).first())
        if later is not None:            # the scale changed: item taken off or swapped
            alert.status, alert.resolved_at = "removed", now
            changed = True
    if changed:
        db.session.commit()


def open_alerts():
    return CartAlert.query.filter_by(status="open").order_by(CartAlert.id.desc()).all()
