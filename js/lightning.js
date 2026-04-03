// ── lightning state ───────────────────────────────────────
const LightningState = {
  tileLayer: null,
  active: false,
  refreshTimer: null,
};

// ── init ──────────────────────────────────────────────────
function initLightning() {
  if (LightningState.active) return;
  LightningState.active = true;

  addLightningTileLayer();

  // refresh tile layer every 5 minutes
  LightningState.refreshTimer = setInterval(() => {
    refreshLightningLayer();
  }, 300000);

  console.log('[VortexOps] Lightning layer initialized');
}

function destroyLightning() {
  if (LightningState.refreshTimer) {
    clearInterval(LightningState.refreshTimer);
    LightningState.refreshTimer = null;
  }

  removeLightningTileLayer();
  LightningState.active = false;

  resetLightningPanel();
  console.log('[VortexOps] Lightning layer destroyed');
}

// ── tile layer ────────────────────────────────────────────
function addLightningTileLayer() {
  console.log('[VortexOps] Lightning tile layer — source pending');
  return;
}

function removeLightningTileLayer() {
  if (LightningState.tileLayer) {
    MapState.map.removeLayer(LightningState.tileLayer);
    LightningState.tileLayer = null;
  }
}

function refreshLightningLayer() {
  if (!LightningState.active) return;
  removeLightningTileLayer();
  addLightningTileLayer();
  console.log('[VortexOps] Lightning layer refreshed');
}

// ── panel ─────────────────────────────────────────────────
function resetLightningPanel() {
  const countEl = document.getElementById('lightning-count');
  const closeEl = document.getElementById('lightning-closest');
  if (countEl) countEl.textContent = '--';
  if (closeEl) closeEl.textContent = 'closest: --';
}

function redrawLightningMarkers() {
  if (LightningState.active && !LightningState.tileLayer) {
    addLightningTileLayer();
  }
}