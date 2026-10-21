"""CartLess Checkout server-side measurements (used in docs/project/CartLess_Checkout_IEEE_Paper).
Run from backend/ against a local MySQL with seed data:  ADMIN_PASSWORD=... python ../tests/benchmark/bench.py
In-process Flask test client; rate limiting is switched off for the run."""
import os, sys, uuid, time, random, statistics, json
os.environ.pop("SCALE_ENABLED", None); os.environ["RATE_LIMIT"] = "0"
sys.path.insert(0, ".")
from app import app
c = app.test_client()
H = lambda t: {"Authorization": f"Bearer {t}"}
AT = c.post("/api/auth/login", json={"email": "admin@smartcart.local", "password": os.environ["ADMIN_PASSWORD"]}).get_json()["token"]
DK = app.config["DEVICE_KEY"]
DH = {"X-Device-Key": DK, "X-Device-Id": "rpi-bench"}
def user():
    e = f"bn{uuid.uuid4().hex[:8]}@t.com"
    t = c.post("/api/auth/register", json={"full_name": "Bench", "email": e, "password": "password9"}).get_json()["token"]
    return e, t
def timed(fn):
    t0 = time.perf_counter(); r = fn(); return r, (time.perf_counter() - t0) * 1000
def stats(xs):
    xs = sorted(xs)
    return {"n": len(xs), "mean": round(statistics.mean(xs), 2), "median": round(statistics.median(xs), 2),
            "p95": round(xs[int(0.95 * (len(xs) - 1))], 2), "max": round(xs[-1], 2)}
R = {}
prods = c.get("/api/products").get_json()["products"]
codes = [p["qr_code"] for p in prods if p.get("stock", 1) > 0]
# warm-up
e, T = user()
for _ in range(20): c.post("/api/scan", headers=H(T), json={"code": codes[0]})
# 1. scan latency (valid codes)
lat = []; ok = 0
for i in range(300):
    if i % 30 == 0:
        e, T = user()
    r, ms = timed(lambda: c.post("/api/scan", headers=H(T), json={"code": random.choice(codes)}))
    lat.append(ms); ok += r.status_code in (200, 201)
R["scan_valid"] = {**stats(lat), "accepted": ok}; R["raw_scan"] = [round(x,3) for x in lat]
# 2. unknown / mistyped codes
rej = 0; lat = []
for i in range(300):
    if i % 2 == 0:
        code = "".join(random.choice("0123456789") for _ in range(13))   # random 13-digit numbers
    else:
        base = random.choice([x for x in codes if x.isdigit()] or codes)
        code = base[:-1] + str((int(base[-1]) + 1) % 10) if base.isdigit() else base + "X"   # one digit changed
    r, ms = timed(lambda: c.post("/api/scan", headers=H(T), json={"code": code}))
    lat.append(ms); rej += r.status_code >= 400
R["scan_invalid"] = {**stats(lat), "rejected": rej}
# 3. checkout + exit passes
N = 100
orders = []; lat_pay = []
for i in range(N):
    e, T = user()
    c.post("/api/counter/credit", headers=H(AT), json={"email": e, "amount": 2000, "note": "bench"})
    for _ in range(random.randint(1, 4)):
        c.post("/api/scan", headers=H(T), json={"code": random.choice(codes)})
    r, ms = timed(lambda: c.post("/api/checkout", headers=H(T), json={"idempotency_key": uuid.uuid4().hex}))
    if r.status_code not in (200, 201): R.setdefault("checkout_fail", []).append([r.status_code, r.get_json().get("error", "")[:60]])
    if r.status_code in (200, 201):
        lat_pay.append(ms); oid=r.get_json()["order"]["id"]; orders.append(c.get(f"/api/orders/{oid}", headers=H(T)).get_json()["order"])
R["checkout"] = {**stats(lat_pay), "paid": len(orders)}; R["raw_checkout"] = [round(x,3) for x in lat_pay]
res = {"nonexistent_blocked": 0, "first_use_ok": 0, "reuse_blocked": 0, "tampered_blocked": 0, "forged_blocked": 0, "random_blocked": 0}
lat_dev = []
for o in orders:
    code = o["exit_code"]
    r, ms = timed(lambda: c.post("/api/exit/device", headers=DH, json={"code": code, "device_id": "rpi-bench", "weight_g": None}))
    lat_dev.append(ms); res["first_use_ok"] += r.get_json().get("result") == "ok"
    r = c.post("/api/exit/device", headers=DH, json={"code": code, "device_id": "rpi-bench"})
    res["reuse_blocked"] += r.get_json().get("result") == "used"
    pre, sig = code.rsplit("-", 1)
    i = random.randrange(len(sig)); bad = sig[:i] + random.choice([h for h in "0123456789abcdef" if h != sig[i]]) + sig[i+1:]
    r = c.post("/api/exit/device", headers=DH, json={"code": f"{pre}-{bad}", "device_id": "rpi-bench"})
    res["tampered_blocked"] += r.get_json().get("result") == "invalid"
    oid = int(pre.split("-")[1])
    other = orders[(orders.index(o) + 1) % len(orders)]          # a different, real, paid order
    r = c.post("/api/exit/device", headers=DH, json={"code": f"SCBILL-{other['id']}-{sig}", "device_id": "rpi-bench"})
    res["forged_blocked"] += r.get_json().get("result") == "invalid"
    r = c.post("/api/exit/device", headers=DH, json={"code": f"SCBILL-{oid+100000}-{sig}", "device_id": "rpi-bench"})
    res["nonexistent_blocked"] = res.get("nonexistent_blocked", 0) + (r.get_json().get("result") == "invalid")
    r = c.post("/api/exit/device", headers=DH, json={"code": f"SCBILL-{oid}-{uuid.uuid4().hex[:16]}", "device_id": "rpi-bench"})
    res["random_blocked"] += r.get_json().get("result") == "invalid"
R["exit"] = {**res, "n": len(orders), "latency": stats(lat_dev)}; R["raw_exit"] = [round(x,3) for x in lat_dev]
# 4. device key required
r1 = c.post("/api/exit/device", json={"code": orders[0]["exit_code"]})
r2 = c.post("/api/exit/device", headers={"X-Device-Key": "wrong"}, json={"code": orders[0]["exit_code"]})
R["device_key"] = {"no_key_status": r1.status_code, "wrong_key_status": r2.status_code}
# 5. top-up tokens: tampered refused, confirm once
tt = {"n": 0, "tampered_refused": 0, "genuine_found": 0, "first_confirm_ok": 0, "second_confirm_refused": 0, "credited_once": 0}
for i in range(50):
    e, T = user()
    tp = c.post("/api/wallet/topups", headers=H(T), json={"amount": 100}).get_json()["topup"]
    code = tp["code"]; tt["n"] += 1
    pre, sig = code.rsplit("-", 1) if code.count("-") >= 2 else (code, "")
    j = random.randrange(len(sig)); bad = sig[:j] + ("0" if sig[j] != "0" else "1") + sig[j+1:]
    tt["tampered_refused"] += c.post("/api/counter/lookup", headers=H(AT), json={"code": f"{pre}-{bad}"}).status_code == 404
    tt["genuine_found"] += c.post("/api/counter/lookup", headers=H(AT), json={"code": code}).status_code == 200
    tt["first_confirm_ok"] += c.post(f"/api/counter/topups/{tp['id']}/confirm", headers=H(AT), json={"method": "upi"}).status_code == 200
    tt["second_confirm_refused"] += c.post(f"/api/counter/topups/{tp['id']}/confirm", headers=H(AT), json={"method": "cash"}).status_code == 409
    bal = c.get("/api/wallet", headers=H(T)).get_json()
    tt["credited_once"] += float(bal.get("balance", bal.get("wallet", {}).get("balance", -1))) == 100.0
tt["sample_code"] = code
R["topup"] = tt
json.dump(R, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "results.json"), "w"), indent=1)
print(json.dumps(R, indent=1))
