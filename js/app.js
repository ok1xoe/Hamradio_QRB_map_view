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

        layerQsoCheckbox: document.getElementById('layerQso'),
        layerQsoCwCheckbox: document.getElementById('layerQsoCw'),
        layerQsoSsbCheckbox: document.getElementById('layerQsoSsb'),
        layerQsoOtherCheckbox: document.getElementById('layerQsoOther')
    };

    const dict = createI18n();
    let currentLang = normalizeLang(ui.langSelect?.value);

    // Pokud je seznam naplněn z EDI, uložíme mapu locator -> { call, qso }.
    // Pokud je prázdná, zobrazujeme lokátory.
    let importedByLocator = new Map();

    // import režim pro cíle:
    // - 'LOC' = lokátory z textarea (ručně / EDI lokátory)
    // - 'ADIF' = cíle jsou DXCC entity (dle prefixů)
    let targetsMode = 'LOC';

    // DXCC index (načte se lazy a cachuje se)
    let dxccIndex = null;
    let dxccIndexPromise = null;

    // DXCC geometrie (vrstva států)
    const workedDxccEntityCodes = new Set(); // entityCode, kde existuje (VIDITELNÉ) spojení
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

        // Umísti pod hlavní panel; s malou mezerou.
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

        // texty mohou změnit výšku panelu -> přepozicovat vrstvy
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

    // QSO vrstvy: CW / SSB / OTHER (spojnice)
    const qsoCwSource = new ol.source.Vector();
    const qsoCwLayer = new ol.layer.Vector({
        source: qsoCwSource,
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({ color: 'rgba(255, 215, 0, 0.95)', width: 2 }) // zlatá
        })
    });
    qsoCwLayer.set('name', 'QSO CW');
    qsoCwLayer.setZIndex(8);

    const qsoSsbSource = new ol.source.Vector();
    const qsoSsbLayer = new ol.layer.Vector({
        source: qsoSsbSource,
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({ color: 'rgba(255, 0, 0, 0.90)', width: 2 }) // červená
        })
    });
    qsoSsbLayer.set('name', 'QSO SSB');
    qsoSsbLayer.setZIndex(8);

    const qsoOtherSource = new ol.source.Vector();
    const qsoOtherLayer = new ol.layer.Vector({
        source: qsoOtherSource,
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({ color: 'rgba(30, 144, 255, 0.90)', width: 2 }) // modrá (Other)
        })
    });
    qsoOtherLayer.set('name', 'QSO Other');
    qsoOtherLayer.setZIndex(8);

    const qsoGroupLayer = new ol.layer.Group({
        layers: [qsoCwLayer, qsoSsbLayer, qsoOtherLayer]
    });
    qsoGroupLayer.set('name', 'QSO');
    qsoGroupLayer.setZIndex(8);

    function detectQsoModeFromModeField(qso) {
        const m = String(qso?.mode ?? '').trim().toUpperCase();
        if (!m) return 'OTHER';

        if (m === 'CW' || m.includes('CW')) return 'CW';

        // SSB (často SSB / USB / LSB)
        if (m === 'SSB' || m === 'USB' || m === 'LSB' || m.includes('SSB')) return 'SSB';

        return 'OTHER';
    }

    function isQsoModeVisible(mode) {
        if (mode === 'CW') return qsoCwLayer.getVisible();
        if (mode === 'SSB') return qsoSsbLayer.getVisible();
        if (mode === 'OTHER') return qsoOtherLayer.getVisible();
        return false;
    }

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

    function getDxccEntityCodeAtCoordinate3857(coord3857) {
        const feats = dxccGeomSource.getFeatures() || [];
        for (const f of feats) {
            const geom = f.getGeometry();
            if (!geom) continue;

            if (geom.intersectsCoordinate(coord3857)) {
                const props = f.getProperties() || {};
                const code = Number(props.dxcc_entity_code);
                if (Number.isFinite(code)) return code;
            }
        }
        return null;
    }

    function getQthLonLatOrNull() {
        const feats = qthSource.getFeatures();
        if (!feats.length) return null;
        return ol.proj.toLonLat(feats[0].getGeometry().getCoordinates());
    }

    function getQsoOrigin3857OrNull() {
        // V režimu ADIF chceme střed DXCC země, kde leží bod QTH
        if (targetsMode === 'ADIF') {
            const qthLL = getQthLonLatOrNull();
            if (!qthLL) return null;

            const qth3857 = ol.proj.fromLonLat(qthLL);

            const myEntity = getDxccEntityCodeAtCoordinate3857(qth3857);
            if (myEntity != null) {
                const c = getDxccCenter3857ByEntityCode(myEntity);
                if (c) return c;
            }

            // fallback: pokud QTH neleží v žádné DXCC geometrii, použij bod QTH
            return qth3857;
        }

        // default: bod QTH
        const qthLL = getQthLonLatOrNull();
        if (!qthLL) return null;
        return ol.proj.fromLonLat(qthLL);
    }

    function refreshQsoLinks() {
        qsoCwSource.clear(true);
        qsoSsbSource.clear(true);
        qsoOtherSource.clear(true);

        const origin3857 = getQsoOrigin3857OrNull();
        if (!origin3857) return;

        for (const f of targetsSource.getFeatures()) {
            const coords = f.getGeometry()?.getCoordinates();
            if (!coords) continue;

            const qso = f.get('qso');
            if (!qso) continue; // jen skutečná QSO (EDI/ADIF)

            const mode = f.get('qsoMode') || detectQsoModeFromModeField(qso);

            const line = new ol.Feature({
                geometry: new ol.geom.LineString([origin3857, coords]),
                locator: f.get('locator') || null,
                call: f.get('call') || null,
                mode
            });

            if (mode === 'CW') qsoCwSource.addFeature(line);
            else if (mode === 'SSB') qsoSsbSource.addFeature(line);
            else qsoOtherSource.addFeature(line);
        }
    }

    function rebuildWorkedDxccSetFromVisibleQsos() {
        workedDxccEntityCodes.clear();

        for (const f of targetsSource.getFeatures()) {
            const qso = f.get('qso');
            if (!qso) continue; // jen spojení (EDI/ADIF)

            const mode = f.get('qsoMode') || detectQsoModeFromModeField(qso);

            if (!isQsoModeVisible(mode)) continue;

            const code = Number(f.get('dxccEntityCode'));
            if (Number.isFinite(code)) workedDxccEntityCodes.add(code);
        }

        dxccGeomSource.changed();
    }

    function setQsoCheckboxStateFromLayers() {
        if (!ui.layerQsoCheckbox || !ui.layerQsoCwCheckbox || !ui.layerQsoSsbCheckbox || !ui.layerQsoOtherCheckbox) return;

        const cw = qsoCwLayer.getVisible();
        const ssb = qsoSsbLayer.getVisible();
        const other = qsoOtherLayer.getVisible();

        ui.layerQsoCwCheckbox.checked = cw;
        ui.layerQsoSsbCheckbox.checked = ssb;
        ui.layerQsoOtherCheckbox.checked = other;

        const anyOn = (cw || ssb || other);
        const allOn = (cw && ssb && other);

        ui.layerQsoCheckbox.indeterminate = (anyOn && !allOn);
        ui.layerQsoCheckbox.checked = anyOn;
    }

    function setQsoChildrenVisible(vis) {
        qsoCwLayer.setVisible(vis);
        qsoSsbLayer.setVisible(vis);
        qsoOtherLayer.setVisible(vis);
        setQsoCheckboxStateFromLayers();

        targetsSource.changed();
        rebuildWorkedDxccSetFromVisibleQsos();
    }

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
            const qso = feature.get('qso');
            const qsoMode = feature.get('qsoMode');

            if (qso && qsoMode && !isQsoModeVisible(qsoMode)) return null;

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
            qsoGroupLayer,
            gridLayer,
            highlightLayer,
            targetsLayer,
            qthLayer
        ],
        view
    });

    /************************************************************
     *  Tooltip (hover nad cílem)
     ************************************************************/
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
        const qso = feature.get('qso'); // objekt z EDI/ADIF (pokud je)

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
        if (dt) {
            lines.push(`<div class="line"><span class="key">Date/Time</span><span class="val">${escapeHtml(dt)}</span></div>`);
        }

        if (fmt(qso.mode)) {
            lines.push(`<div class="line"><span class="key">Mode</span><span class="val">${escapeHtml(qso.mode)}</span></div>`);
        }

        const sentStr = formatExchange(qso.sentReport, qso.sentContestCode, qso.myLocator);
        if (sentStr) {
            lines.push(`<div class="line"><span class="key">Sent</span><span class="val">${escapeHtml(sentStr)}</span></div>`);
        } else if (fmt(qso.sentExchangeRaw)) {
            lines.push(`<div class="line"><span class="key">Sent</span><span class="val">${escapeHtml(qso.sentExchangeRaw)}</span></div>`);
        }

        const rcvdStr = formatExchange(qso.rcvReport, qso.rcvContestCode, qso.locator);
        if (rcvdStr) {
            lines.push(`<div class="line"><span class="key">Rcvd</span><span class="val">${escapeHtml(rcvdStr)}</span></div>`);
        } else if (fmt(qso.rcvExchangeRaw)) {
            lines.push(`<div class="line"><span class="key">Rcvd</span><span class="val">${escapeHtml(qso.rcvExchangeRaw)}</span></div>`);
        }

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

    // Helpers
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

            const imported = importedByLocator.get(loc); // {call,qso} nebo undefined
            const call = imported?.call || null;
            const qso = imported?.qso || null;

            const qsoMode = qso ? detectQsoModeFromModeField(qso) : null;

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
                qsoMode,
                km,
                dxccEntityCode: dxcc?.entityCode ?? null,
                dxccName: dxcc?.name ?? null
            }));

            listItems.push({ loc, display, km });
        }

        renderLocatorList(listItems);

        refreshQsoLinks();
        rebuildWorkedDxccSetFromVisibleQsos();
        targetsSource.changed();

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

    function refreshTargetsDistancesIfAny() {
        if (!targetsSource.getFeatures().length) {
            refreshQsoLinks();
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

    const mapEl = document.getElementById('map');
    if (mapEl) mapEl.addEventListener('contextmenu', onMapContextMenu);

    document.addEventListener('mousedown', (e) => {
        if (!ui.contextMenuEl) return;
        if (ui.contextMenuEl.style.display !== 'block') return;
        if (!ui.contextMenuEl.contains(e.target)) hideContextMenu();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideContextMenu();
    });

    // -------- Events (opraveno: vše přes null-check) --------
    if (ui.langSelect) ui.langSelect.addEventListener('change', () => setLanguage(ui.langSelect.value));
    if (ui.modeSelect) ui.modeSelect.addEventListener('change', refreshGrid);
    if (ui.gridToggle) ui.gridToggle.addEventListener('change', refreshGrid);

    // Panel vrstev (tree)
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

    if (ui.layerQsoCheckbox && ui.layerQsoCwCheckbox && ui.layerQsoSsbCheckbox && ui.layerQsoOtherCheckbox) {
        setQsoCheckboxStateFromLayers();

        ui.layerQsoCheckbox.addEventListener('change', () => {
            const on = Boolean(ui.layerQsoCheckbox.checked);
            setQsoChildrenVisible(on);
        });

        ui.layerQsoCwCheckbox.addEventListener('change', () => {
            qsoCwLayer.setVisible(Boolean(ui.layerQsoCwCheckbox.checked));
            setQsoCheckboxStateFromLayers();
            targetsSource.changed();
            rebuildWorkedDxccSetFromVisibleQsos();
        });

        ui.layerQsoSsbCheckbox.addEventListener('change', () => {
            qsoSsbLayer.setVisible(Boolean(ui.layerQsoSsbCheckbox.checked));
            setQsoCheckboxStateFromLayers();
            targetsSource.changed();
            rebuildWorkedDxccSetFromVisibleQsos();
        });

        ui.layerQsoOtherCheckbox.addEventListener('change', () => {
            qsoOtherLayer.setVisible(Boolean(ui.layerQsoOtherCheckbox.checked));
            setQsoCheckboxStateFromLayers();
            targetsSource.changed();
            rebuildWorkedDxccSetFromVisibleQsos();
        });
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
            positionLayersPanel();
        });
    }

    if (ui.clearQthBtn) {
        ui.clearQthBtn.addEventListener('click', () => {
            if (ui.qthInput) ui.qthInput.value = '';
            qthSource.clear(true);
            refreshTargetsDistancesIfAny();
            refreshGrid();
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

            qsoCwSource.clear(true);
            qsoSsbSource.clear(true);
            qsoOtherSource.clear(true);

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
                        if (ui.statusEl) ui.statusEl.textContent = 'Nejdřív nastav Moje QTH (kvůli výchozímu DXCC středu).';
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
                            modes: new Set()
                        };

                        bucket.calls.add(call);
                        const modeNorm = detectQsoModeFromModeField({ mode: r.mode || '' });
                        bucket.modes.add(modeNorm || 'OTHER');

                        byEntity.set(key, bucket);
                    }

                    if (!byEntity.size) {
                        if (ui.statusEl) ui.statusEl.textContent = 'Z ADI/ADIF se nepodařilo určit žádné DXCC (prefixy).';
                        positionLayersPanel();
                        return;
                    }

                    targetsSource.clear(true);
                    if (ui.targetsTextarea) ui.targetsTextarea.value = '';

                    const origin3857 = getQsoOrigin3857OrNull();
                    const originLL = origin3857 ? ol.proj.toLonLat(origin3857) : null;

                    const listItems = [];
                    for (const ent of byEntity.values()) {
                        const center3857 = getDxccCenter3857ByEntityCode(ent.entityCode);
                        if (!center3857) continue;

                        const ll = ol.proj.toLonLat(center3857);
                        const km = (originLL && ll)
                            ? haversineKm(originLL[0], originLL[1], ll[0], ll[1])
                            : null;

                        const repMode = ent.modes.has('CW') ? 'CW' : (ent.modes.has('SSB') ? 'SSB' : 'OTHER');

                        const labelName = ent.dxccName ? ent.dxccName : `DXCC ${ent.entityCode}`;
                        const label = `${labelName} (${ent.calls.size})`;

                        targetsSource.addFeature(new ol.Feature({
                            geometry: new ol.geom.Point(center3857),
                            label,
                            locator: null,
                            call: null,
                            qso: { mode: repMode, source: 'ADIF' },
                            qsoMode: repMode,
                            km,
                            dxccEntityCode: ent.entityCode,
                            dxccName: ent.dxccName
                        }));

                        listItems.push({ display: labelName, km });
                    }

                    renderLocatorList(listItems);

                    refreshQsoLinks();
                    rebuildWorkedDxccSetFromVisibleQsos();
                    targetsSource.changed();

                    if (ui.statusEl) {
                        ui.statusEl.textContent =
                            `ADIF načten: DXCC cílů ${byEntity.size}` + (unknownDxcc ? ` | Neznámé DXCC: ${unknownDxcc}` : '');
                    }

                    const ext = targetsSource.getExtent();
                    if (ext && ext.every(Number.isFinite)) {
                        view.fit(ext, { padding: [80, 80, 80, 80], duration: 350, maxZoom: 4 });
                    }

                    positionLayersPanel();
                    return;
                }

                // ---- EDI větev ----
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

                    qsoCwSource.clear(true);
                    qsoSsbSource.clear(true);
                    qsoOtherSource.clear(true);

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

            if (ui.statusEl) ui.statusEl.textContent = t().msgQthFromMap(locator6, lon.toFixed(5), lat.toFixed(5));
            positionLayersPanel();
        });
    }

    if (ui.ctxExportPngBtn) {
        ui.ctxExportPngBtn.addEventListener('click', () => {
            exportMapAsPng({ map, hideContextMenu });
        });
    }

    /************************************************************
     *  Hover detekce nad cílovými body
     ************************************************************/
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
    refreshQsoLinks();
    rebuildWorkedDxccSetFromVisibleQsos();

    requestAnimationFrame(() => positionLayersPanel());
})();