import io
import time
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from flask import Blueprint, current_app, jsonify, request
from sqlalchemy import func

import cache
from config import APP_VERSION
from extensions import db
from alerts import refresh_alerts
from models import (CartAlert, CartItem, FlaggedTransaction, HardwareReading, HelpRequest, Order, OrderItem,
                    Product, ShoppingListItem,
                    ProductImage, TopupRequest, User, WalletTransaction, utcnow)
from routes.cart import add_to_cart
from services import (HEX_RE, MODES, admin_required, clean_code, code_variants, error, gtin_check_ok,
                      hardware_mode, hardware_mode_source, is_barcode_number, json_body, latest_reading,
                      to_int)

bp = Blueprint("admin", __name__, url_prefix="/api/admin")


def parse_product(data):
    """Validate an admin product form. Returns (fields, errors)."""
    fields, errors = {}, {}

    def text(key, max_len, required=False):
        raw = data.get(key)
        value = str(raw).strip() if raw is not None else ""
        if required and not value:
            errors[key] = "Required"
        elif len(value) > max_len:
            errors[key] = f"Max {max_len} characters"
        fields[key] = value or None

    def decimal(key, required=False):
        raw = data.get(key)
        if raw is None or str(raw).strip() == "":
            if required:
                errors[key] = "Required"
            fields[key] = None
            return
        try:
            value = Decimal(str(raw).strip())
        except InvalidOperation:
            errors[key] = "Must be a number"
            return
        if not value.is_finite() or value < 0 or value > 1000000:
            errors[key] = "Must be between 0 and 1,000,000"
            return
        fields[key] = value

    text("name", 120, True)
    text("category", 60, True)
    text("description", 2000)
    text("image_url", 500)
    text("qr_code", 120, True)
    decimal("price", True)
    decimal("mrp")
    decimal("weight_min_g")
    decimal("weight_max_g")

    # one code per product: the barcode number on the pack, or the text of our QR label
    code = clean_code(fields.get("qr_code"))
    fields["qr_code"] = code or None
    if code and is_barcode_number(code) and not gtin_check_ok(code):
        errors["qr_code"] = "This barcode number's last digit doesn't check out - scan it instead of typing"

    stock = to_int(data.get("stock", 0))
    if stock is None or stock < 0:
        errors["stock"] = "Must be a whole number, 0 or more"
    fields["stock"] = stock

    color = str(data.get("ref_color") or "").strip().lower()
    if color and not HEX_RE.match(color):
        errors["ref_color"] = "Use a colour like #a1b2c3"
    fields["ref_color"] = color or None

    status = data.get("status", "draft")
    if status not in ("draft", "published"):
        errors["status"] = "Must be draft or published"
    fields["status"] = status

    mrp, price = fields.get("mrp"), fields.get("price")
    if mrp is not None and price is not None and "mrp" not in errors and mrp < price:
        errors["mrp"] = "MRP can't be below the price (leave it blank if there is no offer)"
    wmin, wmax = fields.get("weight_min_g"), fields.get("weight_max_g")
    if "weight_min_g" not in errors and "weight_max_g" not in errors:
        if (wmin is None) != (wmax is None):
            errors["weight_max_g"] = "Set both min and max weight (or neither)"
        elif wmin is not None and wmin > wmax:
            errors["weight_max_g"] = "Max must be at least the min"
    return fields, errors


def apply_product(product, data):
    fields, errors = parse_product(data)
    if errors:
        return error("Please fix the highlighted fields", 422, fields=errors)
    clash = Product.query.filter(Product.qr_code.in_(code_variants(fields["qr_code"])),
                                 Product.id != (product.id or 0)).first()
    if clash:
        return error(f"That code is already used by {clash.name}", 409,
                     fields={"qr_code": f"Already used by {clash.name}"})
    for key, value in fields.items():
        setattr(product, key, value)
    return None


def get_active(product_id):
    return Product.query.filter(Product.id == product_id, Product.deleted_at.is_(None)).first()


# ---------------- products ----------------

@bp.get("/products")
@admin_required
def list_products(user):
    q = Product.query.filter(Product.deleted_at.is_(None))
    status = request.args.get("status", "all")
    if status in ("draft", "published"):
        q = q.filter(Product.status == status)
    products = q.order_by(Product.updated_at.desc(), Product.id.desc()).all()
    return jsonify(products=[p.to_dict(admin=True) for p in products])


@bp.get("/products/<int:product_id>")
@admin_required
def get_product(user, product_id):
    product = get_active(product_id)
    if product is None:
        return error("Product not found", 404)
    return jsonify(product=product.to_dict(admin=True))


@bp.post("/products")
@admin_required
def create_product(user):
    product = Product()
    problem = apply_product(product, json_body())
    if problem:
        return problem
    db.session.add(product)
    db.session.commit()
    cache.products.clear("admin changed a product")
    return jsonify(product=product.to_dict(admin=True)), 201


@bp.put("/products/<int:product_id>")
@admin_required
def update_product(user, product_id):
    product = get_active(product_id)
    if product is None:
        return error("Product not found", 404)
    problem = apply_product(product, json_body())
    if problem:
        return problem
    db.session.commit()
    cache.products.clear("admin changed a product")
    return jsonify(product=product.to_dict(admin=True))


@bp.patch("/products/<int:product_id>/status")
@admin_required
def set_status(user, product_id):
    product = get_active(product_id)
    if product is None:
        return error("Product not found", 404)
    status = json_body().get("status")
    if status not in ("draft", "published"):
        return error("status must be draft or published", 422)
    product.status = status
    db.session.commit()
    cache.products.clear("admin changed a product")
    return jsonify(product=product.to_dict(admin=True))


@bp.delete("/products/<int:product_id>")
@admin_required
def delete_product(user, product_id):
    """Soft delete: hidden everywhere, QR value freed, order history untouched."""
    product = get_active(product_id)
    if product is None:
        return error("Product not found", 404)
    product.deleted_at = utcnow()
    product.status = "draft"
    product.qr_code = f"deleted-{product.id}-{product.qr_code}"[:120]
    CartItem.query.filter_by(product_id=product.id).delete()
    db.session.commit()
    cache.products.clear("admin changed a product")
    return jsonify(ok=True)


@bp.post("/products/<int:product_id>/calibrate")
@admin_required
def calibrate(user, product_id):
    """Put ONLY this item on the scale / under the camera, then call this to store
    its real weight range and reference colour."""
    if not current_app.config["SCALE_ENABLED"]:
        return error("The cart scale is switched off on this server (SCALE_ENABLED).", 409)
    product = get_active(product_id)
    if product is None:
        return error("Product not found", 404)
    data = json_body()
    try:
        spread = float(data.get("spread_pct", 3))
    except (TypeError, ValueError):
        spread = -1
    if not 0 <= spread <= 50:
        return error("spread_pct must be between 0 and 50", 422)

    weight = latest_reading("weight", include_consumed=True) if data.get("use_weight", True) else None
    image = latest_reading("image", include_consumed=True) if data.get("use_image", True) else None
    if weight is None and image is None:
        return error("No fresh reading. Place the item on the scale / under the camera "
                     "(or use the simulator) and try again within a few seconds.", 409)

    calibrated = {}
    if weight is not None:
        grams = Decimal(str(weight.weight_g))
        s = Decimal(str(spread)) / 100
        product.weight_min_g = (grams * (1 - s)).quantize(Decimal("0.1"))
        product.weight_max_g = (grams * (1 + s)).quantize(Decimal("0.1"))
        calibrated["weight"] = {"reading_g": float(grams), "min_g": float(product.weight_min_g),
                                "max_g": float(product.weight_max_g)}
    if image is not None and image.color_hex:
        product.ref_color = image.color_hex
        calibrated["color"] = image.color_hex
    db.session.commit()
    cache.products.clear("admin changed a product")
    return jsonify(product=product.to_dict(admin=True), calibrated=calibrated)


# ---------------- fraud flags ----------------

@bp.get("/flags")
@admin_required
def list_flags(user):
    q = FlaggedTransaction.query
    status = request.args.get("status", "open")
    if status in ("open", "approved", "rejected"):
        q = q.filter_by(status=status)
    flags = q.order_by(FlaggedTransaction.created_at.desc()).limit(200).all()
    return jsonify(flags=[f.to_dict() for f in flags])


@bp.post("/flags/<int:flag_id>/resolve")
@admin_required
def resolve_flag(user, flag_id):
    flag = db.session.get(FlaggedTransaction, flag_id)
    if flag is None:
        return error("Flag not found", 404)
    if flag.status != "open":
        return error("This flag was already resolved", 409)
    action = json_body().get("action")
    if action not in ("approve", "reject"):
        return error("action must be approve or reject", 422)
    if action == "approve":
        product = flag.product
        if product.deleted_at is not None or product.status != "published":
            return error("That product is no longer available", 409)
        _, problem = add_to_cart(flag.user, product, 1)
        if problem:
            db.session.rollback()
            return problem
    flag.status = "approved" if action == "approve" else "rejected"
    flag.resolved_at = utcnow()
    flag.resolved_by = user.id
    db.session.commit()
    return jsonify(flag=flag.to_dict())


# ---------------- settings + system status ----------------

@bp.put("/settings")
@admin_required
def update_settings(user):
    """Change the hardware mode from the website - no .env edit or restart needed."""
    mode = str(json_body().get("hardware_mode") or "").strip().lower()
    if mode not in MODES:
        return error("hardware_mode must be off, weight or full", 422)
    if mode != "off" and not current_app.config["SCALE_ENABLED"]:
        return error("The cart scale is switched off on this server (SCALE_ENABLED), so only 'off' is possible.", 409)
    cache.settings.set("hardware_mode", mode)
    return jsonify(hardware_mode=hardware_mode(), source=hardware_mode_source())


@bp.get("/system")
@admin_required
def system(user):
    cfg = current_app.config
    return jsonify(
        version=APP_VERSION,
        scale_enabled=bool(cfg["SCALE_ENABLED"]),
        hardware_mode=hardware_mode(),
        hardware_mode_source=hardware_mode_source(),
        cache=cache.products.stats(),
        devices=cache.devices.list(),
        google_sign_in=bool(cfg["GOOGLE_CLIENT_ID"]),
        admin_google_emails=len(cfg["ADMIN_GOOGLE_EMAILS"]),
    )


# ---------------- all orders ----------------

@bp.get("/orders")
@admin_required
def all_orders(user):
    orders = Order.query.order_by(Order.created_at.desc(), Order.id.desc()).limit(100).all()
    return jsonify(orders=[{**o.to_dict(with_items=False), "user_name": o.user.full_name,
                            "user_email": o.user.email} for o in orders])


# ---------------- product photos (kept in MySQL) ----------------

@bp.post("/products/<int:product_id>/photo")
@admin_required
def upload_photo(user, product_id):
    """A photo of the pack taken on the phone. Re-encoded here (max 900 px JPEG), so whatever the
    browser sends, only a small, clean image is stored and served."""
    from PIL import Image, ImageOps
    product = get_active(product_id)
    if product is None:
        return error("Product not found", 404)
    upload = request.files.get("photo")
    raw = upload.read() if upload else request.get_data()
    if not raw:
        return error("Send the photo as form field 'photo'", 422)
    try:
        with Image.open(io.BytesIO(raw)) as img:
            img = ImageOps.exif_transpose(img).convert("RGB")
            img.thumbnail((900, 900))
            out = io.BytesIO()
            img.save(out, "JPEG", quality=82, optimize=True)
    except Exception:
        return error("That file is not a photo we can read (use JPG or PNG)", 422)
    row = db.session.get(ProductImage, product.id)
    if row is None:
        db.session.add(ProductImage(product_id=product.id, mime="image/jpeg", data=out.getvalue()))
    else:
        row.data, row.mime = out.getvalue(), "image/jpeg"
    product.image_url = f"/api/products/{product.id}/photo?v={int(time.time())}"
    db.session.commit()
    cache.products.clear("admin changed a product photo")
    return jsonify(product=product.to_dict(admin=True), bytes=len(out.getvalue()))


@bp.delete("/products/<int:product_id>/photo")
@admin_required
def delete_photo(user, product_id):
    product = get_active(product_id)
    if product is None:
        return error("Product not found", 404)
    ProductImage.query.filter_by(product_id=product.id).delete()
    if (product.image_url or "").startswith(f"/api/products/{product.id}/photo"):
        product.image_url = None
    db.session.commit()
    cache.products.clear("admin removed a product photo")
    return jsonify(product=product.to_dict(admin=True))


# ---------------- item-not-scanned alerts ----------------

@bp.get("/alerts")
@admin_required
def list_alerts(user):
    refresh_alerts()
    rows = CartAlert.query.order_by(CartAlert.id.desc()).limit(50).all()
    return jsonify(alerts=[a.to_dict() for a in rows])


@bp.post("/alerts/<int:alert_id>/dismiss")
@admin_required
def dismiss_alert(user, alert_id):
    alert = db.session.get(CartAlert, alert_id)
    if alert is None:
        return error("Alert not found", 404)
    if alert.status == "open":
        alert.status, alert.resolved_at = "dismissed", utcnow()
        db.session.commit()
    return jsonify(alert=alert.to_dict())


# ---------------- dashboard ----------------

def local_day_start(days_ago=0):
    """Midnight in the shop's time zone (India by default), as the UTC time the DB stores."""
    offset = timedelta(minutes=current_app.config["APP_UTC_OFFSET_MINUTES"])
    local_now = utcnow() + offset
    midnight = local_now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days_ago)
    return midnight - offset


@bp.get("/dashboard")
@admin_required
def dashboard(user):
    refresh_alerts()
    today = local_day_start(0)
    week = local_day_start(6)

    def money(q):
        return float(q or 0)

    orders_today = Order.query.filter(Order.created_at >= today, Order.status == "completed")
    revenue_today = money(db.session.query(func.sum(Order.total_amount))
                          .filter(Order.created_at >= today, Order.status == "completed").scalar())
    count_today = orders_today.count()
    items_today = int(db.session.query(func.coalesce(func.sum(OrderItem.quantity), 0))
                      .join(Order, Order.id == OrderItem.order_id)
                      .filter(Order.created_at >= today, Order.status == "completed").scalar() or 0)

    # last 7 days, one row per local day
    offset = timedelta(minutes=current_app.config["APP_UTC_OFFSET_MINUTES"])
    days = []
    for i in range(6, -1, -1):
        start = local_day_start(i)
        end = start + timedelta(days=1)
        row = (db.session.query(func.count(Order.id), func.coalesce(func.sum(Order.total_amount), 0))
               .filter(Order.created_at >= start, Order.created_at < end, Order.status == "completed").one())
        days.append({"date": (start + offset).date().isoformat(), "orders": row[0], "revenue": float(row[1])})

    top = (db.session.query(OrderItem.product_name, func.sum(OrderItem.quantity).label("qty"),
                            func.sum(OrderItem.quantity * OrderItem.unit_price).label("revenue"))
           .join(Order, Order.id == OrderItem.order_id)
           .filter(Order.created_at >= week, Order.status == "completed")
           .group_by(OrderItem.product_name).order_by(func.sum(OrderItem.quantity).desc()).limit(5).all())

    topups = dict(db.session.query(WalletTransaction.method, func.coalesce(func.sum(WalletTransaction.amount), 0))
                  .filter(WalletTransaction.kind == "topup", WalletTransaction.created_at >= today)
                  .group_by(WalletTransaction.method).all())
    flag_counts = dict(db.session.query(FlaggedTransaction.status, func.count(FlaggedTransaction.id))
                       .filter(FlaggedTransaction.created_at >= week).group_by(FlaggedTransaction.status).all())
    reasons = {"weight_mismatch": 0, "image_mismatch": 0}
    for (text,) in db.session.query(FlaggedTransaction.reasons).filter(FlaggedTransaction.created_at >= week).all():
        for reason in (text or "").split(","):
            if reason in reasons:
                reasons[reason] += 1
    alert_counts = dict(db.session.query(CartAlert.status, func.count(CartAlert.id))
                        .filter(CartAlert.created_at >= week).group_by(CartAlert.status).all())
    savings_today = money(db.session.query(func.sum((OrderItem.unit_mrp - OrderItem.unit_price) * OrderItem.quantity))
                          .join(Order, Order.id == OrderItem.order_id)
                          .filter(Order.created_at >= today, Order.status == "completed",
                                  OrderItem.unit_mrp.isnot(None)).scalar())
    low_stock = (Product.query.filter(Product.deleted_at.is_(None), Product.status == "published", Product.stock <= 5)
                 .order_by(Product.stock).limit(8).all())
    return jsonify(
        today={"revenue": revenue_today, "orders": count_today, "items": items_today,
               "average_bill": round(revenue_today / count_today, 2) if count_today else 0,
               "topups_cash": money(topups.get("cash")), "topups_upi": money(topups.get("upi")),
               "exits": Order.query.filter(Order.exit_verified_at >= today).count(),
               "new_customers": User.query.filter(User.created_at >= today, User.role == "user").count(),
               "savings": savings_today,
               "help_open": HelpRequest.query.filter(HelpRequest.status.in_(("open", "coming"))).count()},
        days=days,
        top_items=[{"name": n, "qty": int(q), "revenue": float(r)} for n, q, r in top],
        fraud={"flags": sum(flag_counts.values()), "open": flag_counts.get("open", 0),
               "approved": flag_counts.get("approved", 0), "rejected": flag_counts.get("rejected", 0),
               "weight_mismatch": reasons["weight_mismatch"], "image_mismatch": reasons["image_mismatch"],
               "unscanned_alerts": sum(alert_counts.values()), "unscanned_open": alert_counts.get("open", 0)},
        wallet={"total_balance": money(db.session.query(func.sum(User.wallet_balance)).scalar()),
                "pending_topups": TopupRequest.query.filter_by(status="pending").count()},
        low_stock=[{"id": p.id, "name": p.name, "stock": p.stock} for p in low_stock],
        hardware_mode=hardware_mode(),
    )


# ---------------- restock + export ----------------

@bp.post("/products/<int:product_id>/restock")
@admin_required
def restock(user, product_id):
    """Stock arrived: add to the shelf count (from the dashboard's Running low list)."""
    product = get_active(product_id)
    if product is None:
        return error("Product not found", 404)
    add = to_int(json_body().get("add"))
    if add is None or add < 1 or add > 10000:
        return error("add must be 1-10000", 422)
    product.stock += add
    db.session.commit()
    cache.products.clear("admin restocked a product")
    return jsonify(product=product.to_dict(admin=True))


@bp.get("/export/sales.csv")
@admin_required
def export_sales(user):
    """Every bill line as a spreadsheet (opens in Excel / Google Sheets): ?days=30 (default)."""
    import csv
    days = max(1, min(366, to_int(request.args.get("days"), 30) or 30))
    since = local_day_start(days - 1)
    offset = timedelta(minutes=current_app.config["APP_UTC_OFFSET_MINUTES"])
    rows = (db.session.query(Order, OrderItem, User)
            .join(OrderItem, OrderItem.order_id == Order.id)
            .join(User, User.id == Order.user_id)
            .filter(Order.created_at >= since, Order.status == "completed")
            .order_by(Order.id, OrderItem.id).all())
    out = io.StringIO()
    out.write("\ufeff")                                  # so Excel reads the rupee sign right
    w = csv.writer(out)
    w.writerow(["Bill", "Date", "Time", "Customer", "Email", "Item", "Qty", "Price (Rs)", "MRP (Rs)",
                "Line total (Rs)", "Saved (Rs)", "Paid by", "Exited"])
    for order, item, customer in rows:
        local = order.created_at + offset
        saved = (item.unit_mrp - item.unit_price) * item.quantity if item.unit_mrp else 0
        w.writerow([f"SC-{order.id:06d}", local.strftime("%Y-%m-%d"), local.strftime("%H:%M"),
                    customer.full_name, customer.email, item.product_name, item.quantity,
                    f"{item.unit_price:.2f}", f"{item.unit_mrp:.2f}" if item.unit_mrp else "",
                    f"{item.unit_price * item.quantity:.2f}", f"{saved:.2f}",
                    f"wallet W-{order.payment_ref:06d}" if order.payment_ref else (order.payment_method or ""),
                    "yes" if order.exit_verified_at else "no"])
    name = f"smartcart-sales-{(utcnow() + offset):%Y%m%d}.csv"
    return current_app.response_class(out.getvalue(), mimetype="text/csv",
                                      headers={"Content-Disposition": f'attachment; filename="{name}"'})


# ---------------- reset for demo ----------------

# the six dev-board demo items from the first version (Raspberry Pi 5, webcam, SD card...)
SAMPLE_ELECTRONICS = ("SMARTCART-PI5-8GB", "SMARTCART-CAM-1080", "SMARTCART-SD-64GB",
                      "SMARTCART-LCD-1602", "SMARTCART-BUZZ-KIT", "SMARTCART-SENSOR-12")


@bp.post("/reset")
@admin_required
def reset_demo(user):
    """Clears test activity before the project is submitted. Cannot be undone, so the admin must
    type RESET. Keeps: admin accounts, products (stock as it is), settings."""
    data = json_body()
    if str(data.get("confirm") or "") != "RESET":
        return error("Type RESET (capital letters) to confirm", 422, fields={"confirm": "Type RESET"})
    counts = {}
    for name, model in (("help_requests", HelpRequest), ("shopping_list_items", ShoppingListItem),
                        ("cart_alerts", CartAlert), ("wallet_transactions", WalletTransaction),
                        ("topup_requests", TopupRequest), ("order_items", OrderItem), ("orders", Order),
                        ("cart_items", CartItem), ("flagged_transactions", FlaggedTransaction),
                        ("hardware_readings", HardwareReading)):
        counts[name] = model.query.delete(synchronize_session=False)
    counts["customer_accounts"] = User.query.filter(User.role != "admin").delete(synchronize_session=False)
    User.query.update({"wallet_balance": 0, "shopping_budget": None}, synchronize_session=False)
    removed = 0
    if data.get("remove_sample_electronics"):
        for product in Product.query.filter(Product.qr_code.in_(SAMPLE_ELECTRONICS),
                                            Product.deleted_at.is_(None)).all():
            product.deleted_at = utcnow()
            product.status = "draft"
            product.qr_code = f"deleted-{product.id}-{product.qr_code}"[:120]
            removed += 1
    counts["sample_products_removed"] = removed
    db.session.commit()
    cache.products.clear("reset for demo")
    cache.exit_feed._events.clear()
    current_app.logger.warning("Reset for demo by %s: %s", user.email, counts)
    return jsonify(ok=True, removed=counts)
