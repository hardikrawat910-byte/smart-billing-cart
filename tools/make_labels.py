"""Printable product labels for the demo catalogue (backend/seed.py):
docs/labels/CartLess_Checkout_Product_QR_Labels.pdf  - QR code per product (3 x 6 per A4 page)
docs/labels/CartLess_Checkout_Product_Barcodes.pdf   - Code 128 barcode per product (EAN-13 where the pack has one)

Both encode the product's code exactly as stored in the database, so either one scans to the same product.
Run from the repository root:   pip install reportlab qrcode   then   python tools/make_labels.py
Print at 100% / "Actual size". If a product's code was changed in Admin, print a new label for it.
"""
import ast
import os

import qrcode
from reportlab.graphics import renderPDF
from reportlab.graphics.barcode import code128, eanbc
from reportlab.graphics.shapes import Drawing
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "labels")
FONT, BOLD = "Helvetica", "Helvetica-Bold"


def catalogue():
    """Reads the item(...) rows of CATALOGUE in backend/seed.py without importing it (no database needed)."""
    tree = ast.parse(open(os.path.join(ROOT, "backend", "seed.py"), encoding="utf-8").read())
    for node in tree.body:
        if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "CATALOGUE":
            return [dict(category=ast.literal_eval(c.args[0]), name=ast.literal_eval(c.args[1]),
                         code=ast.literal_eval(c.args[3])) for c in node.value.elts]
    raise SystemExit("CATALOGUE not found in backend/seed.py")


def wrap(text, font, size, width):
    lines, cur = [], ""
    for word in text.split():
        trial = (cur + " " + word).strip()
        if pdfmetrics.stringWidth(trial, font, size) <= width:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    return lines + [cur]


def page_canvas(name, title):
    c = canvas.Canvas(os.path.join(OUT, name), pagesize=A4)
    c.setTitle(title)
    return c


def cut_box(c, x, y, w, h):
    c.setStrokeColor(HexColor("#BBBBBB")); c.setDash(2, 2); c.setLineWidth(0.4); c.rect(x, y, w, h); c.setDash()


def qr_labels(items):
    W, H = A4; cols, rows, lw, lh = 3, 6, 64 * mm, 44 * mm
    mx, my = (W - cols * lw) / 2, (H - rows * lh) / 2
    c = page_canvas("CartLess_Checkout_Product_QR_Labels.pdf", "CartLess Checkout - product QR labels")
    for i, p in enumerate(items):
        k = i % (cols * rows)
        if k == 0 and i:
            c.showPage()
        x, y = mx + (k % cols) * lw, H - my - (k // cols + 1) * lh
        cut_box(c, x, y, lw, lh)
        q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=2, box_size=10)
        q.add_data(p["code"]); q.make(fit=True)
        s = 34 * mm
        c.drawImage(ImageReader(q.make_image().get_image()), x + 2 * mm, y + (lh - s) / 2, s, s)
        tx = x + 2 * mm + s + 1.5 * mm; tw = lw - (tx - x) - 2 * mm
        c.setFillColor(HexColor("#666666")); c.setFont(FONT, 5.6)
        c.drawString(tx, y + lh - 7 * mm, p["category"].upper())
        size = 7.6; lines = wrap(p["name"], BOLD, size, tw)
        while len(lines) > 4:
            size -= 0.4; lines = wrap(p["name"], BOLD, size, tw)
        c.setFillColor(HexColor("#111111")); c.setFont(BOLD, size); ty = y + lh - 11 * mm
        for line in lines:
            c.drawString(tx, ty, line); ty -= size + 1.6
        code_lines = [l.replace("- ", "-") for l in wrap(p["code"].replace("-", "- "), FONT, 5.0, tw)]
        c.setFillColor(HexColor("#444444")); c.setFont(FONT, 5.0); cy = y + 4 * mm + (len(code_lines) - 1) * 6
        for line in code_lines:
            c.drawString(tx, cy, line); cy -= 6
    c.save()


def barcode_labels(items):
    W, H = A4; cols, rows, lw, lh = 2, 8, 98 * mm, 34 * mm
    mx, my = (W - cols * lw) / 2, (H - rows * lh) / 2
    c = page_canvas("CartLess_Checkout_Product_Barcodes.pdf", "CartLess Checkout - product barcodes")
    for i, p in enumerate(items):
        k = i % (cols * rows)
        if k == 0 and i:
            c.showPage()
        x, y = mx + (k % cols) * lw, H - my - (k // cols + 1) * lh
        cut_box(c, x, y, lw, lh)
        size = 8
        while pdfmetrics.stringWidth(p["name"], BOLD, size) > lw - 8 * mm and size > 5.5:
            size -= 0.3
        c.setFillColor(HexColor("#111111")); c.setFont(BOLD, size); c.drawCentredString(x + lw / 2, y + lh - 6 * mm, p["name"])
        code = p["code"]
        if code.isdigit() and len(code) == 13:            # the pack's own EAN-13
            b = eanbc.Ean13BarcodeWidget(code[:12]); b.barHeight = 15 * mm; b.barWidth = 0.33 * mm
            x1, y1, x2, y2 = b.getBounds(); d = Drawing(x2 - x1, y2 - y1); d.add(b)
            renderPDF.draw(d, c, x + (lw - (x2 - x1)) / 2 - x1, y + 4 * mm - y1)
            continue
        bw = 0.30 * mm
        bc = code128.Code128(code, barWidth=bw, barHeight=15 * mm, quiet=True, lquiet=5 * mm, rquiet=5 * mm)
        if bc.width > lw - 2 * mm:
            bc = code128.Code128(code, barWidth=bw * (lw - 2 * mm) / bc.width, barHeight=15 * mm,
                                 quiet=True, lquiet=5 * mm, rquiet=5 * mm)
        bc.drawOn(c, x + (lw - bc.width) / 2, y + 8 * mm)
        c.setFont(FONT, 6.5); c.setFillColor(HexColor("#333333")); c.drawCentredString(x + lw / 2, y + 4 * mm, code)
    c.save()


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    products = catalogue()
    qr_labels(products)
    barcode_labels(products)
    print(f"{len(products)} products -> {OUT}")
