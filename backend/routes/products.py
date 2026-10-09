"""Public catalogue. Served from the memory cache (cache.py), not from MySQL on every request."""
from flask import Blueprint, Response, jsonify, request

from cache import products as product_cache
from extensions import db
from models import Product, ProductImage
from services import error

bp = Blueprint("products", __name__, url_prefix="/api/products")


def public_query():
    """Only published, not-deleted products are visible to shoppers (straight from MySQL)."""
    return Product.query.filter(Product.status == "published", Product.deleted_at.is_(None))


@bp.get("")
def list_products():
    items = product_cache.all()
    category = request.args.get("category", "").strip()
    term = request.args.get("q", "").strip().lower()
    if category and category.lower() != "all":
        items = [p for p in items if p.category == category]
    if term:
        items = [p for p in items
                 if any(term in (text or "").lower() for text in (p.name, p.category, p.description))]
    return jsonify(products=[p.to_dict() for p in items])


@bp.get("/categories")
def categories():
    return jsonify(categories=product_cache.categories())


@bp.get("/<int:product_id>")
def get_product(product_id):
    product = product_cache.get(product_id)
    if product is None:
        return error("Product not found", 404)
    return jsonify(product=product.to_dict())


@bp.get("/<int:product_id>/photo")
def photo(product_id):
    """Product photo taken in the admin form (stored in MySQL)."""
    image = db.session.get(ProductImage, product_id)
    if image is None:
        return error("No photo", 404)
    return Response(image.data, mimetype=image.mime)
