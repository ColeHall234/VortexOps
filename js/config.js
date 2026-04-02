const CONFIG = {
    // Map Defaults
    map: {
        center: [36.5, -97.5],
        zoom: 6,
        minZoom: 4,
        maxZoom: 12,
        tileTheme: 'dark',
    },

    //Radar
    radar: {
        baseUrl: 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0',
        product: 'nexrad-n0q-900913',
        opacity: 0.65,
        refreshInterval: 120000,
    },

    //NWS Alerts
    alerts: {
        baseUrl: 'http://localhost:3000/api/alerts',
        refreshInterval: 60000,
        area: null,
        severityOrder: ['Extreme', 'Severe', 'Moderate', 'Minor', 'Unknown'],
    },

    //Warning Type Mappings
    warningTypes: {
        'Tornado Warning': { badge: 'TOR', cls: 'badge-tor', priority: 1 },
        'Tornado Watch': { badge: 'TOW', cls: 'badge-tor', priority: 2 },
        'Severe Thunderstorm Warning': { badge: 'SVR', cls: 'badge-svr', priority: 3 },
        'Severe Thunderstorm Watch': { badge: 'SVW', cls: 'badge-svr', priority: 4 },
        'Flash Flood Warning': { badge: 'FFW', cls: 'badge-ffw', priority: 5 },
        'Special Weather Statement': { badge: 'SWS', cls: 'badge-sct', priority: 6 },
        'default': { badge: 'WRN', cls: 'badge-default', priority: 9 },
    },

    //Base Map Tiles
    baseTiles: {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attribution: '%copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://openstreetmap.org">OSM</a>',
        subdomains: 'abcd',
        maxZoom: 19,
    },

    //Road Overlay Tiles
    roadTiles: {
        url: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
        opacity: 0.7,
    },

    //SPC Outlook
    spc: {
        url: 'https://www.spc.noaa.gov/gis/svrgis/zipped/',
        wmsUrl: 'https://mapservices.weather.noaa.gov/vector/services/outlooks/SPC_wx_outlks/MapServer/WMSServer',
        layers: 3,
        opacity: 0.4,
    },

    spcAnalysis: {
        bounds: [[21.652, -122.9], [47.839, -60.885]],
        opacity: 0.5,
        cape: {
            // Iowa Mesonet CAPE tile layer — same format as radar
            url: 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/mrad-n0q-900913/{z}/{x}/{y}.png',
            label: 'CAPE',
        },
        srh: {
            url: 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/mrad-n0q-900913/{z}/{x}/{y}.png',
            label: 'SRH 0-1km',
        },
    },

    //APP Settings
    app: {
        clockTimezone: 'America/New_York', // CDT - Change to Chase Zone
        units: 'imperial', // 'imperial || 'metric'
        alertRadius: 100, // miles - used for proximity alerts
        autoFollow: false, // follow GPS position on map
    },
};