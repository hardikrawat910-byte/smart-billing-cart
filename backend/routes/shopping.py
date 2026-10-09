"""Shopper extras found on real smart carts (Amazon Dash Cart, Instacart Caper):
a shopping list that ticks itself off, a spending budget, "buy again" and "often bought
together" suggestions, and a Call staff button that staff answer from their pages."""
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request
from sqlalchemy import func

from cache import products as product_cache
from extensions import db
from models import (HELP_REASONS, CartItem, HelpRequest, Order, OrderItem, Product, ShoppingListItem,
                    utcnow)
from services import admin_required, error, json_body, login_required, to_int

bp = Blueprint("shopping", __name__, url_prefix="/api")
LIST_MAX = 60


# ---------------- shopping list ----------------

def list_payload(user):
    rows = (ShoppingListItem.query.filter_by(user_id=user.id)
            .options(db.joinedload(ShoppingListItem.product)).all())
    in_cart = dict(db.session.query(CartItem.product_id, CartItem.quantity)
                   .filter(CartItem.user_id == user.id).all())
    items = [r.to_dict(in_cart=in_cart.get(r.product_id, 0)) for r in rows]
    # walking order: aisle by aisle, what's still to get first
    items.sort(key=lambda i: (i["done"], i["aisle"] or 99, i["name"]))
    left = [i for i in items if not i["done"]]
    return {"items": items, "count": len(items), "done": len(items) - len(left),
            "aisles_left": sorted({i["aisle"] for i in left if i["aisle"]}),
            "estimate": round(sum(i["price"] * i["quantity"] for i in items), 2)}


@bp.get("/list")
@login_required
def get_list(user):
    return jsonify(list_payload(user))


@bp.post("/list")
@login_required
def add_to_list(user):
    data = json_body()
    product = product_cache.get(to_int(data.get("product_id")))
    if product is None:
        return error("Product not found", 404)
    quantity = max(1, min(99, to_int(data.get("quantity"), 1) or 1))
    row = ShoppingListItem.query.filter_by(user_id=user.id, product_id=product.id).first()
    if row is None:
        if ShoppingListItem.query.filter_by(user_id=user.id).count() >= LIST_MAX:
            return error(f"Your list is full ({LIST_MAX} items). Tick some off first.", 409)
        db.session.add(ShoppingListItem(user_id=user.id, product_id=product.id, quantity=quantity))
    else:
        row.quantity = min(99, row.quantity + quantity) if data.get("add") else quantity
    db.session.commit()
    return jsonify(list_payload(user)), 201


@bp.patch("/list/<int:item_id>")
@login_required
def change_list_item(user, item_id):
    row = ShoppingListItem.query.filter_by(id=item_id, user_id=user.id).first()
    if row is None:
        return error("Not on your list", 404)
    quantity = to_int(json_body().get("quantity"))
    if quantity is None or quantity < 0 or quantity > 99:
        return error("quantity must be 0-99", 422)
    if quantity == 0:
        db.session.delete(row)
    else:
        row.quantity = quantity
    db.session.commit()
    return jsonify(list_payload(user))


@bp.delete("/list/<int:item_id>")
@login_required
def remove_list_item(user, item_id):
    ShoppingListItem.query.filter_by(id=item_id, user_id=user.id).delete()
    db.session.commit()
    return jsonify(list_payload(user))


@bp.delete("/list")
@login_required
def clear_list(user):
    """?done=1 clears only the ticked items (after shopping); otherwise everything."""
    q = ShoppingListItem.query.filter_by(user_id=user.id)
    if request.args.get("done"):
        in_cart = dict(db.session.query(CartItem.product_id, CartItem.quantity)
                       .filter(CartItem.user_id == user.id).all())
        for row in q.all():
            if in_cart.get(row.product_id, 0) >= row.quantity:
                db.session.delete(row)
    else:
        q.delete()
    db.session.commit()
    return jsonify(list_payload(user))


@bp.post("/list/from-order/<int:order_id>")
@login_required
def list_from_order(user, order_id):
    """"Shop this bill again": put every item of an old bill on the list."""
    order = Order.query.filter_by(id=order_id, user_id=user.id).first()
    if order is None:
        return error("Bill not found", 404)
    added = 0
    for item in order.items:
        if product_cache.get(item.product_id) is None:
            continue                       # no longer sold
        row = ShoppingListItem.query.filter_by(user_id=user.id, product_id=item.product_id).first()
        if row is None:
            db.session.add(ShoppingListItem(user_id=user.id, product_id=item.product_id,
                                            quantity=min(99, item.quantity)))
            added += 1
    db.session.commit()
    return jsonify({**list_payload(user), "added": added})


# ---------------- budget ----------------

@bp.put("/budget")
@login_required
def set_budget(user):
    raw = json_body().get("budget")
    if raw in (None, "", 0, "0"):
        user.shopping_budget = None
    else:
        try:
            value = Decimal(str(raw).strip()).quantize(Decimal("0.01"))
        except InvalidOperation:
            return error("Enter the budget in rupees, e.g. 500", 422, fields={"budget": "Must be a number"})
        if not value.is_finite() or value < 1 or value > 100000:
            return error("Budget must be between ₹1 and ₹1,00,000", 422, fields={"budget": "1 - 1,00,000"})
        user.shopping_budget = value
    db.session.commit()
    return jsonify(budget=float(user.shopping_budget) if user.shopping_budget is not None else None)


# ---------------- suggestions ----------------

def published(ids, limit):
    out = []
    for pid in ids:
        p = product_cache.get(pid)
        if p is not None and p.stock > 0 and p.to_dict() not in out:
            out.append(p.to_dict())
        if len(out) >= limit:
            break
    return out


@bp.get("/recommendations")
@login_required
def recommendations(user):
    """Buy again: what this shopper buys most often. Deals: everything on offer today."""
    rows = (db.session.query(OrderItem.product_id, func.sum(OrderItem.quantity).label("qty"),
                             func.max(Order.created_at).label("last"))
            .join(Order, Order.id == OrderItem.order_id)
            .filter(Order.user_id == user.id, Order.status == "completed")
            .group_by(OrderItem.product_id)
            .order_by(func.sum(OrderItem.quantity).desc(), func.max(Order.created_at).desc())
            .limit(30).all())
    deals = [p.to_dict() for p in product_cache.all() if p.to_dict().get("mrp")]
    deals.sort(key=lambda d: d["mrp"] - d["price"], reverse=True)
    return jsonify(buy_again=published([r.product_id for r in rows], 10), deals=deals)


@bp.get("/products/<int:product_id>/related")
def related(product_id):
    """Often bought together (from real bills), topped up with items from the same section."""
    product = product_cache.get(product_id)
    if product is None:
        return error("Product not found", 404)
    bills = db.session.query(OrderItem.order_id).filter(OrderItem.product_id == product_id)
    together = (db.session.query(OrderItem.product_id, func.count(OrderItem.order_id).label("n"))
                .filter(OrderItem.order_id.in_(bills), OrderItem.product_id != product_id)
                .group_by(OrderItem.product_id).order_by(func.count(OrderItem.order_id).desc())
                .limit(12).all())
    picks = published([pid for pid, _ in together], 6)
    from_bills = len(picks)
    if len(picks) < 6:
        taken = {p["id"] for p in picks} | {product_id}
        same = [p.id for p in product_cache.all() if p.category == product.category and p.id not in taken]
        picks += published(same, 6 - len(picks))
    return jsonify(products=picks, from_bills=from_bills)


# ---------------- call staff ----------------

def help_payload(row):
    return row.to_dict() if row else None


@bp.post("/help")
@login_required
def ask_for_help(user):
    data = json_body()
    reason = str(data.get("reason") or "other")
    if reason not in HELP_REASONS:
        return error("Pick a reason", 422)
    open_row = (HelpRequest.query.filter(HelpRequest.user_id == user.id,
                                         HelpRequest.status.in_(("open", "coming")))
                .order_by(HelpRequest.id.desc()).first())
    if open_row:                       # one call at a time; update what they need
        open_row.reason = reason
        open_row.note = str(data.get("note") or "").strip()[:160] or open_row.note
        open_row.location = str(data.get("location") or "").strip()[:60] or open_row.location
        db.session.commit()
        return jsonify(help=help_payload(open_row))
    row = HelpRequest(user_id=user.id, reason=reason, note=str(data.get("note") or "").strip()[:160] or None,
                      location=str(data.get("location") or "").strip()[:60] or None)
    db.session.add(row)
    db.session.commit()
    return jsonify(help=help_payload(row)), 201


@bp.get("/help/mine")
@login_required
def my_help(user):
    row = (HelpRequest.query.filter(HelpRequest.user_id == user.id,
                                    HelpRequest.status.in_(("open", "coming")))
           .order_by(HelpRequest.id.desc()).first())
    return jsonify(help=help_payload(row))


@bp.post("/help/<int:help_id>/cancel")
@login_required
def cancel_help(user, help_id):
    row = HelpRequest.query.filter_by(id=help_id, user_id=user.id).first()
    if row is None:
        return error("Not found", 404)
    if row.status in ("open", "coming"):
        row.status = "cancelled"
        db.session.commit()
    return jsonify(help=help_payload(row))


@bp.get("/admin/help")
@admin_required
def staff_help_list(staff):
    """Open calls for staff pages (polled), plus the last few finished ones."""
    open_rows = (HelpRequest.query.filter(HelpRequest.status.in_(("open", "coming")))
                 .order_by(HelpRequest.id.asc()).all())
    return jsonify(help=[r.to_dict() for r in open_rows])


@bp.post("/admin/help/<int:help_id>/<action>")
@admin_required
def staff_help_action(staff, help_id, action):
    if action not in ("coming", "done"):
        return error("action must be coming or done", 422)
    row = db.session.get(HelpRequest, help_id)
    if row is None:
        return error("Not found", 404)
    if row.status in ("done", "cancelled"):
        return jsonify(help=help_payload(row))
    row.status = action
    row.staff_id = staff.id
    row.updated_at = utcnow()
    db.session.commit()
    return jsonify(help=help_payload(row))
