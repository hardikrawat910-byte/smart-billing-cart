# Server benchmark

`bench.py` drives the real SmartCart server through Flask's test client (local MySQL 8, seed data,
rate limiting off) and records what the IEEE paper and the presentations report:

| Test | Result (`results.json`) |
|---|---|
| Genuine exit pass, first use / second use | 90/90 accepted, 90/90 refused |
| Forged or edited passes (one digit changed, another order's tag, random tag, order that doesn't exist) | 360/360 refused |
| Edited top-up tokens / top-up confirmed twice | 50/50 refused, 50/50 credited once |
| Unknown or mistyped codes | 300/300 refused |
| Median server time: scan / checkout / exit check | 9.8 ms / 19.1 ms / 10.2 ms |

Times are server processing only (2-core test machine); network, camera and QR decoding on the Pi
are not included.

Run it from `backend/`:

```
ADMIN_PASSWORD=<your admin password> python ../tests/benchmark/bench.py
```
