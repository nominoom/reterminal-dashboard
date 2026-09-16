/**
 * reTerminal 1001 E-Ink Display Client Controller
 * Optimized for Vercel Serverless deployments and local standalone execution.
 * Includes smart polling, SSE listener, offline cache recovery, flicker-free DOM updates,
 * and multi-template layout switching (Executive, Minimal, Split Grid, Terminal, Deskplate).
 */

let qrCodeInstance = null;
let splitQrCodeInstance = null;
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
        data.layoutTemplate,
        data.fontFamily,
        data.headerNameplate,
        data.showHeaderClock,
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
        const splitTimeEl = document.getElementById('splitClock');
        const dateEl = document.getElementById('dateDisplay');
        const tz = (currentConfig && currentConfig.timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
        const is24h = currentConfig && currentConfig.clockFormat === '24h';

        if (timeEl || splitTimeEl) {
            try {
                const timeFormatter = new Intl.DateTimeFormat('en-US', {
                    timeZone: tz,
                    hour: is24h ? '2-digit' : 'numeric',
                    minute: '2-digit',
                    hour12: !is24h
                });
                const formattedTime = timeFormatter.format(now);
                if (timeEl) timeEl.textContent = formattedTime;
                if (splitTimeEl) splitTimeEl.textContent = formattedTime;
            } catch (e) {
                let hours = now.getHours();
                const minutes = String(now.getMinutes()).padStart(2, '0');
                const ampm = hours >= 12 ? 'PM' : 'AM';
                hours = hours % 12;
                hours = hours ? hours : 12;
                const formattedTime = `${hours}:${minutes} ${ampm}`;
                if (timeEl) timeEl.textContent = formattedTime;
                if (splitTimeEl) splitTimeEl.textContent = formattedTime;
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
    } catch (e) {}

    const dashboard = document.getElementById('dashboard');
    const statusText = document.getElementById('mainStatus');
    const badgeText = document.getElementById('statusBadge');
    const nameplateText = document.getElementById('headerNameplate');
    const clockGroup = document.getElementById('headerClockGroup');
    const nextTimeHighlight = document.getElementById('nextTimeHighlight');
    const customSubnote = document.getElementById('customSubnote');
    const footerDomain = document.getElementById('footerDomain');
    const splitDomain = document.getElementById('splitDomain');
    const footerSubtext = document.getElementById('footerSubtext');
    const qrContainer = document.getElementById('qrcode');
    const splitQrContainer = document.getElementById('splitQrcode');
    const splitRightPanel = document.getElementById('splitRightPanel');
    const footerElement = document.getElementById('footer');

    // 1. Layout Template & Font & Theme Classes on Dashboard container
    if (dashboard) {
        // Reset dynamic classes
        dashboard.className = 'dashboard';

        // Layout template class
        const layout = data.layoutTemplate || 'executive';
        dashboard.classList.add(`layout-${layout}`);

        // Font family
        const font = data.fontFamily || 'sans';
        dashboard.classList.add(`font-${font}`);

        // Theme
        if (data.theme === 'inverted') {
            dashboard.classList.add('theme-inverted');
        } else if (data.theme === 'retro') {
            dashboard.classList.add('theme-retro');
        }

        // Show/hide split panel based on layout
        if (splitRightPanel) {
            splitRightPanel.style.display = layout === 'split' ? 'flex' : 'none';
        }
    }

    // 2. Header Nameplate
    if (nameplateText) {
        if (data.headerNameplate && data.headerNameplate.trim()) {
            nameplateText.textContent = data.headerNameplate.trim().toUpperCase();
            nameplateText.style.display = 'inline-block';
        } else {
            nameplateText.style.display = 'none';
        }
    }

    // 3. Header Clock Group Visibility
    if (clockGroup) {
        clockGroup.style.display = data.showHeaderClock !== false ? 'flex' : 'none';
    }

    // 4. Main Status Text
    if (statusText) {
        const text = data.status || 'AVAILABLE';
        statusText.textContent = text;
        
        // Dynamically scale font size if text is long
        const len = text.length;
        if (data.layoutTemplate === 'minimal') {
            statusText.style.fontSize = len > 15 ? '56px' : len > 10 ? '72px' : '88px';
        } else if (data.layoutTemplate === 'split') {
            statusText.style.fontSize = len > 15 ? '40px' : len > 10 ? '50px' : '58px';
        } else {
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
    }

    // 5. Status Badge Tag
    if (badgeText) {
        badgeText.textContent = data.statusBadge || 'OPEN FOR QUESTIONS';
    }

    // 6. Next Available Time
    if (nextTimeHighlight) {
        nextTimeHighlight.textContent = data.nextAvailableTime || 'Now';
    }

    // 7. Custom Note / Context
    if (customSubnote) {
        const note = data.availabilityNote || data.customNote;
        if (note && note.trim().length > 0) {
            customSubnote.textContent = note;
            customSubnote.style.display = 'block';
        } else {
            customSubnote.style.display = 'none';
        }
    }

    // 8. Footer Link & Subtitle
    if (footerDomain) {
        footerDomain.textContent = data.linkText || 'nominoom.com';
    }
    if (splitDomain) {
        splitDomain.textContent = data.linkText || 'nominoom.com';
    }
    if (footerSubtext) {
        footerSubtext.textContent = data.linkSubtitle || 'Scan QR for portfolio & projects';
    }

    // 9. Footer Visibility
    if (footerElement) {
        footerElement.style.display = (data.showFooter !== false && data.layoutTemplate !== 'split') ? 'flex' : 'none';
    }

    // 10. QR Code Generation (Standard Footer & Split Panel)
    const targetUrl = data.linkUrl || 'https://nominoom.com';
    const showQr = data.showQr !== false;

    if (qrContainer && typeof QRCode !== 'undefined') {
        if (showQr) {
            qrContainer.style.display = 'flex';
            if (!qrCodeInstance || qrContainer.children.length === 0) {
                qrContainer.innerHTML = '';
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

    if (splitQrContainer && typeof QRCode !== 'undefined') {
        if (showQr && data.layoutTemplate === 'split') {
            splitQrContainer.style.display = 'flex';
            if (!splitQrCodeInstance || splitQrContainer.children.length === 0) {
                splitQrContainer.innerHTML = '';
                splitQrCodeInstance = new QRCode(splitQrContainer, {
                    text: targetUrl,
                    width: 90,
                    height: 90,
                    colorDark: '#000000',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.M
                });
            } else {
                splitQrCodeInstance.makeCode(targetUrl);
            }
        } else {
            splitQrContainer.style.display = 'none';
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
            } catch (err) {}
        };
    } catch (e) {}
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

// Immediate hydration & event binding
function initApp() {
    if (window.__INITIAL_STATUS__) {
        updateUI(window.__INITIAL_STATUS__);
    } else {
        restoreFromCache();
    }
    initClock();
    setupSSE();
    fetchStatus();

    // Continuous smart polling every 3 seconds
    setInterval(fetchStatus, 3000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
