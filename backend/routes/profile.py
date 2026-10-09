from flask import Blueprint, jsonify
from sqlalchemy import func
from werkzeug.security import check_password_hash, generate_password_hash

from extensions import db
from models import Order
from services import error, json_body, login_required

bp = Blueprint("profile", __name__, url_prefix="/api/profile")


@bp.get("")
@login_required
def get_profile(user):
    count, spent = (db.session.query(func.count(Order.id), func.coalesce(func.sum(Order.total_amount), 0))
                    .filter(Order.user_id == user.id).one())
    return jsonify(user=user.to_dict(), stats={"order_count": count, "total_spent": float(spent)})


@bp.put("")
@login_required
def update_profile(user):
    data = json_body()
    full_name = str(data.get("full_name") or "").strip()
    organization = str(data.get("organization") or "").strip()
    new_password = str(data.get("new_password") or "")

    fields = {}
    if not 2 <= len(full_name) <= 120:
        fields["full_name"] = "Please enter your full name"
    if len(organization) > 120:
        fields["organization"] = "Max 120 characters"
    if new_password:
        # Google-only accounts have no password yet, so they can set one without the old one.
        if user.has_password and not check_password_hash(user.password_hash,
                                                         str(data.get("current_password") or "")):
            fields["current_password"] = "Current password is incorrect"
        elif not 8 <= len(new_password) <= 72:
            fields["new_password"] = "New password must be 8-72 characters"
    if fields:
        return error(next(iter(fields.values())), 422, fields=fields)

    user.full_name = full_name
    user.organization = organization or None
    if new_password:
        user.password_hash = generate_password_hash(new_password)
    db.session.commit()
    return jsonify(user=user.to_dict())
