# 📟 reTerminal 1001 E-Ink Status Display & Remote Admin Panel

A high-contrast, pixel-perfect 800×480 monochrome status and availability dashboard tailored specifically for the **Seeed Studio reTerminal E10-1 / reTerminal 1001** black-and-white e-paper display.

---

## 🌟 Key Features

- **800×480 Pixel-Perfect E-Ink Screen (`/main`)**:
  - High-contrast pure monochrome black & white design with sharp text rendering.
  - Displays your **Current Status** (e.g. `AVAILABLE`, `DEEP FOCUS`, `IN A MEETING`, `ON LUNCH`).
  - Displays your **Next Available Time** (e.g. `Now`, `3:30 PM`, `Tomorrow 9:00 AM`).
  - Direct prominent link to **`nominoom.com`** along with a **high-contrast scannable QR Code** rendered client-side on canvas.
  - Live digital clock & date header.
  - Instant live synchronization over **Server-Sent Events (SSE)** — zero screen flickers or manual refreshes required.
  - Optional **Inverted High-Contrast Dark Mode** (white-on-black).

- **Mobile & Desktop Admin Panel (`/admin`)**:
  - **1-Tap Quick Presets**: Available, Deep Focus (DND), In Meeting, On Break, Coding, Out of Office.
  - **Quick Time Calculation Chips**: `Now`, `+15m`, `+30m`, `+45m`, `+1h`, `+2h`, `5:00 PM`, `Tomorrow 9:00 AM`.
  - **Link & QR Code Config**: Dynamically edit destination URL, title, and subtitles.
  - **Live 800×480 Simulator Preview**: Embedded mirrored preview that shows exactly what the reTerminal sees in real-time.
  - Accessible from your smartphone, tablet, or laptop on your local Wi-Fi / LAN.

---

## 🚀 Quick Start

### 1. Install & Start Server

```bash
cd reterminal-dashboard
npm install
npm start
```

By default, the server runs on port `3000`.

### 2. Accessing the Interfaces

- **On your reTerminal**:
  Open Chromium in kiosk mode to:
  ```
  http://localhost:3000/main
  ```

- **On your Phone / Laptop**:
  Open your browser and navigate to:
  ```
  http://<YOUR_COMPUTER_OR_RETERMINAL_IP>:3000/admin
  ```

---

## 🖥️ Auto-Starting on reTerminal (Kiosk Mode)

To run this automatically on boot on the reTerminal (Raspberry Pi OS):

1. Install Chromium and unclutter (to hide mouse cursor):
   ```bash
   sudo apt-get install -y chromium-browser unclutter
   ```

2. Add a systemd service or autostart entry:
   ```bash
   mkdir -p ~/.config/autostart
   nano ~/.config/autostart/reterminal-dashboard.desktop
   ```

3. Paste:
   ```ini
   [Desktop Entry]
   Type=Application
   Name=reTerminal Dashboard
   Exec=chromium-browser --kiosk --noerrdialogs --disable-infobars --check-for-update-interval=31536000 http://localhost:3000/main
   ```

---

## ⚙️ REST API Endpoints

- `GET /api/status`: Fetch current JSON state.
- `POST /api/status`: Update status, notes, time, link, and theme options.
- `GET /api/events`: Server-Sent Events stream for instant real-time pushes.
