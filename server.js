require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Official Redis client for Upstash & Vercel KV
let Redis = null;
try {
  const upstash = require('@upstash/redis');
  Redis = upstash.Redis;
} catch (e) { }

let vercelBlobSdk = null;
try { vercelBlobSdk = require('@vercel/blob'); } catch (e) { }

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'status.json');
const TMP_DATA_FILE = path.join(os.tmpdir(), 'reterminal_status.json');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Default status object
const DEFAULT_STATUS = {
  status: 'AVAILABLE',
  statusType: 'available',
  statusBadge: 'OPEN FOR QUESTIONS',
  nextAvailableTime: 'Now',
  availabilityNote: 'Feel free to say hi or drop in',
  customNote: 'Feel free to say hi or drop in',
  linkUrl: 'https://nominoom.com',
  linkText: 'nominoom.com',
  linkSubtitle: 'Scan QR for portfolio & projects',
  showQr: true,
  theme: 'standard',
  layoutTemplate: 'executive',
  fontFamily: 'sans',
  headerNameplate: '',
  showHeaderClock: true,
  showFooter: true,
  timezone: 'America/New_York',
  clockFormat: '12h',
  updatedAt: new Date().toISOString()
};

let inMemoryStatus = { ...DEFAULT_STATUS };
let redisClient = null;

// Helper to determine Upstash / KV credentials (universal prefix scanner)
function getKVCredentials() {
  // 1. Standard variable names
  let url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REST_API_URL;
  let token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REST_API_TOKEN;

  if (url && token) {
    return { url: url.replace(/\/$/, ''), token };
  }

  // 2. Scan all process.env keys for any custom database prefixes created by Vercel
  const envKeys = Object.keys(process.env);
  for (const k of envKeys) {
    if (k.endsWith('_REST_API_URL') || k.endsWith('_KV_REST_API_URL')) {
      const prefix = k.replace(/_REST_API_URL$/, '').replace(/_KV_REST_API_URL$/, '');
      const candidateTokens = [
        process.env[`${prefix}_REST_API_TOKEN`],
        process.env[`${prefix}_KV_REST_API_TOKEN`],
        process.env[`${prefix}_TOKEN`]
      ].filter(Boolean);

      if (process.env[k] && candidateTokens.length > 0) {
        return { url: process.env[k].replace(/\/$/, ''), token: candidateTokens[0] };
      }
    }
  }

  return null;
}

// Get or initialize the Redis client
function getRedisClient() {
  if (redisClient) return redisClient;
  if (!Redis) return null;

  const creds = getKVCredentials();
  if (creds && creds.url && creds.token) {
    try {
      redisClient = new Redis({
        url: creds.url,
        token: creds.token
      });
      return redisClient;
    } catch (e) {
      return null;
    }
  }

  return null;
}

// In-memory clients list for Server-Sent Events (SSE)
let sseClients = [];

// Helper to load status across multiple storage tiers
async function getStatus() {
  // Tier 1: Cloud KV via Official @upstash/redis SDK
  const client = getRedisClient();
  if (client) {
    try {
      const stored = await client.get('reterminal_status');
      if (stored) {
        const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
        inMemoryStatus = { ...DEFAULT_STATUS, ...parsed };
        return inMemoryStatus;
      }
    } catch (err) {
      console.warn('[Storage] Redis read error:', err.message);
    }
  }

  // Tier 2: Vercel Blob
  if (process.env.BLOB_READ_WRITE_TOKEN && vercelBlobSdk) {
    try {
      const blobs = await vercelBlobSdk.list({ prefix: 'status.json' });
      if (blobs.blobs.length > 0) {
        const res = await fetch(blobs.blobs[0].url, { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          inMemoryStatus = { ...DEFAULT_STATUS, ...json };
          return inMemoryStatus;
        }
      }
    } catch (err) {
      console.warn('[Storage] Blob read error:', err.message);
    }
  }

  // Tier 3: Local disk file (data/status.json)
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      inMemoryStatus = { ...DEFAULT_STATUS, ...JSON.parse(raw) };
      return inMemoryStatus;
    }
  } catch (err) {
    // Local read error
  }

  // Tier 4: /tmp file fallback
  try {
    if (fs.existsSync(TMP_DATA_FILE)) {
      const raw = fs.readFileSync(TMP_DATA_FILE, 'utf8');
      inMemoryStatus = { ...DEFAULT_STATUS, ...JSON.parse(raw) };
      return inMemoryStatus;
    }
  } catch (err) {
    // /tmp read error
  }

  return inMemoryStatus;
}

// Helper to persist status
async function saveStatus(data) {
  const current = await getStatus();
  const updated = {
    ...current,
    ...data,
    updatedAt: new Date().toISOString()
  };

  inMemoryStatus = updated;

  let storageEngineName = 'Local Disk / Memory';
  let cloudSuccess = false;

  // 1. Cloud KV Storage write via @upstash/redis SDK
  const client = getRedisClient();
  if (client) {
    try {
      await client.set('reterminal_status', updated);
      storageEngineName = 'Upstash Redis / Vercel KV (Cloud Synced)';
      cloudSuccess = true;
    } catch (err) {
      console.warn('[Storage] Redis write error:', err.message);
    }
  }

  // 2. Vercel Blob write
  if (process.env.BLOB_READ_WRITE_TOKEN && vercelBlobSdk) {
    try {
      await vercelBlobSdk.put('status.json', JSON.stringify(updated, null, 2), {
        access: 'public',
        addRandomSuffix: false
      });
      storageEngineName = 'Vercel Blob (Cloud Synced)';
      cloudSuccess = true;
    } catch (err) {
      console.warn('[Storage] Blob write error:', err.message);
    }
  }

  // 3. Local File write (safe with EROFS fallback)
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(updated, null, 2), 'utf8');
  } catch (err) {
    try {
      fs.writeFileSync(TMP_DATA_FILE, JSON.stringify(updated, null, 2), 'utf8');
    } catch (tmpErr) {
      // Serverless in-memory mode
    }
  }

  // 4. Notify any connected SSE clients
  notifyClients(updated);

  return {
    ...updated,
    _storageMeta: {
      engine: storageEngineName,
      isCloudSynced: cloudSuccess || !process.env.VERCEL,
      warning: process.env.VERCEL && !cloudSuccess ? 'Running on Vercel without persistent cloud storage (Upstash Redis / KV / Blob). Changes will reset when Lambdas recycle.' : null
    }
  };
}

// Notify all connected SSE clients
function notifyClients(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.res.write(payload);
    } catch (e) {
      // client disconnected
    }
  });
}

// Server-side HTML pre-renderer to prevent any flash of default "AVAILABLE" content
async function renderMainHtml() {
  const templatePath = path.join(__dirname, 'public', 'main.html');
  let html = fs.readFileSync(templatePath, 'utf8');
  const data = await getStatus();

  const status = data.status || 'AVAILABLE';
  const badge = data.statusBadge || 'OPEN FOR QUESTIONS';
  const nextTime = data.nextAvailableTime || 'Now';
  const note = data.availabilityNote || data.customNote || '';
  const domain = data.linkText || 'nominoom.com';
  const subtitle = data.linkSubtitle || 'Scan QR for portfolio & projects';
  const nameplate = data.headerNameplate || '';
  const layout = data.layoutTemplate || 'executive';
  const font = data.fontFamily || 'sans';
  const themeClass = data.theme === 'inverted' ? 'theme-inverted' : (data.theme === 'retro' ? 'theme-retro' : '');
  const showNameplate = nameplate.trim().length > 0;
  const showNote = note.trim().length > 0;

  // 1. Pre-render classes
  html = html.replace(
    /class="dashboard[^"]*"/,
    `class="dashboard layout-${layout} font-${font} ${themeClass}"`
  );

  // 2. Pre-render header elements
  html = html.replace(
    '<span class="header-nameplate" id="headerNameplate">NOMINOOM</span>',
    `<span class="header-nameplate" id="headerNameplate" style="display: ${showNameplate ? 'inline-block' : 'none'};">${nameplate.toUpperCase()}</span>`
  );

  html = html.replace(
    '<span class="status-badge-tag" id="statusBadge">OPEN FOR QUESTIONS</span>',
    `<span class="status-badge-tag" id="statusBadge">${badge}</span>`
  );

  // 3. Pre-render status and time
  html = html.replace(
    '<h1 id="mainStatus">AVAILABLE</h1>',
    `<h1 id="mainStatus">${status}</h1>`
  );

  html = html.replace(
    '<span class="next-time-highlight" id="nextTimeHighlight">Now</span>',
    `<span class="next-time-highlight" id="nextTimeHighlight">${nextTime}</span>`
  );

  html = html.replace(
    '<div class="custom-subnote" id="customSubnote">\n                    Feel free to say hi or drop in\n                </div>',
    `<div class="custom-subnote" id="customSubnote" style="display: ${showNote ? 'block' : 'none'};">${note}</div>`
  );

  // 4. Pre-render footer and split domain
  html = html.replace(
    '<span class="footer-domain" id="footerDomain">nominoom.com</span>',
    `<span class="footer-domain" id="footerDomain">${domain}</span>`
  );

  html = html.replace(
    '<div class="footer-domain" id="splitDomain" style="font-size: 16px;">nominoom.com</div>',
    `<div class="footer-domain" id="splitDomain" style="font-size: 16px;">${domain}</div>`
  );

  html = html.replace(
    '<span class="footer-subtext" id="footerSubtext">Scan QR for portfolio & projects</span>',
    `<span class="footer-subtext" id="footerSubtext">${subtitle}</span>`
  );

  // 5. Inject synchronous initial status payload
  const scriptInjection = `<script>window.__INITIAL_STATUS__ = ${JSON.stringify(data)};</script>\n</head>`;
  html = html.replace('</head>', scriptInjection);

  return html;
}

// Main page routes with Server-Side Pre-Rendering (Instant zero-flash load)
app.get('/', async (req, res) => {
  try {
    const html = await renderMainHtml();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(html);
  } catch (err) {
    res.sendFile(path.join(__dirname, 'public', 'main.html'));
  }
});

app.get('/main', async (req, res) => {
  try {
    const html = await renderMainHtml();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(html);
  } catch (err) {
    res.sendFile(path.join(__dirname, 'public', 'main.html'));
  }
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Status API
app.get('/api/status', async (req, res) => {
  try {
    const data = await getStatus();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read status', fallback: inMemoryStatus });
  }
});

app.post('/api/status', async (req, res) => {
  try {
    const updated = await saveStatus(req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Error saving status:', err);
    res.status(500).json({ error: 'Failed to update status', details: err.message });
  }
});

// SSE Stream for instant auto-refresh in persistent environments
app.get('/api/events', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  const clientId = Date.now() + Math.random();
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  // Send initial status immediately
  const initial = await getStatus();
  res.write(`data: ${JSON.stringify(initial)}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

// Storage engine status diagnostic endpoint
app.get('/api/info', (req, res) => {
  const kv = getKVCredentials();
  const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
  const storageKeys = Object.keys(process.env).filter(k =>
    k.includes('KV') || k.includes('REDIS') || k.includes('UPSTASH') ||
    k.includes('CONFIG') || k.includes('BLOB') || k.includes('STORAGE')
  );

  res.json({
    cloudKVConfigured: !!(kv || getRedisClient()),
    blobConfigured: hasBlob,
    isCloudReady: !!(kv || getRedisClient() || hasBlob || !process.env.VERCEL),
    isVercel: !!process.env.VERCEL,
    detectedStorageKeys: storageKeys,
    nodeEnv: process.env.NODE_ENV || 'development',
    serverTime: new Date().toISOString()
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

// Start server if run directly
if (require.main === module) {
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
}

module.exports = app;
