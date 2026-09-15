/**
 * reTerminal 1001 E-Ink Display Client Controller
 * Optimized for Vercel Serverless deployments and local standalone execution.
 * Includes smart polling, SSE listener, offline cache recovery, and flicker-free DOM updates.
 */

let qrCodeInstance = null;
let currentConfig = null;
let lastRenderedHash = '';

// Helper to compute a simple signature of data to prevent unnecessary DOM redraws
function computeDataHash(data) {
    if (!data) return '';
    return [
        data.status,
        data.statusBadge,
        data.nextAvailableTime,
        data.availabilityNote,
        data.customNote,
        data.linkUrl,
        data.linkText,
        data.linkSubtitle,
        data.showQr,
        data.theme,
        data.showFooter,
        data.timezone,
        data.clockFormat,
        data.updatedAt
    ].join('|');
}

function initClock() {
    function updateClock() {
        const now = new Date();
        const timeEl = document.getElementById('clockDisplay');
        const dateEl = document.getElementById('dateDisplay');
        const tz = (currentConfig && currentConfig.timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
        const is24h = currentConfig && currentConfig.clockFormat === '24h';

        if (timeEl) {
            try {
                const timeFormatter = new Intl.DateTimeFormat('en-US', {
                    timeZone: tz,
                    hour: is24h ? '2-digit' : 'numeric',
                    minute: '2-digit',
                    hour12: !is24h
                });
                timeEl.textContent = timeFormatter.format(now);
            } catch (e) {
                let hours = now.getHours();
                const minutes = String(now.getMinutes()).padStart(2, '0');
                const ampm = hours >= 12 ? 'PM' : 'AM';
                hours = hours % 12;
                hours = hours ? hours : 12;
                timeEl.textContent = `${hours}:${minutes} ${ampm}`;
            }
        }

        if (dateEl) {
            try {
                const dateFormatter = new Intl.DateTimeFormat('en-US', {
                    timeZone: tz,
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                });
                dateEl.textContent = dateFormatter.format(now).toUpperCase();
            } catch (e) {
                const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
                const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
                const dayName = days[now.getDay()];
                const monthName = months[now.getMonth()];
                const dateNum = now.getDate();
                dateEl.textContent = `${dayName}, ${monthName} ${dateNum}`;
            }
        }
    }

    updateClock();
    setInterval(updateClock, 1000);
}

function updateUI(data) {
    if (!data) return;

    // Check if configuration has actually changed
    const newHash = computeDataHash(data);
    if (newHash === lastRenderedHash) {
        return; // Skip redraw to avoid any unnecessary CPU/flicker
    }
    lastRenderedHash = newHash;
    currentConfig = data;

    // Cache locally
    try {
        localStorage.setItem('reterminal_cached_status', JSON.stringify(data));
    } catch (e) {
        // LocalStorage quota or privacy mode
    }

    const dashboard = document.getElementById('dashboard');
    const statusText = document.getElementById('mainStatus');
    const badgeText = document.getElementById('statusBadge');
    const nextTimeHighlight = document.getElementById('nextTimeHighlight');
    const customSubnote = document.getElementById('customSubnote');
    const footerDomain = document.getElementById('footerDomain');
    const footerSubtext = document.getElementById('footerSubtext');
    const qrContainer = document.getElementById('qrcode');
    const footerElement = document.getElementById('footer');

    // 1. Theme Inversion
    if (dashboard) {
        if (data.theme === 'inverted') {
            dashboard.classList.add('theme-inverted');
        } else {
            dashboard.classList.remove('theme-inverted');
        }
    }

    // 2. Main Status Text
    if (statusText) {
        const text = data.status || 'AVAILABLE';
        statusText.textContent = text;
        
        // Dynamically scale font size if text is long
        const len = text.length;
        if (len > 18) {
            statusText.style.fontSize = '46px';
        } else if (len > 13) {
            statusText.style.fontSize = '58px';
        } else if (len > 10) {
            statusText.style.fontSize = '68px';
        } else {
            statusText.style.fontSize = '78px';
        }
    }

    // 3. Status Badge Tag
    if (badgeText) {
        badgeText.textContent = data.statusBadge || 'OPEN FOR QUESTIONS';
    }

    // 4. Next Available Time
    if (nextTimeHighlight) {
        nextTimeHighlight.textContent = data.nextAvailableTime || 'Now';
    }

    // 5. Custom Note / Context
    if (customSubnote) {
        const note = data.availabilityNote || data.customNote;
        if (note && note.trim().length > 0) {
            customSubnote.textContent = note;
            customSubnote.style.display = 'block';
        } else {
            customSubnote.style.display = 'none';
        }
    }

    // 6. Footer Link & Subtitle
    if (footerDomain) {
        footerDomain.textContent = data.linkText || 'nominoom.com';
    }
    if (footerSubtext) {
        footerSubtext.textContent = data.linkSubtitle || 'Scan QR for portfolio & projects';
    }

    // 7. Footer Visibility
    if (footerElement) {
        footerElement.style.display = data.showFooter !== false ? 'flex' : 'none';
    }

    // 8. QR Code Generation
    if (qrContainer && typeof QRCode !== 'undefined') {
        const targetUrl = data.linkUrl || 'https://nominoom.com';
        if (data.showQr !== false) {
            qrContainer.style.display = 'flex';
            if (!qrCodeInstance) {
                qrCodeInstance = new QRCode(qrContainer, {
                    text: targetUrl,
                    width: 62,
                    height: 62,
                    colorDark: '#000000',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.M
                });
            } else {
                qrCodeInstance.makeCode(targetUrl);
            }
        } else {
            qrContainer.style.display = 'none';
        }
    }
}

// Fetch current status via standard HTTP
async function fetchStatus() {
    try {
        const res = await fetch(`/api/status?_t=${Date.now()}`, {
            cache: 'no-store',
            headers: { 'Pragma': 'no-cache' }
        });
        if (res.ok) {
            const data = await res.json();
            updateUI(data);
        }
    } catch (err) {
        console.warn('[Display] Poll fetch error:', err.message);
    }
}

// Server-Sent Events setup with graceful fallback
function setupSSE() {
    if (typeof EventSource === 'undefined') return;

    try {
        const evtSource = new EventSource('/api/events');

        evtSource.onmessage = function (event) {
            try {
                const data = JSON.parse(event.data);
                updateUI(data);
            } catch (err) {
                // Parse error
            }
        };

        evtSource.onerror = function () {
            // In serverless environments (Vercel), SSE streams close naturally.
            // Our active poller guarantees real-time freshness seamlessly.
        };
    } catch (e) {
        // SSE not supported or blocked
    }
}

// Restore cached configuration immediately on load to prevent blank flash
function restoreFromCache() {
    try {
        const cached = localStorage.getItem('reterminal_cached_status');
        if (cached) {
            const parsed = JSON.parse(cached);
            updateUI(parsed);
        }
    } catch (e) {}
}

// Initialization on DOM load
document.addEventListener('DOMContentLoaded', () => {
    restoreFromCache();
    initClock();
    setupSSE();
    fetchStatus();

    // Continuous smart polling every 3 seconds for 100% reliable Vercel serverless syncing
    setInterval(fetchStatus, 3000);
});
