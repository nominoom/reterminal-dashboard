const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'status.json');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory clients list for Server-Sent Events (SSE)
let sseClients = [];

// Helper to read status
function getStatus() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading status file:', err);
  }
  return {
    status: 'AVAILABLE',
    statusType: 'available',
    statusBadge: 'OPEN FOR QUESTIONS',
    nextAvailableTime: 'Now',
    availabilityNote: 'Feel free to drop in',
    linkUrl: 'https://nominoom.com',
    linkText: 'nominoom.com',
    linkSubtitle: 'Scan for portfolio & links',
    showQr: true,
    theme: 'standard',
    customNote: 'Focus: Creative Engineering & Design',
    showHeaderClock: true,
    showFooter: true,
    updatedAt: new Date().toISOString()
  };
}

// Helper to save status
function saveStatus(data) {
  try {
    const updated = {
      ...getStatus(),
      ...data,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(updated, null, 2), 'utf8');
    notifyClients(updated);
    return updated;
  } catch (err) {
    console.error('Error saving status file:', err);
    throw err;
  }
}

// Notify all connected SSE clients
function notifyClients(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.res.write(payload);
    } catch (e) {
      // client may have disconnected
    }
  });
}

// Routes for main display and admin panel
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'main.html'));
});

app.get('/main', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'main.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API Routes
app.get('/api/status', (req, res) => {
  res.json(getStatus());
});

app.post('/api/status', (req, res) => {
  try {
    const updated = saveStatus(req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// SSE Stream for instant auto-refresh
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  const clientId = Date.now() + Math.random();
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  // Send current status immediately
  res.write(`data: ${JSON.stringify(getStatus())}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

// Get local network IPv4 addresses for easy mobile pairing
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

app.listen(PORT, '0.0.0.0', () => {
  const localIPs = getLocalIPs();
  console.log(`====================================================`);
  console.log(` reTerminal 800x480 E-Ink Status Dashboard is RUNNING`);
  console.log(`====================================================`);
  console.log(` -> E-Ink Display Screen:  http://localhost:${PORT}/main`);
  console.log(` -> Admin Control Panel:   http://localhost:${PORT}/admin`);
  if (localIPs.length > 0) {
    console.log(`\n Access from Phone / Laptop on local network:`);
    localIPs.forEach(ip => {
      console.log(` -> Admin Panel (Mobile):  http://${ip}:${PORT}/admin`);
      console.log(` -> Main Screen (Remote):  http://${ip}:${PORT}/main`);
    });
  }
  console.log(`====================================================\n`);
});
