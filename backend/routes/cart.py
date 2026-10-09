from flask import Blueprint, jsonify

from extensions import db
from models import CartItem
from cache import products as product_cache
from services import error, hardware_mode, json_body, login_required, to_int

bp = Blueprint("cart", __name__, url_prefix="/api/cart")
MAX_QTY = 99


def cart_payload(user):
    items = (CartItem.query.filter_by(user_id=user.id)
             .options(db.joinedload(CartItem.product))          # one query, not one per item
             .order_by(CartItem.added_at.asc(), CartItem.id.asc()).all())
    lines = [i.to_dict() for i in items]
    return {
        "items": lines,
        "item_count": sum(line["quantity"] for line in lines),
        "subtotal": round(sum(line["line_total"] for line in lines), 2),
        "savings": round(sum(line["line_saving"] for line in lines), 2),
        "budget": float(user.shopping_budget) if user.shopping_budget is not None else None,
        "hardware_mode": hardware_mode(),
        "wallet_balance": float(user.wallet_balance or 0),
    }


def add_to_cart(user, product, quantity=1):
    """Shared by /cart/items, /scan and admin flag approval. Caller commits.
    `product` can be a Product row or a cached ProductSnapshot (only id/name/stock are used).
    Returns (cart_item, None) or (None, error_response)."""
    item = CartItem.query.filter_by(user_id=user.id, product_id=product.id).first()
    new_qty = (item.quantity if item else 0) + quantity
    if new_qty > MAX_QTY:
        return None, error(f"You can add at most {MAX_QTY} of one item", 409)
    if new_qty > product.stock:
        return None, error(f"Only {product.stock} of {product.name} left in stock", 409)
    if item:
        item.quantity = new_qty
    else:
        item = CartItem(user_id=user.id, product_id=product.id, quantity=quantity)
        db.session.add(item)
    return item, None


@bp.get("")
@login_required
def view_cart(user):
    return jsonify(cart_payload(user))


@bp.post("/items")
@login_required
def add_item(user):
    # With hardware verification on, items may ONLY enter the cart through /api/scan,
    # otherwise the weight/camera check could simply be skipped.
    if hardware_mode() != "off":
        return error("Verification is on - scan the item at the cart to add it.", 403)
    data = json_body()
    product_id = to_int(data.get("product_id"))
    quantity = to_int(data.get("quantity", 1))
    if product_id is None or quantity is None or not 1 <= quantity <= MAX_QTY:
        return error("Send product_id and a quantity between 1 and 99", 422)
    product = product_cache.get(product_id)
    if product is None:
        return error("Product not found", 404)
    _, problem = add_to_cart(user, product, quantity)
    if problem:
        return problem
    db.session.commit()
    return jsonify(cart_payload(user)), 201


@bp.patch("/items/<int:item_id>")
@login_required
def update_item(user, item_id):
    item = CartItem.query.filter_by(id=item_id, user_id=user.id).first()
    if item is None:
        return error("Cart item not found", 404)
    quantity = to_int(json_body().get("quantity"))
    if quantity is None:
        return error("Send quantity as a whole number", 422)
    if quantity <= 0:
        db.session.delete(item)
    else:
        if quantity > item.quantity and hardware_mode() != "off":
            return error("Scan the item again to add another one.", 403)
        if quantity > MAX_QTY:
            return error(f"You can add at most {MAX_QTY} of one item", 409)
        if quantity > item.product.stock:
            return error(f"Only {item.product.stock} of {item.product.name} left in stock", 409)
        item.quantity = quantity
    db.session.commit()
    return jsonify(cart_payload(user))


@bp.delete("/items/<int:item_id>")
@login_required
def remove_item(user, item_id):
    item = CartItem.query.filter_by(id=item_id, user_id=user.id).first()
    if item is None:
        return error("Cart item not found", 404)
    db.session.delete(item)
    db.session.commit()
    return jsonify(cart_payload(user))


@bp.delete("")
@login_required
def clear_cart(user):
    CartItem.query.filter_by(user_id=user.id).delete()
    db.session.commit()
    return jsonify(cart_payload(user))
