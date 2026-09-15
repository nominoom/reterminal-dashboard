/**
 * reTerminal Admin Panel Controller
 * Handles presets, time math, form submissions, and live preview sync across Vercel & local servers.
 */

// Presets Definition
const PRESETS = {
    available: {
        status: 'AVAILABLE',
        statusBadge: 'OPEN FOR QUESTIONS',
        nextAvailableTime: 'Now',
        availabilityNote: 'Feel free to say hi or drop in',
        theme: 'standard'
    },
    focus: {
        status: 'DEEP FOCUS',
        statusBadge: 'DO NOT DISTURB',
        nextAvailableTime: getTimeOffset(60), // +1 hour
        availabilityNote: 'In flow state — ping Slack for urgent matters',
        theme: 'standard'
    },
    meeting: {
        status: 'IN A MEETING',
        statusBadge: 'BUSY',
        nextAvailableTime: getTimeOffset(30), // +30 mins
        availabilityNote: 'On a client / team sync call',
        theme: 'standard'
    },
    break: {
        status: 'ON LUNCH',
        statusBadge: 'STEPPED AWAY',
        nextAvailableTime: getTimeOffset(45), // +45 mins
        availabilityNote: 'Grabbing coffee & food — back shortly',
        theme: 'standard'
    },
    coding: {
        status: 'LIVE CODING',
        statusBadge: 'HEADPHONES ON',
        nextAvailableTime: getTimeOffset(120), // +2 hours
        availabilityNote: 'Building new features & debugging',
        theme: 'standard'
    },
    ooo: {
        status: 'OUT OF OFFICE',
        statusBadge: 'OFFLINE',
        nextAvailableTime: 'Tomorrow 9:00 AM',
        availabilityNote: 'Will respond to messages during work hours',
        theme: 'inverted'
    }
};

// Helper to compute relative time formatted string e.g. "3:45 PM"
function getTimeOffset(minutesToAdd) {
    const d = new Date();
    d.setMinutes(d.getMinutes() + minutesToAdd);
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${minutes} ${ampm}`;
}

// Show Toast Notification
function showToast(message = 'Saved successfully!', isError = false) {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = isError ? `❌ ${message}` : `✓ ${message}`;
        toast.style.backgroundColor = isError ? 'rgba(239, 68, 68, 0.95)' : 'rgba(34, 197, 94, 0.95)';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2800);
    }
}

// Adjust live preview iframe scale to fit container dynamically
function adjustPreviewScale() {
    const wrapper = document.getElementById('previewWrapper');
    const iframe = document.getElementById('previewIframe');
    if (wrapper && iframe) {
        const wrapperWidth = wrapper.clientWidth;
        const scale = wrapperWidth / 800;
        iframe.style.transform = `scale(${scale})`;
    }
}

window.addEventListener('resize', adjustPreviewScale);

// Check environment & storage info
async function checkServerInfo() {
    try {
        const res = await fetch('/api/info');
        if (res.ok) {
            const info = await res.json();
            const badge = document.getElementById('serverStorageBadge');
            if (badge) {
                if (info.cloudKVConfigured) {
                    badge.innerHTML = '⚡ Upstash / KV Synced';
                    badge.style.color = '#4ade80';
                } else if (info.blobConfigured) {
                    badge.innerHTML = '📦 Vercel Blob Synced';
                    badge.style.color = '#4ade80';
                } else if (info.isVercel) {
                    badge.innerHTML = '⚠️ Storage Not Connected';
                    badge.style.color = '#f59e0b';
                    badge.title = 'Add Upstash Redis or KV in Vercel Storage to enable persistent saving';
                } else {
                    badge.innerHTML = '💾 Local Disk Mode';
                    badge.style.color = '#a78bfa';
                }
            }
        }
    } catch (e) {}
}

// Load current configuration into admin form
async function loadStatus() {
    try {
        const res = await fetch(`/api/status?_t=${Date.now()}`, { cache: 'no-store' });
        const data = await res.json();
        
        document.getElementById('inputStatus').value = data.status || '';
        document.getElementById('inputBadge').value = data.statusBadge || '';
        document.getElementById('inputNextTime').value = data.nextAvailableTime || '';
        document.getElementById('inputNote').value = data.availabilityNote || data.customNote || '';
        document.getElementById('inputLinkUrl').value = data.linkUrl || 'https://nominoom.com';
        document.getElementById('inputLinkText').value = data.linkText || 'nominoom.com';
        document.getElementById('inputLinkSubtitle').value = data.linkSubtitle || 'Scan QR for portfolio & projects';
        
        document.getElementById('toggleQr').checked = data.showQr !== false;
        document.getElementById('toggleInverted').checked = data.theme === 'inverted';
        document.getElementById('toggleFooter').checked = data.showFooter !== false;

        adjustPreviewScale();
    } catch (err) {
        console.error('Failed to load status:', err);
    }
}

// Apply Preset
function applyPreset(presetKey) {
    const p = PRESETS[presetKey];
    if (!p) return;

    document.getElementById('inputStatus').value = p.status;
    document.getElementById('inputBadge').value = p.statusBadge;
    document.getElementById('inputNextTime').value = p.nextAvailableTime;
    document.getElementById('inputNote').value = p.availabilityNote;
    document.getElementById('toggleInverted').checked = p.theme === 'inverted';

    // Auto save immediately for quick 1-tap operation
    saveForm(true, `Applied "${p.status}" Preset`);
}

// Set Quick Time
function setQuickTime(type) {
    const input = document.getElementById('inputNextTime');
    if (!input) return;

    switch (type) {
        case 'now':
            input.value = 'Now';
            break;
        case '15m':
            input.value = getTimeOffset(15);
            break;
        case '30m':
            input.value = getTimeOffset(30);
            break;
        case '45m':
            input.value = getTimeOffset(45);
            break;
        case '1h':
            input.value = getTimeOffset(60);
            break;
        case '2h':
            input.value = getTimeOffset(120);
            break;
        case 'eod':
            input.value = 'Today 5:00 PM';
            break;
        case 'tomorrow':
            input.value = 'Tomorrow 9:00 AM';
            break;
    }
}

// Save Form to Server
async function saveForm(isPreset = false, toastMessage = 'Display updated!') {
    const btn = document.getElementById('btnSave');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.7';
    }

    const payload = {
        status: document.getElementById('inputStatus').value.trim().toUpperCase() || 'AVAILABLE',
        statusBadge: document.getElementById('inputBadge').value.trim().toUpperCase() || 'OPEN FOR QUESTIONS',
        nextAvailableTime: document.getElementById('inputNextTime').value.trim() || 'Now',
        availabilityNote: document.getElementById('inputNote').value.trim(),
        customNote: document.getElementById('inputNote').value.trim(),
        linkUrl: document.getElementById('inputLinkUrl').value.trim() || 'https://nominoom.com',
        linkText: document.getElementById('inputLinkText').value.trim() || 'nominoom.com',
        linkSubtitle: document.getElementById('inputLinkSubtitle').value.trim() || 'Scan QR for portfolio & projects',
        showQr: document.getElementById('toggleQr').checked,
        theme: document.getElementById('toggleInverted').checked ? 'inverted' : 'standard',
        showFooter: document.getElementById('toggleFooter').checked
    };

    try {
        const res = await fetch('/api/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
            if (result.data?._storageMeta?.warning) {
                showToast('Saved temporarily (Connect Upstash KV in Vercel Storage for permanent sync)', true);
            } else {
                showToast(toastMessage);
            }
            // Refresh preview frame
            const iframe = document.getElementById('previewIframe');
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.location.reload();
            }
        } else {
            showToast(result.error || 'Update failed', true);
        }
    } catch (err) {
        console.error('Save failed:', err);
        showToast('Network error saving status', true);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.innerHTML = originalText;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadStatus();
    checkServerInfo();

    // Form Submit Listener
    const form = document.getElementById('statusForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            saveForm(false, 'Display updated live!');
        });
    }

    // Preset button event listeners
    document.querySelectorAll('.btn-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            const presetKey = btn.getAttribute('data-preset');
            applyPreset(presetKey);
        });
    });

    // Time chip event listeners
    document.querySelectorAll('.chip-btn').forEach(chip => {
        chip.addEventListener('click', () => {
            const timeType = chip.getAttribute('data-time');
            setQuickTime(timeType);
        });
    });

    // Toggle listeners for instant response
    ['toggleQr', 'toggleInverted', 'toggleFooter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                saveForm(false, 'Settings updated!');
            });
        }
    });

    // Initial scale calculation
    setTimeout(adjustPreviewScale, 100);
});
