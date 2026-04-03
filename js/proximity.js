const ProximityState = {
    audioCtx: null,
    activeAlerts: new Set(),
    dismissTimer: null,
    flashing: false,
};
function unlockAudio() {
    initAudio();
    const ctx = ProximityState.audioCtx;
    if (!ctx) return;

    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBuffersource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);

    document.removeEventListener('click', unlockAudio);
    document.removeEventListener('touchend', unlockAudio);
    console.log('[Vortex Ops] Audio Unlocked');
}

document.addEventListener('click', unlockAudio);
document.addEventListener('touchend', unlockAudio);

function initAudio() {
    if (ProximityState.audioCtx) return;
    ProximityState.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playAlertSound(type) {
    initAudio();
    const ctx = ProximityState.audioCtx;
    if (!ctx) return;

    const sounds = {
        tornado: [
            { freq: 880, duration: 0.3, delay: 0.0 },
            { freq: 0, duration: 0.1, delay: 0.3 },
            { freq: 880, duration: 0.3, delay: 0.4 },
            { freq: 0, duration: 0.1, delay: 0.7 },
            { freq: 880, duration: 0.3, delay: 0.8 },
            { freq: 0, duration: 0.1, delay: 1.1 },
            { freq: 1760, duration: 0.6, delay: 1.2 },
        ],
        severe: [
            { freq: 660, duration: 0.4, delay: 0.0 },
            { freq: 0, duration: 0.1, delay: 0.4 },
            { freq: 660, duration: 0.4, delay: 0.5 },
            { freq: 880, duration: 0.5, delay: 1.0 },
        ],
        watch: [
            { freq: 440, duration: 0.3, delay: 0.0 },
            { freq: 0, duration: 0.1, delay: 0.3 },
            { freq: 440, duration: 0.3, delay: 0.4 },
        ],
        flood: [
            { freq: 520, duration: 0.4, delay: 0.0 },
            { freq: 0, duration: 0.1, delay: 0.4 },
            { freq: 520, duration: 0.4, delay: 0.5 },
        ],
    };

    const pattern = sounds[type] || sounds.watch;

    pattern.forEach(({ freq, duration, delay }) => {
        if (freq === 0) return;

        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);

        gainNode.gain.setValueAtTime(0.3, ctx.currentTime + delay);
        gainNode.gain.exponentialRampToValueAtTime(
            0.001, ctx.currentTime + delay + duration
        );

        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + duration);
    });
}

function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 3958.8;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
        + Math.cos(lat1 * Math.PI / 180)
        * Math.cos(lat2 * Math.PI / 180)
        * Math.sin(dLng / 2) * Math.sin(dLng / 2);


    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getPolygonCentroid(geometry) {
    if (!geometry || !geometry.coordinates) return null;

    const coords = geometry.type === 'Polygon'
        ? geometry.coordinates[0]
        : geometry.coordinates[0][0];

    if (!coords || !coords.length) return null;

    const avgLat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
    const avgLng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;

    return { lat: avgLat, lng: avgLng };
}

function checkProximity(alerts) {
    if (!CONFIG.proximity.enabled) return;

    const userLat = CONFIG.proximity.userLat;
    const userLng = CONFIG.proximity.userLng;
    const radius = CONFIG.proximity.radius;

    let highestUrgency = 0;
    let closestAlert = null;
    let closestDist = Infinity;

    alerts.forEach(alert => {
        const eventName = alert.properties.event;
        const alertConfig = CONFIG.proximity.alerts[eventName];
        if (!alertConfig) return;

        const centroid = getPolygonCentroid(alert.geometry);
        if (!centroid) return;

        const dist = haversineDistance(userLat, userLng, centroid.lat, centroid.lng);

        if (dist <= radius) {
            if (dist < closestDist) {
                closestDist = dist;
                closestAlert = alert;
            }
            if (alertConfig.urgency > highestUrgency) {
                highestUrgency = alertConfig.urgency;
            }
        }
    });

    if (closestAlert) {
        const id = closestAlert.id;
        if (!ProximityState.activeAlerts.has(id)) {
            ProximityState.activeAlerts.add(id);
            triggerProximityAlert(closestAlert, closestDist, highestUrgency);
        } else {
            clearProximityAlert();
        }
    }
}

function triggerProximityAlert(alert, distance, urgency) {
    const props = alert.properties;
    const eventName = props.event;
    const area = props.areaDesc;
    const alertConfig = CONFIG.proximity.alerts[eventName] || {};

    const isTor = urgency >= 3;
    const cls = isTor ? 'proximity-tor' : 'proximity-svr';

    document.getElementById('proximity-title').textContent =
        `${eventName} - ${Math.round(distance)} mi away`;
    document.getElementById('proximity-body').textContent =
        `${area} · expires ${formatExpires(props.expires)}`;

    const el = document.getElementById('proximity-alert');
    el.className = cls;

    const topbar = document.getElementById('topbar');
    topbar.className = isTor ? 'flashing-tor' : 'flashing-svr';
    ProximityState.flashing = true;

    playAlertSound(alertConfig.sound || 'watch');

    if (ProximityState.dismissTimer) clearTimeout(ProximityState.dismissTimer);
    ProximityState.dismissTimer = setTimeout(dismissProximityAlert, 30000);

    console.log(`[Vortex Ops] PROXIMITY ALERT: ${eventName} - ${Math.round(distance)} mi`);
}

function dismissProximityAlert() {
    const el = document.getElementById('proximity-alert');
    el.className = 'proximity-hidden';

    document.getElementById('topbar').className = '';
    ProximityState.flashing = false;

    if (ProximityState.dismissTimer) {
        clearTimeout(ProximityState.dismissTimer);
        ProximityState.dismissTimer = null;
    }
}

function clearProximityAlert() {
    ProximityState.activeAlerts.clear();
}

function initGPS() {
    if (!navigator.geolocation) {
        console.log('[Vortex Ops] Geolocation not available');
        return;
    }

    navigator.geolocation.watchPosition(
        (pos) => {
            CONFIG.proximity.userLat = pos.coords.latitude;
            CONFIG.proximity.userLng = pos.coords.longitude;
            console.log(`[Vortex Ops] GPS Updates: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);

        },
        (err) => {
            console.log('[Vortex Ops] GPS Error', err.message);
        },
        { enableHighAccuracy: true, maximumAge: 30000 }
    );
}


