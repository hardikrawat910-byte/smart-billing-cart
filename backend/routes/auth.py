import re

from flask import Blueprint, current_app, jsonify
from flask_jwt_extended import create_access_token
from werkzeug.security import check_password_hash, generate_password_hash

from extensions import db
from models import User
from routes.wallet import welcome_credit
from security import login_guard, verify_google_token
from services import error, json_body, login_required

bp = Blueprint("auth", __name__, url_prefix="/api/auth")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
GOOGLE_ONLY = "!google"          # password_hash of an account that only signs in with Google


def session_payload(user):
    return {"token": create_access_token(identity=str(user.id)), "user": user.to_dict()}


@bp.get("/config")
def auth_config():
    """Tells the login page whether to show the Google button."""
    return jsonify(google_client_id=current_app.config["GOOGLE_CLIENT_ID"] or None)


@bp.post("/register")
def register():
    data = json_body()
    full_name = str(data.get("full_name") or "").strip()
    email = str(data.get("email") or "").strip().lower()
    password = str(data.get("password") or "")

    fields = {}
    if not 2 <= len(full_name) <= 120:
        fields["full_name"] = "Please enter your full name"
    if len(email) > 255 or not EMAIL_RE.match(email):
        fields["email"] = "Enter a valid email address"
    if not 8 <= len(password) <= 72:
        fields["password"] = "Password must be 8-72 characters"
    if fields:
        return error("Please fix the highlighted fields", 422, fields=fields)
    if User.query.filter_by(email=email).first():
        return error("An account with this email already exists", 409,
                     fields={"email": "Already registered - log in instead"})

    user = User(full_name=full_name, email=email, password_hash=generate_password_hash(password))
    db.session.add(user)
    welcome_credit(user)
    db.session.commit()
    return jsonify(session_payload(user)), 201


@bp.post("/login")
def login():
    data = json_body()
    email = str(data.get("email") or "").strip().lower()
    password = str(data.get("password") or "")

    wait = login_guard.wait_seconds(email)
    if wait:
        minutes = max(1, round(wait / 60))
        return error(f"Too many wrong passwords. Try again in {minutes} minute{'s' if minutes > 1 else ''}.",
                     429, retry_after_sec=wait)

    user = User.query.filter_by(email=email).first()
    if user is None or not check_password_hash(user.password_hash, password):
        login_guard.failed(email)
        if user is not None and not user.has_password:
            return error("This account uses Google sign-in. Press 'Continue with Google'.", 401)
        return error("Invalid email or password", 401)
    login_guard.succeeded(email)
    return jsonify(session_payload(user))


@bp.post("/google")
def google_login():
    """The login page sends the token from Google's 'Continue with Google' button.
    We check it with Google's public keys, then log in (or create) the matching account.
    The password never reaches this server."""
    credential = str(json_body().get("credential") or "")
    if not credential:
        return error("Missing Google credential", 422)
    try:
        claims = verify_google_token(credential)
    except Exception as exc:          # bad signature, wrong app, expired, Google unreachable...
        current_app.logger.warning("Google sign-in rejected: %s", exc)
        return error("Google sign-in failed: " + str(exc)[:160], 401)

    sub = str(claims["sub"])
    email = str(claims["email"]).strip().lower()
    name = str(claims.get("name") or email.split("@")[0])[:120]

    user = User.query.filter_by(google_sub=sub).first()
    created = False
    if user is None:
        user = User.query.filter_by(email=email).first()
        if user is not None:
            if user.google_sub and user.google_sub != sub:
                return error("This email is linked to a different Google account", 409)
            user.google_sub = sub          # Google proved they own this email: link it
        else:
            user = User(full_name=name if len(name) >= 2 else email, email=email,
                        password_hash=GOOGLE_ONLY, google_sub=sub)
            db.session.add(user)
            welcome_credit(user)
            created = True
    if email in current_app.config["ADMIN_GOOGLE_EMAILS"] and user.role != "admin":
        user.role = "admin"
    db.session.commit()
    login_guard.succeeded(email)
    return jsonify({**session_payload(user), "created": created}), 201 if created else 200


@bp.get("/me")
@login_required
def me(user):
    return jsonify(user=user.to_dict())
