// js/app.js
import {
    maidenheadSubsquare,
    locatorToExtentWGS84,
    locatorToCenterLonLat,
    buildGrid
} from './maidenhead.js';

import { createI18n, applyTranslations, normalizeLang } from './i18n.js';
import { parseEdiText, importEdiFile } from './edi.js';
import { parseAdifText, importAdifFile } from './adif.js';
import { exportMapAsPng } from './exportPng.js';
import { loadDxccIndex, findDxccByCall } from './dxcc.js';

(() => {
    const zlinskyExtentWGS84 = [16.8, 48.95, 18.6, 49.75];
    const zlinskyExtent3857 = ol.proj.transformExtent(zlinskyExtentWGS84, 'EPSG:4326', 'EPSG:3857');

    // UI refs
    const ui = {
        controlPanel: document.getElementById('controlPanel'),
        togglePanelBtn: document.getElementById('togglePanel'),
        panelBodyEl: document.getElementById('controlPanel')?.querySelector('.panel-body') ?? null,

        modeSelect: document.getElementById('mode'),
        statusEl: document.getElementById('status'),

        locatorInput: document.getElementById('locator'),
        goLocatorBtn: document.getElementById('goLocator'),
        clearLocatorBtn: document.getElementById('clearLocator'),

        qthInput: document.getElementById('qth'),
        setQthBtn: document.getElementById('setQth'),
        clearQthBtn: document.getElementById('clearQth'),

        targetsTextarea: document.getElementById('targets'),
        plotTargetsBtn: document.getElementById('plotTargets'),
        clearTargetsBtn: document.getElementById('clearTargets'),
        locatorListEl: document.getElementById('locatorList'),

        contextMenuEl: document.getElementById('contextMenu'),
        ctxAddQthBtn: document.getElementById('ctxAddQth'),
        ctxExportPngBtn: document.getElementById('ctxExportPng'),

        gridToggle: document.getElementById('gridToggle'),

        ediFileInput: document.getElementById('ediFile'),
        ediSetQthCheckbox: document.getElementById('ediSetQth'),
        importEdiBtn: document.getElementById('importEdi'),

        langSelect: document.getElementById('lang'),

        // panel vrstev
        layersPanelEl: document.getElementById('layersPanel'),
        layerMapCheckbox: document.getElementById('layerMap'),
        layerDxccCheckbox: document.getElementById('layerDxcc'),

        // Spojnice
        layerLinksCheckbox: document.getElementById('layerLinks'),
        layerLinksCwCheckbox: document.getElementById('layerLinksCw'),
        layerLinksSsbCheckbox: document.getElementById('layerLinksSsb'),
        layerLinksOtherCheckbox: document.getElementById('layerLinksOther'),

        // Spojnice > DIGI + podvrstvy
        layerLinksDigiCheckbox: document.getElementById('layerLinksDigi'),
        layerLinksDigiFt8Checkbox: document.getElementById('layerLinksDigiFt8'),
        layerLinksDigiFt4Checkbox: document.getElementById('layerLinksDigiFt4'),
        layerLinksDigiJt65Checkbox: document.getElementById('layerLinksDigiJt65'),
        layerLinksDigiRttyCheckbox: document.getElementById('layerLinksDigiRtty'),
        layerLinksDigiPsk31Checkbox: document.getElementById('layerLinksDigiPsk31'),
        layerLinksDigiPsk63Checkbox: document.getElementById('layerLinksDigiPsk63'),
        layerLinksDigiPsk125Checkbox: document.getElementById('layerLinksDigiPsk125'),
        layerLinksDigiSstvCheckbox: document.getElementById('layerLinksDigiSstv'),

        // Mode (jen filtrace bodů)
        layerQsoCheckbox: document.getElementById('layerQso'),
        layerQsoCwCheckbox: document.getElementById('layerQsoCw'),
        layerQsoSsbCheckbox: document.getElementById('layerQsoSsb'),
        layerQsoOtherCheckbox: document.getElementById('layerQsoOther'),

        // Mode > DIGI + podvrstvy
        layerQsoDigiCheckbox: document.getElementById('layerQsoDigi'),
        layerQsoDigiFt8Checkbox: document.getElementById('layerQsoDigiFt8'),
        layerQsoDigiFt4Checkbox: document.getElementById('layerQsoDigiFt4'),
        layerQsoDigiJt65Checkbox: document.getElementById('layerQsoDigiJt65'),
        layerQsoDigiRttyCheckbox: document.getElementById('layerQsoDigiRtty'),
        layerQsoDigiPsk31Checkbox: document.getElementById('layerQsoDigiPsk31'),
        layerQsoDigiPsk63Checkbox: document.getElementById('layerQsoDigiPsk63'),
        layerQsoDigiPsk125Checkbox: document.getElementById('layerQsoDigiPsk125'),
        layerQsoDigiSstvCheckbox: document.getElementById('layerQsoDigiSstv')
    };

    const dict = createI18n();
    let currentLang = normalizeLang(ui.langSelect?.value);

    let importedByLocator = new Map();
    let targetsMode = 'LOC';

    let dxccIndex = null;
    let dxccIndexPromise = null;

    const workedDxccEntityCodes = new Set();
    let dxccGeomLoaded = false;
    let dxccGeomPromise = null;

    function ensureDxccLoaded() {
        if (dxccIndex) return Promise.resolve(dxccIndex);
        if (dxccIndexPromise) return dxccIndexPromise;

        dxccIndexPromise = loadDxccIndex({ url: './dxcc/dxcc.json' })
            .then((idx) => {
                dxccIndex = idx;
                return dxccIndex;
            })
            .catch((err) => {
                dxccIndex = null;
                dxccIndexPromise = null;
                console.warn('DXCC load failed:', err);
                return null;
            });

        return dxccIndexPromise;
    }

    function isPanelCollapsed() {
        return ui.controlPanel?.classList?.contains('collapsed');
    }

    function positionLayersPanel() {
        if (!ui.layersPanelEl || !ui.controlPanel) return;

        const cpRect = ui.controlPanel.getBoundingClientRect();
        const gap = 10;
        const top = Math.round(cpRect.bottom + gap);
        const left = Math.round(cpRect.left);

        ui.layersPanelEl.style.top = `${top}px`;
        ui.layersPanelEl.style.left = `${left}px`;
    }

    function t() {
        return dict[currentLang] || dict.cs;
    }

    function setLanguage(lang) {
        currentLang = normalizeLang(lang);
        if (ui.langSelect) ui.langSelect.value = currentLang;
        applyTranslations({ lang: currentLang, dict, ui, isPanelCollapsed: () => isPanelCollapsed() });
        refreshGrid();
        positionLayersPanel();
    }

    // Panel collapse
    if (ui.togglePanelBtn && ui.controlPanel && ui.panelBodyEl) {
        ui.togglePanelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const collapsed = ui.controlPanel.classList.toggle('collapsed');
            ui.panelBodyEl.style.display = collapsed ? 'none' : 'block';
            applyTranslations({ lang: currentLang, dict, ui, isPanelCollapsed: () => isPanelCollapsed() });

            positionLayersPanel();
        });
    }

    // Map + layers
    const osmLayer = new ol.layer.Tile({ source: new ol.source.OSM() });
    osmLayer.set('name', 'Mapa');

    const dxccGeomSource = new ol.source.Vector();
    const dxccLayer = new ol.layer.Vector({
        source: dxccGeomSource,
        opacity: 0.5,
        style: (feature) => {
            const props = feature.getProperties() || {};
            const code = Number(props.dxcc_entity_code);
            const isWorked = Number.isFinite(code) && workedDxccEntityCodes.has(code);

            return new ol.style.Style({
                fill: new ol.style.Fill({
                    color: isWorked ? 'rgba(255,0,0,0.50)' : 'rgba(255,0,0,0.00)'
                }),
                stroke: new ol.style.Stroke({
                    color: 'rgba(255,0,0,0.18)',
                    width: 1
                })
            });
        }
    });
    dxccLayer.set('name', 'DXCC');
    dxccLayer.setZIndex(5);

    async function ensureDxccGeometryLoaded() {
        if (dxccGeomLoaded) return true;
        if (dxccGeomPromise) return dxccGeomPromise;

        dxccGeomPromise = (async () => {
            try {
                const res = await fetch('./geometry/dxcc.geojson', { cache: 'force-cache' });
                if (!res.ok) throw new Error(`DXCC geometry load failed (${res.status})`);
                const geojson = await res.json();

                const format = new ol.format.GeoJSON();
                const features = format.readFeatures(geojson, {
                    dataProjection: 'EPSG:4326',
                    featureProjection: 'EPSG:3857'
                });

                dxccGeomSource.clear(true);
                dxccGeomSource.addFeatures(features);

                dxccGeomLoaded = true;
                return true;
            } catch (err) {
                console.warn('DXCC geometry load failed:', err);
                dxccGeomLoaded = false;
                dxccGeomPromise = null;
                return false;
            }
        })();

        return dxccGeomPromise;
    }

    // --- FIX: chybějící DXCC helpery pro ADIF ---
    function getDxccFeatureByEntityCode(entityCode) {
        const codeNum = Number(entityCode);
        if (!Number.isFinite(codeNum)) return null;

        const feats = dxccGeomSource.getFeatures() || [];
        for (const f of feats) {
            const props = f.getProperties() || {};
            const c = Number(props.dxcc_entity_code);
            if (Number.isFinite(c) && c === codeNum) return f;
        }
        return null;
    }

    function getDxccCenter3857ByEntityCode(entityCode) {
        const f = getDxccFeatureByEntityCode(entityCode);
        if (!f) return null;

        const geom = f.getGeometry();
        if (!geom) return null;

        const ext = geom.getExtent();
        if (!ext || !ext.every(Number.isFinite)) return null;

        return ol.extent.getCenter(ext);
    }
    // --- /FIX ---

    // ===== MODE/DETEKCE (CW/SSB/DIGI/OTHER + submode u DIGI) =====
    const DIGI_SUBMODES = Object.freeze([
        'FT8', 'FT4', 'JT65', 'RTTY', 'PSK31', 'PSK63', 'PSK125', 'SSTV'
    ]);

    function normalizeModeStr(modeStr) {
        return String(modeStr ?? '').trim().toUpperCase();
    }

    function detectDigiSubmode(modeStr) {
        const m = normalizeModeStr(modeStr);
        if (!m) return null;
        return DIGI_SUBMODES.includes(m) ? m : null;
    }

    function detectModeBucket(modeStr) {
        const m = normalizeModeStr(modeStr);
        if (!m) return 'OTHER';

        const digi = detectDigiSubmode(m);
        if (digi) return 'DIGI';

        if (m === 'CW' || m.includes('CW')) return 'CW';
        if (m === 'SSB' || m === 'USB' || m === 'LSB' || m.includes('SSB')) return 'SSB';

        return 'OTHER';
    }

    function detectFeatureModeInfo(feature) {
        // Prefer explicit fields (we store them on features)
        const bucket = feature.get('qsoMode');
        const sub = feature.get('qsoModeSub');

        const bucketOk = (bucket === 'CW' || bucket === 'SSB' || bucket === 'DIGI' || bucket === 'OTHER');
        if (bucketOk) return { bucket, sub: (bucket === 'DIGI' ? (sub || null) : null) };

        const qso = feature.get('qso');
        if (qso && qso.mode) {
            const b = detectModeBucket(qso.mode);
            const s = (b === 'DIGI') ? detectDigiSubmode(qso.mode) : null;
            return { bucket: b, sub: s };
        }

        return { bucket: 'OTHER', sub: null };
    }

    // ===== SPOJNICE: CW/SSB/DIGI(FT8..)/OTHER =====
    const linksCwSource = new ol.source.Vector();
    const linksCwLayer = new ol.layer.Vector({
        source: linksCwSource,
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({ color: 'rgba(0,0,0,0.45)', width: 1.5, lineDash: [8, 6] })
        })
    });
    linksCwLayer.set('name', 'Spojnice CW');
    linksCwLayer.setZIndex(7);

    const linksSsbSource = new ol.source.Vector();
    const linksSsbLayer = new ol.layer.Vector({
        source: linksSsbSource,
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({ color: 'rgba(0,0,0,0.45)', width: 1.5, lineDash: [8, 6] })
        })
    });
    linksSsbLayer.set('name', 'Spojnice SSB');
    linksSsbLayer.setZIndex(7);

    // DIGI sublayers (links)
    function makeLinksDigiLayer(name, source) {
        const layer = new ol.layer.Vector({
            source,
            style: new ol.style.Style({
                stroke: new ol.style.Stroke({ color: 'rgba(0,0,0,0.45)', width: 1.5, lineDash: [8, 6] })
            })
        });
        layer.set('name', `Spojnice DIGI ${name}`);
        layer.setZIndex(7);
        return layer;
    }

    const linksDigiFt8Source = new ol.source.Vector();
    const linksDigiFt4Source = new ol.source.Vector();
    const linksDigiJt65Source = new ol.source.Vector();
    const linksDigiRttySource = new ol.source.Vector();
    const linksDigiPsk31Source = new ol.source.Vector();
    const linksDigiPsk63Source = new ol.source.Vector();
    const linksDigiPsk125Source = new ol.source.Vector();
    const linksDigiSstvSource = new ol.source.Vector();

    const linksDigiFt8Layer = makeLinksDigiLayer('FT8', linksDigiFt8Source);
    const linksDigiFt4Layer = makeLinksDigiLayer('FT4', linksDigiFt4Source);
    const linksDigiJt65Layer = makeLinksDigiLayer('JT65', linksDigiJt65Source);
    const linksDigiRttyLayer = makeLinksDigiLayer('RTTY', linksDigiRttySource);
    const linksDigiPsk31Layer = makeLinksDigiLayer('PSK31', linksDigiPsk31Source);
    const linksDigiPsk63Layer = makeLinksDigiLayer('PSK63', linksDigiPsk63Source);
    const linksDigiPsk125Layer = makeLinksDigiLayer('PSK125', linksDigiPsk125Source);
    const linksDigiSstvLayer = makeLinksDigiLayer('SSTV', linksDigiSstvSource);

    const linksDigiGroupLayer = new ol.layer.Group({
        layers: [
            linksDigiFt8Layer,
            linksDigiFt4Layer,
            linksDigiJt65Layer,
            linksDigiRttyLayer,
            linksDigiPsk31Layer,
            linksDigiPsk63Layer,
            linksDigiPsk125Layer,
            linksDigiSstvLayer
        ]
    });
    linksDigiGroupLayer.set('name', 'Spojnice DIGI');
    linksDigiGroupLayer.setZIndex(7);

    const linksOtherSource = new ol.source.Vector();
    const linksOtherLayer = new ol.layer.Vector({
        source: linksOtherSource,
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({ color: 'rgba(0,0,0,0.45)', width: 1.5, lineDash: [8, 6] })
        })
    });
    linksOtherLayer.set('name', 'Spojnice Other');
    linksOtherLayer.setZIndex(7);

    const linksGroupLayer = new ol.layer.Group({
        layers: [linksCwLayer, linksSsbLayer, linksDigiGroupLayer, linksOtherLayer]
    });
    linksGroupLayer.set('name', 'Spojnice');
    linksGroupLayer.setZIndex(7);

    // ===== MODE: CW/SSB/DIGI(FT8..)/OTHER (jen filtrace bodů) =====
    const modeCwLayer = new ol.layer.Vector({ source: new ol.source.Vector() });
    modeCwLayer.set('name', 'Mode CW');
    modeCwLayer.setZIndex(8);

    const modeSsbLayer = new ol.layer.Vector({ source: new ol.source.Vector() });
    modeSsbLayer.set('name', 'Mode SSB');
    modeSsbLayer.setZIndex(8);

    const modeOtherLayer = new ol.layer.Vector({ source: new ol.source.Vector() });
    modeOtherLayer.set('name', 'Mode Other');
    modeOtherLayer.setZIndex(8);

    // DIGI sublayers (mode visibility toggles)
    function makeModeDigiLayer(name) {
        const layer = new ol.layer.Vector({ source: new ol.source.Vector() });
        layer.set('name', `Mode DIGI ${name}`);
        layer.setZIndex(8);
        return layer;
    }

    const modeDigiFt8Layer = makeModeDigiLayer('FT8');
    const modeDigiFt4Layer = makeModeDigiLayer('FT4');
    const modeDigiJt65Layer = makeModeDigiLayer('JT65');
    const modeDigiRttyLayer = makeModeDigiLayer('RTTY');
    const modeDigiPsk31Layer = makeModeDigiLayer('PSK31');
    const modeDigiPsk63Layer = makeModeDigiLayer('PSK63');
    const modeDigiPsk125Layer = makeModeDigiLayer('PSK125');
    const modeDigiSstvLayer = makeModeDigiLayer('SSTV');

    const modeDigiGroupLayer = new ol.layer.Group({
        layers: [
            modeDigiFt8Layer,
            modeDigiFt4Layer,
            modeDigiJt65Layer,
            modeDigiRttyLayer,
            modeDigiPsk31Layer,
            modeDigiPsk63Layer,
            modeDigiPsk125Layer,
            modeDigiSstvLayer
        ]
    });
    modeDigiGroupLayer.set('name', 'Mode DIGI');
    modeDigiGroupLayer.setZIndex(8);

    const modeGroupLayer = new ol.layer.Group({
        layers: [modeCwLayer, modeSsbLayer, modeDigiGroupLayer, modeOtherLayer]
    });
    modeGroupLayer.set('name', 'Mode');
    modeGroupLayer.setZIndex(8);

    function isDigiSubmodeVisible(sub) {
        if (!sub) return false;
        if (sub === 'FT8') return modeDigiFt8Layer.getVisible();
        if (sub === 'FT4') return modeDigiFt4Layer.getVisible();
        if (sub === 'JT65') return modeDigiJt65Layer.getVisible();
        if (sub === 'RTTY') return modeDigiRttyLayer.getVisible();
        if (sub === 'PSK31') return modeDigiPsk31Layer.getVisible();
        if (sub === 'PSK63') return modeDigiPsk63Layer.getVisible();
        if (sub === 'PSK125') return modeDigiPsk125Layer.getVisible();
        if (sub === 'SSTV') return modeDigiSstvLayer.getVisible();
        return false;
    }

    function isModeVisible(bucket, sub) {
        if (bucket === 'CW') return modeCwLayer.getVisible();
        if (bucket === 'SSB') return modeSsbLayer.getVisible();
        if (bucket === 'OTHER') return modeOtherLayer.getVisible();

        if (bucket === 'DIGI') {
            if (!modeDigiGroupLayer.getVisible()) return false;
            return isDigiSubmodeVisible(sub);
        }

        return false;
    }

    // grid/highlight/targets/qth
    const gridSource = new ol.source.Vector();
    const gridLayer = new ol.layer.Vector({
        source: gridSource,
        style: feature => new ol.style.Style({
            stroke: new ol.style.Stroke({ width: 1 }),
            fill: new ol.style.Fill({ color: 'rgba(0,0,0,0)' }),
            text: new ol.style.Text({
                text: feature.get('label'),
                font: '12px system-ui, Arial',
                overflow: true
            })
        })
    });

    const highlightSource = new ol.source.Vector();
    const highlightLayer = new ol.layer.Vector({
        source: highlightSource,
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({ color: '#ff2d2d', width: 3 }),
            fill: new ol.style.Fill({ color: 'rgba(255,45,45,0.12)' })
        })
    });

    const targetsSource = new ol.source.Vector();
    const targetsLayer = new ol.layer.Vector({
        source: targetsSource,
        style: (feature) => {
            const mi = detectFeatureModeInfo(feature);
            if (!isModeVisible(mi.bucket, mi.sub)) return null;

            return new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 5,
                    fill: new ol.style.Fill({ color: '#00a36c' }),
                    stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 })
                }),
                text: new ol.style.Text({
                    text: feature.get('label') || '',
                    offsetY: -14,
                    font: '12px system-ui, Arial',
                    fill: new ol.style.Fill({ color: '#0b3b2a' }),
                    stroke: new ol.style.Stroke({ color: 'rgba(255,255,255,0.9)', width: 3 })
                })
            });
        }
    });

    const qthSource = new ol.source.Vector();
    const qthLayer = new ol.layer.Vector({
        source: qthSource,
        style: feature => new ol.style.Style({
            image: new ol.style.Circle({
                radius: 6,
                fill: new ol.style.Fill({ color: '#1b6cff' }),
                stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 })
            }),
            text: new ol.style.Text({
                text: feature.get('label') || 'QTH',
                offsetY: -14,
                font: '12px system-ui, Arial',
                fill: new ol.style.Fill({ color: '#0b2a66' }),
                stroke: new ol.style.Stroke({ color: 'rgba(255,255,255,0.9)', width: 3 })
            })
        })
    });

    const view = new ol.View({
        center: ol.proj.fromLonLat([17.73, 49.22]),
        zoom: 9
    });

    const map = new ol.Map({
        target: 'map',
        layers: [
            osmLayer,
            dxccLayer,
            linksGroupLayer,
            modeGroupLayer,
            gridLayer,
            highlightLayer,
            targetsLayer,
            qthLayer
        ],
        view
    });

    // Tooltip
    const tooltipEl = document.createElement('div');
    tooltipEl.className = 'qrb-tooltip';
    tooltipEl.style.display = 'none';

    const tooltipOverlay = new ol.Overlay({
        element: tooltipEl,
        offset: [12, -12],
        positioning: 'bottom-left',
        stopEvent: false
    });
    map.addOverlay(tooltipOverlay);

    let hoverTimer = null;
    let hoverFeature = null;
    let hoverPixelKey = null;

    function escapeHtml(s) {
        return String(s ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function fmt(val) {
        const s = String(val ?? '').trim();
        return s ? s : null;
    }

    function formatExchange(report, code, locator) {
        const parts = [fmt(report), fmt(code), fmt(locator)].filter(Boolean);
        return parts.length ? parts.join(' ') : null;
    }

    function setTooltipContentForFeature(feature) {
        const locator = feature.get('locator');
        const call = feature.get('call');
        const km = feature.get('km');
        const qso = feature.get('qso');

        const dxccEntityCode = feature.get('dxccEntityCode');
        const dxccName = feature.get('dxccName');

        if (!qso) {
            const lines = [];
            lines.push(`<div class="title">${escapeHtml(locator || '')}</div>`);

            if (dxccEntityCode && dxccName) {
                lines.push(
                    `<div class="line"><span class="key">DXCC</span><span class="val">${escapeHtml(String(dxccEntityCode))} — ${escapeHtml(dxccName)}</span></div>`
                );
            }

            tooltipEl.innerHTML = lines.join('');
            return;
        }

        const title = call ? call : (locator || '');
        const lines = [];
        lines.push(`<div class="title">${escapeHtml(title)}</div>`);

        if (dxccEntityCode && dxccName) {
            lines.push(
                `<div class="line"><span class="key">DXCC</span><span class="val">${escapeHtml(String(dxccEntityCode))} — ${escapeHtml(dxccName)}</span></div>`
            );
        }

        const dt = [fmt(qso.date), fmt(qso.time)].filter(Boolean).join(' ');
        if (dt) lines.push(`<div class="line"><span class="key">Date/Time</span><span class="val">${escapeHtml(dt)}</span></div>`);

        if (fmt(qso.mode)) lines.push(`<div class="line"><span class="key">Mode</span><span class="val">${escapeHtml(qso.mode)}</span></div>`);

        const sentStr = formatExchange(qso.sentReport, qso.sentContestCode, qso.myLocator);
        if (sentStr) lines.push(`<div class="line"><span class="key">Sent</span><span class="val">${escapeHtml(sentStr)}</span></div>`);
        else if (fmt(qso.sentExchangeRaw)) lines.push(`<div class="line"><span class="key">Sent</span><span class="val">${escapeHtml(qso.sentExchangeRaw)}</span></div>`);

        const rcvdStr = formatExchange(qso.rcvReport, qso.rcvContestCode, qso.locator);
        if (rcvdStr) lines.push(`<div class="line"><span class="key">Rcvd</span><span class="val">${escapeHtml(rcvdStr)}</span></div>`);
        else if (fmt(qso.rcvExchangeRaw)) lines.push(`<div class="line"><span class="key">Rcvd</span><span class="val">${escapeHtml(qso.rcvExchangeRaw)}</span></div>`);

        if (typeof km === 'number' && Number.isFinite(km)) {
            lines.push(`<div class="line"><span class="key">QRB</span><span class="val">${escapeHtml(km.toFixed(1))} km</span></div>`);
        }

        tooltipEl.innerHTML = lines.join('');
    }

    function showTooltip(feature, coordinate3857) {
        setTooltipContentForFeature(feature);
        tooltipOverlay.setPosition(coordinate3857);
        tooltipEl.style.display = 'block';
    }

    function hideTooltip() {
        tooltipEl.style.display = 'none';
        tooltipOverlay.setPosition(undefined);
    }

    function clearHoverTimer() {
        if (hoverTimer) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
        }
    }

    function isValidTargetLocator6(loc) {
        return /^[A-R]{2}[0-9]{2}[A-X]{2}$/.test(loc);
    }

    function haversineKm(lon1, lat1, lon2, lat2) {
        const R = 6371.0088;
        const toRad = d => d * Math.PI / 180;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
    }

    function getQthLonLatOrNull() {
        const feats = qthSource.getFeatures();
        if (!feats.length) return null;
        return ol.proj.toLonLat(feats[0].getGeometry().getCoordinates());
    }

    function setQthFromLonLat(lon, lat) {
        const locator6 = maidenheadSubsquare(lon, lat);
        qthSource.clear(true);
        qthSource.addFeature(new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat])),
            label: `QTH ${locator6}`
        }));
        if (ui.qthInput) ui.qthInput.value = locator6;
        return locator6;
    }

    function setQthFromLocator(locator) {
        const ext = locatorToExtentWGS84(locator);
        if (!ext) return false;
        const lon = (ext[0] + ext[2]) / 2;
        const lat = (ext[1] + ext[3]) / 2;
        qthSource.clear(true);
        qthSource.addFeature(new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat])),
            label: `QTH ${String(locator).trim()}`
        }));
        return true;
    }

    function getLinksOrigin3857OrNull() {
        const qthLL = getQthLonLatOrNull();
        if (!qthLL) return null;
        return ol.proj.fromLonLat(qthLL);
    }

    function clearAllLinkSources() {
        linksCwSource.clear(true);
        linksSsbSource.clear(true);
        linksOtherSource.clear(true);

        linksDigiFt8Source.clear(true);
        linksDigiFt4Source.clear(true);
        linksDigiJt65Source.clear(true);
        linksDigiRttySource.clear(true);
        linksDigiPsk31Source.clear(true);
        linksDigiPsk63Source.clear(true);
        linksDigiPsk125Source.clear(true);
        linksDigiSstvSource.clear(true);
    }

    function addDigiLinkFeature(submode, lineFeature) {
        if (submode === 'FT8') linksDigiFt8Source.addFeature(lineFeature);
        else if (submode === 'FT4') linksDigiFt4Source.addFeature(lineFeature);
        else if (submode === 'JT65') linksDigiJt65Source.addFeature(lineFeature);
        else if (submode === 'RTTY') linksDigiRttySource.addFeature(lineFeature);
        else if (submode === 'PSK31') linksDigiPsk31Source.addFeature(lineFeature);
        else if (submode === 'PSK63') linksDigiPsk63Source.addFeature(lineFeature);
        else if (submode === 'PSK125') linksDigiPsk125Source.addFeature(lineFeature);
        else if (submode === 'SSTV') linksDigiSstvSource.addFeature(lineFeature);
    }

    function refreshTargetLinks() {
        clearAllLinkSources();

        if (!linksGroupLayer.getVisible()) return;

        const origin3857 = getLinksOrigin3857OrNull();
        if (!origin3857) return;

        for (const f of targetsSource.getFeatures()) {
            const coords = f.getGeometry()?.getCoordinates();
            if (!coords) continue;

            const mi = detectFeatureModeInfo(f);

            const line = new ol.Feature({
                geometry: new ol.geom.LineString([origin3857, coords]),
                mode: mi.bucket,
                submode: mi.sub
            });

            if (mi.bucket === 'CW') linksCwSource.addFeature(line);
            else if (mi.bucket === 'SSB') linksSsbSource.addFeature(line);
            else if (mi.bucket === 'OTHER') linksOtherSource.addFeature(line);
            else if (mi.bucket === 'DIGI') addDigiLinkFeature(mi.sub, line);
            else linksOtherSource.addFeature(line);
        }
    }

    function pickLevel() {
        const mode = ui.modeSelect?.value;
        if (mode === "field" || mode === "square" || mode === "subsquare") return mode;

        const z = view.getZoom() ?? 0;
        if (z <= 5) return "field";
        return (z >= 11.5) ? "subsquare" : "square";
    }

    function refreshGrid() {
        if (!ui.statusEl || !ui.gridToggle) return;

        const zNum = view.getZoom();
        const zTxt = (typeof zNum === 'number') ? zNum.toFixed(1) : '?';

        if (!ui.gridToggle.checked) {
            gridLayer.setVisible(false);
            gridSource.clear(true);
            ui.statusEl.textContent = t().msgGridOff(zTxt);
            return;
        }

        gridLayer.setVisible(true);

        const level = pickLevel();
        const extent = view.calculateExtent(map.getSize());

        const ll = ol.proj.toLonLat([extent[0], extent[1]]);
        const ur = ol.proj.toLonLat([extent[2], extent[3]]);
        const wLon = Math.abs(ur[0] - ll[0]);
        const hLat = Math.abs(ur[1] - ll[1]);

        let effectiveLevel = level;
        if (level === "subsquare") {
            const estCells = (wLon / (1 / 12)) * (hLat / (1 / 24));
            if (estCells > 2500) effectiveLevel = "square";
        }

        const features = buildGrid(extent, effectiveLevel);
        gridSource.clear(true);
        gridSource.addFeatures(features);

        ui.statusEl.textContent = t().msgGridOn(zTxt, effectiveLevel.toUpperCase(), features.length);
    }

    function parseTargetsText(text) {
        const rawLines = String(text || '')
            .split(/\r?\n/)
            .map(s => s.trim())
            .filter(Boolean);

        const seen = new Set();
        const out = [];
        for (const line of rawLines) {
            const token = line.replace(/\s+/g, '').toUpperCase();
            if (!token) continue;
            if (seen.has(token)) continue;
            seen.add(token);
            out.push(token);
        }
        return out;
    }

    function renderLocatorList(items) {
        if (!ui.locatorListEl) return;

        ui.locatorListEl.innerHTML = '';
        for (const it of items) {
            const li = document.createElement('li');
            const kmTxt = (typeof it.km === 'number')
                ? ` — ${it.km.toFixed(1)} km`
                : ` ${t().msgNeedQthForDist}`;

            li.innerHTML = `<code>${it.display}</code>${kmTxt}`;
            ui.locatorListEl.appendChild(li);
        }
    }

    function plotTargetsFromTextarea() {
        const locs = parseTargetsText(ui.targetsTextarea?.value);
        const valid = [];
        const invalid = [];

        for (const loc of locs) {
            if (!isValidTargetLocator6(loc)) invalid.push(loc);
            else valid.push(loc);
        }

        const qthLL = getQthLonLatOrNull();
        targetsSource.clear(true);

        const listItems = [];
        for (const loc of valid) {
            const center = locatorToCenterLonLat(loc);
            if (!center) continue;

            const [lon, lat] = center;
            const km = qthLL ? haversineKm(qthLL[0], qthLL[1], lon, lat) : null;

            const imported = importedByLocator.get(loc);
            const call = imported?.call || null;
            const qso = imported?.qso || null;

            const qsoModeBucket = qso ? detectModeBucket(qso.mode) : null;
            const qsoModeSub = (qsoModeBucket === 'DIGI') ? detectDigiSubmode(qso?.mode) : null;

            const dxcc = (call && dxccIndex)
                ? findDxccByCall(call, dxccIndex, { includeDeleted: false })
                : null;

            const display = call ? call : loc;

            targetsSource.addFeature(new ol.Feature({
                geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat])),
                label: qthLL ? `${display} (${km.toFixed(0)} km)` : display,
                locator: loc,
                call,
                qso,
                qsoMode: qsoModeBucket,
                qsoModeSub,
                km,
                dxccEntityCode: dxcc?.entityCode ?? null,
                dxccName: dxcc?.name ?? null
            }));

            listItems.push({ loc, display, km });
        }

        renderLocatorList(listItems);

        refreshTargetLinks();
        targetsSource.changed();
        rebuildWorkedDxccSetFromVisibleQsos();

        if (ui.statusEl) {
            if (invalid.length) {
                ui.statusEl.textContent = t().msgInvalidLines(
                    invalid.slice(0, 8).join(', ') + (invalid.length > 8 ? '…' : '')
                );
            } else {
                ui.statusEl.textContent = t().msgShownLocs(valid.length, Boolean(qthLL));
            }
        }

        if (valid.length) {
            const ext = targetsSource.getExtent();
            if (ext && ext.every(Number.isFinite)) {
                view.fit(ext, { padding: [80, 80, 80, 80], duration: 350, maxZoom: 12 });
            }
        }

        positionLayersPanel();
    }

    function rebuildWorkedDxccSetFromVisibleQsos() {
        workedDxccEntityCodes.clear();

        for (const f of targetsSource.getFeatures()) {
            const qso = f.get('qso');
            if (!qso) continue;

            const mi = detectFeatureModeInfo(f);
            if (!isModeVisible(mi.bucket, mi.sub)) continue;

            const code = Number(f.get('dxccEntityCode'));
            if (Number.isFinite(code)) workedDxccEntityCodes.add(code);
        }

        dxccGeomSource.changed();
    }

    function refreshTargetsDistancesIfAny() {
        if (!targetsSource.getFeatures().length) {
            refreshTargetLinks();
            rebuildWorkedDxccSetFromVisibleQsos();
            return;
        }
        plotTargetsFromTextarea();
    }

    function highlightLocator(locator) {
        const ext = locatorToExtentWGS84(locator);
        if (!ext) return false;

        const ext3857 = ol.proj.transformExtent(ext, 'EPSG:4326', 'EPSG:3857');

        const ring = [
            [ext[0], ext[1]],
            [ext[2], ext[1]],
            [ext[2], ext[3]],
            [ext[0], ext[3]],
            [ext[0], ext[1]]
        ].map(c => ol.proj.fromLonLat(c));

        highlightSource.clear(true);
        highlightSource.addFeature(new ol.Feature({
            geometry: new ol.geom.Polygon([ring])
        }));

        view.fit(ext3857, { padding: [80, 80, 80, 80], duration: 450, maxZoom: 14 });
        return true;
    }

    // Context menu
    let lastContextLonLat = null;

    function hideContextMenu() {
        if (ui.contextMenuEl) ui.contextMenuEl.style.display = 'none';
        lastContextLonLat = null;
    }

    function showContextMenu(clientX, clientY) {
        if (!ui.contextMenuEl) return;

        const vpRect = map.getViewport().getBoundingClientRect();
        let x = clientX - vpRect.left;
        let y = clientY - vpRect.top;

        ui.contextMenuEl.style.display = 'block';
        ui.contextMenuEl.style.left = `${x}px`;
        ui.contextMenuEl.style.top = `${y}px`;

        const menuRect = ui.contextMenuEl.getBoundingClientRect();
        const overRight = menuRect.right - vpRect.right;
        const overBottom = menuRect.bottom - vpRect.bottom;
        if (overRight > 0) x = Math.max(0, x - overRight - 6);
        if (overBottom > 0) y = Math.max(0, y - overBottom - 6);

        ui.contextMenuEl.style.left = `${x}px`;
        ui.contextMenuEl.style.top = `${y}px`;
    }

    function onMapContextMenu(e) {
        e.preventDefault();
        lastContextLonLat = ol.proj.toLonLat(map.getEventCoordinate(e));
        showContextMenu(e.clientX, e.clientY);
    }

    map.getViewport().addEventListener('contextmenu', onMapContextMenu);

    const mapEl2 = document.getElementById('map');
    if (mapEl2) mapEl2.addEventListener('contextmenu', onMapContextMenu);

    document.addEventListener('mousedown', (e) => {
        if (!ui.contextMenuEl) return;
        if (ui.contextMenuEl.style.display !== 'block') return;
        if (!ui.contextMenuEl.contains(e.target)) hideContextMenu();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideContextMenu();
    });

    // Events
    if (ui.langSelect) ui.langSelect.addEventListener('change', () => setLanguage(ui.langSelect.value));
    if (ui.modeSelect) ui.modeSelect.addEventListener('change', refreshGrid);
    if (ui.gridToggle) ui.gridToggle.addEventListener('change', refreshGrid);

    // Panel vrstev
    if (ui.layerMapCheckbox) {
        ui.layerMapCheckbox.checked = true;
        ui.layerMapCheckbox.disabled = true;
    }

    if (ui.layerDxccCheckbox) {
        ui.layerDxccCheckbox.checked = dxccLayer.getVisible();
        ui.layerDxccCheckbox.addEventListener('change', async () => {
            const wantVisible = Boolean(ui.layerDxccCheckbox.checked);
            if (wantVisible) await ensureDxccGeometryLoaded();
            dxccLayer.setVisible(wantVisible);
        });
    }

    // ===== SPOJNICE: UI (CW/SSB/DIGI/OTHER + DIGI sub) =====
    function setLinksDigiChildrenVisible(vis) {
        linksDigiFt8Layer.setVisible(vis);
        linksDigiFt4Layer.setVisible(vis);
        linksDigiJt65Layer.setVisible(vis);
        linksDigiRttyLayer.setVisible(vis);
        linksDigiPsk31Layer.setVisible(vis);
        linksDigiPsk63Layer.setVisible(vis);
        linksDigiPsk125Layer.setVisible(vis);
        linksDigiSstvLayer.setVisible(vis);
        linksDigiGroupLayer.setVisible(vis);
    }

    function setLinksDigiCheckboxStateFromLayers() {
        const childs = [
            { cb: ui.layerLinksDigiFt8Checkbox, layer: linksDigiFt8Layer },
            { cb: ui.layerLinksDigiFt4Checkbox, layer: linksDigiFt4Layer },
            { cb: ui.layerLinksDigiJt65Checkbox, layer: linksDigiJt65Layer },
            { cb: ui.layerLinksDigiRttyCheckbox, layer: linksDigiRttyLayer },
            { cb: ui.layerLinksDigiPsk31Checkbox, layer: linksDigiPsk31Layer },
            { cb: ui.layerLinksDigiPsk63Checkbox, layer: linksDigiPsk63Layer },
            { cb: ui.layerLinksDigiPsk125Checkbox, layer: linksDigiPsk125Layer },
            { cb: ui.layerLinksDigiSstvCheckbox, layer: linksDigiSstvLayer }
        ].filter(x => x.cb && x.layer);

        for (const x of childs) x.cb.checked = x.layer.getVisible();

        if (ui.layerLinksDigiCheckbox) {
            const anyOn = childs.some(x => x.layer.getVisible());
            const allOn = childs.length ? childs.every(x => x.layer.getVisible()) : false;
            ui.layerLinksDigiCheckbox.indeterminate = (anyOn && !allOn);
            ui.layerLinksDigiCheckbox.checked = anyOn;
        }

        linksDigiGroupLayer.setVisible(
            linksDigiFt8Layer.getVisible() ||
            linksDigiFt4Layer.getVisible() ||
            linksDigiJt65Layer.getVisible() ||
            linksDigiRttyLayer.getVisible() ||
            linksDigiPsk31Layer.getVisible() ||
            linksDigiPsk63Layer.getVisible() ||
            linksDigiPsk125Layer.getVisible() ||
            linksDigiSstvLayer.getVisible()
        );
    }

    function setLinksCheckboxStateFromLayers() {
        if (!ui.layerLinksCheckbox || !ui.layerLinksCwCheckbox || !ui.layerLinksSsbCheckbox || !ui.layerLinksOtherCheckbox) return;

        const cw = linksCwLayer.getVisible();
        const ssb = linksSsbLayer.getVisible();
        const other = linksOtherLayer.getVisible();

        ui.layerLinksCwCheckbox.checked = cw;
        ui.layerLinksSsbCheckbox.checked = ssb;
        ui.layerLinksOtherCheckbox.checked = other;

        setLinksDigiCheckboxStateFromLayers();
        const digiAny = Boolean(ui.layerLinksDigiCheckbox?.checked);

        const anyOn = (cw || ssb || digiAny || other);
        const allOn = (cw && ssb && digiAny && other);

        ui.layerLinksCheckbox.indeterminate = (anyOn && !allOn);
        ui.layerLinksCheckbox.checked = anyOn;
    }

    function setLinksChildrenVisible(vis) {
        linksCwLayer.setVisible(vis);
        linksSsbLayer.setVisible(vis);
        linksOtherLayer.setVisible(vis);

        setLinksDigiChildrenVisible(vis);

        linksGroupLayer.setVisible(vis);

        setLinksCheckboxStateFromLayers();
        refreshTargetLinks();
    }

    if (ui.layerLinksCheckbox) {
        setLinksCheckboxStateFromLayers();

        ui.layerLinksCheckbox.addEventListener('change', () => {
            const on = Boolean(ui.layerLinksCheckbox.checked);
            setLinksChildrenVisible(on);
        });

        if (ui.layerLinksCwCheckbox) {
            ui.layerLinksCwCheckbox.addEventListener('change', () => {
                linksCwLayer.setVisible(Boolean(ui.layerLinksCwCheckbox.checked));
                linksGroupLayer.setVisible(
                    linksCwLayer.getVisible() ||
                    linksSsbLayer.getVisible() ||
                    linksDigiGroupLayer.getVisible() ||
                    linksOtherLayer.getVisible()
                );
                setLinksCheckboxStateFromLayers();
                refreshTargetLinks();
            });
        }

        if (ui.layerLinksSsbCheckbox) {
            ui.layerLinksSsbCheckbox.addEventListener('change', () => {
                linksSsbLayer.setVisible(Boolean(ui.layerLinksSsbCheckbox.checked));
                linksGroupLayer.setVisible(
                    linksCwLayer.getVisible() ||
                    linksSsbLayer.getVisible() ||
                    linksDigiGroupLayer.getVisible() ||
                    linksOtherLayer.getVisible()
                );
                setLinksCheckboxStateFromLayers();
                refreshTargetLinks();
            });
        }

        if (ui.layerLinksOtherCheckbox) {
            ui.layerLinksOtherCheckbox.addEventListener('change', () => {
                linksOtherLayer.setVisible(Boolean(ui.layerLinksOtherCheckbox.checked));
                linksGroupLayer.setVisible(
                    linksCwLayer.getVisible() ||
                    linksSsbLayer.getVisible() ||
                    linksDigiGroupLayer.getVisible() ||
                    linksOtherLayer.getVisible()
                );
                setLinksCheckboxStateFromLayers();
                refreshTargetLinks();
            });
        }

        // DIGI master + sub
        if (ui.layerLinksDigiCheckbox) {
            ui.layerLinksDigiCheckbox.addEventListener('change', () => {
                const on = Boolean(ui.layerLinksDigiCheckbox.checked);
                setLinksDigiChildrenVisible(on);
                setLinksCheckboxStateFromLayers();
                linksGroupLayer.setVisible(
                    linksCwLayer.getVisible() ||
                    linksSsbLayer.getVisible() ||
                    linksDigiGroupLayer.getVisible() ||
                    linksOtherLayer.getVisible()
                );
                refreshTargetLinks();
            });
        }

        const digiSubLinks = [
            { cb: ui.layerLinksDigiFt8Checkbox, layer: linksDigiFt8Layer },
            { cb: ui.layerLinksDigiFt4Checkbox, layer: linksDigiFt4Layer },
            { cb: ui.layerLinksDigiJt65Checkbox, layer: linksDigiJt65Layer },
            { cb: ui.layerLinksDigiRttyCheckbox, layer: linksDigiRttyLayer },
            { cb: ui.layerLinksDigiPsk31Checkbox, layer: linksDigiPsk31Layer },
            { cb: ui.layerLinksDigiPsk63Checkbox, layer: linksDigiPsk63Layer },
            { cb: ui.layerLinksDigiPsk125Checkbox, layer: linksDigiPsk125Layer },
            { cb: ui.layerLinksDigiSstvCheckbox, layer: linksDigiSstvLayer }
        ];
        for (const x of digiSubLinks) {
            if (!x.cb) continue;
            x.cb.addEventListener('change', () => {
                x.layer.setVisible(Boolean(x.cb.checked));
                setLinksCheckboxStateFromLayers();
                linksGroupLayer.setVisible(
                    linksCwLayer.getVisible() ||
                    linksSsbLayer.getVisible() ||
                    linksDigiGroupLayer.getVisible() ||
                    linksOtherLayer.getVisible()
                );
                refreshTargetLinks();
            });
        }
    }

    // ===== MODE: UI (CW/SSB/DIGI/OTHER + DIGI sub) =====
    function setModeDigiChildrenVisible(vis) {
        modeDigiFt8Layer.setVisible(vis);
        modeDigiFt4Layer.setVisible(vis);
        modeDigiJt65Layer.setVisible(vis);
        modeDigiRttyLayer.setVisible(vis);
        modeDigiPsk31Layer.setVisible(vis);
        modeDigiPsk63Layer.setVisible(vis);
        modeDigiPsk125Layer.setVisible(vis);
        modeDigiSstvLayer.setVisible(vis);
        modeDigiGroupLayer.setVisible(vis);
    }

    function setModeDigiCheckboxStateFromLayers() {
        const childs = [
            { cb: ui.layerQsoDigiFt8Checkbox, layer: modeDigiFt8Layer },
            { cb: ui.layerQsoDigiFt4Checkbox, layer: modeDigiFt4Layer },
            { cb: ui.layerQsoDigiJt65Checkbox, layer: modeDigiJt65Layer },
            { cb: ui.layerQsoDigiRttyCheckbox, layer: modeDigiRttyLayer },
            { cb: ui.layerQsoDigiPsk31Checkbox, layer: modeDigiPsk31Layer },
            { cb: ui.layerQsoDigiPsk63Checkbox, layer: modeDigiPsk63Layer },
            { cb: ui.layerQsoDigiPsk125Checkbox, layer: modeDigiPsk125Layer },
            { cb: ui.layerQsoDigiSstvCheckbox, layer: modeDigiSstvLayer }
        ].filter(x => x.cb && x.layer);

        for (const x of childs) x.cb.checked = x.layer.getVisible();

        if (ui.layerQsoDigiCheckbox) {
            const anyOn = childs.some(x => x.layer.getVisible());
            const allOn = childs.length ? childs.every(x => x.layer.getVisible()) : false;
            ui.layerQsoDigiCheckbox.indeterminate = (anyOn && !allOn);
            ui.layerQsoDigiCheckbox.checked = anyOn;
        }

        modeDigiGroupLayer.setVisible(
            modeDigiFt8Layer.getVisible() ||
            modeDigiFt4Layer.getVisible() ||
            modeDigiJt65Layer.getVisible() ||
            modeDigiRttyLayer.getVisible() ||
            modeDigiPsk31Layer.getVisible() ||
            modeDigiPsk63Layer.getVisible() ||
            modeDigiPsk125Layer.getVisible() ||
            modeDigiSstvLayer.getVisible()
        );
    }

    function setModeCheckboxStateFromLayers() {
        if (!ui.layerQsoCheckbox || !ui.layerQsoCwCheckbox || !ui.layerQsoSsbCheckbox || !ui.layerQsoOtherCheckbox) return;

        const cw = modeCwLayer.getVisible();
        const ssb = modeSsbLayer.getVisible();
        const other = modeOtherLayer.getVisible();

        ui.layerQsoCwCheckbox.checked = cw;
        ui.layerQsoSsbCheckbox.checked = ssb;
        ui.layerQsoOtherCheckbox.checked = other;

        setModeDigiCheckboxStateFromLayers();
        const digiAny = Boolean(ui.layerQsoDigiCheckbox?.checked);

        const anyOn = (cw || ssb || digiAny || other);
        const allOn = (cw && ssb && digiAny && other);

        ui.layerQsoCheckbox.indeterminate = (anyOn && !allOn);
        ui.layerQsoCheckbox.checked = anyOn;
    }

    function setModeChildrenVisible(vis) {
        modeCwLayer.setVisible(vis);
        modeSsbLayer.setVisible(vis);
        modeOtherLayer.setVisible(vis);

        setModeDigiChildrenVisible(vis);

        setModeCheckboxStateFromLayers();
        targetsSource.changed();
        rebuildWorkedDxccSetFromVisibleQsos();
    }

    if (ui.layerQsoCheckbox) {
        setModeCheckboxStateFromLayers();

        ui.layerQsoCheckbox.addEventListener('change', () => {
            const on = Boolean(ui.layerQsoCheckbox.checked);
            setModeChildrenVisible(on);
        });

        if (ui.layerQsoCwCheckbox) {
            ui.layerQsoCwCheckbox.addEventListener('change', () => {
                modeCwLayer.setVisible(Boolean(ui.layerQsoCwCheckbox.checked));
                setModeCheckboxStateFromLayers();
                targetsSource.changed();
                rebuildWorkedDxccSetFromVisibleQsos();
            });
        }

        if (ui.layerQsoSsbCheckbox) {
            ui.layerQsoSsbCheckbox.addEventListener('change', () => {
                modeSsbLayer.setVisible(Boolean(ui.layerQsoSsbCheckbox.checked));
                setModeCheckboxStateFromLayers();
                targetsSource.changed();
                rebuildWorkedDxccSetFromVisibleQsos();
            });
        }

        if (ui.layerQsoOtherCheckbox) {
            ui.layerQsoOtherCheckbox.addEventListener('change', () => {
                modeOtherLayer.setVisible(Boolean(ui.layerQsoOtherCheckbox.checked));
                setModeCheckboxStateFromLayers();
                targetsSource.changed();
                rebuildWorkedDxccSetFromVisibleQsos();
            });
        }

        if (ui.layerQsoDigiCheckbox) {
            ui.layerQsoDigiCheckbox.addEventListener('change', () => {
                const on = Boolean(ui.layerQsoDigiCheckbox.checked);
                setModeDigiChildrenVisible(on);
                setModeCheckboxStateFromLayers();
                targetsSource.changed();
                rebuildWorkedDxccSetFromVisibleQsos();
            });
        }

        const digiSubMode = [
            { cb: ui.layerQsoDigiFt8Checkbox, layer: modeDigiFt8Layer },
            { cb: ui.layerQsoDigiFt4Checkbox, layer: modeDigiFt4Layer },
            { cb: ui.layerQsoDigiJt65Checkbox, layer: modeDigiJt65Layer },
            { cb: ui.layerQsoDigiRttyCheckbox, layer: modeDigiRttyLayer },
            { cb: ui.layerQsoDigiPsk31Checkbox, layer: modeDigiPsk31Layer },
            { cb: ui.layerQsoDigiPsk63Checkbox, layer: modeDigiPsk63Layer },
            { cb: ui.layerQsoDigiPsk125Checkbox, layer: modeDigiPsk125Layer },
            { cb: ui.layerQsoDigiSstvCheckbox, layer: modeDigiSstvLayer }
        ];
        for (const x of digiSubMode) {
            if (!x.cb) continue;
            x.cb.addEventListener('change', () => {
                x.layer.setVisible(Boolean(x.cb.checked));
                setModeCheckboxStateFromLayers();
                targetsSource.changed();
                rebuildWorkedDxccSetFromVisibleQsos();
            });
        }
    }

    window.addEventListener('resize', () => {
        positionLayersPanel();
    });

    let gridTimer = null;
    map.on('moveend', () => {
        clearTimeout(gridTimer);
        gridTimer = setTimeout(refreshGrid, 120);
    });

    if (ui.goLocatorBtn) {
        ui.goLocatorBtn.addEventListener('click', () => {
            if (!highlightLocator(ui.locatorInput?.value)) {
                if (ui.statusEl) ui.statusEl.textContent = t().msgBadLocator;
            } else refreshGrid();
        });
    }

    if (ui.locatorInput) {
        ui.locatorInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            if (!highlightLocator(ui.locatorInput.value)) {
                if (ui.statusEl) ui.statusEl.textContent = t().msgBadLocator;
            } else refreshGrid();
        });
    }

    if (ui.clearLocatorBtn) {
        ui.clearLocatorBtn.addEventListener('click', () => {
            highlightSource.clear(true);
            if (ui.locatorInput) ui.locatorInput.value = '';
            refreshGrid();
        });
    }

    if (ui.setQthBtn) {
        ui.setQthBtn.addEventListener('click', () => {
            if (!setQthFromLocator(ui.qthInput?.value)) {
                if (ui.statusEl) ui.statusEl.textContent = t().msgBadQth;
                return;
            }
            refreshTargetsDistancesIfAny();
            refreshGrid();
            refreshTargetLinks();
            positionLayersPanel();
        });
    }

    if (ui.qthInput) {
        ui.qthInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            if (!setQthFromLocator(ui.qthInput.value)) {
                if (ui.statusEl) ui.statusEl.textContent = t().msgBadQth;
                return;
            }
            refreshTargetsDistancesIfAny();
            refreshGrid();
            refreshTargetLinks();
            positionLayersPanel();
        });
    }

    if (ui.clearQthBtn) {
        ui.clearQthBtn.addEventListener('click', () => {
            if (ui.qthInput) ui.qthInput.value = '';
            qthSource.clear(true);
            refreshTargetsDistancesIfAny();
            refreshGrid();
            refreshTargetLinks();
            positionLayersPanel();
        });
    }

    if (ui.plotTargetsBtn) {
        ui.plotTargetsBtn.addEventListener('click', async () => {
            targetsMode = 'LOC';
            await ensureDxccLoaded();
            await ensureDxccGeometryLoaded();
            plotTargetsFromTextarea();
            refreshGrid();
            positionLayersPanel();
        });
    }

    if (ui.clearTargetsBtn) {
        ui.clearTargetsBtn.addEventListener('click', () => {
            if (ui.targetsTextarea) ui.targetsTextarea.value = '';
            targetsSource.clear(true);
            if (ui.locatorListEl) ui.locatorListEl.innerHTML = '';
            importedByLocator = new Map();
            targetsMode = 'LOC';
            hideTooltip();
            refreshGrid();

            workedDxccEntityCodes.clear();
            dxccGeomSource.changed();

            clearAllLinkSources();
            positionLayersPanel();
        });
    }

    if (ui.importEdiBtn) {
        ui.importEdiBtn.addEventListener('click', async () => {
            const file = ui.ediFileInput?.files && ui.ediFileInput.files[0];
            if (!file) {
                if (ui.statusEl) ui.statusEl.textContent = t().msgPickEdi;
                return;
            }

            const name = String(file.name || '').toLowerCase();
            const isAdif = name.endsWith('.adi') || name.endsWith('.adif');

            try {
                await ensureDxccLoaded();
                await ensureDxccGeometryLoaded();

                if (isAdif) {
                    const text = await importAdifFile(file);
                    const rows = parseAdifText(text);

                    if (!rows.length) {
                        if (ui.statusEl) ui.statusEl.textContent = 'V ADI/ADIF jsem nenašel žádné záznamy se značkou (CALL).';
                        positionLayersPanel();
                        return;
                    }

                    const qthLL = getQthLonLatOrNull();
                    if (!qthLL) {
                        if (ui.statusEl) ui.statusEl.textContent = 'Nejdřív nastav Moje QTH.';
                        positionLayersPanel();
                        return;
                    }

                    targetsMode = 'ADIF';
                    importedByLocator = new Map();

                    const byEntity = new Map();
                    let unknownDxcc = 0;

                    for (const r of rows) {
                        const call = String(r.call || '').trim().toUpperCase();
                        if (!call) continue;

                        const dx = findDxccByCall(call, dxccIndex, { includeDeleted: false });
                        if (!dx?.entityCode) {
                            unknownDxcc++;
                            continue;
                        }

                        const key = Number(dx.entityCode);
                        if (!Number.isFinite(key)) continue;

                        const bucket = byEntity.get(key) || {
                            entityCode: key,
                            dxccName: dx.name || null,
                            calls: new Set(),
                            modes: new Set(),
                            digiSubmodes: new Set()
                        };

                        bucket.calls.add(call);

                        const b = detectModeBucket(r.mode || '');
                        bucket.modes.add(b);
                        if (b === 'DIGI') {
                            const sub = detectDigiSubmode(r.mode || '');
                            if (sub) bucket.digiSubmodes.add(sub);
                        }

                        byEntity.set(key, bucket);
                    }

                    if (!byEntity.size) {
                        if (ui.statusEl) ui.statusEl.textContent = 'Z ADI/ADIF se nepodařilo určit žádné DXCC (prefixy).';
                        positionLayersPanel();
                        return;
                    }

                    targetsSource.clear(true);
                    if (ui.targetsTextarea) ui.targetsTextarea.value = '';

                    const origin3857 = getLinksOrigin3857OrNull();
                    const originLL = origin3857 ? ol.proj.toLonLat(origin3857) : null;

                    const listItems = [];
                    for (const ent of byEntity.values()) {
                        const center3857 = getDxccCenter3857ByEntityCode(ent.entityCode);
                        if (!center3857) continue;

                        const ll = ol.proj.toLonLat(center3857);
                        const km = (originLL && ll)
                            ? haversineKm(originLL[0], originLL[1], ll[0], ll[1])
                            : null;

                        // reprezentativní mode pro "bod"
                        let repMode = 'OTHER';
                        let repSub = null;

                        if (ent.modes.has('CW')) repMode = 'CW';
                        else if (ent.modes.has('SSB')) repMode = 'SSB';
                        else if (ent.modes.has('DIGI')) {
                            repMode = 'DIGI';
                            repSub = ent.digiSubmodes.values().next().value || 'FT8';
                        }

                        const labelName = ent.dxccName ? ent.dxccName : `DXCC ${ent.entityCode}`;
                        const label = `${labelName} (${ent.calls.size})`;

                        targetsSource.addFeature(new ol.Feature({
                            geometry: new ol.geom.Point(center3857),
                            label,
                            locator: null,
                            call: null,
                            qso: { mode: (repSub ? repSub : repMode), source: 'ADIF' },
                            qsoMode: repMode,
                            qsoModeSub: repSub,
                            km,
                            dxccEntityCode: ent.entityCode,
                            dxccName: ent.dxccName
                        }));

                        listItems.push({ display: labelName, km });
                    }

                    renderLocatorList(listItems);

                    refreshTargetLinks();
                    targetsSource.changed();
                    rebuildWorkedDxccSetFromVisibleQsos();

                    if (ui.statusEl) {
                        ui.statusEl.textContent = `ADIF načten: DXCC cílů ${byEntity.size}` + (unknownDxcc ? ` | Neznámé DXCC: ${unknownDxcc}` : '');
                    }

                    const ext = targetsSource.getExtent();
                    if (ext && ext.every(Number.isFinite)) {
                        view.fit(ext, { padding: [80, 80, 80, 80], duration: 350, maxZoom: 4 });
                    }

                    positionLayersPanel();
                    return;
                }

                // EDI
                const text = await importEdiFile(file);
                const parsed = parseEdiText(text, isValidTargetLocator6);

                if (ui.ediSetQthCheckbox?.checked && parsed.myLocator) {
                    if (ui.qthInput) ui.qthInput.value = parsed.myLocator;
                    setQthFromLocator(parsed.myLocator);
                }

                if (!parsed.targets.length) {
                    if (ui.statusEl) ui.statusEl.textContent = t().msgEdiNoLocs;
                    if (ui.targetsTextarea) ui.targetsTextarea.value = '';
                    targetsSource.clear(true);
                    if (ui.locatorListEl) ui.locatorListEl.innerHTML = '';
                    importedByLocator = new Map();
                    targetsMode = 'LOC';
                    hideTooltip();
                    refreshGrid();

                    workedDxccEntityCodes.clear();
                    dxccGeomSource.changed();

                    clearAllLinkSources();
                    positionLayersPanel();
                    return;
                }

                importedByLocator = new Map(
                    parsed.targets.map(x => [x.locator, { call: (x.call || '').toUpperCase() || null, qso: x.qso || null }])
                );

                if (ui.targetsTextarea) ui.targetsTextarea.value = parsed.targets.map(x => x.locator).join('\n');

                targetsMode = 'LOC';
                plotTargetsFromTextarea();
                refreshGrid();

                if (ui.statusEl) ui.statusEl.textContent = t().msgEdiLoaded(parsed.targets.length, parsed.myLocator);

                positionLayersPanel();
            } catch (err) {
                if (ui.statusEl) ui.statusEl.textContent = `Import failed: ${err && err.message ? err.message : String(err)}`;
                positionLayersPanel();
            }
        });
    }

    if (ui.ctxAddQthBtn) {
        ui.ctxAddQthBtn.addEventListener('click', () => {
            if (!lastContextLonLat) return;
            const [lon, lat] = lastContextLonLat;
            const locator6 = setQthFromLonLat(lon, lat);

            hideContextMenu();
            refreshTargetsDistancesIfAny();
            refreshGrid();
            refreshTargetLinks();

            if (ui.statusEl) ui.statusEl.textContent = t().msgQthFromMap(locator6, lon.toFixed(5), lat.toFixed(5));
            positionLayersPanel();
        });
    }

    if (ui.ctxExportPngBtn) {
        ui.ctxExportPngBtn.addEventListener('click', () => {
            exportMapAsPng({ map, hideContextMenu });
        });
    }

    map.on('pointermove', (evt) => {
        if (evt.dragging) {
            clearHoverTimer();
            hoverFeature = null;
            hoverPixelKey = null;
            hideTooltip();
            return;
        }

        const feature = map.forEachFeatureAtPixel(
            evt.pixel,
            (f, layer) => (layer === targetsLayer ? f : null),
            { hitTolerance: 6 }
        );

        if (!feature) {
            clearHoverTimer();
            hoverFeature = null;
            hoverPixelKey = null;
            hideTooltip();
            return;
        }

        const pixKey = `${evt.pixel[0]}:${evt.pixel[1]}`;
        if (hoverFeature === feature && hoverPixelKey === pixKey) return;

        clearHoverTimer();
        hideTooltip();
        hoverFeature = feature;
        hoverPixelKey = pixKey;

        const coordinate = evt.coordinate;
        hoverTimer = setTimeout(() => {
            if (hoverFeature !== feature) return;
            showTooltip(feature, coordinate);
        }, 1000);
    });

    map.on('movestart', () => {
        clearHoverTimer();
        hoverFeature = null;
        hoverPixelKey = null;
        hideTooltip();
    });

    // Initial
    setLanguage(currentLang);
    if (ui.panelBodyEl) ui.panelBodyEl.style.display = isPanelCollapsed() ? 'none' : 'block';
    view.fit(zlinskyExtent3857, { padding: [40, 40, 40, 40] });

    ensureDxccLoaded();
    ensureDxccGeometryLoaded();

    refreshGrid();
    refreshTargetLinks();
    rebuildWorkedDxccSetFromVisibleQsos();

    requestAnimationFrame(() => positionLayersPanel());
})();