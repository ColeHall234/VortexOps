const ViewState = {
    current: 'map',
};

function initNavPills() {
    const pills = document.querySelectorAll('#nav-pills .pill');

    pills.forEach(pill => {
        pill.addEventListener('click', () => {
            const view = pill.dataset.view;
            switchView(view);

            pills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
        });
    });

    switchView('map');
}

function switchView(view) {
    ViewState.current = view;

    document.querySelectorAll('.view-panel').forEach(panel => {
        panel.classList.remove('active');
    });

    document.querySelectorAll(`.view-panel[data-view="${view}"]`).forEach(panel => {
        panel.classList.add('active');
    });

    switch (view) {
        case 'alerts':
            renderFullAlertsList();
            renderAlertsSummary();
            break;
        case 'soundings': {
            const center = MapState.map.getCenter();
            renderSoundingsView(center.lat, center.lng);
            fetchMCDs();
            fetchSWO();
            break;
        }
        case 'history':
            renderHistoryView();
            break;
    }
}

function renderFullAlertsList() {
    const list = document.getElementById('alerts-full-list');
    const alerts = AlertState.lastAlerts;

    if (!alerts.length) {
        list.innerHTML = `<div style="font-size:11px;color:#484f58;font-style:italic;padding:4px 0;">No active alerts</div>`;
        return;
    }

    list.innerHTML = alerts.map(alert => {
        const props = alert.properties;
        const type = props.event || 'Warning';
        const config = CONFIG.warningTypes[type] || CONFIG.warningTypes['default'];
        const area = props.areaDesc || 'Unknown';
        const expires = formatExpires(props.expires);

        return `
      <div class="alert-item" onclick="handleAlertClick('${alert.id}');switchView('map');">
        <div class="alert-badge ${config.cls}">${config.badge}</div>
        <div>
          <div class="alert-text">${type} — ${truncate(area, 36)}</div>
          <div class="alert-meta">expires ${expires} · ${props.severity || ''}</div>
        </div>
      </div>`;
    }).join('');
}

function renderAlertsSummary() {
    const panel = document.getElementById('alerts-summary-panel');
    const alerts = AlertState.lastAlerts;

    const counts = {};
    alerts.forEach(a => {
        const type = a.properties.event || 'Unknown';
        counts[type] = (counts[type] || 0) + 1;
    });

    const sorted = Object.entries(counts)
        .sort((a, b) => {
            const pa = getAlertPriority(a[0]);
            const pb = getAlertPriority(b[0]);
            return pa - pb;
        });

    if (!sorted.length) {
        panel.innerHTML = `<div style="font-size:11px;color:#484f58;font-style:italic;">No active alerts</div>`;
        return;
    }

    panel.innerHTML = `
    <div style="font-size:11px;color:#8b949e;margin-bottom:8px;">
      ${alerts.length} total alerts nationwide
    </div>
    ${sorted.map(([type, count]) => {
        const config = CONFIG.warningTypes[type] || CONFIG.warningTypes['default'];
        return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:0.5px solid #21262d;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="alert-badge ${config.cls}">${config.badge}</span>
            <span style="font-size:11px;color:#c9d1d9;">${truncate(type, 28)}</span>
          </div>
          <span style="font-size:13px;font-weight:500;color:#e6edf3;">${count}</span>
        </div>`;
    }).join('')}`;
}

// ── soundings view ────────────────────────────────────────
async function renderSoundingsView(lat, lng) {
    const panel = document.getElementById('soundings-panel');
    const params = document.getElementById('soundings-params');

    panel.innerHTML = `<div class="loading-msg">Loading sounding data...</div>`;
    params.innerHTML = `<div class="loading-msg">Loading...</div>`;

    try {
        const res = await fetch(`/api/instability?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`);
        if (!res.ok) throw new Error('Sounding fetch failed');
        const data = await res.json();

        const periods = data.properties?.periods || [];
        if (!periods.length) throw new Error('No period data');

        const current = periods[0];
        const next6 = periods.slice(0, 6);

        panel.innerHTML = `
      <div style="font-size:11px;color:#8b949e;margin-bottom:8px;">
        ${current.name} · ${current.shortForecast}
      </div>
      ${next6.map(p => `
        <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:0.5px solid #21262d;font-size:11px;">
          <span style="color:#8b949e;">${p.name}</span>
          <span style="color:#c9d1d9;">${p.temperature}°${p.temperatureUnit} · ${p.windDirection} ${p.windSpeed}</span>
        </div>`).join('')}`;

        params.innerHTML = `
      <div class="instab-row">
        <div class="instab-header">
          <span class="instab-name">forecast</span>
          <span class="instab-val" style="color:#93c5fd;font-size:11px;">${truncate(current.shortForecast, 24)}</span>
        </div>
      </div>
      <div style="margin-top:8px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;padding:4px 0;">
          <span style="color:#8b949e;">wind</span>
          <span style="color:#c9d1d9;">${current.windDirection} ${current.windSpeed}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;padding:4px 0;">
          <span style="color:#8b949e;">humidity</span>
          <span style="color:#c9d1d9;">${current.relativeHumidity?.value || '--'}%</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;padding:4px 0;">
          <span style="color:#8b949e;">precip chance</span>
          <span style="color:#c9d1d9;">${current.probabilityOfPrecipitation?.value || 0}%</span>
        </div>
      </div>`;

    } catch (err) {
        panel.innerHTML = `<div style="font-size:11px;color:#f87171;">Failed to load sounding data</div>`;
        params.innerHTML = `<div style="font-size:11px;color:#f87171;">Failed to load</div>`;
    }
}

// ── history view ──────────────────────────────────────────
function renderHistoryView() {
    const list = document.getElementById('history-list');
    const stats = document.getElementById('history-stats');
    const lsrs = AlertState.lastLSRs;

    if (!lsrs.length) {
        list.innerHTML = `<div class="loading-msg">No recent storm reports</div>`;
        stats.innerHTML = `<div class="loading-msg">No data</div>`;
        return;
    }

    // full LSR timeline
    list.innerHTML = lsrs.map(r => {
        const config = getLSRConfig(r.type);
        return `
      <div class="spotter-item" onclick="flyToLSR(${r.lat}, ${r.lng});switchView('map');">
        <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
          <span style="font-weight:500;color:${config.color};">${r.type}</span>
          <span style="font-size:10px;color:#8b949e;">${formatLSRTime(r.issuedAt)}</span>
        </div>
        <div style="font-size:11px;color:#c9d1d9;">${r.city}, ${r.state}</div>
        ${r.remarks ? `<div style="font-size:10px;color:#8b949e;margin-top:2px;">${truncate(r.remarks, 60)}</div>` : ''}
      </div>`;
    }).join('');

    // LSR type breakdown for stats panel
    const typeCounts = {};
    lsrs.forEach(r => {
        typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
    });

    const sortedTypes = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1]);

    stats.innerHTML = `
    <div style="font-size:11px;color:#8b949e;margin-bottom:8px;">
      ${lsrs.length} reports in last fetch
    </div>
    ${sortedTypes.map(([type, count]) => {
        const config = getLSRConfig(type);
        return `
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:0.5px solid #21262d;">
          <span style="font-size:11px;color:${config.color};">${type}</span>
          <span style="font-size:12px;font-weight:500;color:#e6edf3;">${count}</span>
        </div>`;
    }).join('')}`;
}

// ── alert modal ───────────────────────────────────────────
const ModalState = {
    currentAlert: null,
};

function openAlertModal(alertId) {
    const alert = AlertState.lastAlerts.find(a => a.id === alertId);
    if (!alert) return;

    ModalState.currentAlert = alert;
    const props = alert.properties;
    const type = props.event || 'Warning';
    const config = CONFIG.warningTypes[type] || CONFIG.warningTypes['default'];

    // badge
    const badge = document.getElementById('modal-badge');
    badge.textContent = config.badge;
    badge.className = `alert-badge ${config.cls}`;

    // title
    document.getElementById('modal-title').textContent = type;

    // meta row
    document.getElementById('modal-meta').innerHTML = `
    <div class="modal-meta-item">
      <span class="modal-meta-label">area</span>
      <span class="modal-meta-value">${truncate(props.areaDesc || 'Unknown', 40)}</span>
    </div>
    <div class="modal-meta-item">
      <span class="modal-meta-label">severity</span>
      <span class="modal-meta-value">${props.severity || '--'}</span>
    </div>
    <div class="modal-meta-item">
      <span class="modal-meta-label">certainty</span>
      <span class="modal-meta-value">${props.certainty || '--'}</span>
    </div>
    <div class="modal-meta-item">
      <span class="modal-meta-label">expires</span>
      <span class="modal-meta-value" style="color:#fcd34d;">${formatExpires(props.expires)}</span>
    </div>
    <div class="modal-meta-item">
      <span class="modal-meta-label">issued by</span>
      <span class="modal-meta-value">${props.senderName || '--'}</span>
    </div>`;

    // body text
    const description = props.description || 'No details available.';
    const instruction = props.instruction || '';
    const isPDS = description.includes('PARTICULARLY DANGEROUS SITUATION');

    let bodyHTML = '';

    if (isPDS) {
        bodyHTML += `<span class="pds-highlight">⚠ PARTICULARLY DANGEROUS SITUATION</span>`;
    }

    bodyHTML += formatAlertText(description);

    if (instruction) {
        bodyHTML += `\n\n--- WHAT TO DO ---\n${formatAlertText(instruction)}`;
    }

    document.getElementById('modal-body').innerHTML = bodyHTML;
    document.getElementById('modal-fly-btn').style.display = '';
    // show modal
    const modal = document.getElementById('alert-modal');
    modal.className = 'modal-visible';
}

function closeAlertModal() {
    document.getElementById('alert-modal').className = 'modal-hidden';
    ModalState.currentAlert = null;
}

function modalFlyTo() {
    if (!ModalState.currentAlert) return;
    flyToAlert(ModalState.currentAlert);
    closeAlertModal();
    switchView('map');
}

function formatAlertText(text) {
    if (!text) return '';
    // clean up excessive whitespace and format nicely
    return text
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
// ── mesoscale discussions ─────────────────────────────────
const MCDState = {
    discussions: [],
    outlooks: [],
};

async function fetchMCDs() {
    try {
        const res = await fetch('/api/mcd');
        if (!res.ok) throw new Error('MCD fetch failed');
        const data = await res.json();
        const products = data['@graph'] || [];

        const details = await Promise.all(
            products.slice(0, 8).map(async p => {
                try {
                    const r = await fetch(`/api/mcd/${p.id}`);
                    if (!r.ok) return null;
                    return await r.json();
                } catch { return null; }
            })
        );

        MCDState.discussions = details.filter(Boolean);
        renderMCDList();

    } catch (err) {
        console.error('[VortexOps] MCD fetch failed:', err);
        document.getElementById('mcd-list').innerHTML =
            `<div style="font-size:11px;color:#f87171;">Failed to load discussions</div>`;
    }
}

async function fetchSWO() {
    try {
        const res = await fetch('/api/swo');
        if (!res.ok) throw new Error('SWO fetch failed');
        const data = await res.json();
        const products = data['@graph'] || [];

        const details = await Promise.all(
            products.slice(0, 3).map(async p => {
                try {
                    const r = await fetch(`/api/swo/${p.id}`);
                    if (!r.ok) return null;
                    return await r.json();
                } catch { return null; }
            })
        );

        MCDState.outlooks = details.filter(Boolean);
        renderSWOPanel();

    } catch (err) {
        console.error('[VortexOps] SWO fetch failed:', err);
        document.getElementById('swo-panel').innerHTML =
            `<div style="font-size:11px;color:#f87171;">Failed to load outlook</div>`;
    }
}

function renderMCDList() {
    const list = document.getElementById('mcd-list');

    if (!MCDState.discussions.length) {
        list.innerHTML = `
      <div style="font-size:11px;color:#484f58;font-style:italic;padding:4px 0;">
        No active mesoscale discussions
      </div>`;
        return;
    }

    list.innerHTML = MCDState.discussions.map((d, i) => {
        const text = d.productText || '';
        const time = formatExpires(d.issuanceTime);
        const office = d.issuingOffice || '--';
        const excerpt = extractMCDExcerpt(text);
        const tag = getMCDTag(text);
        const num = extractMCDNumber(text);

        return `
      <div class="mcd-item" onclick="openMCDModal(${i})">
        <div class="mcd-header">
          <span class="mcd-number">MCD #${num}</span>
          <span class="mcd-time">${time}</span>
        </div>
        <div class="mcd-office">${office}</div>
        <div class="mcd-excerpt">${truncate(excerpt, 80)}</div>
        <span class="mcd-tag ${tag.cls}">${tag.label}</span>
      </div>`;
    }).join('');
}

function renderSWOPanel() {
    const panel = document.getElementById('swo-panel');

    if (!MCDState.outlooks.length) {
        panel.innerHTML = `
      <div style="font-size:11px;color:#484f58;font-style:italic;padding:4px 0;">
        No outlook available
      </div>`;
        return;
    }

    panel.innerHTML = MCDState.outlooks.map((s, i) => {
        const text = s.productText || '';
        const time = formatExpires(s.issuanceTime);
        const excerpt = extractSWOExcerpt(text);

        return `
      <div class="swo-item" onclick="openSWOModal(${i})">
        <div class="swo-header">
          <span class="swo-title">SPC Outlook</span>
          <span class="swo-time">${time}</span>
        </div>
        <div class="swo-excerpt">${truncate(excerpt, 100)}</div>
      </div>`;
    }).join('');
}

function extractMCDExcerpt(text) {
    const lines = text.split('\n').filter(l => l.trim().length > 20);
    for (const line of lines) {
        if (!line.match(/^[0-9]/) && !line.match(/^[A-Z]{4}/) &&
            !line.includes('ATTN') && !line.includes('www')) {
            return line.trim();
        }
    }
    return 'See full discussion for details.';
}

function extractSWOExcerpt(text) {
    const lines = text.split('\n').filter(l => l.trim().length > 20);
    for (const line of lines) {
        if (!line.match(/^\d/) && !line.match(/^[A-Z]{4,}/)) {
            return line.trim();
        }
    }
    return 'See full outlook for details.';
}

function extractMCDNumber(text) {
    const match = text.match(/MESOSCALE DISCUSSION\s+(\d+)/i);
    return match ? match[1] : '----';
}

function getMCDTag(text) {
    const upper = text.toUpperCase();
    if (upper.includes('TORNADO') || upper.includes('PARTICULARLY DANGEROUS')) {
        return { cls: 'mcd-tag-tor', label: 'tornado threat' };
    } else if (upper.includes('SEVERE') || upper.includes('HAIL')) {
        return { cls: 'mcd-tag-svr', label: 'severe threat' };
    }
    return { cls: 'mcd-tag-gen', label: 'general convection' };
}

// ── MCD modal ─────────────────────────────────────────────
function openMCDModal(index) {
    document.getElementById('modal-fly-btn').style.display = 'none';
    const d = MCDState.discussions[index];
    if (!d) return;

    const text = d.productText || '';
    const num = extractMCDNumber(text);
    const tag = getMCDTag(text);
    const office = d.issuingOffice || '--';
    const time = formatExpires(d.issuanceTime);

    document.getElementById('modal-badge').textContent = 'MCD';
    document.getElementById('modal-badge').className = `alert-badge ${tag.cls}`;
    document.getElementById('modal-title').textContent = `Mesoscale Discussion #${num}`;

    document.getElementById('modal-meta').innerHTML = `
    <div class="modal-meta-item">
      <span class="modal-meta-label">issued by</span>
      <span class="modal-meta-value">${office}</span>
    </div>
    <div class="modal-meta-item">
      <span class="modal-meta-label">issued at</span>
      <span class="modal-meta-value">${time}</span>
    </div>
    <div class="modal-meta-item">
      <span class="modal-meta-label">type</span>
      <span class="modal-meta-value" style="color:#93c5fd;">${tag.label}</span>
    </div>`;

    document.getElementById('modal-body').innerHTML =
        formatAlertText(text);

    document.getElementById('modal-fly-btn').style.display = 'none';
    document.getElementById('alert-modal').className = 'modal-visible';
}

function openSWOModal(index) {
    document.getElementById('modal-fly-btn').style.display = 'none';
    const s = MCDState.outlooks[index];
    if (!s) return;

    const text = s.productText || '';
    const time = formatExpires(s.issuanceTime);

    document.getElementById('modal-badge').textContent = 'SWO';
    document.getElementById('modal-badge').className = 'alert-badge badge-svr';
    document.getElementById('modal-title').textContent = 'Severe Weather Outlook';

    document.getElementById('modal-meta').innerHTML = `
    <div class="modal-meta-item">
      <span class="modal-meta-label">issued by</span>
      <span class="modal-meta-value">Storm Prediction Center</span>
    </div>
    <div class="modal-meta-item">
      <span class="modal-meta-label">issued at</span>
      <span class="modal-meta-value">${time}</span>
    </div>`;

    document.getElementById('modal-body').innerHTML =
        formatAlertText(text);

    document.getElementById('modal-fly-btn').style.display = 'none';
    document.getElementById('alert-modal').className = 'modal-visible';
}
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAlertModal();
});
// ── kick off ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initNavPills);