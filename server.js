const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

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
                'User-Agent': 'VortexOps/1.0 (storm-chase-app; cole.s.hall.x@gmail.com)',
                'Accept': 'application/geo+json',
            }
        });

        if (!response.ok) throw new Error(`NWS error: ${response.status}`);

        const data = await response.json();
        res.json(data);

    } catch (err) {
        console.error('[proxy] observations error:', err.message);
        res.status(500).json({ error: err.message });
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

        // SPC mesoanalysis point data — free, no key needed
        const url = `https://api.weather.gov/points/${lat},${lng}`;

        const pointRes = await fetch(url, {
            headers: {
                'User-Agent': 'VortexOps/1.0 (storm-chase-app; contact@example.com)',
                'Accept': 'application/geo+json',
            }
        });

        if (!pointRes.ok) throw new Error(`Points error: ${pointRes.status}`);
        const pointData = await pointRes.json();

        // get the hourly forecast which contains derived instability params
        const forecastUrl = pointData.properties?.forecastHourly;
        if (!forecastUrl) throw new Error('No forecast URL');

        const forecastRes = await fetch(forecastUrl, {
            headers: {
                'User-Agent': 'VortexOps/1.0 (storm-chase-app; contact@example.com)',
                'Accept': 'application/geo+json',
            }
        });

        if (!forecastRes.ok) throw new Error(`Forecast error: ${forecastRes.status}`);
        const forecastData = await forecastRes.json();

        res.json(forecastData);

    } catch (err) {
        console.error('[proxy] instability error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
app.listen(PORT, () => {
    console.log(`[VortexOps] Server running at http://localhost:${PORT}`);
});