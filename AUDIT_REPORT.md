# CartLess Checkout (SmartCart) — Website Audit Report

| | |
|---|---|
| **Date of audit** | 23 November 2026, 08:57–09:34 UTC (14:27–15:04 IST) |
| **Live site** | `https://smartcart-gkrx.onrender.com` (Render free plan + Aiven MySQL) |
| **Code audited** | `hardikrawat910-byte/smartcart` @ `5efd7e4` and `hardikrawat910-byte/smart-billing-cart` @ `c2715fb`. The `backend/`, `frontend-html/`, `pi/` and `render.yaml` of the two repositories are byte-identical, so every finding applies to both. |
| **Version** | v2.9.0 |
| **Constraint honoured** | Inspection only. No application code was modified. This report is the only file added. |

## How this audit was done

1. **Live site:** probed with plain and browser-like HTTPS requests every 30 seconds for 37 minutes.
2. **Local replica:** the app was installed from the pinned `requirements.txt`, seeded into a fresh MySQL 8.0 database and started with the exact Render start command (`gunicorn app:app --workers 1 --threads 8 --timeout 60`).
3. **Browser crawl:** all 17 pages plus error URLs were opened in headless Chromium as a logged-out visitor, a shopper and an admin, at 320, 360, 390 and 1366 px widths. Console errors, uncaught exceptions, failed requests, HTTP 4xx/5xx, broken images, font loading and horizontal overflow were recorded.
4. **User journeys through the real UI:** sign-up → search → product → cart → shopping list → scan (manual code) → budget → wallet token → counter confirms → pay → bill → exit gate → profile → password change → call staff → session expiry → offline; and on the staff side product create/edit/delete, photo upload, restock, CSV export, counter and exit-gate pages.
5. **API probing:** bad inputs, boundary values, authorisation checks and concurrent requests.
6. **Failure injection:** database unreachable, server never answering, response lost in transit, device offline.

### Confidence tags used below

- **[Certain]** — reproduced, or read directly from the code or a server response.
- **[Likely]** — strong inference from evidence, not directly observable from outside.
- **[Guessing]** — plausible, could not be tested; verify before acting.

### What could not be tested

- **Render and Aiven dashboards and logs.** They are not reachable from outside, so the exact reason the live service does not start is an inference (issue A-1).
- **The live application itself** (Google sign-in on the real origin, real proxy headers, real latency), because the live server never answered.
- **A physical camera, iPhone Safari and the Raspberry Pi hardware.** Camera pages were tested through manual code entry; the Pi program was reviewed statically against the server contract.
- **Scale/weight verification** (`SCALE_ENABLED=1`), flag approval, alert dismissal, calibration and the simulator. The project ships with the scale switched off.

---

## Executive Summary

**The website is failing because the live server is not running at all — not because of a bug on a page.** For the whole 37-minute observation window every request to `smartcart-gkrx.onrender.com` was answered by Render's own placeholder (`503 Service Unavailable`, header `x-render-routing: hibernate-pending-wake`, page title "Render - Application loading"), and direct API calls received zero bytes for 232–280 seconds before being cut. A healthy free Render service wakes in about a minute; this one never did. **[Certain]**

**The most probable cause is the database.** The start command runs `python seed.py` *before* the web server, and `seed.py` exits with an error if MySQL cannot be reached. Reproduced locally: with the database unreachable the chain dies in 0.09 seconds and the web server never opens its port, which from the outside looks exactly like what the live site is doing. The last code change was 23 October 2026, a month of inactivity, which is the situation in which a free hosted database gets powered off. **[Likely]** — only the Render "Logs" tab can confirm it.

**The code itself is in much better shape than the live site suggests.** On a working database, all 17 pages load with no JavaScript exceptions, no failed assets and correctly loaded fonts; the complete shopper journey and the staff journeys pass; pages weigh roughly 60–80 KB compressed. **[Certain]**

**But the code has real defects that will surface once the site is back**, concentrated in money, stock and the exit gate:

- A shopper can see **"Payment successful"** for an *old* bill while the new items stay unpaid (B-1).
- Editing a product **silently puts sold stock back** on the shelf count (B-2).
- The same bill can pass the **exit gate more than once** if checked at the same instant (B-3).
- Anyone can **lock the admin out** of logging in for 15 minutes at a time (D-1).
- A whole campus Wi-Fi shares a limit of **20 sign-ups per hour** (D-2).
- Fixes shipped without bumping the version number **never reach returning visitors** (E-1).

**Issue count:** 1 Critical, 3 High, 12 Medium, 16 Low (32 total).

---

## Categorized Bug List

### A. Deployment and server health

#### A-1 — The live site never starts
- **Severity:** Critical
- **Location:** `https://smartcart-gkrx.onrender.com` (every URL); `render.yaml:11`; `backend/seed.py:257-263`
- **Symptom:** Browsers see Render's "Application loading" page indefinitely. API clients, the app's own data requests and the Raspberry Pi get no response at all and time out. Nothing of the actual website is ever served.
- **Root Cause:**
  - **[Certain]** The service is stuck in Render's wake-up state. 26 consecutive browser-style requests between 09:03 and 09:34 UTC all returned `503` with `x-render-routing: hibernate-pending-wake`; three `/api/health` requests returned 0 bytes after 232 s, 280 s and 280 s. The TLS certificate (`*.onrender.com`, valid 19 Nov 2026 – 17 Feb 2027) and DNS are fine, so this is not an SSL or DNS problem.
  - **[Likely]** The process exits during start-up. `render.yaml` starts the site with `python seed.py && gunicorn …`. `seed.py` stops with "Could not connect to MySQL" and exit code 1 when the database is unreachable, so `gunicorn` is never launched and no port is opened. Reproduced locally with a closed database port and with a non-existent database hostname: exit code 1 in 0.09 s both times.
  - **[Guessing]** Other causes that produce the same outside view: the Render free instance hours for the month are used up, the service was suspended, the last deploy failed, or a required environment value (`DB_HOST`, `DB_PORT`, `DB_PASSWORD`) was changed or lost.
- **Recommended Fix:**
  1. Open Render → the service → **Logs** and **Events**. A line starting "Could not connect to MySQL" confirms the database cause; a build error or a suspension notice points elsewhere.
  2. Open the Aiven console and check whether the MySQL service is running; power it back on if it was stopped, and confirm host, port and password still match the Render environment values.
  3. Longer term, stop making the web server's start depend on the seeding step succeeding: let the web server come up regardless and show a clear "database unavailable" message, and run the seeding/upgrade step separately.

#### A-2 — The health check reports "ok" when the database is dead
- **Severity:** High
- **Location:** `backend/app.py:85-88` (`/api/health`); `backend/services.py:141-147`; `render.yaml:12`
- **Symptom:** With the database unreachable, `/api/health` still answers `200 {"ok": true}` in 7 ms and the pages still load, but every data request (`/api/products`, login, cart) returns `500 "Something went wrong on the server"`. Render keeps sending visitors to a site that cannot do anything.
- **Root Cause:** **[Certain]** The health route only reports the hardware mode, and with the scale switched off that function returns "off" before it ever touches the database. Nothing in the health check runs a query. Reproduced by running the app against a closed database port.
- **Recommended Fix:** Make the health check perform one trivial database query and report failure when it fails, so the host (and the team) can see a database outage. Keep it lightweight so it does not slow the check.

#### A-3 — A server that does not answer leaves pages loading forever
- **Severity:** Medium
- **Location:** `frontend-html/js/api.js:84-108` (shared `api()` helper), `:66-71` (banner)
- **Symptom:** If the page has loaded but the server then stops answering (the free instance went to sleep while the cart was open, or a wake-up fails), the page shows grey loading shapes and the banner "Waking up the server… the first visit after a quiet spell takes up to a minute" with no end and no error. Reproduced: after 12 s of a non-answering API the page still showed 37 skeleton blocks and the same banner; by the code it never gives up.
- **Root Cause:** **[Certain]** Requests are sent with no time limit, and the banner text never changes however long the wait.
- **Recommended Fix:** Give every request a maximum wait (longer than a normal cold start, for example 75–90 seconds), then replace the skeleton with a clear error and a "Try again" button. Change the banner wording after the first minute so the user knows something is wrong rather than slow.

---

### B. Payments, stock and exit integrity

#### B-1 — "Payment successful" is shown for an old bill; the new items are never charged
- **Severity:** High
- **Location:** `frontend-html/js/cart.js:192-207` (`checkout`); `backend/routes/orders.py:32-34`
- **Symptom:** Reproduced through the cart page:
  1. Shopper presses **Pay ₹5.00**. The payment succeeds on the server but the reply is lost (weak phone signal, server slow to wake). The page says **"Payment failed. Your wallet has not been charged."** In fact the wallet *was* charged (₹760 → ₹755) and bill SC-000015 exists.
  2. The shopper carries on, adds a ₹120 item and presses **Pay ₹120.00**.
  3. The page opens **"Payment successful"** showing the *old* ₹5 bill and its unused exit pass. The wallet is not charged, no new bill exists, and the ₹120 item is still sitting in the cart. The shopper can walk to the exit with a valid pass.
- **Root Cause:** **[Certain]** The page creates a "do not bill twice" key and keeps it in the browser tab until a success reply arrives. When the reply is lost the key is kept, and it is not tied to what is in the cart. The server, seeing a key it already knows, returns the earlier bill without looking at the current cart. Separately, the "has not been charged" wording is shown for any lost reply even though the page cannot know that.
- **Recommended Fix:** Tie the key to the cart contents (or discard it whenever the cart changes or is found empty). On the server, when a known key arrives while the cart holds different items, do not report success for the old bill. Replace the "has not been charged" message with one that tells the shopper to check their wallet history before paying again.

#### B-2 — Saving the product edit form puts sold stock back
- **Severity:** High
- **Location:** `backend/routes/admin.py:70-73`, `:106-107`, `:150-161` (edit); `:472-482` (restock); `frontend-html/js/admin.js:453`, `:532`
- **Symptom:** An admin opens **Edit** on a product showing stock 8. While the form is open a shopper buys 3 (true stock 5). The admin changes only the description and saves: "Product updated", and stock is back to 8. Inventory drifts upward and the shop oversells. Related: six "+1 restock" presses arriving together all reported success but added only 3.
- **Root Cause:** **[Certain]** The edit form sends the whole product, including the stock number it showed when it was opened, and the server stores that number as-is. Restock reads, adds and writes the count without the lock that checkout uses, so simultaneous changes overwrite each other.
- **Recommended Fix:** Change stock only through "add/remove N" adjustments made under the same lock checkout uses. Have the edit form leave stock untouched unless the admin actually edited that field, and refuse the save if stock changed since the form was opened.

#### B-3 — One bill can pass the exit gate several times if checked at the same moment
- **Severity:** Medium
- **Location:** `backend/routes/exit_gate.py:58`, `:69`, `:107-110` (`/api/exit/verify` and `/api/exit/device`)
- **Symptom:** Six simultaneous checks of one unused bill returned **EXIT OK** three times in one run and five times in the next (only the rest said "already used"). One staff phone plus the Pi camera reading the same code together both got OK. One after another, re-use is correctly refused.
- **Root Cause:** **[Certain]** The server reads the bill, checks it is unused, then marks it used, without locking it in between. The server runs 8 request threads, so several checks can pass before any of them writes.
- **Recommended Fix:** Mark the bill as used in a single guarded step ("mark used only if still unused") and treat "nothing changed" as already used. The window is milliseconds, which is why this is Medium rather than High.

#### B-4 — A double-submitted payment answers "Your cart is empty"
- **Severity:** Low
- **Location:** `backend/routes/orders.py:32-39`
- **Symptom:** Four identical payment requests sent together (same key): one succeeds, the other three return `400 "Your cart is empty"` instead of the bill that was just created. The shopper sees an error although the payment went through, and the key stays stored, which sets up B-1.
- **Root Cause:** **[Certain]** The "have I seen this key?" check happens before the cart is locked. The waiting requests pass that check, then find the cart already emptied by the first one.
- **Recommended Fix:** Repeat the key check after the lock is obtained, so a duplicate returns the existing bill as the code comments intend.

---

### C. Reliability: server errors and stuck screens

#### C-1 — Two quick requests for the same item crash with "Something went wrong on the server"
- **Severity:** Medium
- **Location:** `backend/routes/cart.py:28-44` (used by add-to-cart, scan and flag approval); `backend/routes/shopping.py:43-57`; `backend/routes/admin.py:101-105`, `:137-147`
- **Symptom:** Six simultaneous "add to cart" for one product: two succeeded, four returned HTTP 500 and those adds were lost (cart showed 2, not 6). Same for the shopping list (4 of 6 failed) and for scanning (1 of 6 failed). Four simultaneous "create product" with one code gave one success and two or three 500s instead of "code already used". Happens when the same account is open on two devices or a request is retried.
- **Root Cause:** **[Certain]** The server checks "is this row already there?" and then inserts it. When two requests check at the same time both insert, the database rejects the duplicate, and that rejection is not handled.
- **Recommended Fix:** Handle the duplicate rejection by retrying as an update (cart, list) or by returning the existing "already used" message (products).

#### C-2 — Wallet counter: after a failed confirm the Cash/UPI buttons stay dead
- **Severity:** Medium
- **Location:** `frontend-html/js/counter.js:56-70`, `:160-163`
- **Symptom:** (a) Wi-Fi drops as staff press **Cash received**: a "Cannot reach the server" message, then both buttons stay disabled with a spinner even after the connection returns; staff must reload or retype the token. (b) Another staff member already confirmed the token: the warning appears, but the card still reads "waiting for payment ₹200.00" with dead buttons.
- **Root Cause:** **[Certain]** Both buttons are disabled when pressed and never re-enabled on failure, and the page skips redrawing the card when its content has not changed.
- **Recommended Fix:** On any failed confirm, re-enable the buttons and look the token up again so the card shows its true state.

#### C-3 — Exit page says the Pi gate is working when its code reader is off
- **Severity:** Medium
- **Location:** `frontend-html/js/exit.js:182-186`; `backend/routes/hardware.py:92-96`; `pi/cart_agent.py:913-914`
- **Symptom:** Green dot and "Online — customers hold the bill QR under the Pi camera" while the Pi itself reports that its exit reader is off (camera failed to open, reader disabled in its settings, or QR library missing). Nobody is reading bills. The Wallet counter page handles the same state correctly ("its camera reader is off").
- **Root Cause:** **[Certain]** The exit page only checks that a Pi is online; it ignores the reader status the Pi sends.
- **Recommended Fix:** Give the exit page the same "is it reading codes" status the counter page uses and word the banner from that.

#### C-4 — Unchecked values reach the database and come back as a bare 500
- **Severity:** Low
- **Location:** `backend/routes/admin.py:70-73` (stock has no upper limit); `backend/routes/wallet.py:252` (`limit`); `backend/routes/hardware.py:78` with `backend/routes/wallet.py:195-202` (heartbeat `roles`)
- **Symptom:** Stock of 2,147,483,648 in the product form → "Something went wrong on the server" with no field highlighted. Customer search with `limit=-1` → 500. A Pi status message whose `roles` is not a list makes the Wallet counter's data request fail on every refresh: the page shows "Cash today –" and loading shapes forever, with no error, until the next valid status message.
- **Root Cause:** **[Certain]** These values are passed on without range or type checks, and the counter page shows nothing when its data request fails.
- **Recommended Fix:** Add upper limits and type checks to those inputs, and show an error line on the counter page when its refresh fails.

#### C-5 — Counter page left open across a server restart stops opening Pi-scanned tokens
- **Severity:** Low
- **Location:** `frontend-html/js/counter.js:114-121`; `backend/cache.py` (`ExitFeed`)
- **Symptom:** After the server restarts (which a free host does whenever it sleeps), a counter page that stayed open no longer opens tokens the Pi camera reads; a freshly loaded page does. **[Certain]** for the mechanism, reproduced by simulating the restart in the browser.
- **Root Cause:** The page remembers the number of the last scan it saw; the server's numbering starts again from 1 after a restart, so new scans look old.
- **Recommended Fix:** On every refresh, reset the remembered position to the one the server reports.

#### C-6 — "Today" on the Wallet counter is not the same day as "Today" on the dashboard
- **Severity:** Low
- **Location:** `backend/routes/wallet.py:178` versus `backend/routes/admin.py:387-392`
- **Symptom:** The counter's "Cash today / UPI today" resets at 05:30 IST; the dashboard's day starts at 00:00 IST. Top-ups between midnight and 05:30 IST are counted in different days by the two pages. **[Certain]** from the code; small in practice for a shop closed overnight.
- **Root Cause:** The counter uses UTC midnight; the dashboard uses the shop's time-zone setting.
- **Recommended Fix:** Use the shop-day start for both.

#### C-7 — Dashboard top-up figures do not add up
- **Severity:** Low
- **Location:** `frontend-html/js/admin.js:59`, `:103`
- **Symptom:** Tile showed "₹4,608 · cash ₹4,133 · UPI ₹476" (the parts sum to ₹4,609).
- **Root Cause:** **[Certain]** Each figure is rounded separately.
- **Recommended Fix:** Show paise on these three figures, or build the total from the rounded parts.

---

### D. Security and abuse limits

#### D-1 — Anyone can lock any account, including the admin, out of logging in
- **Severity:** Medium
- **Location:** `backend/security.py:36-49`; `backend/routes/auth.py:61-65`; default admin address in `render.yaml` and `README.md`
- **Symptom:** After five wrong passwords for an email, the *correct* password is also refused for 15 minutes ("Too many wrong passwords. Try again in 15 minutes."). Reproduced. The admin's address `admin@smartcart.local` is published in the README, so a stranger can keep staff from signing in on a new device indefinitely by repeating five bad attempts every 15 minutes. Sessions already signed in keep working.
- **Root Cause:** **[Certain]** The lock is keyed on the email address alone and applies to every attempt regardless of who makes it.
- **Recommended Fix:** Slow down or challenge the *source* of the bad attempts rather than blocking the account for everyone; use a non-published admin address on the live site.

#### D-2 — Only 20 new accounts per hour for everyone sharing one network
- **Severity:** Medium
- **Location:** `backend/security.py:133-134`; `backend/config.py:111`
- **Symptom:** The 21st sign-up from one network address within an hour gets "Too many requests. Please wait 2464 seconds and try again." Reproduced. A college or office Wi-Fi presents one address for everyone, so a classroom demo stops accepting new users after 20.
- **Root Cause:** **[Certain]** The sign-up limit counts per network address, with a fixed limit of 20 per hour.
- **Recommended Fix:** Raise the limit to fit the expected audience for demos (it is the `REGISTER_PER_HOUR` setting) and show a friendlier message with the wait in minutes.

#### D-3 — Sending any `X-Device-Key` header switches off the per-user request limit
- **Severity:** Medium
- **Location:** `backend/security.py:130-131`
- **Symptom:** 130 change requests in one burst from one shopper account with a made-up device key were all processed; without that header the same account is stopped at request 61. **[Certain]**. By the same code path the sign-up limit in D-2 is skipped too. **[Likely]** — read from the code, not flooded.
- **Root Cause:** The limiter applies the generous hardware rule whenever the header is present, before checking that the key is the real one.
- **Recommended Fix:** Apply the hardware rule only after the key has been verified.

#### D-4 — The Sales CSV can carry spreadsheet formulas typed by customers
- **Severity:** Medium
- **Location:** `backend/routes/admin.py:488-515`
- **Symptom:** A customer registered with the name `=HYPERLINK("http://evil.example","Click")`; after one purchase, the admin's downloaded CSV contains that text as a live formula cell when opened in Excel or Google Sheets.
- **Root Cause:** **[Certain]** Customer names, emails and item names are written into the file exactly as typed.
- **Recommended Fix:** Neutralise any exported text that begins with `=`, `+`, `-` or `@` so spreadsheets treat it as plain text.

#### D-5 — The visitor's network address may be read from the wrong hop on Render (verify)
- **Severity:** Medium if confirmed
- **Location:** `backend/app.py:47`
- **Symptom / risk:** If Render passes requests through more than one proxy, every visitor would appear to come from the same address. Then D-2 becomes 20 sign-ups per hour for the whole world, 60 logged-out change requests per minute are shared by everyone, and 20 wrong passwords from anyone lock login for everyone.
- **Root Cause:** **[Certain]** the app trusts exactly one forwarding hop. **[Guessing]** whether Render's chain has one hop or more; it could not be checked because the live site is down.
- **Recommended Fix:** Once the site is up, have the server log the visitor address it sees for a request from a known phone and compare with the phone's real public address; adjust the number of trusted hops if they differ.

---

### E. Frontend and UI/UX

#### E-1 — Changed scripts are still published under the old version number, so returning visitors keep stale files
- **Severity:** Medium
- **Location:** all `frontend-html/*.html` (`?v=2.9.0` links); `frontend-html/sw.js:5`, `:28-32`; `backend/security.py:79`, `:167-170`
- **Symptom:** Three commits after v2.9.0 was set (13, 21 and 23 October) changed ten scripts and most pages, but every link still says `?v=2.9.0` and the offline cache is still named `smartcart-2.9.0`. Anyone who visited before those commits, or installed the app, keeps running the old scripts against the new pages; today that shows as "SmartCart" and "CartLess Checkout" wording mixed on one screen. **More important: any fix made from this report will not reach existing users either.**
- **Root Cause:** **[Certain]** Versioned files are kept by the browser for a week and by the installed app until the cache name changes; the app never re-checks them. The version number was not raised when the files changed.
- **Recommended Fix:** Raise the version number in every page link and in the service worker's cache name on every release that touches a script or stylesheet. Better, derive it automatically from the file contents so it cannot be forgotten.

#### E-2 — A long customer name or email breaks the Wallet counter and Exit gate layouts
- **Severity:** Medium
- **Location:** `frontend-html/js/counter.js:18-24`, `:127-131`; `frontend-html/js/exit.js:45`, `:118-121`; `frontend-html/css/style.css` (no wrapping rule for these rows)
- **Symptom:** With one customer whose name has no spaces, the counter page becomes 914 px wide on a 360–390 px phone and the amount to collect ("₹9,999.99") sits off-screen; the exit page becomes 885 px wide and the bottom navigation stretches with it. The counter still overflows at 1366 px. Measured in the browser; the layout returns to normal when the name is shortened.
- **Root Cause:** **[Certain]** Those rows do not allow long words to wrap or be cut off, and names (up to 120 characters) and emails (up to 255) come from customers.
- **Recommended Fix:** Let name and email lines wrap or truncate with "…" and keep the amount column a fixed width.

#### E-3 — iPhone zooms the page whenever a text box is tapped
- **Severity:** Low
- **Location:** `frontend-html/css/style.css:42` (15 px base text), `:94` (inputs inherit it)
- **Symptom:** On iPhone Safari the page zooms in on focusing login, search, amount and code fields, and stays zoomed. **[Certain]** about the sizes; **[Likely]** about the behaviour, which is standard for text boxes under 16 px but was not run on a real iPhone.
- **Root Cause:** Input text is 15 px.
- **Recommended Fix:** Make text inside input fields at least 16 px.

#### E-4 — Admin page header spills off a 320 px screen
- **Severity:** Low
- **Location:** `frontend-html/admin.html:23`; `frontend-html/css/style.css:50-51`
- **Symptom:** On a 320 px phone the "Counter / Exit gate / Back" buttons run to x = 329, the page scrolls sideways and the title is squeezed to 73 px. Fine at 360 px and above.
- **Root Cause:** **[Certain]** Three buttons that cannot wrap sit beside the title.
- **Recommended Fix:** Allow the buttons to wrap below the title on narrow screens.

#### E-5 — No tablet or desktop layout
- **Severity:** Low
- **Location:** `frontend-html/css/style.css:49` (page width capped at 420 px; no screen-size rules other than print)
- **Symptom:** On a laptop the admin dashboard, product list, orders and counter occupy a 420 px strip in the middle of the screen. Nothing is broken, but staff tools use under a third of the width.
- **Root Cause:** **[Certain]** The design is phone-only by construction.
- **Recommended Fix:** Add a wider layout for the three staff pages at tablet and desktop widths.

#### E-6 — Scan page always blames camera permission
- **Severity:** Low
- **Location:** `frontend-html/js/scan.js:56-66`
- **Symptom:** With no camera at all, or a camera in use by another app, the page says "Allow camera access in your browser settings, then reload." The counter and exit pages give the right reason for each case.
- **Root Cause:** **[Certain]** The scan page does not use the shared helper that words the message by failure type.
- **Recommended Fix:** Use the same message helper as the staff pages.

#### E-7 — Shopping list shows "added" right after "list is full"
- **Severity:** Low
- **Location:** `frontend-html/js/list.js:139-145`
- **Symptom:** When adding fails, two messages appear together: "Your list is full (60 items)…" and "Dettol Original Soap 125 g added (Aisle 6)". Reproduced.
- **Root Cause:** **[Certain]** The success message is shown whether or not the add worked.
- **Recommended Fix:** Show the success message only after a successful add.

#### E-8 — Typed product codes must match capital letters exactly
- **Severity:** Low
- **Location:** `backend/cache.py:74-83`; `backend/services.py:69-78`
- **Symptom:** Typing `smartcart-maggi-70` gives "isn't in the shop's catalogue"; `SMARTCART-MAGGI-70` works. A 14-digit form of a barcode (leading 0 + 13 digits) is also not recognised.
- **Root Cause:** **[Certain]** The in-memory lookup compares text exactly.
- **Recommended Fix:** Compare codes without regard to letter case, and treat a 14-digit number with a leading zero as its 13-digit form.

#### E-9 — Shoppers who open a staff page see staff buttons
- **Severity:** Low
- **Location:** `frontend-html/admin.html:23`, `counter.html:23`, `exit.html:23`; `frontend-html/js/admin.js:19-22`
- **Symptom:** A shopper on `admin.html` sees "This page is for admin accounts only." together with the Admin heading and Counter / Exit gate buttons that lead nowhere. No data leaks: every staff request is refused for a shopper account.
- **Root Cause:** **[Certain]** The header is fixed in the page and only the body is replaced.
- **Recommended Fix:** Hide the staff header actions unless the signed-in user is an admin.

#### E-10 — Colours need a 2023-or-newer browser
- **Severity:** Low
- **Location:** `frontend-html/css/style.css` (58 uses of `oklch` colours, plus `:has()`)
- **Symptom:** On browsers older than Chrome 111, Safari 15.4 or Firefox 113 the colour scheme is missing (plain backgrounds, default text colour). **[Certain]** about the features used; not tested on an old device.
- **Root Cause:** All theme colours use a modern colour notation with no fallback.
- **Recommended Fix:** Provide ordinary fallback colours before the modern ones.

---

### F. Documentation and housekeeping

#### F-1 — Setup instructions point at files that are not in the repository
- **Severity:** Low
- **Location:** `README.md:28` (smartcart); `README.md:356` and `SETUP.md:357`
- **Symptom:** The smartcart README says "Open `backend/.env`", but only `backend/.env.example` ships (the smart-billing-cart README correctly says to copy it). The hosting section tells the reader to run `python create_smartcart.py upload --no-env`; no such file exists in either repository.
- **Root Cause:** **[Certain]** Instructions left over from an earlier packaging workflow.
- **Recommended Fix:** Align the smartcart README with the copy step and remove or replace the `create_smartcart.py` step.

#### F-2 — API table omits the password-reset route
- **Severity:** Low
- **Location:** `README.md` "Every API route"; `backend/routes/wallet.py` (`/api/counter/reset-password`)
- **Symptom:** The staff password-reset route exists and works but is not listed.
- **Root Cause:** **[Certain]** Table not updated when the route was added.
- **Recommended Fix:** Add the row.

#### F-3 — Fonts and icons are re-checked on every page; two standard files are missing
- **Severity:** Low
- **Location:** `backend/security.py:158-171`; site root
- **Symptom:** The two font files and the icons are sent with "always re-check" caching, costing a few extra round trips per page on a slow connection. `/favicon.ico` and `/robots.txt` return the 404 page.
- **Root Cause:** **[Certain]** Long caching is given only to links carrying a version number, and fonts and icons are linked without one.
- **Recommended Fix:** Add the version number to font and icon links, and add a small `robots.txt`.

---

## Performance and server health (measured)

| Check | Result |
|---|---|
| Live homepage | `503` in 0.33–1.1 s, Render placeholder, 26 of 26 attempts over 31 minutes |
| Live `/api/health` | no bytes received; cut at 232 s, 280 s, 280 s |
| Live TLS / DNS | certificate `*.onrender.com`, valid to 17 Feb 2027; resolves and connects normally |
| Dependency install | all 15 pinned packages install cleanly on Python 3.12 |
| Database seeding (fresh MySQL 8.0) | succeeds: admin account, 48 products, 10 offers |
| Local page crawl | 17 pages × 3 roles × up to 4 widths: 0 uncaught script errors, 0 failed assets, 0 broken images, fonts loaded. The only console errors are expected 404s for deliberately wrong IDs and URLs. |
| Home page weight, compressed | HTML 0.9 KB, CSS 8.5 KB, scripts ≈ 21 KB, fonts ≈ 27–49 KB |
| Scanner library | 375 KB raw, 106 KB compressed, loaded only on pages that scan |
| Compression and caching | Brotli on text; versioned files cached 7 days; API responses never cached |
| Security headers | Content-Security-Policy, no-sniff, frame protection, permissions policy all present |
| Offline behaviour | service worker active; offline navigation shows the "You are offline" page |
| Stock under load | 7 shoppers buying the last 3 units together: exactly 3 succeed, 4 get a clear message, stock ends at 0, no server errors |

## Verified working

- **Shopper journey, end to end through the UI:** sign-up, redirect back to the page asked for, search, section and deals filters, product page, add to cart, add to shopping list, store map, list search, manual code scan with undo, barcode number lookup, quantity changes, budget warning, "Add ₹X" hand-off to the wallet with the amount pre-filled, token with QR, automatic balance update when staff confirm, pay, bill with exit QR, "Save QR" download, re-order to list, exit verification, profile edit, password change, sign-out, call-staff with live status, expired-session redirect.
- **Staff pages:** product create/edit/publish/delete, photo upload and re-encoding, QR labels, restock button, CSV download, dashboard figures matching the underlying records, counter lookups and confirms (simultaneous confirms credit exactly once), direct credit, customer search, password reset, exit checks for forged, edited and re-used codes.
- **Access control:** every staff route refuses shopper accounts (403) and missing or bad sessions (401); hardware routes refuse missing or wrong device keys; a shopper cannot read another shopper's bill.
- **Input handling:** names and notes containing HTML or script tags are displayed as plain text on every page checked.
- **Raspberry Pi contract (read, not run):** endpoints, headers, fields and version string match the server; the only mismatch is C-3.

## Recommended order of work

1. **A-1** — get the server running: read the Render logs, check the Aiven database. Nothing else is visible to users until this is done.
2. **A-2** — make the health check tell the truth about the database, so the next outage is noticed in minutes rather than weeks.
3. **E-1** — raise the version number as part of every release from here on; without it none of the fixes below reach people who have used the site before.
4. **B-1, B-2** — money and stock correctness.
5. **B-3, C-1, D-1, D-2, D-3** — before any demo with an audience on shared Wi-Fi.
6. **D-5** — verify on the live site as soon as it is up; it decides how urgent D-1 and D-2 are.
7. Everything else, in severity order.
