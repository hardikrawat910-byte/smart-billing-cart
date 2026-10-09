# SmartCart - full setup and technical guide  (v2.8.4)

Back to the [project overview](README.md).

A self-checkout cart for a neighbourhood general store: shoppers scan items with their phone, pay from
a SmartCart Wallet and walk out. Flask + MySQL backend, HTML/CSS/JS website (installable as an app), and
a Raspberry Pi (Pi camera + load cell + LEDs/buzzer) that verifies every item by **barcode + weight +
camera colour**, beeps when something goes into the cart unscanned, and checks the bill QR at the exit.

```
 phone (website)  --scan barcode-->  SmartCart website (Flask + MySQL, Render)  <--HTTPS out--  Raspberry Pi
                  <--cart, bill QR--                                                            load cell, camera,
                                                                                                LEDs + buzzer
```
The Pi never accepts incoming connections: it only calls out to the website with its device key.

## Run it on your PC (Windows commands; Mac/Linux use `source venv/bin/activate`)

1. Install Python 3.10+ and MySQL Server 8.0.16+ (make sure MySQL is running).
2. Copy `backend/.env.example` to `backend/.env` and set `DB_PASSWORD` to your MySQL root password
   (and `ADMIN_PASSWORD` to your own admin password).
3. In a terminal:
   ```
   cd smart-billing-cart/backend
   python -m venv venv
   venv\Scripts\activate
   pip install -r requirements.txt
   python seed.py
   python app.py
   ```
4. Open **http://localhost:5000**. Flask serves the website too, so there is no CORS setup.
5. Log in as admin: `admin@smartcart.local` with the `ADMIN_PASSWORD` from `.env`. If it is blank,
   `python seed.py` makes up a password and prints it once - write it down.

**Updating from an older version:** run `python seed.py` once - it adds the new columns/tables
(nothing is deleted). Online (Render) this happens automatically on every start.

## The shop: 48 everyday items in 8 sections
Stationery, Snacks, Biscuits & Chocolates, Beverages, Instant Food, Personal Care, Household and
Electronics & Hobby. The home page shows one shelf per section (swipe sideways, **See all** for the
whole section); search covers the whole store. `seed.py` adds the catalogue once (an older shop gets
only the missing items; products you edited or deleted are left alone).
Items without a photo show a drawn picture of their pack (notebook, pen, chips packet, bottle, soap...)
in the pack's own colour - generic shapes, no brand logos - so the shop never shows empty tiles.

**Product photos:** Admin > Products > **Photo** on any item opens the phone camera and uploads at once
(quickest way to photograph the whole shop); Edit > **Add photo** also lets you pick from the gallery. The browser shrinks it, the server re-encodes it as a small JPEG and keeps
it in MySQL, so photos survive Render restarts. **Remove** goes back to the coloured tile.

## Scanning: one scanner for barcodes and QR codes
The Scan page reads the **barcode printed on a pack** (EAN-13/8, UPC-A/E, Code 128/39) and
**SmartCart QR labels** with the same camera - no mode to choose. Every product has ONE code:
- a packaged item: its barcode number (e.g. `8904004400083`); the 12-digit UPC and 13-digit EAN
  forms of the same barcode both match, and a mistyped number is refused (check digit);
- an item with no barcode: any text, then print its QR label (Admin > Products > QR).
Adding a real item: as admin, scan its barcode on the Scan page -> **New item -> Add this product**
(the form opens with the barcode filled in), or press **Scan** next to "Product code" in the form.

## SmartCart Wallet and payment tokens
Bills are paid from the customer's wallet (1 token = Rs 1):
1. Customer: **Wallet** tab -> choose an amount -> **Get token**. A top-up token `T-000042` with a QR appears.
2. They pay that amount at the counter by **cash or UPI**.
3. Staff: **Admin > Counter** (`counter.html`) -> scan the token (or type its number) -> **Cash received**
   or **UPI received**. The wallet is credited at once and the customer's page updates by itself.
4. Cart -> **Pay Rs X** takes the bill from the wallet (refused if the balance is short; the cart offers
   "Add Rs Y" instead). The bill shows "Paid from SmartCart Wallet - W-000123" and the exit gate checks it.
**UPI:** set `UPI_ID` (e.g. `yourshop@okaxis`, plus optional `UPI_PAYEE_NAME`) and every token gets a
**Pay Rs X with a UPI app** button (opens GPay/PhonePe/Paytm with the amount filled in), and the counter
shows a UPI QR with the amount for the customer to scan. Staff still press **UPI received** only after the
money shows in the shop's UPI app - no payment gateway is involved.
Every change is logged in `wallet_transactions` with the balance after it; tokens are HMAC-signed,
work once, and balances change only under a database row lock. Staff can also add money directly
(refunds, demo money). `WALLET_WELCOME_AMOUNT` (default 0) gives every new account demo money.

## Verification modes (Admin > Hardware - switch any time, no restart)

| Mode | What must agree before an item enters the cart |
|---|---|
| `off` | QR/barcode exists in the catalogue (software-only demo fallback) |
| `weight` | barcode + load-cell weight within the product's range |
| `full` | barcode + weight + camera colour close to the product's reference |

`HARDWARE_MODE` in `.env` / Render is only the starting value; the switch on the website wins.
When hardware is on, the only way into the cart is `POST /api/scan`. Direct add and
"+1 quantity" are blocked, so nobody can skip the checks. A mismatch is **not** added.
It is saved in `flagged_transactions`, and staff approve or reject it under Admin > Flags.
Each reading can be used for only one scan, so one weighing can't verify two items.

**Demo without hardware:** switch to `full`, then open **Scan** as admin. An admin-only "Demo simulator"
appears under the camera (also under Admin > Hardware).
- Enter `105`, keep the red colour (`#c8323c`), press Send, then scan `SMARTCART-PI5-8GB` within 15 s. It passes.
- Enter `12` (the weight of a microSD card), press Send, then scan the Pi code again. It gets flagged.
- This is the switcheroo attack being caught. Show it under Admin > Flags, then approve or reject it.

**Calibrating real items:** put ONLY that item on the platform (under the camera), then
Admin > Products > Calibrate. This saves the item's real weight range (+-3%) and reference colour.

## Smart shopping (v2.8)
Ideas taken from the smart carts in real stores (Amazon Dash Cart, Instacart Caper Cart, DMart Scan & Go)
and from a user study of scan-and-go shoppers, who mainly asked for a running total, budget control and
an easy way to fix mistakes.
- **Shopping list + store map** (`list.html`): add items before the trip; the list is sorted aisle by
  aisle and a map of the store lights up the aisles still to visit. Each item **ticks itself off when
  it is scanned**, and paying crosses it off. "Put these items on my shopping list" on any old bill
  re-orders it in one tap. The 8 sections sit in aisles 1-8 (`backend/store.py`).
- **Offers:** an item can have an MRP above its selling price. The shop then shows a **Today's deals**
  shelf and chip, the struck-through MRP and a "Save ₹X" tag; the cart and the bill show
  "You saved ₹X on offers" (the bill keeps the MRP of the day). The seed puts 10 items on offer.
- **Budget:** set a spending limit (Profile or Cart). The cart shows a progress bar that turns amber at
  90% and red when over, and the Scan page warns as soon as a scan crosses it.
- **Buy again** (what you buy most) on the home page; **Often bought together** on product pages
  (worked out from real bills, topped up with the same section).
- **Scan feedback:** a short beep + vibration for a good scan and a low buzz for a problem; the
  success sheet has **Undo** to take a wrong item straight back out.
- **Voice search** (microphone in the search box, Indian English) and **Larger text** (Profile).
- **Call staff** button on the Scan, Cart and List pages (won't scan, weight problem, can't find an
  item, payment). Staff see the call at the top of Admin, Wallet counter and Exit gate with a beep,
  press **On my way** (the shopper sees who is coming) and **Done**.
- **Share** a bill (WhatsApp, email...) or print it as a PDF receipt.
- **Staff:** "+10" restock buttons next to items running low, a **Sales CSV** download (every bill
  line of the last 30 days, opens in Excel), MRP field in the product form, offer savings and open
  help calls on the dashboard.

## Item put in the cart without scanning
In `weight`/`full` mode, a weight that lands on the cart's scale and is not used by a scan within
`UNSCANNED_ALERT_SEC` (15 s) becomes an alert: the shopper's Scan page shows a red banner (and the phone
vibrates), the Pi blinks red and beeps twice (up to 3 reminders), and staff see it under
Admin > Hardware with a **Dismiss** button. It closes by itself when the item is scanned (the scan still
counts, using that placement's weight) or taken out of the cart. The dashboard counts them per week.

## Admin dashboard (Admin > Today)
Today's sales (bills, items, average bill, money shoppers saved on offers), wallet top-ups by cash/UPI, bills checked at the exit,
money held in wallets, new customers, a 7-day sales chart (hover or tap a day; also as a table), what
the cart caught this week (weight / camera mismatches, unscanned items), best sellers and items running
low (with +10 restock buttons). **Sales CSV** downloads the last 30 days of bill lines. Days follow Indian time (`APP_UTC_OFFSET_MINUTES=330`).

**Reset for demo** (bottom of the dashboard): deletes all orders, carts, wallet history and
tokens, fraud flags, alerts, hardware readings and customer accounts, keeping admin accounts, products,
stock and settings (shopping lists, budgets and staff calls are cleared too). Type `RESET` to unlock the button; optionally also hide the 6 sample electronics
items from the first version. It cannot be undone - press it once, just before a demo or hand-over.

## Install as an app
On Android Chrome the site offers **Install** (also in Profile > "Install the SmartCart app"); on an
iPhone use Safari > Share > **Add to Home Screen**. It then opens full screen with its own icon.
Prices, stock and money always come live from the server; with no connection the app shows a
friendly "You are offline" page (`sw.js`, `manifest.webmanifest`, `offline.html`, `icons/`).

## Raspberry Pi (cart scale + exit gate)

Pi 4 + Pi Camera v2 + HX711 with a load cell + green LED + red LED + buzzer. Program: `pi/`
(full guide in `pi/README.md`).
1. Copy the folder to the Pi. From Windows: `scp -r pi <user>@smartcart.local:~/`
2. On the Pi: `cd ~/pi && bash install.sh`, then `python3 cart_agent.py test-camera` (creates
   `cart_agent.ini`). Put **DEVICE_KEY** (Render > Environment, or `backend/.env`; if
   that is blank, the server made one up in `backend/.device_key`) into it.
3. `python3 cart_agent.py test-lights`, `calibrate`, `test-scale`, then `run`.
4. `bash install.sh autostart` - from now on it starts by itself when the Pi is powered on
   (green x3 + beep = connected). `bash install.sh firewall` blocks all incoming connections.
5. Admin > Hardware shows the Pi as **online**; switch the mode to `full`.

Wiring: HX711 VCC pin 1, GND pin 9, DT pin 29 (GPIO 5), SCK pin 31 (GPIO 6);
green LED pin 11 (GPIO 17), red LED pin 13 (GPIO 27), each through 220 ohm; buzzer pin 15 (GPIO 22);
LED/buzzer ground pin 14.

## Hardware contract (what the Pi sends)

Every request has the header `X-Device-Key: <DEVICE_KEY>` (and `X-Device-Id: rpi-cart`).
```
POST /api/hardware/image       Content-Type: image/jpeg   <JPEG bytes>          (item settled)
POST /api/hardware/weight      {"device_id": "rpi-cart", "weight_g": 104.6}       (same item)
POST /api/exit/device          {"device_id": "rpi-cart", "code": "SCBILL-12-...", "weight_g": 412.0}
POST /api/hardware/heartbeat   {"device_id": "rpi-cart", "version": "2.5", "roles": ["cart", "exit"], ...}
```
**One** weight reading per placement (when the scale settles on a new value above 2 g), never
repeated while the same item stays on the platform. Readings older than 15 s are ignored, and each
scan uses up the reading it was checked against. The heartbeat (every 30 s) shows the Pi online
on the website and keeps a free Render server awake while the Pi is on.

Pi on the same WiFi as a laptop server instead of Render: use `http://<laptop IP>:5000` as the url,
allow Python through Windows Defender Firewall on Private networks, and prefer a phone hotspot
(shared WiFi in offices, campuses and hotels often blocks device-to-device traffic).

## Exit gate (bill check before leaving)
Every bill has a signed, one-time **exit pass** QR (`SCBILL-<order>-<signature>`) on its order page.
The customer holds it under the **Pi camera**; the Pi lights green (+1 beep) or red (+beeps).
Staff can also scan it with a phone on **Admin > Exit gate** (`exit.html`), which also shows every
Pi result live. The Pi camera reads **wallet top-up tokens** too (`SCTOP-...`): the token opens by
itself on **Wallet counter** (`counter.html`, green double blink on the Pi) and staff press Cash/UPI
received - the Pi never adds money by itself. The Pi camera can be used by one program at a time, so
in the Pi's own browser these pages leave the camera to the Pi program while it runs.
- **EXIT OK**: genuine, paid, first use. The bill is marked as used (by the Pi or by the staff member).
- **BILL ALREADY USED**: a screenshot or a second person using the same bill.
- **INVALID BILL**: fake or edited QR, or an order number typed into a QR generator.
- **HOLD CUSTOMER**: the shopper has unresolved flagged scans, or (hardware mode on, bag on the
  platform) the bag weight doesn't fit the items on the bill.

## Google sign-in (optional)
1. Open console.cloud.google.com/auth/clients and create a project (e.g. SmartCart).
2. **Branding**: app name SmartCart, your email as support + developer contact. Leave the logo
   empty (a logo makes Google ask for verification). **Audience**: External.
3. **Clients > Create client > Web application**. Authorised JavaScript origins:
   `https://<your-site>.onrender.com`, `http://localhost` and `http://localhost:5000`. No redirect URI.
   Create, then copy the **Client ID** (ends in `.apps.googleusercontent.com`).
   In Branding you can use `https://<your-site>.onrender.com/privacy.html` and `/terms.html` as the
   privacy policy and terms links.
4. **Audience > Publish app** (only name/email/profile are used, so no review is needed),
   or keep it in Testing and add your team's Gmail addresses as test users.
5. The project's own client ID (`509721464654-jup11...apps.googleusercontent.com`, origin
   `https://smartcart-gkrx.onrender.com`) is built into `config.py`, so the live site needs no setting.
   For another site or client, put its Client ID in `GOOGLE_CLIENT_ID` (Render > Environment, or
   `backend/.env`). The client **secret** is not used and must never be put in the code. Optional:
   `ADMIN_GOOGLE_EMAILS=you@gmail.com` makes those Google accounts admins.
The login page then shows **Continue with Google**. The server checks Google's signed token
(signature, this app's client ID, expiry, verified email) - passwords never reach the server.
Google only allows https sites and localhost, so it doesn't appear on `http://192.168.x.x:5000`.

## Works on locked-down networks
Everything the pages need is served by the site itself: the camera scanner (html5-qrcode), the QR
drawing library (qrcodejs) and the Plus Jakarta Sans font are in `frontend-html/vendor/` (licences
alongside). Office, campus or hotel Wi-Fi that blocks public CDNs (unpkg, cdnjs, Google Fonts) no longer
stops the Scan, Wallet counter, Exit gate, Wallet or bill pages. Only "Continue with Google" needs
accounts.google.com; if that is blocked, email + password still works.

The scanner and QR libraries are loaded only when a page needs them and never hold the page up: if a
network is slow or filters them, the page still draws, lists and polls, and the code can be typed.
If one of the page's own scripts fails, a red line at the top names the file and line.

On the Raspberry Pi itself (Chromium or Firefox), the Wallet counter and Exit gate pages leave the
camera to the SmartCart Pi program while it is running, and what it reads appears on those pages by
itself. When the Pi program is not running, they use the camera in the browser.

The Wallet counter shows a "Pi camera" line: online and passing tokens, not running, camera reader
off, or "old Pi program" (a cart_agent.py from before v2.8.4 - copy the new one to the Pi).

## Speed and security
- **No secrets in the code:** `JWT_SECRET`, `DEVICE_KEY` and `ADMIN_PASSWORD` come from `.env` or the
  host's settings. If one is missing, the server makes up a random value and keeps it in
  `backend/.jwt_secret` / `backend/.device_key` (ignored by git) - never a value printed in the code.
- **Memory cache:** the catalogue is kept in the server's RAM; the shop, product pages and every scan
  are answered without asking MySQL. Admin edits and checkouts clear it at once, and it refreshes
  itself every 5 minutes. Hit rate is shown under Admin > Hardware.
- Pages' CSS/JS are cached by the browser for a week (`?v=2.8.4` in the links changes with each version);
  pages themselves and all API answers are never cached stale.
- 5 wrong passwords for an email lock it for 15 minutes (`LOGIN_MAX_FAILURES`, `LOGIN_LOCK_MINUTES`).
- Security headers on every response (no MIME sniffing, no framing, camera only for this site,
  HTTPS-only on the public site). Passwords are hashed; prices always come from the database;
  bills are HMAC-signed and work once; hardware needs the device key.

## Every API route

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | /api/health | - | Server up, hardware mode, version |
| GET | /api/auth/config | - | Google client ID for the login page (or null) |
| POST | /api/auth/register | - | Create account, returns JWT |
| POST | /api/auth/login | - | Log in, returns JWT (locked after 5 wrong passwords) |
| POST | /api/auth/google | - | Log in / sign up with a Google token |
| GET | /api/auth/me | user | Current user |
| GET | /api/products | - | Published catalogue (`?q=` `?category=`) - memory cache |
| GET | /api/products/categories | - | Category list - memory cache |
| GET | /api/products/{id} | - | One product - memory cache |
| POST | /api/scan | user | Scan code, verify, add to cart or flag |
| GET | /api/cart | user | Cart lines + subtotal |
| POST | /api/cart/items | user | Add by product id (only when mode = off) |
| PATCH | /api/cart/items/{id} | user | Change quantity (0 removes) |
| DELETE | /api/cart/items/{id} | user | Remove a line |
| DELETE | /api/cart | user | Clear cart |
| POST | /api/checkout | user | Atomic checkout, paid from the wallet (409 insufficient_funds); crosses bought items off the list |
| GET | /api/list | user | Shopping list sorted by aisle, with what is already in the cart |
| POST | /api/list | user | Add `{product_id, quantity, add}` |
| PATCH | /api/list/{id} | user | Change quantity (0 removes) |
| DELETE | /api/list/{id} | user | Remove one item |
| DELETE | /api/list | user | Empty the list (`?done=1`: only ticked items) |
| POST | /api/list/from-order/{id} | user | Put an old bill's items on the list |
| PUT | /api/budget | user | `{"budget": 500}` or null to remove |
| GET | /api/recommendations | user | Buy again + today's deals |
| GET | /api/products/{id}/related | - | Often bought together |
| POST | /api/help | user | Call staff `{reason, location, note}` |
| GET | /api/help/mine | user | My open call (status, who is coming) |
| POST | /api/help/{id}/cancel | user | Don't need help any more |
| GET | /api/admin/help | admin | Open staff calls |
| POST | /api/admin/help/{id}/coming | admin | "On my way" |
| POST | /api/admin/help/{id}/done | admin | Close the call |
| GET | /api/wallet | user | Balance, history, unpaid top-up tokens |
| POST | /api/wallet/topups | user | New top-up token `{amount}` |
| GET | /api/wallet/topups/{id} | user | One token (status) |
| POST | /api/wallet/topups/{id}/cancel | user | Cancel an unpaid token |
| POST | /api/counter/lookup | admin | Scanned/typed token -> customer + amount |
| POST | /api/counter/topups/{id}/confirm | admin | `{"method": "cash"/"upi"}` credits the wallet once |
| GET | /api/counter/overview | admin | Waiting tokens, recent activity, today's cash/UPI |
| POST | /api/counter/credit | admin | Add money by email `{email, amount, note}` |
| GET | /api/counter/customers | admin | Search customers `?q=` |
| GET | /api/orders | user | Order history |
| GET | /api/orders/{id} | user | One bill (with its exit pass code) |
| GET | /api/profile | user | Profile + stats |
| PUT | /api/profile | user | Update name/org/password |
| GET | /api/admin/products | admin | All products (`?status=`) |
| GET | /api/admin/products/{id} | admin | One product |
| POST | /api/admin/products | admin | Create product |
| PUT | /api/admin/products/{id} | admin | Edit product |
| PATCH | /api/admin/products/{id}/status | admin | Publish / unpublish |
| DELETE | /api/admin/products/{id} | admin | Soft delete |
| POST | /api/admin/products/{id}/calibrate | admin | Save real weight + colour |
| POST | /api/admin/products/{id}/restock | admin | `{"add": 10}` adds to the stock |
| GET | /api/admin/export/sales.csv | admin | Bill lines as a spreadsheet (`?days=30`) |
| POST | /api/admin/products/{id}/photo | admin | Upload a product photo (form field `photo`) |
| DELETE | /api/admin/products/{id}/photo | admin | Remove the photo |
| GET | /api/products/{id}/photo | - | The product photo (JPEG) |
| GET | /api/admin/dashboard | admin | Today's numbers, 7 days, best sellers, fraud, low stock |
| GET | /api/admin/alerts | admin | Item-not-scanned alerts |
| POST | /api/admin/alerts/{id}/dismiss | admin | Close an alert |
| POST | /api/admin/reset | admin | `{"confirm": "RESET"}` clears test activity (cannot be undone) |
| GET | /api/admin/flags | admin | Fraud flags (`?status=open`) |
| POST | /api/admin/flags/{id}/resolve | admin | approve / reject |
| GET | /api/admin/orders | admin | All orders |
| PUT | /api/admin/settings | admin | `{"hardware_mode": "off/weight/full"}` |
| GET | /api/admin/system | admin | Mode, devices online, memory-cache stats |
| POST | /api/exit/verify | admin | Staff phone: check a bill QR - ok / used / invalid / hold |
| POST | /api/exit/device | device key | Pi camera: check a bill QR (+ platform weight) |
| GET | /api/exit/recent | admin | Last customers checked out |
| GET | /api/exit/events | admin | Live feed of exit checks (`?after=<id>`) |
| POST | /api/hardware/weight | device key | Weight reading |
| POST | /api/hardware/image | device key | JPEG photo |
| POST | /api/hardware/heartbeat | device key | Pi is alive (+ its status) |
| GET | /api/hardware/status | user | Latest readings, devices online, open not-scanned alerts |
| GET | /api/hardware/readings/{id} | device key | Pi: was this placement scanned? |
| GET | /api/hardware/images/{file} | - | Captured photo |
| POST | /api/hardware/simulate | admin | Fake readings for demos |

## Host it 24/7 for free (Render + Aiven MySQL)
1. Aiven (aiven.io): create a free **MySQL** service. Note Host, Port and Password (user `avnadmin`, database `defaultdb`).
2. Make a clean copy without secrets: `python create_smartcart.py upload --no-env`,
   then upload everything inside `upload` to a private GitHub repository.
3. Render (render.com): New > Blueprint > choose the repo. Fill DB_HOST, DB_PORT, DB_PASSWORD and
   ADMIN_PASSWORD (GOOGLE_CLIENT_ID / ADMIN_GOOGLE_EMAILS / UPI_ID are optional), then Apply.
4. Your site is `https://<name>.onrender.com`. The free plan sleeps after 15 min without visitors
   (the website shows "Waking up the server..." meanwhile); while the Pi is on, its heartbeat keeps it awake.
To update later: upload the new files to the same repository - Render redeploys by itself.
Variables added after the first deploy (e.g. GOOGLE_CLIENT_ID, UPI_ID) go in Render > your service > Environment.
Uploaded camera photos are not kept after a restart (free disk is temporary); readings and orders are
in MySQL, so they stay.

## Share it from the laptop instead (temporary https link)
With `python app.py` running: `cloudflared tunnel --url http://localhost:5000` and open the printed
`https://....trycloudflare.com` link. Keep `FLASK_DEBUG=0` and change the admin password first.

## Notes
- The phone camera needs https or localhost (the public Render site is https).
- Prices are single INR prices.
- Unknown pages show a friendly 404 page; slow first loads show a "waking up" bar and grey skeletons.
- `privacy.html` and `terms.html` explain what is stored and how the wallet works (linked from login and profile).

## Team
Shivraj Morde, Hardik Rawat and Ismail Mohammed.
