/**
 * reTerminal 1001 E-Ink Display Client Controller
 * Handles real-time SSE updates, dynamic QR generation, and precise clock timing.
 */

let qrCodeInstance = null;
let currentConfig = {};

function initClock() {
    function updateClock() {
        const now = new Date();
        const timeEl = document.getElementById('clockDisplay');
        const dateEl = document.getElementById('dateDisplay');

        if (timeEl) {
            let hours = now.getHours();
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12; // 12-hour format
            timeEl.textContent = `${hours}:${minutes} ${ampm}`;
        }

        if (dateEl) {
            const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
            const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
            const dayName = days[now.getDay()];
            const monthName = months[now.getMonth()];
            const dateNum = now.getDate();
            dateEl.textContent = `${dayName}, ${monthName} ${dateNum}`;
        }
    }

    updateClock();
    setInterval(updateClock, 1000);
}

function updateUI(data) {
    if (!data) return;
    currentConfig = data;

    const dashboard = document.getElementById('dashboard');
    const statusText = document.getElementById('mainStatus');
    const badgeText = document.getElementById('statusBadge');
    const nextTime = document.getElementById('nextTime');
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
        statusText.textContent = data.status || 'AVAILABLE';
        
        // Dynamically scale font size if the text is particularly long to prevent wrapping out of bounds
        const len = (data.status || '').length;
        if (len > 16) {
            statusText.style.fontSize = '50px';
        } else if (len > 12) {
            statusText.style.fontSize = '62px';
        } else {
            statusText.style.fontSize = '78px';
        }
    }

    // 3. Status Badge Tag
    if (badgeText) {
        badgeText.textContent = data.statusBadge || 'STATUS';
    }

    // 4. Next Available Time
    if (nextTimeHighlight) {
        nextTimeHighlight.textContent = data.nextAvailableTime || 'Now';
    }

    // 5. Custom Note / Context
    if (customSubnote) {
        if (data.availabilityNote || data.customNote) {
            customSubnote.textContent = data.availabilityNote || data.customNote;
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
        footerSubtext.textContent = data.linkSubtitle || 'Scan to view link';
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
                    colorLight: '#ffffff'
                });
            } else {
                qrCodeInstance.makeCode(targetUrl);
            }
        } else {
            qrContainer.style.display = 'none';
        }
    }
}

// Connect to Server-Sent Events for real-time live push updates
function setupSSE() {
    try {
        const evtSource = new EventSource('/api/events');

        evtSource.onmessage = function (event) {
            try {
                const data = JSON.parse(event.data);
                updateUI(data);
            } catch (err) {
                console.error('Error parsing SSE payload:', err);
            }
        };

        evtSource.onerror = function () {
            console.warn('SSE connection lost, reconnecting...');
            // Fallback short poll while reconnecting
            fetchStatusFallback();
        };
    } catch (e) {
        console.error('SSE initialization failed:', e);
        fetchStatusFallback();
        setInterval(fetchStatusFallback, 5000);
    }
}

// Fallback fetch helper
function fetchStatusFallback() {
    fetch('/api/status')
        .then(res => res.json())
        .then(data => updateUI(data))
        .catch(err => console.error('Error fetching fallback status:', err));
}

// Initialization on DOM load
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    setupSSE();
    fetchStatusFallback();
});
