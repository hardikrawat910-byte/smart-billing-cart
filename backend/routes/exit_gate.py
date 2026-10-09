"""Exit gate: the customer's bill QR is checked before they leave the store.

Two ways to check a bill, both using the same rules:
  * the Raspberry Pi camera at the exit reads the QR   -> POST /api/exit/device  (device key)
  * staff scan it with a phone on exit.html            -> POST /api/exit/verify  (admin login)

A bill passes only if it is genuine (signed by this server), paid, not used before,
and the customer has no unresolved fraud flags. If the bag is on the scale
(hardware mode on), its weight must also fit the items on the bill.
"""
from flask import Blueprint, current_app, jsonify, request

from cache import counter_feed, exit_feed
from extensions import db
from models import FlaggedTransaction, Order, Product, utcnow
from services import (admin_required, bill_signature_ok, device_id_from_request, device_required,
                      hardware_mode, json_body, latest_reading, parse_bill_code, parse_topup_code, to_int,
                      topup_signature_ok)

bp = Blueprint("exit_gate", __name__, url_prefix="/api/exit")


def _summary(order):
    data = order.to_dict()
    data["customer_name"] = order.user.full_name if order.user else None
    data["customer_email"] = order.user.email if order.user else None
    data["exit_staff"] = order.exit_by_label()
    return data


def _expected_bag_weight(order):
    """Allowed bag weight from the products' reference ranges, or None if any are missing."""
    low = high = 0.0
    for item in order.items:
        product = db.session.get(Product, item.product_id)
        if product is None or product.weight_min_g is None or product.weight_max_g is None:
            return None
        low += float(product.weight_min_g) * item.quantity
        high += float(product.weight_max_g) * item.quantity
    tol = current_app.config["WEIGHT_TOLERANCE_PCT"] / 100
    return round(low * (1 - tol), 1), round(high * (1 + tol), 1)


def check_bill(code, staff=None, device_id=None, bag_weight_g=None):
    """Runs every exit check. Returns (body, http_status) and records it in the live feed."""
    source = {"source": "pi" if device_id else "staff", "device_id": device_id,
              "staff": staff.full_name if staff else None}

    def result(kind, message, status, order=None, checks=None):
        body = {"result": kind, "message": message, "checks": checks or [],
                "order": _summary(order) if order else None}
        exit_feed.add(result=kind, message=message, order=body["order"], checks=body["checks"], **source)
        return body, status

    order_id, signature = parse_bill_code(code)
    if order_id is None:
        return result("invalid", "This is not a SmartCart bill QR.", 422)
    order = db.session.get(Order, order_id)
    if order is None or not bill_signature_ok(order, signature):
        return result("invalid", "Bill not recognised - it may be fake or edited. Do not let the customer leave.", 404)

    checks = [{"name": "Genuine bill", "ok": True, "detail": f"SC-{order.id:06d} signed by this store"}]
    if order.status != "completed":
        checks.append({"name": "Paid", "ok": False, "detail": f"Order is {order.status}"})
        return result("invalid", "This order is not a completed purchase.", 409, order, checks)
    paid_by = f" from wallet (W-{order.payment_ref:06d})" if order.payment_ref else ""
    checks.append({"name": "Paid", "ok": True, "detail": f"₹{float(order.total_amount):,.2f}{paid_by}"})

    if order.exit_verified_at is not None:
        checks.append({"name": "Not used before", "ok": False,
                       "detail": f"Already scanned out by {order.exit_by_label()}",
                       "at": order.to_dict()["exit_verified_at"]})
        return result("used", "This bill was already used to leave the store.", 409, order, checks)
    checks.append({"name": "Not used before", "ok": True, "detail": "First exit with this bill"})

    open_flags = FlaggedTransaction.query.filter_by(user_id=order.user_id, status="open").count()
    checks.append({"name": "No open fraud flags", "ok": open_flags == 0,
                   "detail": f"{open_flags} flagged scan(s) waiting for review" if open_flags else "None"})

    weight_ok = True
    if hardware_mode() != "off":
        expected = _expected_bag_weight(order)
        measured, reading = None, None
        if device_id:
            # the Pi sends what is on its platform right now (None = platform empty)
            if bag_weight_g is not None and bag_weight_g >= current_app.config["MIN_ITEM_WEIGHT_G"]:
                measured = bag_weight_g
        else:
            reading = latest_reading("weight")
            measured = float(reading.weight_g) if reading is not None else None
        if expected and measured is not None:
            weight_ok = expected[0] <= measured <= expected[1]
            if reading is not None:
                reading.consumed_at = utcnow()
            checks.append({"name": "Bag weight", "ok": weight_ok,
                           "detail": f"{measured} g (bill allows {expected[0]}-{expected[1]} g)"})
        elif expected:
            checks.append({"name": "Bag weight", "ok": True, "skipped": True,
                           "detail": f"Not weighed (bill allows {expected[0]}-{expected[1]} g)"})

    if open_flags or not weight_ok:
        db.session.commit()            # keeps the used-up scale reading; the bill stays unused
        reason = "unresolved flagged items" if open_flags else "the bag weight does not match the bill"
        return result("hold", f"Hold the customer: {reason}. Check the bag, then scan again.", 409,
                      order, checks)

    order.exit_verified_at = utcnow()
    order.exit_verified_by = staff.id if staff else None
    order.exit_verified_device = device_id
    db.session.commit()
    return result("ok", "Bill verified - the customer may leave.", 200, order, checks)


@bp.post("/verify")
@admin_required
def verify(staff):
    body, status = check_bill(json_body().get("code"), staff=staff)
    return jsonify(body), status


@bp.post("/device")
@device_required
def device_verify():
    """The Raspberry Pi camera read a bill QR at the exit.
    Body: {"code": "SCBILL-12-...", "device_id": "rpi-cart", "weight_g": 412.0 (or null)}"""
    data = json_body()
    device_id = device_id_from_request("rpi-exit")
    # whatever the Pi weighed just now is the customer's bag, not an unscanned item
    from datetime import timedelta
    from models import HardwareReading
    (HardwareReading.query
     .filter(HardwareReading.device_id == device_id, HardwareReading.kind == "weight",
             HardwareReading.consumed_at.is_(None),
             HardwareReading.created_at >= utcnow() - timedelta(seconds=90))
     .update({"consumed_at": utcnow()}, synchronize_session=False))
    weight = data.get("weight_g")
    try:
        weight = float(weight) if weight is not None else None
    except (TypeError, ValueError):
        weight = None
    if str(data.get("code") or "").strip().upper().startswith("SCTOP-"):
        body, status = token_seen(data.get("code"), device_id)
        return jsonify(body), status
    body, status = check_bill(data.get("code"), device_id=device_id, bag_weight_g=weight)
    return jsonify(body), status


def token_seen(code, device_id):
    """The Pi camera read a wallet TOP-UP token (not a bill): hand it to the Wallet counter page,
    where staff take the cash / UPI and press confirm. The Pi never credits money by itself."""
    from models import TopupRequest
    topup_id, signature = parse_topup_code(code)
    row = db.session.get(TopupRequest, topup_id) if topup_id is not None and signature else None
    if row is None or not topup_signature_ok(row, signature):
        return {"result": "invalid", "message": "Top-up token not recognised - it may be fake or edited."}, 404
    number = f"T-{row.id:06d}"
    if row.status == "paid":
        return {"result": "used", "message": f"Token {number} is already paid."}, 409
    if row.status != "pending":
        return {"result": "invalid", "message": f"Token {number} was cancelled by the customer."}, 409
    counter_feed.add(code=code.strip(), topup_id=row.id, number=number, device_id=device_id)
    name = row.user.full_name if row.user else "customer"
    return {"result": "token", "topup_id": row.id,
            "message": f"Top-up token {number}: Rs {row.amount} for {name} - confirm it on the Wallet counter page."}, 200


@bp.get("/recent")
@admin_required
def recent(staff):
    orders = (Order.query.filter(Order.exit_verified_at.isnot(None))
              .order_by(Order.exit_verified_at.desc()).limit(15).all())
    return jsonify(orders=[_summary(o) for o in orders])


@bp.get("/events")
@admin_required
def events(staff):
    """Live feed for the staff page: every exit check after ?after=<id> (Pi and phones)."""
    after = to_int(request.args.get("after"), 0) or 0
    return jsonify(events=exit_feed.since(after), last_id=exit_feed.last_id())
