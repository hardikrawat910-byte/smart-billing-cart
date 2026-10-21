"""
Creates the MySQL database + all tables, an admin account and the demo catalogue (48 items, 10 on offer).

    python seed.py            safe to re-run; only adds what is missing
    python seed.py --reset    DROPS all tables first (deletes all data!)

Weights/colours below are starting guesses - use Admin > Products > Calibrate with the real items.
"""
import os
import sys
from decimal import Decimal

import pymysql

import config

# ---------------------------------------------------------------------------------------
# Demo catalogue: a small general store, 48 items in 8 sections.
# Prices are approximate Indian MRPs and weights are estimates of the whole pack - put the
# real item on the cart's scale and press Admin > Products > Calibrate to store its true
# weight and colour. Codes: the pack's barcode where known (Haldiram's Bhujia Sev), otherwise
# a CartLess Checkout code - print its QR label, or press Edit > Scan to swap in the pack's barcode.
# ---------------------------------------------------------------------------------------
SECTIONS = ["Stationery", "Snacks", "Biscuits & Chocolates", "Beverages", "Instant Food",
            "Personal Care", "Household", "Electronics & Hobby"]


def item(category, name, price, code, wmin, wmax, color, stock, description):
    return dict(category=category, name=name, price=str(price), qr_code=code, weight_min_g=str(wmin),
                weight_max_g=str(wmax), ref_color=color, stock=stock, description=description)


CATALOGUE = [
    # Stationery
    item("Stationery", "Classmate Notebook 172 Pages", 60, "SMARTCART-NOTEBOOK-172", 185, 215, "#2f5fa8", 40,
         "Long-size single-line notebook, 172 pages."),
    item("Stationery", "Reynolds 045 Fine Carbure Pen (Blue)", 10, "SMARTCART-PEN-REYNOLDS", 6, 9, "#e9eef5", 120,
         "Smooth blue ball pen with a fine tip."),
    item("Stationery", "Cello Butterflow Ball Pen (Blue)", 10, "SMARTCART-PEN-CELLO", 7, 10, "#1e63c6", 100,
         "Light ball pen with a comfortable grip."),
    item("Stationery", "Apsara Platinum Pencils (Pack of 10)", 60, "SMARTCART-PENCIL-10", 60, 80, "#1c1c1c", 50,
         "Dark, strong HB pencils for writing and drawing."),
    item("Stationery", "Apsara Non-Dust Eraser", 5, "SMARTCART-ERASER", 9, 13, "#f2f2f2", 150,
         "Clean erasing without crumbs."),
    item("Stationery", "Fevicol MR 50 g", 30, "SMARTCART-FEVICOL-50", 58, 70, "#f4f0e6", 40,
         "White adhesive for paper, card and craft work."),
    item("Stationery", "Camlin Geometry Box", 120, "SMARTCART-GEOBOX", 150, 190, "#1f4f9c", 25,
         "Compass, divider, protractor, set squares, scale, pencil and eraser."),
    item("Stationery", "Faber-Castell Textliner Highlighter (Yellow)", 35, "SMARTCART-HIGHLIGHTER", 11, 16, "#f5e030", 60,
         "Fluorescent highlighter with a chisel tip."),
    item("Stationery", "Kangaro No. 10 Stapler", 90, "SMARTCART-STAPLER-10", 80, 110, "#c62828", 20,
         "Pocket stapler for No. 10 pins."),
    # Snacks
    item("Snacks", "Haldiram's Bhujia Sev 400 g", 110, "8904004400083", 410, 440, "#e8822a", 30,
         "Crunchy besan sev with Haldiram's masala."),
    item("Snacks", "Lay's Classic Salted 52 g", 20, "SMARTCART-LAYS-52", 54, 62, "#f5c518", 60,
         "Thin potato chips, lightly salted."),
    item("Snacks", "Kurkure Masala Munch 75 g", 20, "SMARTCART-KURKURE-75", 77, 86, "#f08a24", 60,
         "Spicy corn puffs."),
    item("Snacks", "Bingo Mad Angles 66 g", 20, "SMARTCART-BINGO-66", 68, 76, "#d8452f", 50,
         "Triangle chips with a tangy masala."),
    item("Snacks", "Haldiram's Aloo Bhujia 200 g", 55, "SMARTCART-ALOO-BHUJIA-200", 206, 222, "#e7b23a", 40,
         "Potato and besan namkeen."),
    # Biscuits & Chocolates
    item("Biscuits & Chocolates", "Parle-G Original Glucose Biscuits 250 g", 25, "SMARTCART-PARLEG-250", 255, 270, "#f4d03f", 60,
         "Classic glucose biscuits."),
    item("Biscuits & Chocolates", "Britannia Good Day Cashew Cookies 200 g", 40, "SMARTCART-GOODDAY-200", 205, 222, "#f2b705", 40,
         "Butter cookies with cashew bits."),
    item("Biscuits & Chocolates", "Britannia Marie Gold 250 g", 40, "SMARTCART-MARIE-250", 255, 272, "#e3c45a", 40,
         "Light tea-time biscuits."),
    item("Biscuits & Chocolates", "Oreo Chocolate Cream Biscuits 120 g", 35, "SMARTCART-OREO-120", 124, 136, "#1d3f8a", 40,
         "Chocolate sandwich biscuits with vanilla cream."),
    item("Biscuits & Chocolates", "Cadbury Dairy Milk 50 g", 50, "SMARTCART-DAIRYMILK-50", 52, 58, "#4b1f7a", 60,
         "Milk chocolate bar."),
    item("Biscuits & Chocolates", "Nestle KitKat 4 Finger", 40, "SMARTCART-KITKAT-4F", 39, 45, "#d6202a", 50,
         "Crisp wafer fingers covered in milk chocolate."),
    item("Biscuits & Chocolates", "Cadbury 5 Star 40 g", 20, "SMARTCART-5STAR-40", 41, 47, "#f2b600", 60,
         "Caramel and nougat chocolate bar."),
    # Beverages
    item("Beverages", "Bisleri Mineral Water 1 L", 20, "SMARTCART-BISLERI-1L", 1020, 1060, "#3aa0d8", 48,
         "Packaged drinking water."),
    item("Beverages", "Coca-Cola 750 ml", 40, "SMARTCART-COKE-750", 790, 830, "#d7262b", 36,
         "Soft drink, best served chilled."),
    item("Beverages", "Maaza Mango Drink 600 ml", 40, "SMARTCART-MAAZA-600", 640, 690, "#f6a623", 36,
         "Mango fruit drink."),
    item("Beverages", "Red Bull Energy Drink 250 ml", 125, "SMARTCART-REDBULL-250", 262, 285, "#2b4aa0", 24,
         "Energy drink can."),
    item("Beverages", "Tata Tea Premium 250 g", 150, "SMARTCART-TATATEA-250", 255, 275, "#c8102e", 30,
         "Strong blended leaf tea."),
    item("Beverages", "Nescafe Classic Coffee 50 g", 190, "SMARTCART-NESCAFE-50", 140, 175, "#b2002d", 24,
         "Instant coffee in a glass jar."),
    # Instant Food
    item("Instant Food", "Maggi 2-Minute Masala Noodles 70 g", 15, "SMARTCART-MAGGI-70", 71, 78, "#f6c400", 80,
         "Instant noodles with masala tastemaker."),
    item("Instant Food", "Sunfeast Yippee Magic Masala Noodles 70 g", 15, "SMARTCART-YIPPEE-70", 71, 78, "#f37021", 60,
         "Long, non-sticky instant noodles."),
    item("Instant Food", "Knorr Classic Thick Tomato Soup 53 g", 60, "SMARTCART-KNORR-TOMATO", 55, 63, "#d32f2f", 30,
         "Instant soup mix, serves four."),
    item("Instant Food", "Kissan Fresh Tomato Ketchup 500 g", 130, "SMARTCART-KETCHUP-500", 540, 585, "#c41e3a", 24,
         "Tomato ketchup in a squeeze bottle."),
    # Personal Care
    item("Personal Care", "Colgate Strong Teeth Toothpaste 200 g", 110, "SMARTCART-COLGATE-200", 225, 250, "#e21d24", 36,
         "Calcium toothpaste for strong teeth."),
    item("Personal Care", "Dettol Original Soap 125 g", 55, "SMARTCART-DETTOL-125", 130, 142, "#2e7d32", 40,
         "Antibacterial bathing soap."),
    item("Personal Care", "Lifebuoy Total 10 Soap 100 g", 35, "SMARTCART-LIFEBUOY-100", 104, 114, "#d32f2f", 40,
         "Germ-protection soap."),
    item("Personal Care", "Clinic Plus Strong & Long Shampoo 175 ml", 115, "SMARTCART-CLINICPLUS-175", 195, 215, "#ec7cb0", 24,
         "Everyday shampoo with milk protein."),
    item("Personal Care", "Gillette Guard Razor", 30, "SMARTCART-GILLETTE-GUARD", 16, 26, "#2a6fb5", 40,
         "Single-blade safety razor."),
    # Household
    item("Household", "Vim Lemon Dishwash Bar 300 g", 30, "SMARTCART-VIM-300", 302, 320, "#8bc34a", 40,
         "Dishwash bar with the power of lemons."),
    item("Household", "Surf Excel Easy Wash Detergent 1 kg", 140, "SMARTCART-SURF-1KG", 1010, 1045, "#1e88e5", 20,
         "Detergent powder for bucket and machine wash."),
    item("Household", "Harpic Power Plus Toilet Cleaner 500 ml", 99, "SMARTCART-HARPIC-500", 590, 640, "#1565c0", 24,
         "Thick liquid toilet cleaner."),
    item("Household", "Scotch-Brite Scrub Pad", 20, "SMARTCART-SCOTCHBRITE", 8, 15, "#43a047", 50,
         "Green scrub pad for utensils."),
    # Electronics & Hobby
    item("Electronics & Hobby", "Duracell AA Batteries (Pack of 2)", 110, "SMARTCART-DURACELL-AA2", 50, 60, "#b5651d", 30,
         "Long-lasting alkaline AA batteries."),
    item("Electronics & Hobby", "Philips 9W LED Bulb", 99, "SMARTCART-LED-9W", 48, 70, "#e0e0e0", 30,
         "B22 cool daylight LED bulb."),
    item("Electronics & Hobby", "Raspberry Pi 5 (8GB)", 8499, "SMARTCART-PI5-8GB", 95, 115, "#c8323c", 20,
         "Quad-core 64-bit single-board computer with 8GB RAM."),
    item("Electronics & Hobby", "USB Webcam 1080p", 1499, "SMARTCART-CAM-1080", 120, 150, "#2b2b2b", 25,
         "Plug-and-play 1080p USB camera with built-in mic."),
    item("Electronics & Hobby", "MicroSD Card 64GB A2", 649, "SMARTCART-SD-64GB", 8, 14, "#d62f2f", 40,
         "Fast 64GB microSD card with adapter."),
    item("Electronics & Hobby", "16x2 LCD Display Module", 249, "SMARTCART-LCD-1602", 32, 42, "#2a5bd7", 30,
         "Character LCD with I2C backpack."),
    item("Electronics & Hobby", "Buzzer + Jumper Wire Kit", 199, "SMARTCART-BUZZ-KIT", 60, 80, "#e0a526", 50,
         "Buzzers with 120 assorted jumper wires."),
    item("Electronics & Hobby", "Sensor Starter Pack (12-in-1)", 1199, "SMARTCART-SENSOR-12", 150, 190, "#3b8a3e", 15,
         "Temperature, ultrasonic, PIR, light and tilt sensors."),
]
CATALOGUE_VERSION = "3"
# This week's offers (v3): code -> (MRP, offer price). Shown as "Save Rs X" deals on the home page.
# Applied once, only to items still at their original catalogue price.
OFFERS = {
    "SMARTCART-NOTEBOOK-172": (60, 54), "SMARTCART-LAYS-52": (20, 18), "SMARTCART-PARLEG-250": (25, 23),
    "SMARTCART-GOODDAY-200": (40, 35), "SMARTCART-COKE-750": (40, 36), "SMARTCART-MAGGI-70": (15, 14),
    "SMARTCART-SURF-1KG": (140, 125), "SMARTCART-COLGATE-200": (110, 99), "SMARTCART-DETTOL-125": (55, 49),
    "SMARTCART-DURACELL-AA2": (110, 99),
}
# The first version's 6 electronics demo items (codes -> their old category), moved into
# "Electronics & Hobby" by the one-time catalogue upgrade.
V1_ITEMS = {"SMARTCART-PI5-8GB": "Boards", "SMARTCART-CAM-1080": "Cameras", "SMARTCART-SD-64GB": "Storage",
            "SMARTCART-LCD-1602": "Displays", "SMARTCART-BUZZ-KIT": "Components", "SMARTCART-SENSOR-12": "Sensors"}
DECIMAL_FIELDS = {"price", "weight_min_g", "weight_max_g"}


def ensure_database():
    conn = pymysql.connect(host=config.DB_HOST, port=config.DB_PORT, user=config.DB_USER,
                           password=config.DB_PASSWORD, charset="utf8mb4",
                           ssl=config.db_ssl_args(), connect_timeout=15)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = %s",
                        (config.DB_NAME,))
            if cur.fetchone() is None:        # hosted MySQL already has its database
                cur.execute(f"CREATE DATABASE `{config.DB_NAME}` "
                            "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
        conn.commit()
    finally:
        conn.close()


def upgrade_schema(db):
    """create_all() never changes tables that already exist, so columns added in later
    versions are added here. Safe to run every time."""
    from sqlalchemy import inspect, text
    inspector = inspect(db.engine)
    columns = {c["name"] for c in inspector.get_columns("orders")}
    user_columns = {c["name"] for c in inspector.get_columns("users")}
    added = []
    if "exit_verified_device" not in columns:
        db.session.execute(text("ALTER TABLE orders ADD COLUMN exit_verified_device VARCHAR(40) NULL"))
        added.append("orders.exit_verified_device")
    if "payment_method" not in columns:
        db.session.execute(text("ALTER TABLE orders ADD COLUMN payment_method VARCHAR(20) NULL, "
                                "ADD COLUMN payment_ref INT NULL"))
        added.append("orders.payment_method/payment_ref")
    if "wallet_balance" not in user_columns:
        db.session.execute(text("ALTER TABLE users ADD COLUMN wallet_balance DECIMAL(10,2) NOT NULL DEFAULT 0"))
        added.append("users.wallet_balance")
    if "google_sub" not in user_columns:
        db.session.execute(text("ALTER TABLE users ADD COLUMN google_sub VARCHAR(64) NULL, "
                                "ADD CONSTRAINT uq_users_google_sub UNIQUE (google_sub)"))
        added.append("users.google_sub")
    if "exit_verified_at" not in columns:
        db.session.execute(text("ALTER TABLE orders ADD COLUMN exit_verified_at DATETIME NULL"))
        added.append("orders.exit_verified_at")
    product_columns = {c["name"] for c in inspector.get_columns("products")}
    item_columns = {c["name"] for c in inspector.get_columns("order_items")}
    if "mrp" not in product_columns:
        db.session.execute(text("ALTER TABLE products ADD COLUMN mrp DECIMAL(10,2) NULL"))
        added.append("products.mrp")
    if "unit_mrp" not in item_columns:
        db.session.execute(text("ALTER TABLE order_items ADD COLUMN unit_mrp DECIMAL(10,2) NULL"))
        added.append("order_items.unit_mrp")
    if "shopping_budget" not in user_columns:
        db.session.execute(text("ALTER TABLE users ADD COLUMN shopping_budget DECIMAL(10,2) NULL"))
        added.append("users.shopping_budget")
    if "exit_verified_by" not in columns:
        db.session.execute(text(
            "ALTER TABLE orders ADD COLUMN exit_verified_by INT NULL, "
            "ADD CONSTRAINT fk_orders_exit_staff FOREIGN KEY (exit_verified_by) "
            "REFERENCES users(id) ON DELETE SET NULL"))
        added.append("orders.exit_verified_by")
    if added:
        db.session.commit()
        print("Upgraded tables:", ", ".join(added))


def upgrade_catalogue(db, Product, Setting):
    """Empty shop: add the whole catalogue. Older shop: add the items it doesn't have yet, once
    (CATALOGUE_VERSION), and move the first 6 demo items into "Electronics & Hobby" without their
    stock photos. Products the admin changed or deleted are left alone."""
    row = db.session.get(Setting, "catalogue_version")
    current = row.value if row is not None else None
    if current is not None and current >= CATALOGUE_VERSION:
        return 0, 0
    added = moved = 0
    if current is None or current < "2":          # (a shop already on v2 keeps what admin deleted)
        existing = {code for (code,) in db.session.query(Product.qr_code).all()}
        for data in CATALOGUE:
            if data["qr_code"] in existing:
                continue
            fields = {k: (Decimal(v) if k in DECIMAL_FIELDS else v) for k, v in data.items()}
            db.session.add(Product(status="published", **fields))
            added += 1
        for product in Product.query.filter(Product.qr_code.in_(list(V1_ITEMS))).all():
            if product.category == V1_ITEMS[product.qr_code]:
                product.category = "Electronics & Hobby"
                if (product.image_url or "").startswith("https://images.unsplash.com/"):
                    product.image_url = None
                moved += 1
        db.session.flush()
    offers = 0
    for product in Product.query.filter(Product.qr_code.in_(list(OFFERS))).all():
        mrp, price = OFFERS[product.qr_code]
        if product.mrp is None and product.price == Decimal(mrp):
            product.mrp, product.price = Decimal(mrp), Decimal(price)
            offers += 1
    if row is None:
        db.session.add(Setting(name="catalogue_version", value=CATALOGUE_VERSION))
    else:
        row.value = CATALOGUE_VERSION
    print(f"Catalogue v{CATALOGUE_VERSION}: added {added} products" + (f", re-filed {moved}" if moved else "")
          + (f", {offers} offers" if offers else "") + ".")
    return added, moved


def main():
    try:
        ensure_database()
    except pymysql.err.OperationalError as exc:
        sys.exit(f"Could not connect to MySQL: {exc}\n"
                 "Check DB_HOST / DB_PORT / DB_USER / DB_PASSWORD (backend/.env, or the Render environment) "
                 "and that the MySQL server is running. Online MySQL (Aiven) also needs DB_SSL=1.")

    from werkzeug.security import generate_password_hash

    from app import app
    from extensions import db
    from models import Product, Setting, User

    with app.app_context():
        if "--reset" in sys.argv:
            db.drop_all()
            print("Dropped all tables.")
        db.create_all()
        upgrade_schema(db)

        email = (os.getenv("ADMIN_EMAIL") or "admin@smartcart.local").strip().lower()
        password = (os.getenv("ADMIN_PASSWORD") or "").strip()
        made_up = not password or password == "choose-a-strong-password"
        if made_up:
            import secrets
            password = secrets.token_urlsafe(9)
        admin = User.query.filter_by(email=email).first()
        if admin is None:
            db.session.add(User(full_name="CartLess Admin", email=email, role="admin",
                                password_hash=generate_password_hash(password)))
            shown = f"{password}   <- made up now, write it down (or set ADMIN_PASSWORD)" if made_up \
                else "(the ADMIN_PASSWORD you set)"
            print(f"Created admin account: {email} / {shown}")
        elif admin.role != "admin":
            admin.role = "admin"

        upgrade_catalogue(db, Product, Setting)
        db.session.commit()
    print("Database ready. Start the server with:  python app.py")


if __name__ == "__main__":
    main()
