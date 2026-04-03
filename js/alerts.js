//State
const AlertState = {
    lastAlerts: [],
    lastLSRs: [],
    lastCells: [],
    refreshTimer: null,
    selectedAlert: null,
};

//Init
function initAlerts() {
    fetchAlerts();
    fetchLSRs();
    fetchCells();
    initGPS();
    const center = CONFIG.map.center;
    fetchConditions(center[0], center[1]);
    fetchInstability(center[0], center[1]);


    AlertState.refreshTimer = setInterval(fetchAlerts, CONFIG.alerts.refreshInterval);
    setInterval(fetchLSRs, CONFIG.lsr.refreshInterval);
    setInterval(fetchCells, CONFIG.cells.refreshInterval);
    setInterval(() => {
        const c = MapState.map.getCenter();
        fetchConditions(c.lat, c.lng);
        fetchInstability(c.lat, c.lng);
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
        checkProximity(alerts);

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
    renderInterceptPanel(alert);
    openAlertModal(alertId);
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
    return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
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
        const pointRes = await fetch(`/api/points?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`, {
            headers: {
                'User-Agent': 'VortexOps/1.0 (storm-chase-app; cole.s.hall.x@gmail.com)',
                'Accept': 'application/geo+json'
            }
        });

        if (!pointRes.ok) throw new Error('Points lookup failed');
        const pointData = await pointRes.json();
        const stationUrl = pointData.properties?.observationStations;
        if (!stationUrl) throw new Error('No station URL found');

        const stationsRes = await fetch(stationUrl, {
            headers: {
                'User-Agent': 'VortexOps/1.0 (storm-chase-app; cole.s.hall.x@gmail.com)',
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


    if (tempC !== null && tempC !== undefined) {
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
//Instability
async function fetchInstability(lat, lng) {
    try {
        const res = await fetch(`/api/instability?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`);
        if (!res.ok) throw new Error(`Instability Error: ${res.statis}`);
        const data = await res.json();

        const period = data.properties?.periods?.[0];
        if (!period) throw new Error(`No forecast period`);

        renderInstability(period);
    } catch (err) {
        console.error('[VortexOps] Instability Fetch Failed:', err);
    }
}

function renderInstability(period) {
    const panel = document.getElementById('instability-panel');

    const windSpd = period.windSpeed || '--';
    const windDir = period.windDirection || '--';
    const forecast = period.shortForecast || '--';
    const temp = period.temperature || '--';
    const isDaytime = period.isDaytime;

    const fcLower = forecast.toLowerCase();
    let capeEst, srhEst, stpEst, color;

    if (fcLower.includes('tornado') || fcLower.includes('severe')) {
        capeEst = '2500+'; srhEst = '300+'; stpEst = '4+'; color = '#fca5a5';
    } else if (fcLower.includes('thunderstorm') || fcLower.includes('t-storm')) {
        capeEst = '1500'; srhEst = '150'; stpEst = '1.5'; color = '#fcd34d';
    } else if (fcLower.includes('shower') || fcLower.includes('rain')) {
        capeEst = '500'; srhEst = '75'; stpEst = '0.5'; color = '#86efac';
    } else {
        capeEst = '<100'; srhEst = '<50'; stpEst = '<0.1'; color = '#8b949e';
    }

    panel.innerHTML = `
    <div class="instab-row">
      <div class="instab-header">
        <span class="instab-name">CAPE (est)</span>
        <span class="instab-val" style="color:${color};">${capeEst} J/kg</span>
      </div>
      <div class="instab-bar">
        <div class="instab-fill" style="width:${getCapeBarWidth(capeEst)}%"></div>
      </div>
    </div>
    <div class="instab-row">
      <div class="instab-header">
        <span class="instab-name">SRH 0-3km (est)</span>
        <span class="instab-val" style="color:${color};">${srhEst} m²/s²</span>
      </div>
      <div class="instab-bar">
        <div class="instab-fill" style="width:${getSrhBarWidth(srhEst)}%"></div>
      </div>
    </div>
    <div class="instab-row">
      <div class="instab-header">
        <span class="instab-name">STP (est)</span>
        <span class="instab-val" style="color:${color};">${stpEst}</span>
      </div>
      <div class="instab-bar">
        <div class="instab-fill" style="width:${getStpBarWidth(stpEst)}%"></div>
      </div>
    </div>
    <div style="margin-top:8px;font-size:10px;color:#484f58;">
      based on: ${forecast} · ${windDir} ${windSpd}
    </div>`;
}

function getCapeBarWidth(cape) {
    if (cape === '<100') return 5;
    if (cape === '500') return 25;
    if (cape === '1500') return 60;
    if (cape === '2500+') return 90;
    return 5;
}

function getSrhBarWidth(srh) {
    if (srh === '<50') return 5;
    if (srh === '75') return 20;
    if (srh === '150') return 50;
    if (srh === '300+') return 90;
    return 5;
}

function getStpBarWidth(stp) {
    if (stp === '<0.1') return 5;
    if (stp === '0.5') return 20;
    if (stp === '1.5') return 50;
    if (stp === '4+') return 90;
    return 5;
}

//LSRs
function getLSRConfig(type) {
    for (const key of Object.keys(CONFIG.lsr.types)) {
        if (type.includes(key)) return CONFIG.lsr.types[key];
    }
    return CONFIG.lsr.types['DEFAULT'];
}
async function fetchLSRs() {
    try {
        const res = await fetch('/api/lsr');
        if (!res.ok) throw new Error(`LSR Error: ${res.status}`);
        const data = await res.json();

        const products = data['@graph'] || [];
        if (!products.length) {
            renderSpotterReports([]);
            return;
        }

        const recent = products.slice(0, 8);
        const reports = [];

        await Promise.all(recent.map(async (product) => {
            try {
                const detailRes = await fetch(`/api/lsr/${product.id}`);
                if (!detailRes.ok) return;
                const detail = await detailRes.json();
                const parsed = parseLSRProduct(detail);
                reports.push(...parsed);
            } catch (e) {

            }
        }));

        reports.sort((a, b) => a.priority - b.priority || b.time - a.time);

        AlertState.lastLSRs = reports;
        renderSpotterReports(reports);
        drawLSRMarkers(reports);

        console.log(`[VortexOps] ${reports.length} LSRs loaded`);

    } catch (err) {
        console.error('[VortexOps] LSR Fetch Failed:', err);
    }

    function parseLSRProduct(product) {
        const reports = [];
        const text = product.productText || '';
        const issuedAt = product.issuanceTime;
        const lines = text.split('\n');

        for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i];

            // match the coordinate line: ends with ##.##N ###.##W or ##.##N ##.##W
            const coordMatch = line.match(/(\d{1,3}\.\d{2})N\s+(\d{1,3}\.\d{2})W\s*$/);
            if (!coordMatch) continue;

            const lat = parseFloat(coordMatch[1]);
            const lng = -parseFloat(coordMatch[2]);

            // extract event type from same line — it's between time and location
            // format: "1237 AM     Non-Tstm Wnd Gst 4 S Lamance Creek..."
            const timeEventMatch = line.match(
                /^\d{3,4}\s+(?:AM|PM)\s{2,}(.+?)\s{3,}[\w\s]+\s+\d{1,3}\.\d{2}N/
            );

            let eventType = 'UNKNOWN';
            if (timeEventMatch) {
                eventType = timeEventMatch[1].trim().toUpperCase();
            }

            // next line has date, magnitude, county, state, source
            const nextLine = lines[i + 1] || '';
            const stateMatch = nextLine.match(/\b([A-Z]{2})\s+\w/);
            const state = stateMatch ? stateMatch[1] : '';

            // remarks are two lines down
            const remarks = lines[i + 2]?.trim() || '';

            // extract city from the coord line
            const cityMatch = line.match(
                /^\d{3,4}\s+(?:AM|PM)\s{2,}(?:.+?)\s{3,}([\w\s]+?)\s+\d{1,3}\.\d{2}N/
            );
            const city = cityMatch ? cityMatch[1].trim() : 'Unknown';

            const config = getLSRConfig(eventType);

            reports.push({
                type: eventType,
                city,
                state,
                lat,
                lng,
                color: config.color,
                icon: config.icon,
                priority: config.priority,
                remarks: remarks.startsWith('..') ? '' : remarks,
                issuedAt,
            });
        }

        return reports;
    }


    function extractRemarks(lines, matchedLine) {
        const idx = lines.indexOf(matchedLine);
        if (idx === -1 || idx >= lines.length - 1) return '';
        return lines[idx + 1]?.trim() || '';
    }
}

function renderSpotterReports(reports) {
    const list = document.getElementById('spotter-list');

    if (!reports.length) {
        list.innerHTML = `
        <div style="font-size:11px;color:#484f58;font-style:italic;padding:4px 0;">
        No Recent Reports
        </div>`;
        return;
    }
    const display = reports.slice(0, CONFIG.lsr.maxReports);

    list.innerHTML = display.map(r => {
        const timeStr = formatLSRTime(r.issuedAt);
        const typeConfig = getLSRConfig(r.type);

        return `
        <div class="spotter-item" onclick="flyToLSR(${r.lat}, ${r.lng})">
        <span class="spotter-time" style="color:${typeConfig.color};">
          ${timeStr}
        </span>
        <span style="color:${typeConfig.color};font-weight:500;">
          ${r.type}
        </span>
        — ${r.city}, ${r.state}
        ${r.remarks ? `<div style="color:#8b949e;font-size:10px;margin-top:2px;">
          ${truncate(r.remarks, 60)}
        </div>` : ''}
      </div>`;
    }).join('');
}

function formatLSRTime(isoString) {
    if (!isoString) return '--:--';
    return new Date(isoString).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: CONFIG.app.clockTimezone,
        hour12: true,
    });
}

function flyToLSR(lat, lng) {
    MapState.map.flyTo([lat, lng], 9, { duration: 1.2 });
}

function drawLSRMarkers(reports) {
    if (MapState.lsrMarkers) {
        MapState.lsrMarkers.forEach(m => MapState.map.removeLayer(m));
    }
    MapState.lsrMarkers = [];

    reports.forEach(r => {
        if (!r.lat || !r.lng) return;

        const marker = L.circleMarker([r.lat, r.lng], {
            radius: 6,
            fillColor: r.color,
            color: r.color,
            weight: 1.5,
            fillOpacity: 0.8,
            zIndex: 500,
        });

        marker.bindTooltip(`
            <strong style="color:${r.color};">${r.type}</strong><br>
            ${r.city}, ${r.state}<br>
            ${r.remarks
                ? `<span style="color:#8b949e;font-size:10px;">${r.remarks}</span>`
                : ''
            }
            `, { sticky: true, className: 'vortex-tooltip' });

        marker.addTo(MapState.map);
        MapState.lsrMarkers.push(marker);
    });
}

// ── storm cells ───────────────────────────────────────────
async function fetchCells() {
    try {
        const res = await fetch('/api/cells');
        if (!res.ok) throw new Error(`Cells error: ${res.status}`);
        const data = await res.json();

        const features = data.features || [];

        // filter by minimum reflectivity and parse
        const cells = features
            .map(f => {
                const p = f.properties;
                return {
                    id: p.storm_id || '----',
                    lat: f.geometry.coordinates[1],
                    lng: f.geometry.coordinates[0],
                    dbz: p.max_dbz || 0,
                    top: p.storm_top || 0,       // ft MSL
                    dir: p.drct || 0,            // degrees
                    speed: p.sknt || 0,            // knots
                    tvs: p.tvs || 'NONE',        // tornado vortex signature
                    meso: p.meso || 'NONE',       // mesocyclone
                    station: p.station || '--',
                };
            })
            .filter(c => c.dbz >= CONFIG.cells.minDbz)
            .sort((a, b) => b.dbz - a.dbz);

        AlertState.lastCells = cells;
        renderCellsSidebar(cells);
        drawCellMarkers(cells);

        console.log(`[VortexOps] ${cells.length} storm cells loaded`);

    } catch (err) {
        console.error('[VortexOps] Cells fetch failed:', err);
        document.getElementById('cells-list').innerHTML =
            `<div class="loading-msg">Cell data unavailable</div>`;
    }
}

function getCellStrength(cell) {
    if (cell.tvs !== 'NONE' || cell.dbz >= CONFIG.cells.strengthThresholds.tor) {
        return { cls: 'str-tor', label: 'TOR+' };
    } else if (cell.dbz >= CONFIG.cells.strengthThresholds.svr) {
        return { cls: 'str-svr', label: 'SVR' };
    }
    return { cls: 'str-obs', label: 'OBS' };
}

function degreesToDir(deg) {
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
        'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
}

// ── render cells sidebar ──────────────────────────────────
function renderCellsSidebar(cells) {
    const list = document.getElementById('cells-list');

    if (!cells.length) {
        list.innerHTML = `
      <div style="font-size:11px;color:#484f58;font-style:italic;padding:4px 0;">
        No significant cells detected
      </div>`;
        return;
    }

    const display = cells.slice(0, 8);

    list.innerHTML = display.map((cell, i) => {
        const strength = getCellStrength(cell);
        const dirStr = degreesToDir(cell.dir);
        const topKft = Math.round(cell.top / 1000);

        return `
      <div class="cell-item" onclick="selectCell(${i})">
        <div>
          <div class="cell-name">
            Cell ${cell.id}
            <span style="font-size:10px;color:#8b949e;margin-left:4px;">
              ${cell.station}
            </span>
          </div>
          <div class="cell-detail">
            ${dirStr} @ ${cell.speed}kt · ${cell.dbz}dBZ · top ${topKft}kft
          </div>
        </div>
        <div class="cell-strength ${strength.cls}">${strength.label}</div>
      </div>`;
    }).join('');

    if (cells.length > 8) {
        list.innerHTML += `
      <div style="font-size:10px;color:#8b949e;padding:6px 0;text-align:center;">
        +${cells.length - 8} more cells
      </div>`;
    }
}

// ── draw cell markers on map ──────────────────────────────
function drawCellMarkers(cells) {
    if (MapState.cellMarkers) {
        MapState.cellMarkers.forEach(m => MapState.map.removeLayer(m));
    }
    MapState.cellMarkers = [];

    cells.forEach((cell, i) => {
        const strength = getCellStrength(cell);
        const color = strength.cls === 'str-tor' ? '#ef4444'
            : strength.cls === 'str-svr' ? '#f59e0b'
                : '#22c55e';

        // cell dot
        const marker = L.circleMarker([cell.lat, cell.lng], {
            radius: 8,
            fillColor: color,
            color: color,
            weight: 2,
            fillOpacity: 0.3,
            zIndex: 550,
        });

        // motion vector line
        const rad = (cell.dir * Math.PI) / 180;
        const distDeg = (cell.speed * 0.0003);  // rough degree offset per knot
        const endLat = cell.lat + Math.cos(rad) * distDeg * 10;
        const endLng = cell.lng + Math.sin(rad) * distDeg * 10;

        const vector = L.polyline(
            [[cell.lat, cell.lng], [endLat, endLng]],
            { color: color, weight: 2, opacity: 0.7, dashArray: '4 4' }
        );

        marker.bindTooltip(`
      <strong style="color:${color};">Cell ${cell.id}</strong><br>
      ${cell.dbz} dBZ · ${degreesToDir(cell.dir)} @ ${cell.speed}kt<br>
      Top: ${Math.round(cell.top / 1000)}kft<br>
      <span style="color:#8b949e;font-size:10px;">${cell.station}</span>
    `, { sticky: true, className: 'vortex-tooltip' });

        marker.on('click', () => selectCell(i));

        marker.addTo(MapState.map);
        vector.addTo(MapState.map);
        MapState.cellMarkers.push(marker);
        MapState.cellMarkers.push(vector);
    });
}

// ── select a cell ─────────────────────────────────────────
function selectCell(index) {
    const cell = AlertState.lastCells[index];
    if (!cell) return;

    MapState.map.flyTo([cell.lat, cell.lng], 9, { duration: 1.2 });
    renderCellInterceptPanel(cell);
}

function renderCellInterceptPanel(cell) {
    const panel = document.getElementById('intercept-info');
    const userLat = CONFIG.proximity.userLat;
    const userLng = CONFIG.proximity.userLng;
    const dist = haversineDistance(userLat, userLng, cell.lat, cell.lng);
    const strength = getCellStrength(cell);

    // calculate ETA based on storm speed
    const speedMph = cell.speed * 1.15078;
    const etaMin = speedMph > 0 ? Math.round((dist / speedMph) * 60) : null;

    // escape vector — opposite of storm motion
    const escapeDir = degreesToDir((cell.dir + 180) % 360);

    panel.innerHTML = `
    <div style="font-size:11px;color:#c9d1d9;line-height:1.8;">
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#8b949e;">target</span>
        <span style="font-weight:500;">Cell ${cell.id} (${cell.station})</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#8b949e;">strength</span>
        <span class="cell-strength ${strength.cls}" style="font-size:11px;padding:1px 6px;">
          ${strength.label} · ${cell.dbz} dBZ
        </span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#8b949e;">distance</span>
        <span>${Math.round(dist)} mi</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#8b949e;">movement</span>
        <span>${degreesToDir(cell.dir)} @ ${cell.speed}kt</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#8b949e;">storm top</span>
        <span>${Math.round(cell.top / 1000)}kft</span>
      </div>
      ${etaMin ? `
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#8b949e;">ETA intercept</span>
        <span style="color:#fcd34d;">~${etaMin} min</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#8b949e;">escape vector</span>
        <span style="color:#86efac;">${escapeDir} clear</span>
      </div>
    </div>`;
}
//Init on Load
document.addEventListener('DOMContentLoaded', initAlerts);