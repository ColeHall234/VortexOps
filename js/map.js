//State
const MapState = {
    map: null,
    layers: {
        base: null,
        radar: null,
        warnings: null,
        roads: null,
        outlook: null,
        lightning: null,
        cape: null,
        srh: null,
    },
    activeLayers: new Set(['radar', 'warnings']),
    warningPolygons: [],
    lsrMarkers: [],
    cellMarkers: [],
    radarRefreshTimer: null,
    radarTimestamp: null,
}

//Init
function initMap() {
    MapState.map = L.map('map', {
        center: CONFIG.map.center,
        zoom: CONFIG.map.zoom,
        minZoom: CONFIG.map.minZoom,
        maxZoom: CONFIG.map.maxZoom,
        zoomControl: true,
    });

    MapState.layers.base = L.tileLayer(CONFIG.baseTiles.url, {
        attribution: CONFIG.baseTiles.attribution,
        subdomains: CONFIG.baseTiles.subdomains,
        maxZoom: CONFIG.baseTiles.maxZoom,
    }).addTo(MapState.map);

    initRadar();
    initOverlayToggles();
    startClock();
    startRadarRefresh();

    MapState.map.on('moveend', () => {
        const center = MapState.map.getCenter();
        fetchConditions(center.lat, center.lng);
        fetchInstability(center.lat, center.lng);
    });

    console.log('[VortexOps] Map initialized');
}

//Radar
function initRadar() {
    const radarUrl =
        `${CONFIG.radar.baseUrl}/${CONFIG.radar.product}/{z}/{x}/{y}.png`;

    MapState.layers.radar = L.tileLayer(radarUrl, {
        opacity: CONFIG.radar.opacity,
        zIndex: 200,
        tileSize: 256,
    }).addTo(MapState.map);

    MapState.radarTimestamp = Date.now();
    updateTimelineDisplay();
}

function refreshRadar() {
    if (!MapState.activeLayers.has('radar')) return;

    //force tile reload
    if (MapState.layers.radar) {
        MapState.map.removeLayer(MapState.layers.radar);
    }

    initRadar();
    MapState.radarTimestamp = Date.now();
    updateTimelineDisplay();

    console.log('[VortexOps] Radar refreshed at', new Date().toLocaleTimeString());
}

function startRadarRefresh() {
    MapState.radarRefreshTimer = setInterval(() => {
        // don't refresh while timeline is animating or scrubbing
        if (typeof TimelineState !== 'undefined' && TimelineState.playing) return;
        if (typeof TimelineState !== 'undefined' &&
            TimelineState.currentIndex < TimelineState.frames.length - 1) return;
        refreshRadar();
    }, CONFIG.radar.refreshInterval);
}

//Roads Layer
function addRoadsLayer() {
    if (MapState.layers.roads) return;

    MapState.layers.roads = L.tileLayer(CONFIG.roadTiles.url, {
        attribution: CONFIG.roadTiles.attribution,
        subdomains: CONFIG.roadTiles.subdomains,
        maxZoom: CONFIG.roadTiles.maxZoom,
        opacity: CONFIG.roadTiles.opacity,
        zIndex: 300,
    }).addTo(MapState.map);
}

function removeRoadsLayer() {
    if (MapState.layers.roads) {
        MapState.map.removeLayer(MapState.layers.roads);
        MapState.layers.roads = null;
    }
}

//SPC Outlook Layer
function addOutlookLayer() {
    if (MapState.layers.outlook) return;

    MapState.layers.outlook = L.tileLayer.wms(CONFIG.spc.wmsUrl, {
        layers: CONFIG.spc.layers,
        format: 'image/png',
        transparent: true,
        opacity: CONFIG.spc.opacity,
        zIndex: 150,
        attribution: 'NOAA/SPC',
    }).addTo(MapState.map);
}

function removeOutlookLayer() {
    if (MapState.layers.outlook) {
        MapState.map.removeLayer(MapState.layers.outlook);
        MapState.layers.outlook = null;
    }
}

function addCapeLayer() {
    console.log('[VortexOps] CAPE overlay — source pending');
    return;
}

function removeCapeLayer() {
    if (MapState.layers.cape) {
        MapState.map.removeLayer(MapState.layers.cape);
        MapState.layers.cape = null;
    }
}

function addSrhLayer() {
    console.log('[VortexOps] SRH overlay — source pending');
    return;
}

function removeSrhLayer() {
    if (MapState.layers.srh) {
        MapState.map.removeLayer(MapState.layers.srh);
        MapState.layers.srh = null;
    }
}

//Warning Polygons
function clearWarningPolygons() {
    MapState.warningPolygons.forEach(p => MapState.map.removeLayer(p));
    MapState.warningPolygons = [];
}

function drawWarningPolygons(alerts) {
    clearWarningPolygons();

    if (!MapState.activeLayers.has('warnings')) return;

    alerts.forEach(alert => {
        const props = alert.properties;
        const geo = alert.geometry;
        if (!geo || !geo.coordinates) return;

        const type = props.event || '';
        const config = CONFIG.warningTypes[type] || CONFIG.warningTypes['default'];
        const color = getWarningColor(config.cls);

        let polygon;

        if (geo.type === 'Polygon') {
            const latlngs = geo.coordinates[0].map(c => [c[1], c[0]]);
            polygon = L.polygon(latlngs, {
                color: color,
                weight: 1.5,
                fillColor: color,
                fillOpacity: 0.15,
                zIndex: 400,
            });
        } else if (geo.type === 'MultiPolygon') {
            const latlngs = geo.coordinates.map(poly =>
                poly[0].map(c => [c[1], c[0]])
            );
            polygon = L.polygon(latlngs, {
                color: color,
                weight: 1.5,
                fillColor: color,
                fillOpacity: 0.15,
                zIndex: 400,
            });
        }

        if (polygon) {
            polygon.bindTooltip(`
    <strong>${props.event}</strong><br>
    ${props.areaDesc}<br>
    <span style="color:#8b949e;font-size:10px;">
      Expires: ${formatExpires(props.expires)}
    </span>
  `, { sticky: true, className: 'vortex-tooltip' });

            polygon.addTo(MapState.map);
            MapState.warningPolygons.push(polygon);
        }
    });
}

function getWarningColor(cls) {
    const colorMap = {
        'badge-tor': '#ef4444',
        'badge-svr': '#f59e0b',
        'badge-ffw': '#22c55e',
        'badge-sct': '#3b82f6',
        'badge-default': '#8b949e',
    };
    return colorMap[cls] || '#8b949e';
}

//Overlay Toggles
function initOverlayToggles() {
    const buttons = document.querySelectorAll('.overlay-pill');

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const layer = btn.dataset.layer;
            const isActive = MapState.activeLayers.has(layer);

            if (isActive) {
                MapState.activeLayers.delete(layer);
                btn.classList.remove('active');
                handleLayerOff(layer);
            } else {
                MapState.activeLayers.add(layer);
                btn.classList.add('active');
                handleLayerOn(layer);
            }
        });
    });
}

function handleLayerOn(layer) {
    switch (layer) {
        case 'radar':
            initRadar();
            break;
        case 'warnings':
            drawWarningPolygons(AlertState?.lastAlerts || []);
            break;
        case 'roads':
            addRoadsLayer();
            break;
        case 'outlook':
            addOutlookLayer();
            break;
        case 'cape':
            addCapeLayer();
            break;
        case 'srh':
            addSrhLayer();
            break;
        case 'lightning':
            initLightning();
            redrawLightningMarkers();
            break;
    }
}

function handleLayerOff(layer) {
    switch (layer) {
        case 'radar':
            if (MapState.layers.radar) {
                MapState.map.removeLayer(MapState.layers.radar);
                MapState.layers.radar = null;
            }
            break;
        case 'warnings':
            clearWarningPolygons();
            break;
        case 'roads':
            removeRoadsLayer();
            break;
        case 'outlook':
            removeOutlookLayer();
            break;
        case 'cape':
            removeCapeLayer();
            break;
        case 'srh':
            removeSrhLayer();
            break;
        case 'lightning': destroyLightning(); break;
    }
}

//Clock
function startClock() {
    function tick() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: CONFIG.app.clockTimezone,
            hour12: true,
        });
        const tz = CONFIG.app.clockTimezone.includes('New_York') ? 'EDT' : 'UTC';
        document.getElementById('clock').textContent = `${timeStr} ${tz}`;
    }
    tick();
    setInterval(tick, 1000);
}

//Timeline Display
function updateTimelineDisplay() {
    if (!MapState.radarTimestamp) return;
    // timeline.js handles display once initialized
    if (typeof TimelineState !== 'undefined' && TimelineState.frames.length) return;

    const now = new Date();
    const start = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const pct = 100;

    document.getElementById('tl-fill').style.width = `${pct}%`;
    document.getElementById('tl-thumb').style.left = `${pct}%`;

    document.getElementById('tl-start').textContent =
        start.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit',
            timeZone: CONFIG.app.clockTimezone, hour12: true,
        });
}

//Utility: Format Expires
function formatExpires(isoString) {
    if (!isoString) return 'unknown';
    return new Date(isoString).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', timeZone: CONFIG.app.clockTimezone, hour12: true,
    });
}

//Warning Fly
function flyToAlert(alert) {
    const geo = alert.geometry;
    if (!geo || !geo.coordinates) return;

    const coords = geo.type === 'Polygon'
        ? geo.coordinates[0]
        : geo.coordinates[0][0];

    const lats = coords.map(c => c[1]);
    const lngs = coords.map(c => c[0]);

    const bounds = L.latLngBounds(
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)]
    );

    MapState.map.flyToBounds(bounds, { padding: [40, 40], duration: 1.2 });
}

// Kick everything off
document.addEventListener('DOMContentLoaded', initMap);

