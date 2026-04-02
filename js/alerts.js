//State
const AlertState = {
    lastAlerts: [],
    refreshTimer: null,
    selectedAlert: null,
};

//Init
function initAlerts() {
    fetchAlerts();
    const center = CONFIG.map.center;
    fetchConditions(center[0], center[1]);

    AlertState.refreshTimer = setInterval(fetchAlerts, CONFIG.alerts.refreshInterval);
    setInterval(() => {
        const c = MapState.map.getCenter();
        fetchConditions(c.lat, c.lng);
    }, 300000);

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

//Surface Conditions
async function fetchConditions(lat, lng) {
    const inUS = (lat >= 24.5 && lat <= 49.5 && lng >= -125 && lng <= -66.5)
        || (lat >= 51 && lat <= 71 && lng >= -180 && lng <= -129)   // Alaska
        || (lat >= 18.5 && lat <= 22.5 && lng >= -160 && lng <= -154); // Hawaii

    if (!inUS) {
        console.log('[VortexOps] Outside NWS coverage area — skipping conditions fetch');
        document.getElementById('m-temp').textContent = '--°';
        document.getElementById('m-dew').textContent = '--°';
        document.getElementById('m-wspd').innerHTML = '--<span class="metric-unit">kt</span>';
        document.getElementById('m-wdir').textContent = '---';
        return;
    }
    try {
        const pointRes = await fetch(
            `https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`,
            {
                headers: {
                    'User-Agent': 'VortexOps/1.0 (storm-chase-app; cole.s.hall.x@gmail.com)',
                    'Accept': 'application/geo+json'
                }
            }
        );

        if (!pointRes.ok) throw new Error('Points lookup failed');
        const pointData = await pointRes.json();
        const stationUrl = pointData.properties?.observationStations;
        if (!stationUrl) throw new Error('No station URL found');

        const stationsRes = await fetch(stationUrl, {
            headers: {
                'User-Agent': 'VortexOps/1.0 (storm-chase-app; contact@example.com)',
                'Accept': 'application/geo+json'
            }
        });
        if (!stationsRes.ok) throw new Error('Stations fetch failed');
        const stationsData = await stationsRes.json();
        const stationId = stationsData.features?.[0]?.properties?.stationIdentifier;
        if (!stationId) throw new Error('No Station ID found');

        const obsRes = await fetch(`/api/observations/${stationId}`);
        if (!obsRes.ok) throw new Error('Observations Fetch Failed');
        const obsData = await obsRes.json();

        renderConditions(obsData.properties);
    } catch (err) {
        console.error('[VortexOps] Conditions fetch failed:', err);
    }
}

function renderConditions(obs) {
    const tempC = obs.temperature?.value;
    const dewC = obs.dewpoint?.value;
    const wspd = obs.windSpeed?.value;
    const wdir = obs.windDirection?.value;


    if (tempC != null && tempC !== undefined) {
        const tempF = CONFIG.app.units === 'imperial'
            ? Math.round((tempC * 9 / 5) + 32)
            : Math.round(tempC);
        document.getElementById('m-temp').textContent =
            `${tempF}°${CONFIG.app.units === 'imperial' ? 'F' : 'C'}`;
    }

    if (dewC !== null && dewC !== undefined) {
        const dewF = CONFIG.app.units === 'imperial'
            ? Math.round((dewC * 9 / 5) + 32)
            : Math.round(dewC);
        document.getElementById('m-dew').textContent =
            `${dewF}°${CONFIG.app.units === 'imperial' ? 'F' : 'C'}`;
    }

    if (wspd !== null && wspd !== undefined) {
        const knots = Math.round(wspd * 1.94384);
        document.getElementById('m-wspd').innerHTML =
            `${knots}<span class="metric-unit">kt</span>`;
    }

    if (wdir !== null && wdir !== undefined) {
        document.getElementById('m-wdir').textContent = degreesToCardinal(wdir);
    }
}

function degreesToCardinal(deg) {
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
        'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
}

//Init on Load
document.addEventListener('DOMContentLoaded', initAlerts);