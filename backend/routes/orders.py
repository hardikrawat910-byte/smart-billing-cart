from decimal import Decimal

from flask import Blueprint, jsonify
from sqlalchemy.exc import IntegrityError

from cache import products as product_cache
from extensions import db
from models import CartItem, Order, OrderItem, Product, ShoppingListItem
from routes.wallet import change_balance, locked_user
from services import bill_code, error, json_body, login_required

bp = Blueprint("orders", __name__, url_prefix="/api")


def order_payload(order):
    """Full bill for its owner (or an admin), including the signed exit-gate code."""
    data = order.to_dict()
    data["exit_code"] = bill_code(order)
    return data


@bp.post("/checkout")
@login_required
def checkout(user):
    """Atomic checkout, paid from the SmartCart Wallet: prices come from the DB (never the
    browser), stock and the wallet are locked, and the idempotency key stops a retried
    request from billing twice. Not enough money -> nothing is charged or reserved."""
    key = str(json_body().get("idempotency_key") or "").strip()
    if not 8 <= len(key) <= 64:
        return error("A valid idempotency_key (8-64 characters) is required", 422)

    existing = Order.query.filter_by(user_id=user.id, idempotency_key=key).first()
    if existing:
        return jsonify(order=existing.to_dict(), replayed=True)

    lines = CartItem.query.filter_by(user_id=user.id).with_for_update().all()
    if not lines:
        return error("Your cart is empty", 400)
    ids = [line.product_id for line in lines]
    products = {p.id: p for p in Product.query.filter(Product.id.in_(ids)).with_for_update().all()}

    problems, total = [], Decimal("0.00")
    for line in lines:
        p = products[line.product_id]
        if p.deleted_at is not None or p.status != "published":
            problems.append(f"{p.name} is no longer available")
        elif line.quantity > p.stock:
            problems.append(f"only {p.stock} of {p.name} left")
        total += p.price * line.quantity
    if problems:
        db.session.rollback()
        return error("Please update your cart: " + "; ".join(problems), 409, problems=problems)

    balance = locked_user(user.id).wallet_balance or Decimal("0")
    if balance < total:
        db.session.rollback()
        short = total - balance
        return error(f"Not enough money in your wallet: the bill is ₹{total:,.2f}, your wallet has "
                     f"₹{balance:,.2f}. Add ₹{short:,.2f} at the counter first.", 409,
                     code="insufficient_funds", total=float(total), balance=float(balance),
                     shortfall=float(short))

    order = Order(user_id=user.id, total_amount=total, status="completed", idempotency_key=key,
                  payment_method="wallet")
    # bought = crossed off the shopping list (what's left stays for next time)
    bought = {line.product_id: line.quantity for line in lines}
    for row in ShoppingListItem.query.filter(ShoppingListItem.user_id == user.id,
                                             ShoppingListItem.product_id.in_(list(bought))).all():
        if bought[row.product_id] >= row.quantity:
            db.session.delete(row)
        else:
            row.quantity -= bought[row.product_id]
    for line in lines:
        p = products[line.product_id]
        order.items.append(OrderItem(product_id=p.id, product_name=p.name, quantity=line.quantity,
                                     unit_price=p.price, unit_mrp=p.mrp if p.on_offer else None))
        p.stock -= line.quantity
        db.session.delete(line)
    db.session.add(order)
    try:
        db.session.flush()
        txn = change_balance(user.id, -total, "payment", "wallet", order_id=order.id,
                             note=f"Bill SC-{order.id:06d}")
        order.payment_ref = txn.id
        db.session.commit()
    except IntegrityError:            # same key submitted twice at the same moment
        db.session.rollback()
        existing = Order.query.filter_by(user_id=user.id, idempotency_key=key).first()
        if existing:
            return jsonify(order=existing.to_dict(), replayed=True)
        raise
    product_cache.clear("checkout changed stock")
    return jsonify(order=order.to_dict(), wallet_balance=float(txn.balance_after)), 201


@bp.get("/orders")
@login_required
def list_orders(user):
    orders = (Order.query.filter_by(user_id=user.id)
              .order_by(Order.created_at.desc(), Order.id.desc()).all())
    return jsonify(orders=[o.to_dict(with_items=False) for o in orders])


@bp.get("/orders/<int:order_id>")
@login_required
def get_order(user, order_id):
    order = db.session.get(Order, order_id)
    if order is None or (order.user_id != user.id and user.role != "admin"):
        return error("Order not found", 404)
    return jsonify(order=order_payload(order))
