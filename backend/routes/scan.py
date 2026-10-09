"""POST /api/scan - the heart of the Smart Billing Cart."""
from flask import Blueprint, jsonify

from alerts import refresh_alerts
from cache import products as product_cache
from extensions import db
from models import FlaggedTransaction, HardwareReading, utcnow
from routes.cart import add_to_cart, cart_payload
from services import clean_code, error, is_barcode_number, json_body, login_required, verify_item

bp = Blueprint("scan", __name__, url_prefix="/api")


@bp.post("/scan")
@login_required
def scan(user):
    code = clean_code(json_body().get("code"))
    if not code:
        return error("Send the scanned QR/barcode value as 'code'", 422)

    # Layer 1: barcode-to-catalogue cross-check (answered from the memory cache)
    product = product_cache.by_code(code)
    if product is None:
        kind = "Barcode" if is_barcode_number(code) else "Code"
        message = (f"{kind} {code[:40]} isn't in the shop's catalogue yet."
                   + (" Add it as a product?" if user.role == "admin" else " Please ask a staff member."))
        return error(message, 404, code=code, can_add=user.role == "admin",
                     verification={"status": "mismatch", "reasons": ["unknown_code"],
                                   "checks": {"barcode": {"ok": False, "detail": "Code not in database"}}})
    if product.stock <= 0:
        return error(f"{product.name} is out of stock", 409)

    # Layers 2 + 3: weight and camera
    refresh_alerts()          # an item left unscanned in the cart may be the one scanned now
    verification, used = verify_item(product)
    if verification["status"] == "waiting":
        return error(verification["message"], 409, verification=verification)

    now = utcnow()
    for reading in used:
        # One reading can never verify two scans. Older unused readings of the same kind
        # are retired too, so an earlier placement can't be "saved up" for a later scan.
        (HardwareReading.query
         .filter(HardwareReading.kind == reading.kind, HardwareReading.id <= reading.id,
                 HardwareReading.consumed_at.is_(None))
         .update({"consumed_at": now}, synchronize_session=False))
        reading.consumed_at = now

    if verification["status"] == "mismatch":
        weight = verification["checks"].get("weight", {})
        image = verification["checks"].get("image", {})
        flag = FlaggedTransaction(
            user_id=user.id, product_id=product.id, scanned_code=code,
            measured_weight_g=weight.get("measured_g"),
            expected_min_g=product.weight_min_g, expected_max_g=product.weight_max_g,
            measured_color=image.get("measured_color"), expected_color=product.ref_color,
            color_distance=image.get("distance"),
            reasons=",".join(verification["reasons"]),
        )
        db.session.add(flag)
        db.session.commit()
        return error("Item flagged for staff review - it was NOT added to your cart.", 409,
                     verification=verification, flag_id=flag.id)

    item, problem = add_to_cart(user, product, 1)
    if problem:
        db.session.rollback()          # keep the readings unused
        return problem
    db.session.commit()
    return jsonify(product=product.to_dict(), cart_item=item.to_dict(),
                   verification=verification, cart=cart_payload(user)), 201
