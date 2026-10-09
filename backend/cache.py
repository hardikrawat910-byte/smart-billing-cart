"""Memory cache: data the server keeps in its own RAM instead of asking MySQL every time.

Products  - the whole published catalogue. The home page, product pages and every scan
            are answered from memory. Anything that changes a product (admin edits,
            calibration, checkout reducing stock) clears it straight away, and it is
            re-read from MySQL at most every PRODUCT_CACHE_SECONDS anyway.
Settings  - the hardware mode the admin picks on the website.
Devices   - which hardware (the Raspberry Pi) is online, from its heartbeats.
Exit feed - the last exit-gate results, so the staff page shows what the Pi camera saw.

render.yaml runs ONE gunicorn worker, so there is exactly one copy of this cache.
(With several workers each would keep its own copy; the 5-minute refresh keeps them close.)
"""
import threading
import time
from collections import deque

from flask import current_app

from extensions import db


class ProductSnapshot:
    """Read-only copy of one published product, safe to share between requests."""
    FIELDS = ("id", "name", "category", "description", "image_url", "price", "mrp", "stock", "qr_code",
              "weight_min_g", "weight_max_g", "ref_color")

    def __init__(self, product):
        for field in self.FIELDS:
            setattr(self, field, getattr(product, field))
        self._public = product.to_dict()

    def to_dict(self, admin=False):
        return dict(self._public)


class ProductCache:
    def __init__(self):
        self._lock = threading.Lock()
        self._items = None
        self._by_id = {}
        self._by_code = {}
        self._loaded_at = 0.0
        self.hits = 0
        self.misses = 0
        self.last_reason = "not loaded yet"

    def _ensure(self):
        ttl = current_app.config["PRODUCT_CACHE_SECONDS"]
        with self._lock:
            if self._items is not None and time.monotonic() - self._loaded_at < ttl:
                self.hits += 1
                return self._items
            from models import Product
            rows = (Product.query.filter(Product.status == "published", Product.deleted_at.is_(None))
                    .order_by(Product.created_at.asc(), Product.id.asc()).all())
            items = [ProductSnapshot(p) for p in rows]
            self._items = items
            self._by_id = {p.id: p for p in items}
            self._by_code = {p.qr_code: p for p in items}
            self._loaded_at = time.monotonic()
            self.misses += 1
            if self.last_reason == "not loaded yet":
                self.last_reason = "first request"
            return items

    def all(self):
        return list(self._ensure())

    def get(self, product_id):
        self._ensure()
        return self._by_id.get(product_id)

    def by_code(self, code):
        """A product by its code: the QR text, or the barcode number printed on the pack
        (12-digit UPC and 13-digit EAN forms of the same barcode both match)."""
        from services import code_variants
        self._ensure()
        for variant in code_variants(code):
            if variant in self._by_code:
                return self._by_code[variant]
        return None

    def categories(self):
        return sorted({p.category for p in self._ensure()})

    def clear(self, reason="changed"):
        with self._lock:
            self._items = None
            self.last_reason = reason

    def stats(self):
        total = self.hits + self.misses
        return {
            "products_in_memory": len(self._items) if self._items is not None else 0,
            "hits": self.hits,
            "misses": self.misses,
            "hit_rate_pct": round(100 * self.hits / total, 1) if total else None,
            "age_sec": round(time.monotonic() - self._loaded_at, 1) if self._items is not None else None,
            "refresh_every_sec": current_app.config["PRODUCT_CACHE_SECONDS"],
            "last_cleared_because": self.last_reason,
        }


class SettingsCache:
    """Admin settings (table "settings"), kept in memory and re-read every 30 s."""

    def __init__(self):
        self._lock = threading.Lock()
        self._values = None
        self._loaded_at = 0.0

    def get(self, name, default=None):
        with self._lock:
            if self._values is None or time.monotonic() - self._loaded_at > 30:
                from models import Setting
                try:
                    self._values = {s.name: s.value for s in Setting.query.all()}
                except Exception:          # table missing (old database before seed.py ran)
                    db.session.rollback()
                    self._values = {}
                self._loaded_at = time.monotonic()
            return self._values.get(name, default)

    def set(self, name, value):
        from models import Setting
        row = db.session.get(Setting, name)
        if row is None:
            db.session.add(Setting(name=name, value=value))
        else:
            row.value = value
        db.session.commit()
        with self._lock:
            self._values = None


class DeviceRegistry:
    """Last heartbeat / reading of each hardware device. Memory only."""

    def __init__(self):
        self._lock = threading.Lock()
        self._devices = {}

    def seen(self, device_id, ip=None, **info):
        with self._lock:
            entry = self._devices.setdefault(device_id, {"device_id": device_id, "first_seen": time.time()})
            entry.update({k: v for k, v in info.items() if v is not None})
            entry["last_seen"] = time.time()
            if ip:
                entry["ip"] = ip

    def list(self):
        limit = current_app.config["DEVICE_ONLINE_SECONDS"]
        now = time.time()
        out = []
        with self._lock:
            for entry in self._devices.values():
                age = now - entry["last_seen"]
                item = {k: v for k, v in entry.items() if k not in ("first_seen", "last_seen")}
                item.update(online=age <= limit, last_seen_sec=round(age, 1),
                            uptime_here_sec=round(now - entry["first_seen"]))
                out.append(item)
        return sorted(out, key=lambda d: d["last_seen_sec"])


class ExitFeed:
    """The last exit-gate results (from the Pi camera and from staff phones). Memory only."""

    def __init__(self, size=40):
        self._lock = threading.Lock()
        self._events = deque(maxlen=size)
        self._next_id = 1

    def add(self, **event):
        with self._lock:
            event.update(id=self._next_id, at=time.time())
            self._next_id += 1
            self._events.append(event)
            return event["id"]

    def since(self, after_id=0):
        now = time.time()
        with self._lock:
            return [{**e, "age_sec": round(now - e["at"], 1)} for e in self._events if e["id"] > after_id]

    def last_id(self):
        with self._lock:
            return self._next_id - 1


products = ProductCache()
settings = SettingsCache()
devices = DeviceRegistry()
exit_feed = ExitFeed()
counter_feed = ExitFeed(size=20)       # top-up tokens the Pi camera read, for the Wallet counter page
