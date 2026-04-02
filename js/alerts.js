//State
const AlertState = {
    lastAlerts: [],
    refreshTimer: null,
    selectedAlert: null,
};

//Init
function initAlerts() {
    fetchAlerts();
    AlertState.refreshTimer = setInterval(fetchAlerts, CONFIG.alerts.refreshInterval);
    console.log('[VortexOps] Alert polling started');
}
//Alert Priority
function getAlertPriority(eventName) {
    const match = CONFIG.warningTypes[eventName];
    return match ? match.priority : 9;
}
//NWS Fetch
async function fetchAlerts() {
  try {
    let url = CONFIG.alerts.baseUrl;

    if (CONFIG.alerts.area) {
      url += `?area=${CONFIG.alerts.area}`;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Server error: ${res.status}`);

    const data = await res.json();
    const alerts = data.features || [];

    alerts.sort((a, b) => {
      const ap = getAlertPriority(a.properties.event);
      const bp = getAlertPriority(b.properties.event);
      return ap - bp;
    });

    AlertState.lastAlerts = alerts;
    renderAlertsSidebar(alerts);
    drawWarningPolygons(alerts);
    updateStatusIndicator(alerts);

    console.log(`[VortexOps] ${alerts.length} alerts loaded`);

  } catch (err) {
    console.error('[VortexOps] Alert Fetch Failed', err);
    renderAlertsError();
  }
}

//Render Sidebar
function renderAlertsSidebar(alerts) {
    const list = document.getElementById('warnings-list');

    if (!alerts.length) {
        list.innerHTML = `
            <div style="font-size:11px;color:#484f58;font-style:italic;padding: 4px 0;">
            No Active Warnings
            </div>`;
        return;
    }

    const display = alerts.slice(0, 8);

    list.innerHTML = display.map(alert => {
        const props = alert.properties;
        const type = props.event || 'Warning';
        const config = CONFIG.warningTypes[type] || CONFIG.warningTypes['default'];
        const area = props.areaDesc || 'Unknown Area';
        const expires = formatExpires(props.expires);
        const isPDS = props.description?.includes('PARTICULARLY DANGEROUS SITUATION');

        return `
            <div class="alert-item" onclick="handleAlertClick('${alert.id}')">
                <div class="alert-badge ${config.cls}">${config.badge}</div>
                <div>
                    <div class="alert-text">
                        ${isPDS ? '<span class="pds-tag">PDS</span> ' : ''}${type} - ${truncate(area, 40)}
                    </div>
                    <div class="alert-meta">expires ${expires}</div>
                </div>
            </div>`;
    }).join('');

    // Show overflow count
    if (alerts.length > 8) {
        list.innerHTML += `
            <div style="font-size:10px;color:#8b949e;padding:6px 0;text-align:center;">
            +${alerts.length - 8} more warnings active
            </div>`;
    }
}

function renderAlertsError() {
    document.getElementById('warnings-list').innerHTML = `
        <div style="font-size:11px;color:#f87171;padding:4px 0;">
        Failed to load warning
        </div>`;
}

//Alert Interaction
function handleAlertClick(alertId) {
    const alert = AlertState.lastAlerts.find(a => a.id === alertId);
    if (!alert) return;

    AlertState.selectedAlert = alert;
    flyToAlert(alert);
    renderInterceptPanel(alert);
}

function renderInterceptPanel(alert) {
    const props = alert.properties;
    const type = props.event || 'Warning';
    const area = props.areaDesc || 'Unknown';
    const panel = document.getElementById('intercept-info');

    panel.innerHTML = `
    <div style="font-size:11px;color:#c9d1d9;line-height:1.8;">
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#8b949e;">event</span>
        <span style="color:#fca5a5;font-weight:500;">${type}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#8b949e;">area</span>
        <span>${truncate(area, 28)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#8b949e;">expires</span>
        <span style="color:#fcd34d;">${formatExpires(props.expires)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#8b949e;">severity</span>
        <span>${props.severity || 'Unknown'}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#8b949e;">certainty</span>
        <span>${props.certainty || 'Unknown'}</span>
      </div>
    </div>`;

}

//Status Indicator
function updateStatusIndicator(alerts) {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');

    const hasTornado = alerts.some(a => 
        a.properties.event?.includes('Tornado Warning')
    );
    const hasSevere = alerts.some(a =>
        a.properties.event?.includes('Severe Thunderstorm Warning')
    );

    if (hasTornado) {
        dot.style.background = '#ef4444';
        text.style.color = '#ef4444';
        text.textContent = 'tornado warning';
    } else if (hasSevere) {
        dot.style.background = '#f59e0b';
        text.style.color = '#f59e0b';
        text.textContent = 'severe t-storm';
    } else {
        dot.style.background = '#22c55e';
        text.style.color = '#22c55e';
        text.textContent = 'live'
    }
}

//Utilities
function truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

//Init on Load
document.addEventListener('DOMContentLoaded', initAlerts);