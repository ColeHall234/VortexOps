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
    })

    switch (view) {
        case 'alerts':
            renderFullAlertsList();
            renderAlertsSummary();
            break;
        case 'soundings':
            const center = MapState.map.getCenter();
            renderSoundingsView(center.lat, center.lng);
            break;
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

// ── kick off ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initNavPills);