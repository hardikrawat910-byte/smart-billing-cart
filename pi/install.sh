#!/bin/bash
# SmartCart Pi setup.
#   bash install.sh             install the camera, GPIO and QR-code libraries
#   bash install.sh autostart   start the SmartCart program by itself whenever the Pi powers on
#   bash install.sh firewall    block every incoming connection from the internet (SSH only from your own WiFi)
#   bash install.sh status      is it running? last 30 log lines
set -e
cd "$(dirname "$0")"
DIR="$(pwd)"

case "$1" in
  autostart)
    USER_NAME="$(whoami)"
    sed -e "s#__DIR__#${DIR}#g" -e "s#__USER__#${USER_NAME}#g" smartcart-agent.service.in \
      | sudo tee /etc/systemd/system/smartcart-agent.service > /dev/null
    sudo systemctl daemon-reload
    sudo systemctl enable --now smartcart-agent
    echo "Auto-start ON: the program now starts by itself every time the Pi is switched on."
    echo "Live log:   journalctl -u smartcart-agent -f"
    echo "Stop it:    sudo systemctl stop smartcart-agent     (needed before calibrate / test commands)"
    echo "Turn off:   sudo systemctl disable --now smartcart-agent"
    ;;
  firewall)
    sudo apt-get install -y ufw
    sudo ufw default deny incoming
    sudo ufw default allow outgoing
    # SSH only from private (home / hotspot / office LAN) addresses, never from the internet
    for net in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16; do
      sudo ufw allow from "$net" to any port 22 proto tcp
    done
    sudo ufw --force enable
    sudo ufw status verbose
    echo "Firewall ON: nothing can connect IN to the Pi; the Pi still calls OUT to the website."
    ;;
  status)
    systemctl is-active smartcart-agent || true
    journalctl -u smartcart-agent -n 30 --no-pager || true
    ;;
  *)
    echo "Installing camera, GPIO and QR-code libraries..."
    sudo apt-get update
    sudo apt-get install -y python3-picamera2 python3-lgpio python3-pil python3-numpy python3-pip libzbar0
    # QR reader: a Debian package on Bookworm; Raspberry Pi OS "Trixie" (2025+) no longer has it -> pip
    if ! sudo apt-get install -y python3-pyzbar; then
      sudo pip3 install --break-system-packages pyzbar || sudo apt-get install -y python3-opencv
    fi
    python3 -c "import lgpio, picamera2; print('Camera + GPIO libraries OK')"
    python3 -c "from pyzbar.pyzbar import decode; print('QR reader OK (pyzbar)')" 2>/dev/null \
      || python3 -c "import cv2; print('QR reader OK (OpenCV)')"
    echo "Libraries OK"
    echo "Done. Next:  python3 cart_agent.py test-camera"
    ;;
esac
