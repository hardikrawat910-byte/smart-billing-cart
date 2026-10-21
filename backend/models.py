"""All 14 database tables (SQLAlchemy ORM). seed.py creates them in MySQL."""
from datetime import datetime, timezone

from extensions import db
from store import aisle_for


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(dt):
    return dt.isoformat(timespec="seconds") + "Z" if dt else None


def num(value):
    return float(value) if value is not None else None


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), nullable=False, unique=True)
    password_hash = db.Column(db.String(255), nullable=False)    # "!google" = Google sign-in only
    google_sub = db.Column(db.String(64), unique=True)               # Google account id, if linked
    organization = db.Column(db.String(120))
    role = db.Column(db.Enum("user", "admin", name="user_role"), nullable=False, default="user")
    wallet_balance = db.Column(db.Numeric(10, 2), nullable=False, default=0)   # CartLess Wallet (INR)
    shopping_budget = db.Column(db.Numeric(10, 2))     # optional spending limit for a shopping trip
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "full_name": self.full_name,
            "email": self.email,
            "organization": self.organization,
            "role": self.role,
            "has_password": self.has_password,
            "wallet_balance": num(self.wallet_balance or 0),
            "google_linked": self.google_sub is not None,
            "budget": num(self.shopping_budget),
            "created_at": iso(self.created_at),
        }

    @property
    def has_password(self):
        return not (self.password_hash or "!").startswith("!")


class Product(db.Model):
    __tablename__ = "products"
    __table_args__ = (
        db.CheckConstraint("price >= 0", name="ck_products_price"),
        db.CheckConstraint("stock >= 0", name="ck_products_stock"),
        db.CheckConstraint(
            "weight_min_g IS NULL OR weight_max_g IS NULL OR weight_min_g <= weight_max_g",
            name="ck_products_weight_range",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    category = db.Column(db.String(60), nullable=False)
    description = db.Column(db.Text)
    image_url = db.Column(db.String(500))
    price = db.Column(db.Numeric(10, 2), nullable=False)
    mrp = db.Column(db.Numeric(10, 2))           # printed MRP; above the price = an offer ("Save Rs X")
    stock = db.Column(db.Integer, nullable=False, default=0)
    qr_code = db.Column(db.String(120), nullable=False, unique=True)   # value in the QR/barcode label
    weight_min_g = db.Column(db.Numeric(8, 1))                          # expected weight range
    weight_max_g = db.Column(db.Numeric(8, 1))
    ref_color = db.Column(db.String(7))                                 # reference colour #rrggbb
    status = db.Column(db.Enum("draft", "published", name="product_status"),
                       nullable=False, default="draft")
    deleted_at = db.Column(db.DateTime)                                 # soft delete
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    def to_dict(self, admin=False):
        data = {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "description": self.description,
            "image_url": self.image_url,
            "price": num(self.price),
            "mrp": num(self.mrp) if self.on_offer else None,
            "stock": self.stock,
            "in_stock": self.stock > 0,
            "qr_code": self.qr_code,
            "tint": self.ref_color,          # pack colour: tints the tile when there is no photo
            "aisle": aisle_for(self.category),
        }
        if admin:
            data.update(
                weight_min_g=num(self.weight_min_g),
                weight_max_g=num(self.weight_max_g),
                ref_color=self.ref_color,
                status=self.status,
                mrp=num(self.mrp),
                updated_at=iso(self.updated_at),
            )
        return data

    @property
    def on_offer(self):
        return self.mrp is not None and self.price is not None and self.mrp > self.price


class CartItem(db.Model):
    __tablename__ = "cart_items"
    __table_args__ = (
        db.UniqueConstraint("user_id", "product_id", name="uq_cart_user_product"),
        db.CheckConstraint("quantity BETWEEN 1 AND 99", name="ck_cart_quantity"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    added_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    product = db.relationship("Product")

    def to_dict(self):
        p = self.product
        return {
            "id": self.id,
            "product_id": p.id,
            "name": p.name,
            "category": p.category,
            "image_url": p.image_url,
            "tint": p.ref_color,
            "aisle": aisle_for(p.category),
            "price": num(p.price),
            "mrp": num(p.mrp) if p.on_offer else None,
            "stock": p.stock,
            "quantity": self.quantity,
            "line_total": num(p.price * self.quantity),
            "line_saving": num((p.mrp - p.price) * self.quantity) if p.on_offer else 0.0,
        }


class Order(db.Model):
    __tablename__ = "orders"
    __table_args__ = (
        db.UniqueConstraint("user_id", "idempotency_key", name="uq_orders_idempotency"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    total_amount = db.Column(db.Numeric(10, 2), nullable=False)
    status = db.Column(db.Enum("completed", "cancelled", name="order_status"),
                       nullable=False, default="completed")
    idempotency_key = db.Column(db.String(64))
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    # Exit gate: set when staff scan the bill QR as the customer leaves (a bill works once).
    exit_verified_at = db.Column(db.DateTime)
    exit_verified_by = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    exit_verified_device = db.Column(db.String(40))      # e.g. "rpi-cart" when the Pi camera read it
    payment_method = db.Column(db.String(20))            # "wallet" (NULL = order from before the wallet)
    payment_ref = db.Column(db.Integer)                  # wallet_transactions.id of the payment

    user = db.relationship("User", foreign_keys=[user_id])
    exit_staff = db.relationship("User", foreign_keys=[exit_verified_by])
    items = db.relationship("OrderItem", backref="order", cascade="all, delete-orphan",
                            lazy="selectin")

    def to_dict(self, with_items=True):
        data = {
            "id": self.id,
            "number": f"SC-{self.id:06d}",
            "total_amount": num(self.total_amount),
            "status": self.status,
            "created_at": iso(self.created_at),
            "item_count": sum(i.quantity for i in self.items),
            "exited": self.exit_verified_at is not None,
            "exit_verified_at": iso(self.exit_verified_at),
            "exit_by": self.exit_by_label(),
            "payment": {"method": self.payment_method or "legacy",
                        "ref": f"W-{self.payment_ref:06d}" if self.payment_ref else None},
            "savings": num(sum(((i.unit_mrp - i.unit_price) * i.quantity for i in self.items
                                if i.unit_mrp is not None and i.unit_mrp > i.unit_price), 0)),
        }
        if with_items:
            data["items"] = [i.to_dict() for i in self.items]
        return data

    def exit_by_label(self):
        if self.exit_verified_at is None:
            return None
        if self.exit_verified_device:
            return f"Pi camera gate ({self.exit_verified_device})"
        return self.exit_staff.full_name if self.exit_staff else "staff"


class OrderItem(db.Model):
    __tablename__ = "order_items"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    product_name = db.Column(db.String(120), nullable=False)       # snapshot at purchase
    quantity = db.Column(db.Integer, nullable=False)
    unit_price = db.Column(db.Numeric(10, 2), nullable=False)      # snapshot at purchase
    unit_mrp = db.Column(db.Numeric(10, 2))                         # MRP at purchase, when on offer

    def to_dict(self):
        return {
            "id": self.id,
            "product_id": self.product_id,
            "name": self.product_name,
            "quantity": self.quantity,
            "unit_price": num(self.unit_price),
            "unit_mrp": num(self.unit_mrp),
            "line_total": num(self.unit_price * self.quantity),
        }


class HardwareReading(db.Model):
    """Every weight reading (ESP32 #2) and camera photo (ESP32-CAM) that reaches the server."""
    __tablename__ = "hardware_readings"

    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.String(40), nullable=False)
    kind = db.Column(db.Enum("weight", "image", name="reading_kind"), nullable=False)
    weight_g = db.Column(db.Numeric(8, 1))
    image_file = db.Column(db.String(120))
    color_hex = db.Column(db.String(7))
    consumed_at = db.Column(db.DateTime)          # set once used for a scan (no replaying)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow, index=True)

    def to_dict(self):
        age = (utcnow() - self.created_at).total_seconds() if self.created_at else None
        return {
            "id": self.id,
            "device_id": self.device_id,
            "kind": self.kind,
            "weight_g": num(self.weight_g),
            "color_hex": self.color_hex,
            "image_url": _image_url(self.image_file),
            "consumed": self.consumed_at is not None,
            "created_at": iso(self.created_at),
            "age_sec": round(age, 1) if age is not None else None,
        }


class FlaggedTransaction(db.Model):
    """A scan where barcode, weight and camera did NOT agree - kept for staff review."""
    __tablename__ = "flagged_transactions"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    scanned_code = db.Column(db.String(120), nullable=False)
    measured_weight_g = db.Column(db.Numeric(8, 1))
    expected_min_g = db.Column(db.Numeric(8, 1))
    expected_max_g = db.Column(db.Numeric(8, 1))
    measured_color = db.Column(db.String(7))
    expected_color = db.Column(db.String(7))
    color_distance = db.Column(db.Numeric(6, 1))
    reasons = db.Column(db.String(255), nullable=False)
    status = db.Column(db.Enum("open", "approved", "rejected", name="flag_status"),
                       nullable=False, default="open")
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    resolved_at = db.Column(db.DateTime)
    resolved_by = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))

    user = db.relationship("User", foreign_keys=[user_id])
    product = db.relationship("Product")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "user_name": self.user.full_name if self.user else None,
            "user_email": self.user.email if self.user else None,
            "product_id": self.product_id,
            "product_name": self.product.name if self.product else None,
            "scanned_code": self.scanned_code,
            "measured_weight_g": num(self.measured_weight_g),
            "expected_weight_g": [num(self.expected_min_g), num(self.expected_max_g)],
            "measured_color": self.measured_color,
            "expected_color": self.expected_color,
            "color_distance": num(self.color_distance),
            "reasons": [r for r in (self.reasons or "").split(",") if r],
            "status": self.status,
            "created_at": iso(self.created_at),
            "resolved_at": iso(self.resolved_at),
        }


class Setting(db.Model):
    """Settings the admin can change from the website without restarting (e.g. hardware mode)."""
    __tablename__ = "settings"

    name = db.Column(db.String(40), primary_key=True)
    value = db.Column(db.String(255), nullable=False)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)


class WalletTransaction(db.Model):
    """Every change to a wallet: top-up at the counter, payment for a bill, refund/adjustment."""
    __tablename__ = "wallet_transactions"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = db.Column(db.Enum("topup", "payment", "refund", "adjust", name="wallet_kind"), nullable=False)
    amount = db.Column(db.Numeric(10, 2), nullable=False)            # + money in, - money out
    balance_after = db.Column(db.Numeric(10, 2), nullable=False)
    method = db.Column(db.String(20))                                  # cash / upi / wallet / staff
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id", ondelete="SET NULL"))
    topup_id = db.Column(db.Integer, db.ForeignKey("topup_requests.id", ondelete="SET NULL"))
    note = db.Column(db.String(160))
    created_by = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    user = db.relationship("User", foreign_keys=[user_id])
    staff = db.relationship("User", foreign_keys=[created_by])

    def to_dict(self, with_user=False):
        data = {
            "id": self.id,
            "number": f"W-{self.id:06d}",
            "kind": self.kind,
            "amount": num(self.amount),
            "balance_after": num(self.balance_after),
            "method": self.method,
            "order_id": self.order_id,
            "order_number": f"SC-{self.order_id:06d}" if self.order_id else None,
            "note": self.note,
            "staff": self.staff.full_name if self.staff else None,
            "created_at": iso(self.created_at),
        }
        if with_user and self.user:
            data.update(user_name=self.user.full_name, user_email=self.user.email)
        return data


class TopupRequest(db.Model):
    """A customer asks to add money; they pay staff (cash/UPI) and staff confirm the token."""
    __tablename__ = "topup_requests"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    status = db.Column(db.Enum("pending", "paid", "cancelled", name="topup_status"), nullable=False,
                       default="pending")
    method = db.Column(db.String(10))                                  # cash / upi, set when paid
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    paid_at = db.Column(db.DateTime)
    confirmed_by = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))

    user = db.relationship("User", foreign_keys=[user_id])
    staff = db.relationship("User", foreign_keys=[confirmed_by])

    def to_dict(self, with_user=False):
        data = {
            "id": self.id,
            "number": f"T-{self.id:06d}",
            "amount": num(self.amount),
            "status": self.status,
            "method": self.method,
            "created_at": iso(self.created_at),
            "paid_at": iso(self.paid_at),
            "confirmed_by": self.staff.full_name if self.staff else None,
        }
        if with_user and self.user:
            data.update(user_name=self.user.full_name, user_email=self.user.email,
                        user_balance=num(self.user.wallet_balance or 0))
        return data


class ProductImage(db.Model):
    """A product photo taken in the admin form, kept in MySQL (the free host's disk is temporary)."""
    __tablename__ = "product_images"

    product_id = db.Column(db.Integer, db.ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    mime = db.Column(db.String(20), nullable=False, default="image/jpeg")
    data = db.Column(db.LargeBinary(length=16 * 1024 * 1024), nullable=False)    # MEDIUMBLOB
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)


class CartAlert(db.Model):
    """Something was put on the cart's scale but no item was scanned in time."""
    __tablename__ = "cart_alerts"

    id = db.Column(db.Integer, primary_key=True)
    reading_id = db.Column(db.Integer, db.ForeignKey("hardware_readings.id", ondelete="CASCADE"),
                           nullable=False, unique=True)
    device_id = db.Column(db.String(40), nullable=False)
    weight_g = db.Column(db.Numeric(8, 1), nullable=False)
    status = db.Column(db.Enum("open", "scanned", "removed", "dismissed", name="alert_status"),
                       nullable=False, default="open")
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    resolved_at = db.Column(db.DateTime)

    def to_dict(self):
        age = (utcnow() - self.created_at).total_seconds()
        return {
            "id": self.id,
            "reading_id": self.reading_id,
            "device_id": self.device_id,
            "weight_g": num(self.weight_g),
            "status": self.status,
            "created_at": iso(self.created_at),
            "resolved_at": iso(self.resolved_at),
            "age_sec": round(age, 1),
        }


class ShoppingListItem(db.Model):
    """What the shopper plans to buy. Ticks itself off when the item is in the cart."""
    __tablename__ = "shopping_list_items"
    __table_args__ = (
        db.UniqueConstraint("user_id", "product_id", name="uq_list_user_product"),
        db.CheckConstraint("quantity BETWEEN 1 AND 99", name="ck_list_quantity"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    product = db.relationship("Product")

    def to_dict(self, in_cart=0):
        p = self.product
        return {
            "id": self.id,
            "product_id": p.id,
            "name": p.name,
            "category": p.category,
            "aisle": aisle_for(p.category),
            "image_url": p.image_url,
            "tint": p.ref_color,
            "price": num(p.price),
            "mrp": num(p.mrp) if p.on_offer else None,
            "in_stock": p.stock > 0 and p.status == "published" and p.deleted_at is None,
            "quantity": self.quantity,
            "in_cart": in_cart,
            "done": in_cart >= self.quantity,
        }


HELP_REASONS = {
    "wont_scan": "An item won't scan",
    "weight": "The cart or exit gate is not working",
    "payment": "Help with the wallet or payment",
    "find": "Can't find an item",
    "other": "Something else",
}


class HelpRequest(db.Model):
    """A shopper pressed "Call staff". Staff see it on their pages and reply "On my way"."""
    __tablename__ = "help_requests"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    reason = db.Column(db.String(20), nullable=False)
    note = db.Column(db.String(160))
    location = db.Column(db.String(60))               # e.g. "Aisle 3" or the page they asked from
    status = db.Column(db.Enum("open", "coming", "done", "cancelled", name="help_status"),
                       nullable=False, default="open")
    staff_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    user = db.relationship("User", foreign_keys=[user_id])
    staff = db.relationship("User", foreign_keys=[staff_id])

    def to_dict(self):
        age = (utcnow() - self.created_at).total_seconds() if self.created_at else None
        return {
            "id": self.id,
            "reason": self.reason,
            "reason_text": HELP_REASONS.get(self.reason, self.reason),
            "note": self.note,
            "location": self.location,
            "status": self.status,
            "user_name": self.user.full_name if self.user else None,
            "staff_name": self.staff.full_name if self.staff else None,
            "created_at": iso(self.created_at),
            "age_sec": round(age) if age is not None else None,
        }


def _image_url(filename):
    from services import image_url          # services imports models, so import here
    return image_url(filename)
