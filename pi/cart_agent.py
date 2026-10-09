#!/usr/bin/env python3
"""
SmartCart - Raspberry Pi program (cart scale + camera + exit gate).

One Raspberry Pi with the Pi camera and an HX711 load cell does two jobs:
  cart  - when an item settles on the platform it sends ONE weight reading and ONE photo
          to the SmartCart website, which checks barcode + weight + colour.
  exit  - the same camera watches for bill QR codes (SCBILL-...). When a customer holds
          their bill under it, the website checks the bill and the Pi answers with the
          green LED + one beep (may leave) or the red LED + beeps (stop).

Security: the Pi never accepts connections from the internet. It only calls OUT to the
website over HTTPS with its device key - the website is the gateway between shoppers and
the Pi. "bash install.sh firewall" switches on a firewall that blocks everything coming in.

    python3 cart_agent.py test-camera    one photo -> test.jpg, its colour and any QR code in view
    python3 cart_agent.py test-lights    green LED, red LED and buzzer one after another
    python3 cart_agent.py test-scale     live weight (run calibrate first)
    python3 cart_agent.py calibrate      empty platform + a known weight -> saves the scale factor
    python3 cart_agent.py run            normal operation (Ctrl+C to stop)

Add --simulate to try it without the HX711, camera or LEDs (type weights on the keyboard),
or --type-weight to use the real camera but type the weight (load cell not wired yet).
Settings live in cart_agent.ini next to this file (created on the first run).
"""
import argparse
import configparser
import io
import json
import os
import signal
import statistics
import sys
import threading
import time
import urllib.error
import urllib.request

AGENT_VERSION = "2.8.4"
HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "cart_agent.ini")

DEFAULT_INI = """\
# SmartCart Raspberry Pi settings. Edit, save, then run:  python3 cart_agent.py run

[server]
# Your public website (Render), or a laptop on the same WiFi: http://<laptop IP>:5000
url = https://smartcart-gkrx.onrender.com
# DEVICE_KEY from Render > your service > Environment (or backend/.env on the laptop).
device_key = PASTE_DEVICE_KEY_HERE
device_id = rpi-cart
# "I'm alive" message every N seconds: shows the Pi as online on the website and
# keeps the free Render server awake while the Pi is switched on.
heartbeat_sec = 30

[scale]
enabled = yes
# BCM GPIO numbers: DT on GPIO 5 (header pin 29), SCK on GPIO 6 (header pin 31).
dt_pin = 5
sck_pin = 6
# Set by "python3 cart_agent.py calibrate". 0 = not calibrated yet.
scale_factor = 0
# platform = put one item on the platform, scan it, take it off (recommended for the demo)
# cart     = items pile up in the basket; each increase in weight is sent as the new item
mode = platform
# Weights below this count as an empty platform.
min_item_g = 2
# Readings must stay within this many grams to count as settled.
stable_band_g = 2

[camera]
enabled = yes
width = 1280
height = 960
# Fix exposure and white balance after start-up so colours stay the same for every item.
# Start the program with the platform EMPTY and the lamp ON.
lock_colours = yes

[exit]
# Read bill QR codes with the Pi camera and check them on the website.
enabled = yes
# How many camera frames per second are searched for a QR code.
scans_per_sec = 4
# A bill that stays in view (or comes back within this many seconds) is not checked again.
repeat_after_sec = 5

[lights]
# BCM GPIO numbers; -1 = not connected. GND for all of them: header pin 14.
green_pin = 17
red_pin = 27
buzzer_pin = 22
# yes if your buzzer module beeps when its signal is LOW ("low level trigger" modules)
buzzer_active_low = no
# active  = beeps by itself when it gets power (sealed bottom, usually a sticker on top)
# passive = only clicks on plain power (green circuit board visible underneath): the Pi plays a tone
buzzer_type = active
buzzer_tone_hz = 2700
"""


# =====================================================================
# Settings
# =====================================================================

def load_config(create=True):
    if not os.path.exists(CONFIG_PATH):
        if not create:
            raise SystemExit("cart_agent.ini is missing.")
        with open(CONFIG_PATH, "w", encoding="utf-8") as fh:
            fh.write(DEFAULT_INI)
        print(f"Created {CONFIG_PATH}")
        print("Open it, set [server] url and device_key, then run this command again.")
        print("  nano cart_agent.ini      (Ctrl+O, Enter to save; Ctrl+X to exit)")
        raise SystemExit(1)
    cfg = configparser.ConfigParser(inline_comment_prefixes=(";",))
    cfg.read(CONFIG_PATH, encoding="utf-8")
    return cfg


def save_scale_factor(factor):
    """Rewrite only the scale_factor line so the user's comments stay."""
    with open(CONFIG_PATH, encoding="utf-8") as fh:
        lines = fh.readlines()
    with open(CONFIG_PATH, "w", encoding="utf-8") as fh:
        for line in lines:
            if line.strip().startswith("scale_factor"):
                line = f"scale_factor = {factor:.6f}\n"
            fh.write(line)


def log(text):
    print(f"[{time.strftime('%H:%M:%S')}] {text}", flush=True)


# =====================================================================
# GPIO
# =====================================================================

class LgpioPins:
    """GPIO through lgpio: works on every Pi model with current Raspberry Pi OS, including Pi 5."""

    HEADER_LABELS = ("pinctrl-rp1", "pinctrl-bcm2711", "pinctrl-bcm2835", "pinctrl-bcm2712")

    def __init__(self, lgpio_module=None):
        if lgpio_module is None:
            import lgpio as lgpio_module
        self.lg = lgpio_module
        self.handle = self._open_header_chip()

    def _open_header_chip(self):
        lg = self.lg
        forced = os.getenv("SMARTCART_GPIOCHIP")
        if forced is not None:
            return lg.gpiochip_open(int(forced))
        fallback = None
        for number in range(0, 16):
            try:
                handle = lg.gpiochip_open(number)
            except Exception:
                continue
            label = ""
            try:
                info = lg.gpio_get_chip_info(handle)
                label = str(info[3]).lower()
            except Exception:
                pass
            if label.startswith(self.HEADER_LABELS):
                if fallback is not None:
                    lg.gpiochip_close(fallback)
                return handle
            if fallback is None:
                fallback = handle
            else:
                lg.gpiochip_close(handle)
        if fallback is not None:
            return fallback
        raise RuntimeError("No GPIO chip found. Is this a Raspberry Pi with python3-lgpio installed?")

    def setup(self, dt, sck):
        self.lg.gpio_claim_input(self.handle, dt)
        self.lg.gpio_claim_output(self.handle, sck, 0)

    def output(self, pin, value=0):
        self.lg.gpio_claim_output(self.handle, pin, value)

    def write(self, pin, value):
        self.lg.gpio_write(self.handle, pin, value)

    def tone(self, pin, hz):
        """Square wave for a passive buzzer (hz 0 = silent)."""
        if hz > 0:
            self.lg.tx_pwm(self.handle, pin, hz, 50)
        else:
            self.lg.tx_pwm(self.handle, pin, 0, 0)
            self.lg.gpio_write(self.handle, pin, 0)

    def read(self, pin):
        return self.lg.gpio_read(self.handle, pin)

    def close(self):
        try:
            self.lg.gpiochip_close(self.handle)
        except Exception:
            pass


class RpiGpioPins:
    """Fallback for older Raspberry Pi OS images without lgpio (not for Pi 5)."""

    def __init__(self):
        import RPi.GPIO as GPIO
        self.GPIO = GPIO
        GPIO.setwarnings(False)
        GPIO.setmode(GPIO.BCM)

    def setup(self, dt, sck):
        self.GPIO.setup(dt, self.GPIO.IN)
        self.GPIO.setup(sck, self.GPIO.OUT, initial=0)

    def output(self, pin, value=0):
        self.GPIO.setup(pin, self.GPIO.OUT, initial=value)

    def write(self, pin, value):
        self.GPIO.output(pin, value)

    def tone(self, pin, hz):
        pwm = getattr(self, "_pwm", {})
        self._pwm = pwm
        if hz > 0:
            if pin not in pwm:
                pwm[pin] = self.GPIO.PWM(pin, hz)
            pwm[pin].ChangeFrequency(hz)
            pwm[pin].start(50)
        elif pin in pwm:
            pwm[pin].stop()
            self.GPIO.output(pin, 0)

    def read(self, pin):
        return self.GPIO.input(pin)

    def close(self):
        self.GPIO.cleanup()


def open_pins():
    try:
        return LgpioPins()
    except ImportError:
        pass
    try:
        return RpiGpioPins()
    except ImportError:
        raise SystemExit("No GPIO library found. Run:  sudo apt install -y python3-lgpio")


# =====================================================================
# Green LED, red LED, buzzer
# =====================================================================

class Lights:
    """Light + sound patterns, played in the background so the scale never waits.
    A new pattern replaces the one that is playing (the newest result wins)."""

    # steps of (green, red, buzzer, seconds)
    PATTERNS = {
        "ready": [(1, 0, 1, .08), (0, 0, 0, .12), (1, 0, 0, .12), (0, 0, 0, .12), (1, 0, 0, .12)],
        "item": [(1, 0, 0, .25)],
        "ok": [(1, 0, 1, .18), (1, 0, 0, 1.8)],
        # a wallet top-up token: handed to the Wallet counter page, staff confirm the money
        "token": [(1, 0, 1, .1), (0, 0, 0, .12), (1, 0, 0, .12), (0, 0, 0, .12), (1, 0, 0, 1.2)],
        "used": [(0, 1, 1, .12), (0, 1, 0, .1), (0, 1, 1, .12), (0, 1, 0, 1.6)],
        "invalid": [(0, 1, 1, .7), (0, 1, 0, 1.3)],
        "hold": [(0, 1, 1, .2), (0, 0, 0, .2)] * 3 + [(0, 1, 0, .25), (0, 0, 0, .25)] * 2,
        "offline": [(0, 1, 0, .12), (0, 0, 0, .12), (0, 1, 0, .12)],
        "keyerror": [(0, 1, 1, .08), (0, 1, 0, 1.0)],
        # an item went into the cart but was never scanned: red double blink + 2 beeps
        "unscanned": [(0, 1, 1, .15), (0, 0, 0, .15), (0, 1, 1, .15), (0, 0, 0, .3),
                      (0, 1, 0, .15), (0, 0, 0, .15), (0, 1, 0, .15)],
    }
    WORDS = {
        "ready": "green x3 + short beep", "ok": "GREEN + 1 beep",
        "token": "green double blink + beep (top-up token sent to the counter)", "used": "RED + 2 beeps",
        "invalid": "RED + long beep", "hold": "RED flashing + 3 beeps", "offline": "red blink",
        "keyerror": "red + beep", "unscanned": "RED double blink + 2 beeps (item not scanned)",
    }

    def __init__(self, pins=None, green=-1, red=-1, buzzer=-1, buzzer_active_low=False, echo=False,
                 buzzer_hz=0):
        self.pins = pins
        self.green, self.red, self.buzzer = green, red, buzzer
        self.active_low = buzzer_active_low
        self.buzzer_hz = buzzer_hz if hasattr(pins, "tone") else 0   # > 0: passive buzzer, play a tone
        self._beeping = False
        self.echo = echo or pins is None
        self._wake = threading.Event()
        self._next = None
        self._stop = False
        if pins is not None:
            for pin in (green, red):
                if pin >= 0:
                    pins.output(pin, 0)
            if buzzer >= 0:
                pins.output(buzzer, 1 if buzzer_active_low else 0)
        threading.Thread(target=self._worker, daemon=True).start()

    def _set(self, g, r, b):
        if self.pins is None:
            return
        if self.green >= 0:
            self.pins.write(self.green, g)
        if self.red >= 0:
            self.pins.write(self.red, r)
        if self.buzzer >= 0:
            if self.buzzer_hz:
                if bool(b) != self._beeping:
                    self.pins.tone(self.buzzer, self.buzzer_hz if b else 0)
                    self._beeping = bool(b)
            else:
                self.pins.write(self.buzzer, (1 - b) if self.active_low else b)

    def show(self, name):
        if name not in self.PATTERNS:
            return
        if self.echo and name in self.WORDS:
            print(f"   lights: {self.WORDS[name]}", flush=True)
        self._next = name
        self._wake.set()

    def _worker(self):
        while not self._stop:
            self._wake.wait()
            self._wake.clear()
            name, self._next = self._next, None
            if name is None:
                continue
            for g, r, b, seconds in self.PATTERNS[name]:
                self._set(g, r, b)
                if self._wake.wait(seconds):       # a newer pattern arrived: switch to it
                    break
            self._set(0, 0, 0)

    def close(self):
        self._stop = True
        self._wake.set()
        try:
            self._set(0, 0, 0)
        except Exception:
            pass


# =====================================================================
# HX711 load cell
# =====================================================================

class HX711:
    """Bit-banged HX711 (channel A, gain 128). Returns signed 24-bit raw values."""

    def __init__(self, pins, dt, sck):
        self.pins, self.dt, self.sck = pins, dt, sck
        pins.setup(dt, sck)
        pins.write(sck, 0)

    def ready(self):
        return self.pins.read(self.dt) == 0

    def read_raw(self, timeout=0.6):
        deadline = time.monotonic() + timeout
        while not self.ready():
            if time.monotonic() > deadline:
                return None
            time.sleep(0.001)
        write, read, sck, dt = self.pins.write, self.pins.read, self.sck, self.dt
        value = 0
        for _ in range(24):
            write(sck, 1)
            write(sck, 0)
            value = (value << 1) | (1 if read(dt) else 0)
        write(sck, 1)          # 25th pulse selects channel A, gain 128 for the next reading
        write(sck, 0)
        if value & 0x800000:
            value -= 1 << 24
        if value in (0x7FFFFF, -0x800000, -1):
            return None        # saturated or a glitched read (Linux interrupted the clock)
        return value

    def read_median(self, samples=3):
        values = [v for v in (self.read_raw() for _ in range(samples)) if v is not None]
        return statistics.median(values) if values else None


class Scale:
    """Grams from the HX711: tare on start-up, factor from calibrate."""

    def __init__(self, hx, factor):
        self.hx = hx
        self.factor = factor
        self.offset = 0.0

    def average_raw(self, count=15):
        values = [v for v in (self.hx.read_median() for _ in range(count)) if v is not None]
        if len(values) < max(3, count // 3):
            raise RuntimeError("The HX711 is not answering. Check VCC, GND, DT and SCK wiring.")
        return statistics.median(values)

    def tare(self):
        self.offset = self.average_raw()

    def grams(self):
        raw = self.hx.read_median()
        if raw is None or not self.factor:
            return None
        return (raw - self.offset) / self.factor


# =====================================================================
# Camera + QR codes
# =====================================================================

class PiCamera:
    def __init__(self, width=1280, height=960, lock_colours=True, picamera2_module=None):
        if picamera2_module is None:
            try:
                from picamera2 import Picamera2
            except ImportError:
                raise SystemExit("Picamera2 is missing. Run:  sudo apt install -y python3-picamera2")
        else:
            Picamera2 = picamera2_module.Picamera2
        try:
            self.cam = Picamera2()
        except (IndexError, RuntimeError) as exc:
            raise SystemExit(f"No camera found ({exc}). Check the ribbon cable, then run: rpicam-hello --list-cameras")
        self.lock = threading.Lock()          # the scale and the QR reader share the camera
        self.cam.configure(self.cam.create_still_configuration(main={"size": (width, height)}))
        self.cam.start()
        time.sleep(2)              # let exposure and white balance settle
        self.locked = False
        if lock_colours:
            self.lock_colours()

    def lock_colours(self):
        metadata = self.cam.capture_metadata()
        controls = {"AwbEnable": False, "AeEnable": False}
        for key in ("ColourGains", "ExposureTime", "AnalogueGain"):
            if key in metadata:
                controls[key] = metadata[key]
        self.cam.set_controls(controls)
        time.sleep(0.5)
        self.locked = True

    def jpeg(self):
        buffer = io.BytesIO()
        with self.lock:
            self.cam.capture_file(buffer, format="jpeg")
        return buffer.getvalue()

    def gray_frame(self):
        """One frame as a 2-D grey image for the QR reader (green channel: sharpest)."""
        with self.lock:
            frame = self.cam.capture_array("main")
        if getattr(frame, "ndim", 2) == 3:
            return frame[:, :, 1].copy()
        return frame

    def close(self):
        try:
            self.cam.stop()
        except Exception:
            pass


class QrReader:
    """Finds QR codes in a grey frame with pyzbar, or OpenCV as a fallback (install.sh sets one up)."""

    def __init__(self):
        self.kind = "missing"
        self._decode = None
        try:
            from pyzbar.pyzbar import ZBarSymbol, decode
            self._decode = lambda img: [r.data.decode("utf-8", "replace")
                                        for r in decode(img, symbols=[ZBarSymbol.QRCODE])]
            self.kind = "pyzbar"
            return
        except Exception:              # not installed, or the zbar library is missing
            pass
        try:
            import cv2
            detector = cv2.QRCodeDetector()

            def opencv_decode(img):
                text, _, _ = detector.detectAndDecode(img)
                return [text] if text else []
            self._decode = opencv_decode
            self.kind = "opencv"
        except Exception:
            pass

    def decode(self, gray):
        return self._decode(gray) if self._decode else []


def centre_colour(jpeg_bytes):
    """Same rule the server uses: average colour of the middle half of the photo."""
    try:
        from PIL import Image
    except ImportError:
        return None
    with Image.open(io.BytesIO(jpeg_bytes)) as img:
        img = img.convert("RGB")
        w, h = img.size
        r, g, b = img.crop((w // 4, h // 4, w * 3 // 4, h * 3 // 4)).resize((1, 1)).getpixel((0, 0))
    return f"#{r:02x}{g:02x}{b:02x}"


# =====================================================================
# Simulation (no hardware)
# =====================================================================

class SimScale:
    """Weights typed on the keyboard, or a script like "0:2,105:4,0:2" (grams:seconds)."""

    def __init__(self, script=None):
        self.value = 0.0
        self.done = False
        self.script = script
        if script:
            threading.Thread(target=self._play, daemon=True).start()
        else:
            threading.Thread(target=self._keyboard, daemon=True).start()

    def _play(self):
        for part in self.script.split(","):
            grams, seconds = part.split(":")
            self.value = float(grams)
            time.sleep(float(seconds))
        self.done = True

    def _keyboard(self):
        print("Simulation: type a weight in grams and press Enter (0 = empty platform).")
        for line in sys.stdin:
            try:
                self.value = float(line.strip())
            except ValueError:
                print("Type a number, e.g. 105")

    def tare(self):
        pass

    def grams(self):
        time.sleep(0.1)
        return self.value


class SimCamera:
    """Plain-colour photos. If --sim-view points to an image file (e.g. a QR code PNG),
    the QR reader 'sees' that image while the file exists."""

    def __init__(self, colour="#c8323c", view=None):
        self.colour = colour
        self.view = view
        self.locked = True

    def jpeg(self):
        from PIL import Image
        rgb = tuple(int(self.colour[i:i + 2], 16) for i in (1, 3, 5))
        buffer = io.BytesIO()
        Image.new("RGB", (640, 480), rgb).save(buffer, "JPEG")
        return buffer.getvalue()

    def gray_frame(self):
        import numpy
        from PIL import Image
        if self.view and os.path.exists(self.view):
            try:
                with Image.open(self.view) as img:
                    return numpy.array(img.convert("L"))
            except OSError:
                pass                   # file half-written: next frame
        return numpy.full((240, 320), 128, dtype=numpy.uint8)

    def close(self):
        pass


# =====================================================================
# Placement detection: one reading per item
# =====================================================================

class PlacementDetector:
    """Turns a stream of weights into events, so one item sends exactly one reading.

    platform mode: ("placed", grams) when a new weight settles, ("emptied", 0) when cleared.
    cart mode:     ("placed", increase) when weight goes up, ("removed", decrease) when it drops.
    """

    def __init__(self, mode="platform", min_item_g=2.0, band_g=2.0, window=5):
        self.mode = mode
        self.min_item_g = min_item_g
        self.band_g = band_g
        self.size = window
        self.window = []
        self.last_sent = None      # platform mode
        self.empty = True
        self.baseline = 0.0        # cart mode

    def settled_value(self):
        if len(self.window) < self.size:
            return None
        spread = max(self.window) - min(self.window)
        value = statistics.median(self.window)
        if spread > max(self.band_g, 0.01 * abs(value)):
            return None
        return value

    def feed(self, grams):
        if grams is None:
            return None
        self.window.append(grams)
        if len(self.window) > self.size:
            self.window.pop(0)
        value = self.settled_value()
        if value is None:
            return None
        if self.mode == "cart":
            step = max(self.min_item_g, 3.0)
            change = value - self.baseline
            if change >= step:
                self.baseline = value
                return ("placed", round(change, 1))
            if change <= -step:
                self.baseline = value
                return ("removed", round(-change, 1))
            return None
        if value < self.min_item_g:
            if not self.empty:
                self.empty = True
                self.last_sent = None
                return ("emptied", 0.0)
            return None
        self.empty = False
        if self.last_sent is None or abs(value - self.last_sent) > max(3.0, 0.03 * self.last_sent):
            self.last_sent = value
            return ("placed", round(value, 1))
        return None


# =====================================================================
# Website (the only thing the Pi talks to)
# =====================================================================

class Server:
    def __init__(self, url, device_key, device_id="rpi-cart"):
        self.url = url.rstrip("/")
        self.key = device_key
        self.device_id = device_id

    def _request(self, path, data=None, content_type=None, timeout=20):
        headers = {"X-Device-Key": self.key, "X-Device-Id": self.device_id,
                   "User-Agent": f"SmartCart-Pi/{AGENT_VERSION}"}
        if content_type:
            headers["Content-Type"] = content_type
        req = urllib.request.Request(self.url + path, data=data, headers=headers,
                                     method="POST" if data is not None else "GET")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = resp.read()
                return resp.status, (json.loads(body) if body else {})
        except urllib.error.HTTPError as exc:
            try:
                return exc.code, json.loads(exc.read() or b"{}")
            except ValueError:
                return exc.code, {}
        except (urllib.error.URLError, OSError, ValueError) as exc:
            return None, {"error": str(getattr(exc, "reason", exc))}

    def _json(self, path, payload, timeout=20):
        return self._request(path, json.dumps(payload).encode(), "application/json", timeout)

    def health(self):
        # long timeout: a sleeping Render free instance takes about a minute to wake up
        return self._request("/api/health", timeout=90)

    def send_weight(self, grams):
        return self._json("/api/hardware/weight", {"device_id": self.device_id, "weight_g": round(grams, 1)})

    def send_photo(self, jpeg_bytes):
        return self._request("/api/hardware/image", jpeg_bytes, "image/jpeg")

    def check_reading(self, reading_id):
        """Was this placement scanned? -> {"consumed": bool, "alert": "open"/"scanned"/.../None}"""
        return self._request(f"/api/hardware/readings/{int(reading_id)}", timeout=20)

    def heartbeat(self, info):
        return self._json("/api/hardware/heartbeat", {"device_id": self.device_id, **info}, timeout=30)

    def check_bill(self, code, weight_g=None):
        return self._json("/api/exit/device", {"device_id": self.device_id, "code": code,
                                                "weight_g": round(weight_g, 1) if weight_g is not None else None},
                          timeout=30)


def explain(status, payload):
    if status is None:
        return f"server not reachable ({payload.get('error')})"
    if status == 401:
        return "device key rejected - copy DEVICE_KEY from the website settings into cart_agent.ini"
    if status >= 400:
        return f"error {status}: {payload.get('error')}"
    return "ok"


# =====================================================================
# Building the parts from the settings
# =====================================================================

def build_scale(cfg, simulate, script=None, pins=None):
    if simulate:          # --simulate or --type-weight
        return SimScale(script)
    if not cfg.getboolean("scale", "enabled", fallback=True):
        return None
    factor = cfg.getfloat("scale", "scale_factor", fallback=0.0)
    pins = pins or open_pins()
    hx = HX711(pins, cfg.getint("scale", "dt_pin", fallback=5), cfg.getint("scale", "sck_pin", fallback=6))
    return Scale(hx, factor)


def build_camera(cfg, simulate, sim_colour, sim_view=None):
    if not cfg.getboolean("camera", "enabled", fallback=True):
        return None
    if simulate:
        return SimCamera(sim_colour, sim_view)
    return PiCamera(cfg.getint("camera", "width", fallback=1280), cfg.getint("camera", "height", fallback=960),
                    cfg.getboolean("camera", "lock_colours", fallback=True))


def build_lights(cfg, pins):
    passive = cfg.get("lights", "buzzer_type", fallback="active").strip().lower() == "passive"
    return Lights(pins,
                  cfg.getint("lights", "green_pin", fallback=17),
                  cfg.getint("lights", "red_pin", fallback=27),
                  cfg.getint("lights", "buzzer_pin", fallback=22),
                  cfg.getboolean("lights", "buzzer_active_low", fallback=False),
                  buzzer_hz=cfg.getint("lights", "buzzer_tone_hz", fallback=2700) if passive else 0)


# =====================================================================
# Commands
# =====================================================================

def cmd_test_camera(cfg, args):
    camera = build_camera(cfg, args.simulate, args.sim_colour, args.sim_view)
    if camera is None:
        raise SystemExit("The camera is disabled in cart_agent.ini ([camera] enabled = no).")
    data = camera.jpeg()
    path = os.path.join(HERE, "test.jpg")
    with open(path, "wb") as fh:
        fh.write(data)
    colour = centre_colour(data)
    print(f"Saved {path} ({len(data) // 1024} KB).", f"Centre colour {colour}." if colour else "")
    qr = QrReader()
    if qr.kind == "missing":
        print("QR reader missing - run:  sudo pip3 install --break-system-packages pyzbar")
    else:
        codes = qr.decode(camera.gray_frame())
        print(f"QR codes in view ({qr.kind}): {', '.join(codes) if codes else 'none'}")
    camera.close()


def cmd_test_lights(cfg, args):
    pins = None if args.simulate else open_pins()
    lights = build_lights(cfg, pins)
    if pins is not None:
        for name, pin in (("green LED", lights.green), ("red LED", lights.red), ("buzzer", lights.buzzer)):
            if pin < 0:
                print(f"{name}: not set in cart_agent.ini")
                continue
            print(f"{name} on GPIO {pin} ...")
            lights._set(int(name == "green LED"), int(name == "red LED"), int(name == "buzzer"))
            time.sleep(0.4 if name == "buzzer" else 1.0)
            lights._set(0, 0, 0)
            time.sleep(0.3)
    for name in ("ok", "used", "invalid", "hold", "unscanned"):
        print(f"pattern '{name}'")
        lights.show(name)
        time.sleep(2.6)
    lights.close()
    if pins is not None:
        pins.close()


def cmd_test_scale(cfg, args):
    scale = build_scale(cfg, args.simulate, args.script)
    if scale is None:
        raise SystemExit("The scale is disabled in cart_agent.ini ([scale] enabled = no).")
    if not args.simulate and not scale.factor:
        raise SystemExit("Not calibrated yet. Run:  python3 cart_agent.py calibrate")
    print("Taring - keep the platform empty...")
    scale.tare()
    print("Live weight (Ctrl+C to stop):")
    try:
        while True:
            grams = scale.grams()
            if grams is not None:
                print(f"\r  {grams:8.1f} g   ", end="", flush=True)
            if getattr(scale, "done", False):
                break
    except KeyboardInterrupt:
        pass
    print()


def cmd_calibrate(cfg, args):
    if args.simulate:
        raise SystemExit("Calibrate needs the real HX711 (leave out --simulate).")
    pins = open_pins()
    hx = HX711(pins, cfg.getint("scale", "dt_pin", fallback=5), cfg.getint("scale", "sck_pin", fallback=6))
    scale = Scale(hx, 0)
    input("1) Take everything off the platform, then press Enter... ")
    zero = scale.average_raw(20)
    print(f"   empty reading: {zero:.0f}")
    while True:
        text = input("2) Put an object of known weight on the platform and type its grams (e.g. 500): ")
        try:
            known = float(text)
            if known > 0:
                break
        except ValueError:
            pass
        print("   Type the weight as a number of grams.")
    loaded = scale.average_raw(20)
    factor = (loaded - zero) / known
    if abs(factor) < 1:
        raise SystemExit("The reading did not change. Check the load cell wires on E+/E-/A+/A- and that the "
                         "platform presses on the free end of the bar.")
    save_scale_factor(factor)
    scale.factor, scale.offset = factor, zero
    check = scale.grams()
    print(f"   scale_factor = {factor:.4f} saved to cart_agent.ini")
    if check is not None:
        print(f"   Check: it now reads {check:.1f} g (should be about {known:g} g).")
    pins.close()


class Agent:
    """Everything that runs at the same time: scale (main thread), QR reader, heartbeat."""

    def __init__(self, cfg, args):
        self.cfg = cfg
        self.args = args
        self.stop = threading.Event()
        self.platform_g = None           # latest weight on the platform (for the exit bag check)
        self.started = time.monotonic()
        self.mode = None
        self.key_ok = None
        self.min_item_g = cfg.getfloat("scale", "min_item_g", fallback=2.0)
        self.unscanned_after = 15        # seconds; the server sends its value in every heartbeat

    # ---- start-up ----
    def connect(self):
        url = self.cfg.get("server", "url", fallback="").strip()
        key = self.cfg.get("server", "device_key", fallback="").strip()
        if not url or not key or key == "PASTE_DEVICE_KEY_HERE":
            raise SystemExit("Set [server] url and device_key in cart_agent.ini first.")
        self.server = Server(url, key, self.cfg.get("server", "device_id", fallback="rpi-cart").strip() or "rpi-cart")
        print(f"Connecting to {self.server.url} ...", flush=True)
        while not self.stop.is_set():
            status, payload = self.server.health()
            if status == 200:
                self.mode = payload.get("hardware_mode")
                print(f"Server OK (verification mode: {self.mode}).", flush=True)
                return
            print(f"Cannot reach the SmartCart server: {explain(status, payload)}.\n"
                  "  Check the url in cart_agent.ini and the Pi's internet. Retrying in 10 s (Ctrl+C to stop)...",
                  flush=True)
            self.lights.show("offline")
            self.stop.wait(10)

    def roles(self):
        roles = []
        if self.scale is not None:
            roles.append("cart")
        if self.exit_on:
            roles.append("exit")
        return roles

    # ---- heartbeat thread ----
    def heartbeat_once(self):
        scale_state = "off" if self.scale is None else ("simulated" if isinstance(self.scale, SimScale) else "ok")
        camera_state = "off" if self.camera is None else ("simulated" if isinstance(self.camera, SimCamera) else "ok")
        # "tokens" tells the website this program passes wallet top-up tokens to the counter page
        status, payload = self.server.heartbeat({
            "version": AGENT_VERSION, "roles": self.roles() + (["tokens"] if self.exit_on else []), "scale": scale_state, "camera": camera_state,
            "qr": self.qr.kind if self.exit_on else "off", "weight_g": self.platform_g,
            "uptime_sec": round(time.monotonic() - self.started)})
        if status == 200:
            if self.key_ok is not True and self.key_ok is not None:
                log("connection back - device key accepted")
            self.key_ok = True
            mode = payload.get("hardware_mode")
            if self.mode is not None and mode != self.mode:
                log(f"website verification mode is now: {mode}")
            self.mode = mode
            self.unscanned_after = int(payload.get("unscanned_alert_sec") or self.unscanned_after)
        elif status == 401:
            if self.key_ok is not False:
                log(explain(status, payload))
                self.lights.show("keyerror")
            self.key_ok = False
        else:
            if self.key_ok is not None or status is not None:
                log(f"heartbeat failed: {explain(status, payload)} (will retry)")
            self.lights.show("offline")
            self.key_ok = "offline"
        return status

    def heartbeat_loop(self):
        every = max(5, self.cfg.getint("server", "heartbeat_sec", fallback=30))
        while not self.stop.wait(every):
            self.heartbeat_once()

    # ---- exit gate thread ----
    def exit_loop(self):
        interval = 1 / max(0.5, self.cfg.getfloat("exit", "scans_per_sec", fallback=4))
        repeat_after = self.cfg.getfloat("exit", "repeat_after_sec", fallback=5)
        seen_at = {}
        error_logged = False
        while not self.stop.is_set():
            started = time.monotonic()
            try:
                codes = self.qr.decode(self.camera.gray_frame())
                error_logged = False
            except Exception as exc:          # camera busy/hiccup: try again shortly
                if not error_logged:
                    log(f"QR reader problem: {exc}")
                    error_logged = True
                self.stop.wait(2)
                continue
            now = time.monotonic()
            for code in codes:
                code = code.strip()
                if not code.upper().startswith(("SCBILL-", "SCTOP-")):
                    continue                  # product labels on the platform are not bills or tokens
                previous = seen_at.get(code)
                seen_at[code] = now
                if previous is not None and now - previous < repeat_after:
                    continue                  # still in view, or shown again too soon
                self.check_bill(code)
            self.stop.wait(max(0.0, interval - (time.monotonic() - started)))

    def check_bill(self, code):
        bag = self.platform_g if self.platform_g is not None and self.platform_g >= self.min_item_g else None
        status, payload = self.server.check_bill(code, bag)
        result = payload.get("result") if status in (200, 404, 409, 422) else None
        order = payload.get("order") or {}
        who = f"{order.get('number')} {order.get('customer_name') or ''}".strip() if order else code[:22]
        if result == "token":
            log(f"TOKEN {code[:22]} -> sent to the Wallet counter ({payload.get('message')})")
            self.lights.show("token")
        elif result:
            log(f"EXIT {who} -> {result.upper()} ({payload.get('message')})")
            self.lights.show(result if result in Lights.PATTERNS else "invalid")
        else:
            log(f"EXIT {who} -> could not check: {explain(status, payload)}")
            self.lights.show("keyerror" if status == 401 else "offline")

    # ---- cart scale (main thread) ----
    def handle_event(self, event):
        kind, grams = event
        if kind == "placed":
            photo_note = ""
            if self.camera is not None:
                data = self.camera.jpeg()
                status, payload = self.server.send_photo(data)
                colour = (payload.get("reading") or {}).get("color_hex") if status == 201 else None
                photo_note = f", photo {colour or explain(status, payload)}"
            status, payload = self.server.send_weight(grams)
            log(f"item {grams:.1f} g -> weight {explain(status, payload)}{photo_note}")
            if status == 201:
                self.lights.show("item")
                reading_id = (payload.get("reading") or {}).get("id")
                if reading_id and self.mode not in (None, "off"):
                    self.watch_unscanned(reading_id, grams)
        elif kind == "emptied":
            self.server.send_weight(0.0)
            log("platform empty")
        elif kind == "removed":
            log(f"item taken out ({grams:.1f} g)")

    # ---- item-not-scanned alert ----
    def watch_unscanned(self, reading_id, grams):
        """After a placement, ask the server whether a scan used it. If not (and something is still
        on the scale) the cart blinks red and beeps; it reminds up to 3 times."""
        def check(round_no=1):
            if self.stop.is_set():
                return
            status, payload = self.server.check_reading(reading_id)
            if status != 200 or payload.get("alert") != "open":
                return                         # scanned, taken out, dismissed by staff, or offline
            if self.platform_g is None or self.platform_g < self.min_item_g:
                return                         # the scale is empty again
            log(f"item {grams:.1f} g NOT SCANNED -> alert (reminder {round_no} of 3)")
            self.lights.show("unscanned")
            if round_no < 3:
                self._timer(self.unscanned_after, check, round_no + 1)
        self._timer(self.unscanned_after + 1, check)

    def _timer(self, seconds, fn, *args):
        t = threading.Timer(seconds, fn, args=args)
        t.daemon = True
        t.start()
        return t

    def run(self):
        args, cfg = self.args, self.cfg
        typed = args.simulate or args.type_weight
        self.pins = None if args.simulate else open_pins()
        self.lights = build_lights(cfg, self.pins)
        self.scale = self.camera = None
        try:
            self.connect()
            if self.stop.is_set():
                return
            self.scale = build_scale(cfg, typed, args.script, self.pins)
            if self.scale is not None:
                if not typed and not self.scale.factor:
                    raise SystemExit("Not calibrated yet. Run:  python3 cart_agent.py calibrate\n"
                                     "(or set [scale] enabled = no to run only the exit gate)")
                print("Taring - keep the platform empty...", flush=True)
                self.scale.tare()
            self.camera = build_camera(cfg, args.simulate, args.sim_colour, args.sim_view)
            if self.camera is not None:
                print("Camera ready" + (" (colours locked)." if getattr(self.camera, "locked", False) else "."),
                      flush=True)
            self.qr = QrReader()
            self.exit_on = cfg.getboolean("exit", "enabled", fallback=True) and self.camera is not None
            if self.exit_on and self.qr.kind == "missing":
                print("Exit gate OFF: no QR reader. Run:  sudo pip3 install --break-system-packages pyzbar", flush=True)
                self.exit_on = False
            self.heartbeat_once()
            threading.Thread(target=self.heartbeat_loop, daemon=True).start()
            if self.exit_on:
                threading.Thread(target=self.exit_loop, daemon=True).start()
            print(f"Ready ({' + '.join(self.roles()) or 'nothing enabled'}). "
                  + ("Put ONE item on the platform, then scan its code within 15 seconds. " if self.scale else "")
                  + ("Hold a bill QR under the camera to leave." if self.exit_on else "") + "\n", flush=True)
            self.lights.show("ready")
            self.loop()
        except KeyboardInterrupt:
            print("\nStopped.")
        finally:
            self.stop.set()
            self.lights.close()
            if self.camera is not None:
                self.camera.close()
            if self.pins is not None:
                self.pins.close()

    def loop(self):
        detector = PlacementDetector(self.cfg.get("scale", "mode", fallback="platform").strip().lower(),
                                     self.min_item_g, self.cfg.getfloat("scale", "stable_band_g", fallback=2.0))
        while not self.stop.is_set():
            if self.scale is None:                # exit gate only
                self.stop.wait(1)
                continue
            grams = self.scale.grams()
            if grams is not None:
                self.platform_g = round(grams, 1)
            event = detector.feed(grams)
            if event:
                self.handle_event(event)
            if getattr(self.scale, "done", False):
                time.sleep(1)
                break


def _stop_on_sigterm(signum, frame):
    raise KeyboardInterrupt


def cmd_run(cfg, args):
    # systemd stops the service with SIGTERM: turn it into a clean stop (LEDs off, camera closed)
    signal.signal(signal.SIGTERM, _stop_on_sigterm)
    Agent(cfg, args).run()


def main(argv=None):
    parser = argparse.ArgumentParser(description="SmartCart Raspberry Pi program")
    parser.add_argument("command", choices=["run", "calibrate", "test-scale", "test-camera", "test-lights"])
    parser.add_argument("--simulate", action="store_true", help="no HX711/camera/LEDs: type weights instead")
    parser.add_argument("--type-weight", action="store_true",
                        help="real camera, but type the weight (until the load cell is wired)")
    parser.add_argument("--script", help='simulation script, e.g. "0:2,105:4,0:2" (grams:seconds)')
    parser.add_argument("--sim-colour", default="#c8323c", help="colour of the simulated photo")
    parser.add_argument("--sim-view", help="simulation: image file the camera 'sees' (e.g. a bill QR PNG)")
    args = parser.parse_args(argv)
    cfg = load_config()
    commands = {"run": cmd_run, "calibrate": cmd_calibrate, "test-scale": cmd_test_scale,
                "test-camera": cmd_test_camera, "test-lights": cmd_test_lights}
    commands[args.command](cfg, args)


if __name__ == "__main__":
    main()
