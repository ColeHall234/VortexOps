const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// serve the frontend files
app.use(express.static(path.join(__dirname)));

// ── NWS alerts proxy ──────────────────────────────────────
app.get('/api/alerts', async (req, res) => {
    try {
        let url = 'https://api.weather.gov/alerts/active?status=actual&message_type=alert&region_type=land';

        if (req.query.area) {
            url += `&area=${req.query.area}`;
        }

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'VortexOps/1.0 (storm-chase-app; contact@example.com)',
                'Accept': 'application/geo+json',
            }
        });

        if (!response.ok) throw new Error(`NWS error: ${response.status}`);

        const data = await response.json();
        res.json(data);

    } catch (err) {
        console.error('[proxy] alerts error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── NWS zone forecast proxy ───────────────────────────────
app.get('/api/forecast/:zone', async (req, res) => {
    try {
        const url = `https://api.weather.gov/zones/forecast/${req.params.zone}/forecast`;

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'VortexOps/1.0 (storm-chase-app; contact@example.com)',
                'Accept': 'application/geo+json',
            }
        });

        if (!response.ok) throw new Error(`NWS error: ${response.status}`);

        const data = await response.json();
        res.json(data);

    } catch (err) {
        console.error('[proxy] forecast error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── NWS observations proxy ────────────────────────────────
app.get('/api/observations/:station', async (req, res) => {
    try {
        const url = `https://api.weather.gov/stations/${req.params.station}/observations/latest`;

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'VortexOps/1.0 (storm-chase-app; contact@example.com)',
                'Accept': 'application/geo+json',
            }
        });

        // some stations return 404 or bad data — handle gracefully
        if (!response.ok) {
            return res.status(200).json({ properties: {} });
        }

        const data = await response.json();

        // validate we actually got observation properties
        if (!data.properties) {
            return res.status(200).json({ properties: {} });
        }

        res.json(data);

    } catch (err) {
        console.error('[proxy] observations error:', err.message);
        res.status(200).json({ properties: {} });
    }
});
// ── SPC image proxy ───────────────────────────────────────
app.get('/api/spc-image', async (req, res) => {
    try {
        const { type } = req.query;

        const urls = {
            cape: 'https://mesonet.agron.iastate.edu/request/grx/capesfc.png',
            srh: 'https://mesonet.agron.iastate.edu/request/grx/srh01km.png',
        };

        const url = urls[type];
        if (!url) return res.status(400).json({ error: 'Invalid type' });

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'VortexOps/1.0 (storm-chase-app; contact@example.com)',
            }
        });

        if (!response.ok) throw new Error(`Mesonet error: ${response.status}`);

        const buffer = await response.buffer();
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=3600');
        res.send(buffer);

    } catch (err) {
        console.error('[proxy] image error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── RAP model data proxy ──────────────────────────────────
app.get('/api/instability', async (req, res) => {
    try {
        const { lat, lng } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({ error: 'lat and lng required' });
        }

        const url = `https://api.weather.gov/points/${lat},${lng}`;

        const pointRes = await fetch(url, {
            headers: {
                'User-Agent': 'VortexOps/1.0 (storm-chase-app; contact@example.com)',
                'Accept': 'application/geo+json',
            }
        });

        if (!pointRes.ok) {
            return res.status(200).json({ properties: { periods: [] } });
        }

        const pointData = await pointRes.json();
        const forecastUrl = pointData.properties?.forecastHourly;

        if (!forecastUrl) {
            return res.status(200).json({ properties: { periods: [] } });
        }

        const forecastRes = await fetch(forecastUrl, {
            headers: {
                'User-Agent': 'VortexOps/1.0 (storm-chase-app; contact@example.com)',
                'Accept': 'application/geo+json',
            }
        });

        if (!forecastRes.ok) {
            return res.status(200).json({ properties: { periods: [] } });
        }

        const forecastData = await forecastRes.json();
        res.json(forecastData);

    } catch (err) {
        console.error('[proxy] instability error:', err.message);
        res.status(200).json({ properties: { periods: [] } });
    }
});

// ── NWS Local Storm Reports proxy ────────────────────────
app.get('/api/lsr', async (req, res) => {
    try {
        // LSRs are published as products through the NWS API
        // We fetch the latest significant weather products
        const url = 'https://api.weather.gov/products?type=LSR&limit=50';

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'VortexOps/1.0 (storm-chase-app; contact@example.com)',
                'Accept': 'application/geo+json',
            }
        });

        if (!response.ok) throw new Error(`LSR error: ${response.status}`);
        const data = await response.json();
        res.json(data);

    } catch (err) {
        console.error('[proxy] LSR error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── single LSR product fetch ───────────────────────────────
app.get('/api/lsr/:productId', async (req, res) => {
    try {
        const url = `https://api.weather.gov/products/${req.params.productId}`;

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'VortexOps/1.0 (storm-chase-app; contact@example.com)',
                'Accept': 'application/geo+json',
            }
        });

        if (!response.ok) throw new Error(`LSR product error: ${response.status}`);
        const data = await response.json();
        res.json(data);

    } catch (err) {
        console.error('[proxy] LSR product error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── SPC Mesoscale Discussions proxy ───────────────────────
app.get('/api/mcd', async (req, res) => {
    try {
        const url = 'https://api.weather.gov/products?type=MCD&limit=10';

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'VortexOps/1.0 (storm-chase-app; contact@example.com)',
                'Accept': 'application/geo+json',
            }
        });

        if (!response.ok) throw new Error(`MCD error: ${response.status}`);
        const data = await response.json();
        res.json(data);

    } catch (err) {
        console.error('[proxy] MCD error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── SPC MCD product detail proxy ──────────────────────────
app.get('/api/mcd/:productId', async (req, res) => {
    try {
        const url = `https://api.weather.gov/products/${req.params.productId}`;

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'VortexOps/1.0 (storm-chase-app; contact@example.com)',
                'Accept': 'application/geo+json',
            }
        });

        if (!response.ok) throw new Error(`MCD product error: ${response.status}`);
        const data = await response.json();
        res.json(data);

    } catch (err) {
        console.error('[proxy] MCD product error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── SPC Severe Weather Outlook proxy ──────────────────────
app.get('/api/swo', async (req, res) => {
    try {
        const url = 'https://api.weather.gov/products?type=SWO&limit=5';

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'VortexOps/1.0 (storm-chase-app; contact@example.com)',
                'Accept': 'application/geo+json',
            }
        });

        if (!response.ok) throw new Error(`SWO error: ${response.status}`);
        const data = await response.json();
        res.json(data);

    } catch (err) {
        console.error('[proxy] SWO error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── SWO product detail proxy ──────────────────────────────
app.get('/api/swo/:productId', async (req, res) => {
    try {
        const url = `https://api.weather.gov/products/${req.params.productId}`;

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'VortexOps/1.0 (storm-chase-app; contact@example.com)',
                'Accept': 'application/geo+json',
            }
        });

        if (!response.ok) throw new Error(`SWO product error: ${response.status}`);
        const data = await response.json();
        res.json(data);

    } catch (err) {
        console.error('[proxy] SWO product error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── Lightning strike buffer ───────────────────────────────
const lightningBuffer = [];
const MAX_STRIKES = 500;

function connectBlitzortung() {
    const servers = [
        'ws://ws1.blitzortung.org/bo/json/4/',
        'ws://ws3.blitzortung.org/bo/json/4/',
        'ws://ws5.blitzortung.org/bo/json/4/',
        'ws://ws7.blitzortung.org/bo/json/4/',
        'ws://ws8.blitzortung.org/bo/json/4/',
    ];

    let serverIndex = 0;

    function tryConnect() {
        const url = servers[serverIndex % servers.length];
        serverIndex++;

        console.log(`[lightning] connecting to ${url}`);

        const ws = new WebSocket(url, {
            rejectUnauthorized: false,  // bypass cert validation server-side
        });

        ws.on('open', () => {
            console.log(`[lightning] connected to ${url}`);
            ws.send(JSON.stringify({
                west: -130,
                east: -60,
                north: 55,
                south: 20,
            }));
        });

        ws.on('message', (data) => {
            try {
                const strike = JSON.parse(data.toString());
                if (strike.lat && strike.lon) {
                    lightningBuffer.push({
                        lat: strike.lat / 1e6,
                        lng: strike.lon / 1e6,
                        time: Date.now(),
                    });

                    // trim buffer
                    if (lightningBuffer.length > MAX_STRIKES) {
                        lightningBuffer.shift();
                    }
                }
            } catch (e) { /* ignore */ }
        });

        ws.on('error', (err) => {
            console.warn(`[lightning] error on ${url}:`, err.message);
        });

        ws.on('close', () => {
            console.log(`[lightning] disconnected — retrying in 5s`);
            setTimeout(tryConnect, 5000);
        });
    }

    tryConnect();
}
// ── NEXRAD storm attributes proxy ────────────────────────
app.get('/api/cells', async (req, res) => {
    try {
        const url = 'https://mesonet.agron.iastate.edu/geojson/nexrad_attr.geojson';

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'VortexOps/1.0 (storm-chase-app; contact@example.com)',
            }
        });

        if (!response.ok) throw new Error(`Cells error: ${response.status}`);
        const data = await response.json();
        res.json(data);

    } catch (err) {
        console.error('[proxy] cells error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
app.listen(PORT, () => {
    console.log(`[VortexOps] Server running at http://localhost:${PORT}`);
});