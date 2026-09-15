# 📟 reTerminal 1001 E-Ink Status Display & Remote Admin Panel

A high-contrast, pixel-perfect 800×480 monochrome status and availability dashboard tailored specifically for the **Seeed Studio reTerminal E10-1 / reTerminal 1001** black-and-white e-paper display.

Works seamlessly both **locally** (on reTerminal / Raspberry Pi) and hosted on **Vercel** for remote cloud control from anywhere.

---

## 🌟 Key Features

- **800×480 Pixel-Perfect E-Ink Screen (`/main`)**:
  - High-contrast pure monochrome black & white design with sharp text rendering.
  - Displays your **Current Status** (e.g. `AVAILABLE`, `DEEP FOCUS`, `IN A MEETING`, `ON LUNCH`).
  - Displays your **Next Available Time** (e.g. `Now`, `3:30 PM`, `Tomorrow 9:00 AM`).
  - Direct prominent link to **`nominoom.com`** along with a **high-contrast scannable QR Code** rendered client-side on canvas.
  - Live digital clock & date header.
  - **Flicker-Free Smart Polling & SSE Sync** — updates dynamically without screen jitter or full reloads.
  - Optional **Inverted High-Contrast Dark Mode** (white-on-black).

- **Mobile & Desktop Admin Panel (`/admin`)**:
  - **1-Tap Quick Presets**: Available, Deep Focus (DND), In Meeting, On Break, Coding, Out of Office.
  - **Quick Time Calculation Chips**: `Now`, `+15m`, `+30m`, `+45m`, `+1h`, `+2h`, `5:00 PM`, `Tomorrow 9:00 AM`.
  - **Link & QR Code Config**: Dynamically edit destination URL, title, and subtitles.
  - **Live 800×480 Simulator Preview**: Embedded mirrored preview that shows exactly what the reTerminal sees in real-time.
  - **Live Storage Indicator**: Shows whether cloud KV or local disk is actively synced.

---

## ☁️ Deploying to Vercel

The dashboard is configured for zero-friction deployment to Vercel with the included `vercel.json`.

### 1. Push to GitHub & Import to Vercel
Simply push this repository to GitHub and link it in the [Vercel Dashboard](https://vercel.com/new).

### 2. Connect Global Config Store or Cloud Storage
To make status changes from `/admin` persist globally and instantly sync to your reTerminal display:

#### Option A: Vercel Global Config Store (`data_read_display`)
1. In your Vercel project, link your **Global Config Store** (e.g. `data_read_display`).
2. Vercel will automatically provide the `GLOBAL_CONFIG` connection string.
3. To allow `/admin` to push updates directly into the Global Config store, generate a Vercel Access Token at [vercel.com/account/tokens](https://vercel.com/account/tokens) and set it in your project's Environment Variables as `VERCEL_API_TOKEN`.

#### Option B: Vercel KV / Upstash Redis
1. In your Vercel project, go to **Storage** -> **Create Database** -> select **KV** or **Upstash Redis**.
2. Connect it to your project. Vercel will auto-populate `KV_REST_API_URL` & `KV_REST_API_TOKEN`.

The backend automatically detects these credentials and synchronizes status updates globally across all devices!

---

## 🚀 Local Quick Start

### 1. Install & Start Server

```bash
cd reterminal-dashboard
npm install
npm run dev
```

Server runs on port `3000`.

### 2. Accessing the Interfaces

- **Display Screen**: `http://localhost:3000/main` (or your Vercel URL `https://your-app.vercel.app/main`)
- **Admin Control Panel**: `http://localhost:3000/admin` (or `https://your-app.vercel.app/admin`)

---

## 🖥️ Auto-Starting on reTerminal (Kiosk Mode)

To run this automatically on boot on the reTerminal (Raspberry Pi OS):

1. Install Chromium and unclutter:
   ```bash
   sudo apt-get install -y chromium-browser unclutter
   ```

2. Add a desktop autostart entry:
   ```bash
   mkdir -p ~/.config/autostart
   nano ~/.config/autostart/reterminal-dashboard.desktop
   ```

3. Paste:
   ```ini
   [Desktop Entry]
   Type=Application
   Name=reTerminal Dashboard
   Exec=chromium-browser --kiosk --noerrdialogs --disable-infobars --check-for-update-interval=31536000 https://your-app.vercel.app/main
   ```

---

## ⚙️ REST API Endpoints

- `GET /api/status`: Fetch current status state (cached / cloud / local).
- `POST /api/status`: Update status, notes, time, link, and theme options.
- `GET /api/events`: Server-Sent Events stream.
- `GET /api/info`: Serverless environment diagnostic & storage status.
