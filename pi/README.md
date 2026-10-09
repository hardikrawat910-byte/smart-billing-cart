# SmartCart - Raspberry Pi program

One Raspberry Pi 4 + Pi Camera v2 + HX711/load cell + 2 LEDs + buzzer does two jobs:

* **Cart** - put an item on the platform: the Pi sends its weight and a photo to the website,
  which checks barcode (scanned on the shopper's phone) + weight + colour together.
* **Exit gate** - after paying, the shopper holds the bill QR (on their phone) under the Pi
  camera. The website checks the bill; the Pi answers:

| Light / sound | Meaning |
|---|---|
| green + 1 beep | bill OK - customer may leave |
| green double blink + beep | wallet top-up token read - it opens on the Wallet counter page for staff to confirm |
| red + 2 beeps | bill already used |
| red + long beep | not a SmartCart bill / edited bill |
| red flashing + 3 beeps | hold: bag weight doesn't match the bill, or flagged items |
| red double blink + 2 beeps | cart: an item went in but was never scanned (repeats up to 3 times, every 15 s) |
| green x3 + short beep | program started and connected (after power-on) |
| short red blinks | no internet / website not reachable (it keeps retrying) |

The Pi never accepts connections from the internet. It only calls **out** to the website over
HTTPS with its device key - the website is the gateway between shoppers and the Pi.

## Wiring (BCM GPIO numbers, physical header pins)
| Part | Wire | Pi pin | Name |
|---|---|---|---|
| HX711 | VCC | 1 | 3.3 V |
| HX711 | GND | 9 | GND |
| HX711 | DT  | 29 | GPIO 5 |
| HX711 | SCK | 31 | GPIO 6 |
| Green LED | long leg, through a 220 ohm resistor | 11 | GPIO 17 |
| Red LED | long leg, through a 220 ohm resistor | 13 | GPIO 27 |
| Buzzer (active) | + (or I/O on a 3-pin module) | 15 | GPIO 22 |
| LED short legs, buzzer - / GND | breadboard GND rail | 14 | GND |
| 3-pin buzzer module only | VCC | 17 | 3.3 V |

Load cell -> HX711: red E+, black E-, white A-, green A+ (a 10 kg cell is wired the same way).
Camera: ribbon into the CAMERA port next to the HDMI ports, metal contacts facing the HDMI ports.
If your buzzer module beeps when its signal is LOW, set `buzzer_active_low = yes` in cart_agent.ini.
If the buzzer stays silent in `test-lights` but clicks when touched to 3.3 V, it is a **passive** buzzer:
set `buzzer_type = passive` under `[lights]` and the Pi plays a tone on it instead.

## Setup on the Pi
```
cd ~/pi
bash install.sh                       # camera, GPIO and QR libraries
python3 cart_agent.py test-camera     # first run creates cart_agent.ini
nano cart_agent.ini                   # paste device_key (Render > Environment > DEVICE_KEY)
python3 cart_agent.py test-camera     # photo + colour + any QR code in view
python3 cart_agent.py test-lights     # green, red, buzzer, then each pattern
python3 cart_agent.py calibrate       # empty platform, then a known weight (e.g. 500 g)
python3 cart_agent.py test-scale      # live grams - check it
python3 cart_agent.py run             # normal use (Ctrl+C to stop)
bash install.sh autostart             # start by itself on every power-on
bash install.sh firewall              # block all incoming connections
```
No load cell yet: `python3 cart_agent.py run --type-weight` (real camera + exit gate, typed weight).
Exit gate only: set `[scale] enabled = no`.  No hardware at all: `python3 cart_agent.py run --simulate`.

## What it sends (all with the X-Device-Key header)
* item settles on the platform: one photo `POST /api/hardware/image`, then one weight
  `POST /api/hardware/weight` (`device_id: rpi-cart`); 0 g when the platform is cleared
* bill QR seen by the camera: `POST /api/exit/device` with the code and the platform weight
* every 30 s: `POST /api/hardware/heartbeat` (the website shows the Pi as online)
