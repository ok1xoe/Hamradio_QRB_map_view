// js/app.js
import {
    maidenheadSubsquare,
    locatorToExtentWGS84,
    locatorToCenterLonLat,
    buildGrid
} from './maidenhead.js';

import { createI18n, applyTranslations, normalizeLang } from './i18n.js';
import { parseEdiText, importEdiFile } from './edi.js';
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

        langSelect: document.getElementById('lang')
    };

    const dict = createI18n();
    let currentLang = normalizeLang(ui.langSelect?.value);

    // Pokud je seznam naplněn z EDI, uložíme mapu locator -> { call, qso }.
    // Pokud je prázdná, zobrazujeme lokátory.
    let importedByLocator = new Map();

    // DXCC index (načte se lazy a cachuje se)
    let dxccIndex = null;
    let dxccIndexPromise = null;

    function ensureDxccLoaded() {
        if (dxccIndex) return Promise.resolve(dxccIndex);
        if (dxccIndexPromise) return dxccIndexPromise;

        dxccIndexPromise = loadDxccIndex({ url: './dxcc/dxcc.json' })
            .then((idx) => {
                dxccIndex = idx;
                return dxccIndex;
            })
            .catch((err) => {
                // DXCC je „nice to have“, mapu to nesmí shodit
                dxccIndex = null;
                dxccIndexPromise = null;
                console.warn('DXCC load failed:', err);
                return null;
            });

        return dxccIndexPromise;
    }

    function isPanelCollapsed() {
        return ui.controlPanel.classList.contains('collapsed');
    }

    function t() {
        return dict[currentLang] || dict.cs;
    }

    function setLanguage(lang) {
        currentLang = normalizeLang(lang);
        ui.langSelect.value = currentLang;
        applyTranslations({ lang: currentLang, dict, ui, isPanelCollapsed });
        refreshGrid();
    }

    // Panel collapse
    if (ui.togglePanelBtn && ui.controlPanel && ui.panelBodyEl) {
        ui.togglePanelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const collapsed = ui.controlPanel.classList.toggle('collapsed');
            ui.panelBodyEl.style.display = collapsed ? 'none' : 'block';
            applyTranslations({ lang: currentLang, dict, ui, isPanelCollapsed });
        });
    }

    // Map + layers
    const osmLayer = new ol.layer.Tile({ source: new ol.source.OSM() });

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
        style: feature => new ol.style.Style({
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
        })
    });

    const linksSource = new ol.source.Vector();
    const linksLayer = new ol.layer.Vector({
        source: linksSource,
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({ color: 'rgba(255,0,0,0.9)', width: 2 })
        })
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
        layers: [osmLayer, gridLayer, highlightLayer, targetsLayer, linksLayer, qthLayer],
        view
    });

    /************************************************************
     *  Tooltip (hover 2s nad cílem)
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
        const qso = feature.get('qso'); // objekt z EDI (pokud je)

        const dxccEntityCode = feature.get('dxccEntityCode');
        const dxccName = feature.get('dxccName');

        // Pokud nejsou detaily, zobraz jen lokátor (+ případně DXCC, pokud je)
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

        // Rozšíření hintu: DXCC entita + země
        if (dxccEntityCode && dxccName) {
            lines.push(
                `<div class="line"><span class="key">DXCC</span><span class="val">${escapeHtml(String(dxccEntityCode))} — ${escapeHtml(dxccName)}</span></div>`
            );
        }

        // Date + Time
        const dt = [fmt(qso.date), fmt(qso.time)].filter(Boolean).join(' ');
        if (dt) {
            lines.push(`<div class="line"><span class="key">Date/Time</span><span class="val">${escapeHtml(dt)}</span></div>`);
        }

        // Mode
        if (fmt(qso.mode)) {
            lines.push(`<div class="line"><span class="key">Mode</span><span class="val">${escapeHtml(qso.mode)}</span></div>`);
        }

        // Sent/Received ve formátu: "59 005 JO88WX" (SSB) nebo "599 005 JO88WX" (CW)
        // report je už správně (59 vs 599) z EDI
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

        // QRB
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
        ui.qthInput.value = locator6;
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

    function refreshLinks() {
        linksSource.clear(true);
        const qthLL = getQthLonLatOrNull();
        if (!qthLL) return;

        const qth3857 = ol.proj.fromLonLat(qthLL);
        for (const f of targetsSource.getFeatures()) {
            const coords = f.getGeometry()?.getCoordinates();
            if (!coords) continue;
            linksSource.addFeature(new ol.Feature({
                geometry: new ol.geom.LineString([qth3857, coords])
            }));
        }
    }

    function pickLevel() {
        const mode = ui.modeSelect.value;
        if (mode === "field" || mode === "square" || mode === "subsquare") return mode;

        const z = view.getZoom() ?? 0;
        if (z <= 5) return "field";
        return (z >= 11.5) ? "subsquare" : "square";
    }

    function refreshGrid() {
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
        const locs = parseTargetsText(ui.targetsTextarea.value);
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

            // DXCC lookup podle prefixů (prefix == začátek značky)
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
                km,
                dxccEntityCode: dxcc?.entityCode ?? null,
                dxccName: dxcc?.name ?? null
            }));

            listItems.push({ loc, display, km });
        }

        renderLocatorList(listItems);

        if (invalid.length) {
            ui.statusEl.textContent = t().msgInvalidLines(
                invalid.slice(0, 8).join(', ') + (invalid.length > 8 ? '…' : '')
            );
        } else {
            ui.statusEl.textContent = t().msgShownLocs(valid.length, Boolean(qthLL));
        }

        if (valid.length) {
            const ext = targetsSource.getExtent();
            if (ext && ext.every(Number.isFinite)) {
                view.fit(ext, { padding: [80, 80, 80, 80], duration: 350, maxZoom: 12 });
            }
        }

        refreshLinks();
    }

    function refreshTargetsDistancesIfAny() {
        if (!targetsSource.getFeatures().length) {
            refreshLinks();
            return;
        }
        plotTargetsFromTextarea();
    }

    // Search highlight
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
        ui.contextMenuEl.style.display = 'none';
        lastContextLonLat = null;
    }

    function showContextMenu(clientX, clientY) {
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
    document.getElementById('map').addEventListener('contextmenu', onMapContextMenu);

    document.addEventListener('mousedown', (e) => {
        if (ui.contextMenuEl.style.display !== 'block') return;
        if (!ui.contextMenuEl.contains(e.target)) hideContextMenu();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideContextMenu();
    });

    // Events
    ui.langSelect.addEventListener('change', () => setLanguage(ui.langSelect.value));

    ui.modeSelect.addEventListener('change', refreshGrid);
    ui.gridToggle.addEventListener('change', refreshGrid);

    let gridTimer = null;
    map.on('moveend', () => {
        clearTimeout(gridTimer);
        gridTimer = setTimeout(refreshGrid, 120);
    });

    ui.goLocatorBtn.addEventListener('click', () => {
        if (!highlightLocator(ui.locatorInput.value)) ui.statusEl.textContent = t().msgBadLocator;
        else refreshGrid();
    });

    ui.locatorInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        if (!highlightLocator(ui.locatorInput.value)) ui.statusEl.textContent = t().msgBadLocator;
        else refreshGrid();
    });

    ui.clearLocatorBtn.addEventListener('click', () => {
        highlightSource.clear(true);
        ui.locatorInput.value = '';
        refreshGrid();
    });

    ui.setQthBtn.addEventListener('click', () => {
        if (!setQthFromLocator(ui.qthInput.value)) {
            ui.statusEl.textContent = t().msgBadQth;
            return;
        }
        refreshTargetsDistancesIfAny();
        refreshLinks();
        refreshGrid();
    });

    ui.qthInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        if (!setQthFromLocator(ui.qthInput.value)) {
            ui.statusEl.textContent = t().msgBadQth;
            return;
        }
        refreshTargetsDistancesIfAny();
        refreshLinks();
        refreshGrid();
    });

    ui.clearQthBtn.addEventListener('click', () => {
        ui.qthInput.value = '';
        qthSource.clear(true);
        refreshTargetsDistancesIfAny();
        refreshLinks();
        refreshGrid();
    });

    ui.plotTargetsBtn.addEventListener('click', async () => {
        await ensureDxccLoaded();
        plotTargetsFromTextarea();
        refreshLinks();
        refreshGrid();
    });

    ui.clearTargetsBtn.addEventListener('click', () => {
        ui.targetsTextarea.value = '';
        targetsSource.clear(true);
        ui.locatorListEl.innerHTML = '';
        importedByLocator = new Map();
        hideTooltip();
        refreshLinks();
        refreshGrid();
    });

    ui.importEdiBtn.addEventListener('click', async () => {
        const file = ui.ediFileInput.files && ui.ediFileInput.files[0];
        if (!file) {
            ui.statusEl.textContent = t().msgPickEdi;
            return;
        }

        try {
            const text = await importEdiFile(file);
            const parsed = parseEdiText(text, isValidTargetLocator6);

            if (ui.ediSetQthCheckbox.checked && parsed.myLocator) {
                ui.qthInput.value = parsed.myLocator;
                setQthFromLocator(parsed.myLocator);
            }

            if (!parsed.targets.length) {
                ui.statusEl.textContent = t().msgEdiNoLocs;
                ui.targetsTextarea.value = '';
                targetsSource.clear(true);
                ui.locatorListEl.innerHTML = '';
                importedByLocator = new Map();
                hideTooltip();
                refreshLinks();
                refreshGrid();
                return;
            }

            // locator -> {call,qso}
            importedByLocator = new Map(
                parsed.targets.map(x => [x.locator, { call: (x.call || '').toUpperCase() || null, qso: x.qso || null }])
            );

            ui.targetsTextarea.value = parsed.targets.map(x => x.locator).join('\n');

            await ensureDxccLoaded();

            plotTargetsFromTextarea();
            refreshLinks();
            refreshGrid();

            ui.statusEl.textContent = t().msgEdiLoaded(parsed.targets.length, parsed.myLocator);
        } catch (err) {
            ui.statusEl.textContent = `EDI import failed: ${err && err.message ? err.message : String(err)}`;
        }
    });

    ui.ctxAddQthBtn.addEventListener('click', () => {
        if (!lastContextLonLat) return;
        const [lon, lat] = lastContextLonLat;
        const locator6 = setQthFromLonLat(lon, lat);

        hideContextMenu();
        refreshTargetsDistancesIfAny();
        refreshLinks();
        refreshGrid();

        ui.statusEl.textContent = t().msgQthFromMap(locator6, lon.toFixed(5), lat.toFixed(5));
    });

    ui.ctxExportPngBtn.addEventListener('click', () => {
        exportMapAsPng({ map, hideContextMenu });
    });

    /************************************************************
     *  Hover detekce nad cílovými body: 2s -> tooltip
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

    // načti DXCC na pozadí (neblokuje start)
    ensureDxccLoaded();

    refreshGrid();
    refreshLinks();
})();