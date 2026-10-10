"""SmartCart Wallet: customers pay their bills from a wallet balance.

Money gets into the wallet with a top-up TOKEN:
  1. the customer chooses an amount on the Wallet page -> a token T-000042 with a QR
  2. they pay that amount at the counter (cash or UPI)
  3. staff scan the token on the Wallet counter page and press "Cash received" / "UPI received"
  4. the wallet is credited at once; checkout then pays bills from it.
Every change is written to wallet_transactions with the balance after it, so the
history always adds up. Balances are changed only under a row lock (no double spending).
"""
from decimal import Decimal, InvalidOperation

from flask import Blueprint, current_app, jsonify, request
from sqlalchemy import func

from cache import counter_feed, devices
from extensions import db
from models import TopupRequest, User, WalletTransaction, utcnow
from services import (admin_required, error, json_body, login_required, parse_topup_code,
                      to_int, topup_code, topup_signature_ok)

bp = Blueprint("wallet", __name__, url_prefix="/api/wallet")
counter_bp = Blueprint("counter", __name__, url_prefix="/api/counter")
CENT = Decimal("0.01")
MAX_PENDING = 3


def parse_amount(raw, maximum=None):
    """Rupees with up to 2 decimals, 1 .. maximum. Returns (Decimal, None) or (None, message)."""
    maximum = Decimal(str(maximum or current_app.config["WALLET_MAX_TOPUP"]))
    try:
        amount = Decimal(str(raw).strip()).quantize(CENT)
    except (InvalidOperation, ValueError):
        return None, "Enter the amount in rupees, e.g. 500"
    if not amount.is_finite() or amount < 1 or amount > maximum:
        return None, f"Amount must be between ₹1 and ₹{maximum:,.0f}"
    return amount, None


def locked_user(user_id):
    """The user's row, re-read and locked until commit (two payments can't both spend it)."""
    return User.query.filter_by(id=user_id).with_for_update().populate_existing().one()


def change_balance(user_id, amount, kind, method, staff=None, note=None, order_id=None, topup_id=None):
    """Adds (positive) or takes (negative) money and logs it. Caller commits.
    Returns the WalletTransaction, or None if the balance would go below zero."""
    user = locked_user(user_id)
    new_balance = (user.wallet_balance or Decimal("0")) + amount
    if new_balance < 0:
        return None
    user.wallet_balance = new_balance
    txn = WalletTransaction(user_id=user.id, kind=kind, amount=amount, balance_after=new_balance,
                            method=method, created_by=staff.id if staff else None, note=note,
                            order_id=order_id, topup_id=topup_id)
    db.session.add(txn)
    db.session.flush()
    return txn


def welcome_credit(user):
    """Optional demo money for new accounts (WALLET_WELCOME_AMOUNT, default 0). Caller commits."""
    amount = Decimal(str(current_app.config["WALLET_WELCOME_AMOUNT"])).quantize(CENT)
    if amount > 0:
        db.session.flush()
        change_balance(user.id, amount, "adjust", "welcome", note="Welcome tokens")


def upi_details():
    """The shop's UPI ID (set UPI_ID on Render) so customers can pay a top-up from any UPI app."""
    cfg = current_app.config
    return {"id": cfg["UPI_ID"], "name": cfg["UPI_PAYEE_NAME"]} if cfg["UPI_ID"] else None


def topup_payload(row, with_user=False):
    data = row.to_dict(with_user=with_user)
    if row.status == "pending":
        data["code"] = topup_code(row)
    return data


# ---------------- customer ----------------

@bp.get("")
@login_required
def wallet(user):
    txns = (WalletTransaction.query.filter_by(user_id=user.id)
            .order_by(WalletTransaction.id.desc()).limit(30).all())
    pending = (TopupRequest.query.filter_by(user_id=user.id, status="pending")
               .order_by(TopupRequest.id.desc()).all())
    return jsonify(balance=float(user.wallet_balance or 0),
                   transactions=[t.to_dict() for t in txns],
                   pending=[topup_payload(p) for p in pending],
                   max_topup=current_app.config["WALLET_MAX_TOPUP"], upi=upi_details())


@bp.post("/topups")
@login_required
def create_topup(user):
    amount, problem = parse_amount(json_body().get("amount"))
    if problem:
        return error(problem, 422, fields={"amount": problem})
    if TopupRequest.query.filter_by(user_id=user.id, status="pending").count() >= MAX_PENDING:
        return error("You already have 3 unpaid top-up tokens. Pay or cancel one first.", 409)
    row = TopupRequest(user_id=user.id, amount=amount, status="pending")
    db.session.add(row)
    db.session.commit()
    return jsonify(topup=topup_payload(row)), 201


@bp.get("/topups/<int:topup_id>")
@login_required
def get_topup(user, topup_id):
    row = TopupRequest.query.filter_by(id=topup_id, user_id=user.id).first()
    if row is None:
        return error("Top-up not found", 404)
    return jsonify(topup=topup_payload(row), balance=float(user.wallet_balance or 0))


@bp.post("/topups/<int:topup_id>/cancel")
@login_required
def cancel_topup(user, topup_id):
    row = TopupRequest.query.filter_by(id=topup_id, user_id=user.id).with_for_update().first()
    if row is None:
        return error("Top-up not found", 404)
    if row.status != "pending":
        return error(f"This token is already {row.status}", 409)
    row.status = "cancelled"
    db.session.commit()
    return jsonify(topup=topup_payload(row))


# ---------------- staff: the Wallet counter ----------------

@counter_bp.post("/lookup")
@admin_required
def lookup(staff):
    """Scanned or typed top-up token -> who it belongs to and how much they must pay."""
    topup_id, signature = parse_topup_code(json_body().get("code"))
    if topup_id is None:
        return error("That is not a SmartCart top-up token (looks like T-000042).", 422)
    row = db.session.get(TopupRequest, topup_id)
    if row is None or (signature is not None and not topup_signature_ok(row, signature)):
        return error("Token not recognised - it may be fake or edited.", 404)
    return jsonify(topup=topup_payload(row, with_user=True), scanned=signature is not None, upi=upi_details())


@counter_bp.post("/topups/<int:topup_id>/confirm")
@admin_required
def confirm(staff, topup_id):
    """Staff received the money: credit the wallet (exactly once)."""
    method = str(json_body().get("method") or "").lower()
    if method not in ("cash", "upi"):
        return error("method must be cash or upi", 422)
    row = TopupRequest.query.filter_by(id=topup_id).with_for_update().populate_existing().first()
    if row is None:
        return error("Top-up not found", 404)
    if row.status == "paid":
        who = row.staff.full_name if row.staff else "staff"
        return error(f"Already confirmed by {who} - do not take the money twice.", 409,
                     topup=topup_payload(row, with_user=True))
    if row.status == "cancelled":
        return error("The customer cancelled this token. Ask them to make a new one.", 409)
    label = "Cash" if method == "cash" else "UPI"
    txn = change_balance(row.user_id, row.amount, "topup", method, staff=staff,
                         note=f"{label} at the counter ({f'T-{row.id:06d}'})", topup_id=row.id)
    row.status, row.method, row.paid_at, row.confirmed_by = "paid", method, utcnow(), staff.id
    db.session.commit()
    return jsonify(topup=topup_payload(row, with_user=True), transaction=txn.to_dict())


@counter_bp.get("/overview")
@admin_required
def overview(staff):
    pending = (TopupRequest.query.filter_by(status="pending")
               .order_by(TopupRequest.id.desc()).limit(50).all())
    recent = WalletTransaction.query.order_by(WalletTransaction.id.desc()).limit(25).all()
    start = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    totals = dict(db.session.query(WalletTransaction.method, func.coalesce(func.sum(WalletTransaction.amount), 0))
                  .filter(WalletTransaction.kind == "topup", WalletTransaction.created_at >= start)
                  .group_by(WalletTransaction.method).all())
    after = to_int(request.args.get("pi_after"), 0) or 0
    return jsonify(pending=[topup_payload(p, with_user=True) for p in pending],
                   recent=[t.to_dict(with_user=True) for t in recent],
                   today={"cash": float(totals.get("cash", 0)), "upi": float(totals.get("upi", 0))},
                   # tokens held under the Pi camera since ?pi_after=<id> (shown on the counter page)
                   pi_scans=[e for e in counter_feed.since(after) if e["age_sec"] < 120],
                   pi_last_id=counter_feed.last_id(),
                   pi=pi_reader())


def pi_reader():
    """The Raspberry Pi program as the counter needs it: is it running, is its camera reading codes,
    and is it new enough to pass top-up tokens here (v2.8.4+ says so with the "tokens" role)."""
    pis = [d for d in devices.list() if d["device_id"].startswith("rpi") or "exit" in (d.get("roles") or [])]
    if not pis:
        return None
    d = pis[0]                                   # the most recently heard from
    roles = d.get("roles") or []
    return {"device_id": d["device_id"], "online": d["online"], "version": d.get("version"),
            "reads_codes": "exit" in roles and d.get("qr") not in (None, "off"),
            "reads_tokens": "tokens" in roles, "last_seen_sec": d["last_seen_sec"]}


@counter_bp.post("/credit")
@admin_required
def direct_credit(staff):
    """Add money to a customer found by email (refunds, prizes, demo money)."""
    data = json_body()
    email = str(data.get("email") or "").strip().lower()
    amount, problem = parse_amount(data.get("amount"))
    note = str(data.get("note") or "").strip()[:160] or "Added by staff"
    customer = User.query.filter_by(email=email).first()
    if customer is None:
        return error("No account with that email", 404, fields={"email": "Not found"})
    if problem:
        return error(problem, 422, fields={"amount": problem})
    txn = change_balance(customer.id, amount, "adjust", "staff", staff=staff, note=note)
    db.session.commit()
    return jsonify(transaction=txn.to_dict(with_user=True)), 201


@counter_bp.get("/customers")
@admin_required
def customers(staff):
    term = str(request.args.get("q") or "").strip()
    if len(term) < 2:
        return jsonify(customers=[])
    like = f"%{term}%"
    rows = (User.query.filter(db.or_(User.email.ilike(like), User.full_name.ilike(like)))
            .order_by(User.full_name).limit(to_int(request.args.get("limit"), 8) or 8).all())
    return jsonify(customers=[{"name": u.full_name, "email": u.email,
                               "balance": float(u.wallet_balance or 0)} for u in rows])
