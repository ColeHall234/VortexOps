// ── timeline state ────────────────────────────────────────
const TimelineState = {
    frames: [],
    currentIndex: -1,
    playing: false,
    animTimer: null,
    isDragging: false,
};

// ── build frame list ──────────────────────────────────────
function buildFrameList() {
    const frames = [];
    const now = new Date();

    // round down to nearest 5 minutes
    const rounded = new Date(now);
    rounded.setMinutes(Math.floor(rounded.getMinutes() / 5) * 5, 0, 0);

    // go back 2 hours in 5-minute intervals
    for (let i = 24; i >= 0; i--) {
        const t = new Date(rounded.getTime() - i * 5 * 60 * 1000);
        frames.push({
            time: t,
            ts: formatRadarTimestamp(t),
            label: t.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: CONFIG.app.clockTimezone,
                hour12: false,
            }),
        });
    }

    TimelineState.frames = frames;
    TimelineState.currentIndex = frames.length - 1; // start at now
    return frames;
}

function formatRadarTimestamp(date) {
    const y = date.getUTCFullYear();
    const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    const h = String(date.getUTCHours()).padStart(2, '0');
    const mi = String(date.getUTCMinutes()).padStart(2, '0');
    return `${y}${mo}${d}${h}${mi}`;
}

// ── init timeline ─────────────────────────────────────────
function initTimeline() {
    buildFrameList();
    renderTimelineTicks();
    updateTimelineUI();
    bindTimelineEvents();
    console.log(`[VortexOps] Timeline initialized with ${TimelineState.frames.length} frames`);
}

function renderTimelineTicks() {
    const container = document.getElementById('tl-frames');
    if (!container) return;

    const frames = TimelineState.frames;
    container.innerHTML = frames.map((f, i) => {
        const pct = (i / (frames.length - 1)) * 100;
        // only show tick for every 4th frame (20 min intervals)
        if (i % 4 !== 0) return '';
        return `<div class="tl-frame-tick" style="left:${pct}%"></div>`;
    }).join('');

    // update start label
    document.getElementById('tl-start').textContent = frames[0]?.label || '--:--';
}

// ── UI update ─────────────────────────────────────────────
function updateTimelineUI() {
    const frames = TimelineState.frames;
    const idx = TimelineState.currentIndex;
    if (!frames.length) return;

    const pct = (idx / (frames.length - 1)) * 100;
    document.getElementById('tl-fill').style.width = `${pct}%`;
    document.getElementById('tl-thumb').style.left = `${pct}%`;

    const frame = frames[idx];
    if (frame) {
        document.getElementById('tl-current-time').textContent =
            idx === frames.length - 1 ? 'NOW' : frame.label;
    }
}

// ── load radar frame ──────────────────────────────────────
function loadRadarFrame(index) {
    const frames = TimelineState.frames;
    if (index < 0 || index >= frames.length) return;

    TimelineState.currentIndex = index;
    updateTimelineUI();

    const frame = frames[index];
    const isLive = index === frames.length - 1;

    if (isLive) {
        // restore live radar
        loadLiveRadar();
    } else {
        // load historical frame
        loadHistoricalRadar(frame.ts);
    }
}

function loadLiveRadar() {
    const radarUrl = `${CONFIG.radar.baseUrl}/${CONFIG.radar.product}/{z}/{x}/{y}.png`;
    swapRadarLayer(radarUrl);
}

function loadHistoricalRadar(ts) {
    const radarUrl = `${CONFIG.radar.baseUrl}/${CONFIG.radar.product}/{z}/{x}/{y}.png?ts=${ts}`;
    swapRadarLayer(radarUrl);
}

function swapRadarLayer(url) {
    // remove old layer first
    if (MapState.layers.radar) {
        MapState.map.removeLayer(MapState.layers.radar);
        MapState.layers.radar = null;
    }

    // add new layer immediately
    MapState.layers.radar = L.tileLayer(url, {
        opacity: CONFIG.radar.opacity,
        zIndex: 200,
        tileSize: 256,
    }).addTo(MapState.map);
}

// ── animation ─────────────────────────────────────────────
function toggleRadarAnimation() {
    if (TimelineState.playing) {
        stopAnimation();
    } else {
        startAnimation();
    }
}

function startAnimation() {
    TimelineState.playing = true;
    document.getElementById('tl-play-btn').textContent = '■';
    document.getElementById('tl-play-btn').classList.add('playing');

    // start from beginning if at end
    if (TimelineState.currentIndex >= TimelineState.frames.length - 1) {
        TimelineState.currentIndex = 0;
    }

    TimelineState.animTimer = setInterval(() => {
        const next = TimelineState.currentIndex + 1;
        if (next >= TimelineState.frames.length) {
            loadRadarFrame(0);
            return;
        }
        loadRadarFrame(next);
    }, 600); // 400ms per frame
}

function stopAnimation() {
    TimelineState.playing = false;
    document.getElementById('tl-play-btn').textContent = '▶';
    document.getElementById('tl-play-btn').classList.remove('playing');

    if (TimelineState.animTimer) {
        clearInterval(TimelineState.animTimer);
        TimelineState.animTimer = null;
    }
}

// ── drag / click events ───────────────────────────────────
function bindTimelineEvents() {
    const track = document.getElementById('tl-track');
    const thumb = document.getElementById('tl-thumb');
    if (!track || !thumb) return;

    function seekToX(x) {
        const rect = track.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
        const index = Math.round(pct * (TimelineState.frames.length - 1));
        if (TimelineState.playing) stopAnimation();
        loadRadarFrame(index);
    }

    // click on track
    track.addEventListener('click', (e) => {
        seekToX(e.clientX);
    });

    // drag thumb
    thumb.addEventListener('mousedown', (e) => {
        TimelineState.isDragging = true;
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!TimelineState.isDragging) return;
        seekToX(e.clientX);
    });

    document.addEventListener('mouseup', () => {
        TimelineState.isDragging = false;
    });
}

// ── kick off ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initTimeline);