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
    const STORAGE_KEY = 'qrbMapViewer.v1';

    // Google Analytics – jednoduchý wrapper na gtag
    function trackEvent(eventName, params = {}) {
        if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
            window.gtag('event', eventName, params);
        }
    }

    function safeJsonParse(s) {
        try { return JSON.parse(s); } catch { return null; }
    }

    function loadSettings() {
        const raw = localStorage.getItem(STORAGE_KEY);
        const obj = raw ? safeJsonParse(raw) : null;
        return (obj && typeof obj === 'object') ? obj : {};
    }

    function saveSettings(patch) {
        const cur = loadSettings();
        const next = { ...cur, ...patch };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
    }

    function ensureSettingsShape(s) {
        const out = (s && typeof s === 'object') ? { ...s } : {};
        if (!out.colors || typeof out.colors !== 'object') out.colors = {};
        if (!out.layerStates || typeof out.layerStates !== 'object') out.layerStates = {};
        if (!out.dxccLabels || typeof out.dxccLabels !== 'object') {
            out.dxccLabels = { size: 12 };
        }
        return out;
    }

    let settings = ensureSettingsShape(loadSettings());

    const defaultColors = {
        'dxcc.cw': '#ff3b30',
        'dxcc.ssb': '#ff9500',
        'dxcc.other': '#8e8e93',

        'dxcc.digi.ft8': '#34c759',
        'dxcc.digi.ft4': '#30b0c7',
        'dxcc.digi.jt65': '#5856d6',
        'dxcc.digi.rtty': '#ff2d55',
        'dxcc.digi.psk31': '#007aff',
        'dxcc.digi.psk63': '#0a84ff',
        'dxcc.digi.psk125': '#64d2ff',
        'dxcc.digi.sstv': '#af52de'
    };

    function getColor(key) {
        const fromStore = settings?.colors?.[key];
        if (typeof fromStore === 'string' && fromStore.trim()) return fromStore.trim();
        return defaultColors[key] || '#ff3b30';
    }

    function hexToRgba(hex, a = 0.35) {
        const h = String(hex || '').trim().replace('#', '');
        if (!/^[0-9a-fA-F]{6}$/.test(h)) return `rgba(255,0,0,${a})`;
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        return `rgba(${r},${g},${b},${a})`;
    }

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

        layersPanelEl: document.getElementById('layersPanel'),
        dxccLabelSizeInput: document.getElementById('dxccLabelSize')
    };

    // ========= i18n =========
    const dict = createI18n();
    let currentLang = normalizeLang(ui.langSelect?.value);

    function t() {
        return dict[currentLang] || dict.cs;
    }

    function isPanelCollapsed() {
        return ui.controlPanel?.classList?.contains('collapsed');
    }

    function setLanguage(lang) {
        currentLang = normalizeLang(lang);
        if (ui.langSelect) ui.langSelect.value = currentLang;

        applyTranslations({ lang: currentLang, dict, ui, isPanelCollapsed: () => isPanelCollapsed() });

        // synchronizace vzhledu tlačítek CZ / EN
        const langButtons = document.querySelectorAll('.lang-btn[data-lang]');
        langButtons.forEach((btn) => {
            const btnLang = normalizeLang(btn.dataset.lang);
            btn.classList.toggle('active', btnLang === currentLang);
        });

        // GA – změna jazyka
        trackEvent('change_language', {
            language: currentLang
        });

        refreshGrid();
    }

    // Panel collapse
    if (ui.togglePanelBtn && ui.controlPanel && ui.panelBodyEl) {
        ui.togglePanelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const collapsed = ui.controlPanel.classList.toggle('collapsed');
            ui.panelBodyEl.style.display = collapsed ? 'none' : 'block';
            applyTranslations({ lang: currentLang, dict, ui, isPanelCollapsed: () => isPanelCollapsed() });
        });
    }

    // ========= Helpers: checkbox =========
    function isChecked(id) {
        const el = document.getElementById(id);
        return Boolean(el && el.checked);
    }

    // ========= Persist: QTH + barvy + checkboxy =========
    function persistAllLayerCheckboxStates() {
        if (!ui.layersPanelEl) return;
        const inputs = ui.layersPanelEl.querySelectorAll('input[type="checkbox"][id]');
        const next = {};
        for (const el of inputs) {
            if (el.disabled) continue;
            next[el.id] = Boolean(el.checked);
        }
        settings = saveSettings({ layerStates: next });
    }

    function applyPersistedLayerCheckboxStates() {
        const s = ensureSettingsShape(loadSettings());
        const st = s.layerStates || {};
        if (!ui.layersPanelEl) return;

        const inputs = ui.layersPanelEl.querySelectorAll('input[type="checkbox"][id]');
        for (const el of inputs) {
            if (el.disabled) continue;
            if (typeof st[el.id] === 'boolean') el.checked = st[el.id];
        }
    }

    function bindPersistLayerCheckboxes() {
        if (!ui.layersPanelEl) return;
        ui.layersPanelEl.addEventListener('change', (e) => {
            const el = e.target;
            if (!(el instanceof HTMLInputElement)) return;
            if (el.type !== 'checkbox') return;
            if (!el.id) return;
            if (el.disabled) return;

            persistAllLayerCheckboxStates();
        });
    }

    // ========= Tree checkbox logic =========
    let treeSyncLock = false;

    function getTreeItemElFromCheckbox(cb) {
        return cb?.closest?.('li[role="treeitem"]') ?? null;
    }

    function getOwnCheckbox(treeItemEl) {
        return treeItemEl?.querySelector?.(':scope > .node input[type="checkbox"]') ?? null;
    }

    function getDirectChildTreeItems(treeItemEl) {
        const group = treeItemEl?.querySelector?.(':scope > ul[role="group"]');
        if (!group) return [];
        return Array.from(group.querySelectorAll(':scope > li[role="treeitem"]'));
    }

    function setTreeSubtreeChecked(treeItemEl, checked) {
        const childItems = getDirectChildTreeItems(treeItemEl);
        for (const child of childItems) {
            const cb = getOwnCheckbox(child);
            if (cb && !cb.disabled) {
                cb.indeterminate = false;
                cb.checked = checked;
            }
            setTreeSubtreeChecked(child, checked);
        }
    }

    function updateParentFromChildren(treeItemEl) {
        const parentCb = getOwnCheckbox(treeItemEl);
        if (!parentCb || parentCb.disabled) return;

        const children = getDirectChildTreeItems(treeItemEl)
            .map(getOwnCheckbox)
            .filter(Boolean)
            .filter(cb => !cb.disabled);

        if (!children.length) {
            parentCb.indeterminate = false;
            return;
        }

        const anyOn = children.some(cb => cb.checked || cb.indeterminate);
        const allOn = children.every(cb => cb.checked && !cb.indeterminate);

        if (!anyOn) {
            parentCb.indeterminate = false;
            parentCb.checked = false;
        } else if (allOn) {
            parentCb.indeterminate = false;
            parentCb.checked = true;
        } else {
            parentCb.checked = true;
            parentCb.indeterminate = true;
        }
    }

    function updateAncestors(treeItemEl) {
        let cur = treeItemEl;
        while (cur) {
            const parent = cur.parentElement?.closest?.('li[role="treeitem"]') ?? null;
            if (!parent) break;
            updateParentFromChildren(parent);
            cur = parent;
        }
    }

    function syncWholeTree(panelEl) {
        const allItems = Array.from(panelEl.querySelectorAll('li[role="treeitem"]'));

        for (const it of allItems) {
            const cb = getOwnCheckbox(it);
            if (!cb) continue;
            if (!cb.checked && !cb.indeterminate) {
                setTreeSubtreeChecked(it, false);
            }
        }

        for (let i = allItems.length - 1; i >= 0; i--) {
            updateParentFromChildren(allItems[i]);
        }
    }

    function bindTreeCheckboxLogic(onTreeChanged) {
        if (!ui.layersPanelEl) return;

        ui.layersPanelEl.addEventListener('change', (e) => {
            const cb = e.target;
            if (!(cb instanceof HTMLInputElement)) return;
            if (cb.type !== 'checkbox') return;

            if (treeSyncLock) return;
            treeSyncLock = true;

            try {
                const item = getTreeItemElFromCheckbox(cb);
                if (!item) return;

                setTreeSubtreeChecked(item, cb.checked);
                cb.indeterminate = false;

                updateParentFromChildren(item);
                updateAncestors(item);

                persistAllLayerCheckboxStates();

                if (typeof onTreeChanged === 'function') onTreeChanged();
            } finally {
                treeSyncLock = false;
            }
        });
    }

    // ========= Color picker =========
    function setSwatch(key, color) {
        const el = document.querySelector(`[data-swatch-key="${CSS.escape(key)}"]`);
        if (el) el.style.background = color;
    }

    function updateAllSwatches() {
        const swatches = document.querySelectorAll('[data-swatch-key]');
        for (const el of swatches) {
            const key = el.getAttribute('data-swatch-key');
            if (!key) continue;
            el.style.background = getColor(key);
        }
    }

    function promptForColor(initial) {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'color';
            input.value = initial;
            input.style.position = 'fixed';
            input.style.left = '-9999px';
            input.style.top = '-9999px';
            document.body.appendChild(input);

            const cleanup = () => {
                input.removeEventListener('change', onChange);
                input.remove();
            };

            const onChange = () => {
                const val = String(input.value || '').trim();
                cleanup();
                resolve(val || null);
            };

            input.addEventListener('change', onChange);
            input.click();
        });
    }

    function bindColorButtons(onColorChanged) {
        updateAllSwatches();

        document.addEventListener('click', async (e) => {
            const btn = e.target?.closest?.('.color-btn');
            if (!btn) return;

            const key = btn.getAttribute('data-color-key');
            if (!key) return;

            const current = getColor(key);
            const chosen = await promptForColor(current);
            if (!chosen) return;

            const s = ensureSettingsShape(loadSettings());
            settings = saveSettings({ colors: { ...(s.colors || {}), [key]: chosen } });

            setSwatch(key, chosen);
            if (typeof onColorChanged === 'function') onColorChanged();
        });
    }

    // ========= DXCC index / geometry =========
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
                dxccIndex = null;
                dxccIndexPromise = null;
                console.warn('DXCC load failed:', err);
                return null;
            });

        return dxccIndexPromise;
    }

    const workedDxcc = {
        cw: new Set(),
        ssb: new Set(),
        other: new Set(),
        digi: {
            ft8: new Set(),
            ft4: new Set(),
            jt65: new Set(),
            rtty: new Set(),
            psk31: new Set(),
            psk63: new Set(),
            psk125: new Set(),
            sstv: new Set()
        }
    };

    function clearWorkedDxccSets() {
        workedDxcc.cw.clear();
        workedDxcc.ssb.clear();
        workedDxcc.other.clear();
        for (const k of Object.keys(workedDxcc.digi)) workedDxcc.digi[k].clear();
    }

    const dxccGeomSource = new ol.source.Vector();
    let dxccGeomLoaded = false;
    let dxccGeomPromise = null;

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

    // ========= Mode parsing =========
    const DIGI_SUBMODES = Object.freeze(['FT8', 'FT4', 'JT65', 'RTTY', 'PSK31', 'PSK63', 'PSK125', 'SSTV']);

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

    // ========= OL layers =========
    const osmLayer = new ol.layer.Tile({ source: new ol.source.OSM() });
    osmLayer.set('name', 'Mapa');

    const patternCache = new Map();
    function createStripePatternRgba(rgbaColors) {
        const key = rgbaColors.join('|');
        const cached = patternCache.get(key);
        if (cached) return cached;

        const n = rgbaColors.length;
        const stripeW = 12;
        const w = Math.max(12, n * stripeW);
        const h = 24;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');

        for (let i = 0; i < n; i++) {
            ctx.fillStyle = rgbaColors[i];
            ctx.fillRect(i * stripeW, 0, stripeW, h);
        }

        const pattern = ctx.createPattern(canvas, 'repeat');
        patternCache.set(key, pattern);
        return pattern;
    }

    function pickDxccModeColorsForEntity(entityCode) {
        const colors = [];

        if (isChecked('layerDxccCw') && workedDxcc.cw.has(entityCode)) colors.push(getColor('dxcc.cw'));
        if (isChecked('layerDxccSsb') && workedDxcc.ssb.has(entityCode)) colors.push(getColor('dxcc.ssb'));
        if (isChecked('layerDxccOther') && workedDxcc.other.has(entityCode)) colors.push(getColor('dxcc.other'));

        if (isChecked('layerDxccDigi')) {
            const subOrder = ['ft8','ft4','jt65','rtty','psk31','psk63','psk125','sstv'];
            for (const k of subOrder) {
                const id = `layerDxccDigi${k[0].toUpperCase()}${k.slice(1)}`;
                if (!isChecked(id)) continue;
                if (workedDxcc.digi[k].has(entityCode)) colors.push(getColor(`dxcc.digi.${k}`));
            }
        }

        return Array.from(new Set(colors));
    }

    // Je entita „worked“ a povolená aktuálními DXCC checkboxy?
    function isEntityWorked(code) {
        const c = Number(code);
        if (!Number.isFinite(c)) return false;

        if (workedDxcc.cw.has(c) && isDxccEnabledForMode('CW')) return true;
        if (workedDxcc.ssb.has(c) && isDxccEnabledForMode('SSB')) return true;
        if (workedDxcc.other.has(c) && isDxccEnabledForMode('OTHER')) return true;

        if (isDxccEnabledForMode('DIGI')) {
            const subs = ['ft8','ft4','jt65','rtty','psk31','psk63','psk125','sstv'];
            for (const sub of subs) {
                const subU = sub.toUpperCase();
                if (!isDxccEnabledForMode('DIGI', subU)) continue;
                if (workedDxcc.digi[sub].has(c)) return true;
            }
        }
        return false;
    }

    const dxccLayer = new ol.layer.Vector({
        source: dxccGeomSource,
        opacity: 0.95,
        style: (feature) => {
            const props = feature.getProperties() || {};
            const code = Number(props.dxcc_entity_code);

            let fill = new ol.style.Fill({ color: 'rgba(255,0,0,0.00)' });

            if (Number.isFinite(code) && isChecked('layerDxcc')) {
                const baseColors = pickDxccModeColorsForEntity(code);
                if (baseColors.length === 1) {
                    fill = new ol.style.Fill({ color: hexToRgba(baseColors[0], 0.35) });
                } else if (baseColors.length > 1) {
                    const rgbaColors = baseColors.map(c => hexToRgba(c, 0.35));
                    const pattern = createStripePatternRgba(rgbaColors);
                    fill = new ol.style.Fill({ color: pattern });
                }
            }

            return new ol.style.Style({
                fill,
                stroke: new ol.style.Stroke({ color: 'rgba(255,0,0,0.18)', width: 1 })
            });
        }
    });
    dxccLayer.set('name', 'DXCC');
    dxccLayer.setZIndex(5);

    // DXCC text labels layer (jen worked DXCC)
    const dxccLabelsLayer = new ol.layer.Vector({
        source: dxccGeomSource,
        declutter: true,
        style: (feature) => {
            const props = feature.getProperties() || {};
            const code = Number(props.dxcc_entity_code);
            if (!Number.isFinite(code)) return null;

            if (!isEntityWorked(code)) return null;

            const name = props.dxcc_name || props.name || '';
            const prefix =
                props.dxcc_prefix ||
                props.primary_prefix ||
                props.prefix ||
                '';
            const label = prefix
                ? `${name} (${prefix})`
                : (name || (code ? `DXCC ${code}` : ''));

            const size = getDxccLabelSize();
            const font = 'system-ui, Arial, sans-serif';

            return new ol.style.Style({
                text: new ol.style.Text({
                    text: label,
                    font: `${size}px ${font}`,
                    fill: new ol.style.Fill({ color: '#0b2a66' }),
                    stroke: new ol.style.Stroke({ color: 'rgba(255,255,255,0.85)', width: 3 }),
                    overflow: true
                }),
                geometry: feature.getGeometry()?.getInteriorPoint?.() ?? feature.getGeometry()
            });
        }
    });
    dxccLabelsLayer.set('name', 'DXCC Labels');
    dxccLabelsLayer.setZIndex(6);

    function linkStrokeColor(bucket, sub) {
        if (bucket === 'CW') return getColor('dxcc.cw');
        if (bucket === 'SSB') return getColor('dxcc.ssb');
        if (bucket === 'OTHER') return getColor('dxcc.other');
        if (bucket === 'DIGI') {
            const k = String(sub || '').toLowerCase();
            const key = `dxcc.digi.${k}`;
            return (defaultColors[key] || settings.colors[key]) ? getColor(key) : getColor('dxcc.digi.ft8');
        }
        return '#000000';
    }

    function makeLinkStyle(bucket, sub) {
        return () => new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: linkStrokeColor(bucket, sub),
                width: 1.5,
                lineDash: [8, 6]
            })
        });
    }

    const linksCwSource = new ol.source.Vector();
    const linksCwLayer = new ol.layer.Vector({ source: linksCwSource, style: makeLinkStyle('CW') });
    linksCwLayer.set('name', 'Spojnice CW');
    linksCwLayer.setZIndex(7);

    const linksSsbSource = new ol.source.Vector();
    const linksSsbLayer = new ol.layer.Vector({ source: linksSsbSource, style: makeLinkStyle('SSB') });
    linksSsbLayer.set('name', 'Spojnice SSB');
    linksSsbLayer.setZIndex(7);

    const linksOtherSource = new ol.source.Vector();
    const linksOtherLayer = new ol.layer.Vector({ source: linksOtherSource, style: makeLinkStyle('OTHER') });
    linksOtherLayer.set('name', 'Spojnice Other');
    linksOtherLayer.setZIndex(7);

    function makeLinksDigiLayer(name, source, sub) {
        const layer = new ol.layer.Vector({ source, style: makeLinkStyle('DIGI', sub) });
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

    const linksDigiFt8Layer = makeLinksDigiLayer('FT8', linksDigiFt8Source, 'FT8');
    const linksDigiFt4Layer = makeLinksDigiLayer('FT4', linksDigiFt4Source, 'FT4');
    const linksDigiJt65Layer = makeLinksDigiLayer('JT65', linksDigiJt65Source, 'JT65');
    const linksDigiRttyLayer = makeLinksDigiLayer('RTTY', linksDigiRttySource, 'RTTY');
    const linksDigiPsk31Layer = makeLinksDigiLayer('PSK31', linksDigiPsk31Source, 'PSK31');
    const linksDigiPsk63Layer = makeLinksDigiLayer('PSK63', linksDigiPsk63Source, 'PSK63');
    const linksDigiPsk125Layer = makeLinksDigiLayer('PSK125', linksDigiPsk125Source, 'PSK125');
    const linksDigiSstvLayer = makeLinksDigiLayer('SSTV', linksDigiSstvSource, 'SSTV');

    const linksDigiGroupLayer = new ol.layer.Group({
        layers: [
            linksDigiFt8Layer, linksDigiFt4Layer, linksDigiJt65Layer, linksDigiRttyLayer,
            linksDigiPsk31Layer, linksDigiPsk63Layer, linksDigiPsk125Layer, linksDigiSstvLayer
        ]
    });
    linksDigiGroupLayer.set('name', 'Spojnice DIGI');
    linksDigiGroupLayer.setZIndex(7);

    const linksGroupLayer = new ol.layer.Group({
        layers: [linksCwLayer, linksSsbLayer, linksDigiGroupLayer, linksOtherLayer]
    });
    linksGroupLayer.set('name', 'Spojnice');
    linksGroupLayer.setZIndex(7);

    const modeCwLayer = new ol.layer.Vector({ source: new ol.source.Vector() });
    const modeSsbLayer = new ol.layer.Vector({ source: new ol.source.Vector() });
    const modeOtherLayer = new ol.layer.Vector({ source: new ol.source.Vector() });

    function makeModeDigiLayer() {
        return new ol.layer.Vector({ source: new ol.source.Vector() });
    }

    const modeDigiFt8Layer = makeModeDigiLayer();
    const modeDigiFt4Layer = makeModeDigiLayer();
    const modeDigiJt65Layer = makeModeDigiLayer();
    const modeDigiRttyLayer = makeModeDigiLayer();
    const modeDigiPsk31Layer = makeModeDigiLayer();
    const modeDigiPsk63Layer = makeModeDigiLayer();
    const modeDigiPsk125Layer = makeModeDigiLayer();
    const modeDigiSstvLayer = makeModeDigiLayer();

    const modeDigiGroupLayer = new ol.layer.Group({
        layers: [
            modeDigiFt8Layer, modeDigiFt4Layer, modeDigiJt65Layer, modeDigiRttyLayer,
            modeDigiPsk31Layer, modeDigiPsk63Layer, modeDigiPsk125Layer, modeDigiSstvLayer
        ]
    });

    const modeGroupLayer = new ol.layer.Group({
        layers: [modeCwLayer, modeSsbLayer, modeDigiGroupLayer, modeOtherLayer]
    });
    modeGroupLayer.setZIndex(8);

    // Přepínání viditelnosti bodů podle checkboxů „Mode“
    function isModeChecked(bucket, sub) {
        if (!isChecked('layerQso')) return false;
        if (bucket === 'CW') return isChecked('layerQsoCw');
        if (bucket === 'SSB') return isChecked('layerQsoSsb');
        if (bucket === 'OTHER') return isChecked('layerQsoOther');
        if (bucket === 'DIGI') {
            if (!isChecked('layerQsoDigi')) return false;
            if (!sub) return true;
            const s = String(sub).toUpperCase();
            if (s === 'FT8') return isChecked('layerQsoDigiFt8');
            if (s === 'FT4') return isChecked('layerQsoDigiFt4');
            if (s === 'JT65') return isChecked('layerQsoDigiJt65');
            if (s === 'RTTY') return isChecked('layerQsoDigiRtty');
            if (s === 'PSK31') return isChecked('layerQsoDigiPsk31');
            if (s === 'PSK63') return isChecked('layerQsoDigiPsk63');
            if (s === 'PSK125') return isChecked('layerQsoDigiPsk125');
            if (s === 'SSTV') return isChecked('layerQsoDigiSstv');
            return true;
        }
        return false;
    }

    function isModeVisible(bucket, sub) {
        return isModeChecked(bucket, sub);
    }

    function pointFillColor(bucket, sub) {
        return linkStrokeColor(bucket, sub);
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
            const mi = detectFeatureModeInfo(feature);
            if (!isModeVisible(mi.bucket, mi.sub)) return null;

            return new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 5,
                    fill: new ol.style.Fill({ color: pointFillColor(mi.bucket, mi.sub) }),
                    stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 })
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
            dxccLabelsLayer,
            linksGroupLayer,
            modeGroupLayer,
            gridLayer,
            highlightLayer,
            targetsLayer,
            qthLayer
        ],
        view
    });

    // mřížka se přepočítá při změně zoomu i po dokončení pohybu
    view.on('change:resolution', () => {
        refreshGrid();
    });

    map.on('moveend', () => {
        refreshGrid();
    });

    // ========= Apply checkbox states to OL layers =========
    function applyLayerVisibilityFromCheckboxes() {
        dxccLayer.setVisible(isChecked('layerDxcc'));
        dxccLabelsLayer.setVisible(isChecked('layerDxccLabels'));
        linksGroupLayer.setVisible(isChecked('layerLinks'));
        modeGroupLayer.setVisible(isChecked('layerQso'));

        linksCwLayer.setVisible(isChecked('layerLinksCw'));
        linksSsbLayer.setVisible(isChecked('layerLinksSsb'));
        linksOtherLayer.setVisible(isChecked('layerLinksOther'));

        linksDigiGroupLayer.setVisible(isChecked('layerLinksDigi'));
        linksDigiFt8Layer.setVisible(isChecked('layerLinksDigiFt8'));
        linksDigiFt4Layer.setVisible(isChecked('layerLinksDigiFt4'));
        linksDigiJt65Layer.setVisible(isChecked('layerLinksDigiJt65'));
        linksDigiRttyLayer.setVisible(isChecked('layerLinksDigiRtty'));
        linksDigiPsk31Layer.setVisible(isChecked('layerLinksDigiPsk31'));
        linksDigiPsk63Layer.setVisible(isChecked('layerLinksDigiPsk63'));
        linksDigiPsk125Layer.setVisible(isChecked('layerLinksDigiPsk125'));
        linksDigiSstvLayer.setVisible(isChecked('layerLinksDigiSstv'));

        modeCwLayer.setVisible(isChecked('layerQsoCw'));
        modeSsbLayer.setVisible(isChecked('layerQsoSsb'));
        modeOtherLayer.setVisible(isChecked('layerQsoOther'));

        modeDigiGroupLayer.setVisible(isChecked('layerQsoDigi'));
        modeDigiFt8Layer.setVisible(isChecked('layerQsoDigiFt8'));
        modeDigiFt4Layer.setVisible(isChecked('layerQsoDigiFt4'));
        modeDigiJt65Layer.setVisible(isChecked('layerQsoDigiJt65'));
        modeDigiRttyLayer.setVisible(isChecked('layerQsoDigiRtty'));
        modeDigiPsk31Layer.setVisible(isChecked('layerQsoDigiPsk31'));
        modeDigiPsk63Layer.setVisible(isChecked('layerQsoDigiPsk63'));
        modeDigiPsk125Layer.setVisible(isChecked('layerQsoDigiPsk125'));
        modeDigiSstvLayer.setVisible(isChecked('layerQsoDigiSstv'));
    }

    // ========= Worked DXCC sets =========
    function isDxccEnabledForMode(bucket, sub) {
        if (!isChecked('layerDxcc')) return false;

        if (bucket === 'CW') return isChecked('layerDxccCw');
        if (bucket === 'SSB') return isChecked('layerDxccSsb');
        if (bucket === 'OTHER') return isChecked('layerDxccOther');

        if (bucket === 'DIGI') {
            if (!isChecked('layerDxccDigi')) return false;
            if (!sub) return true;

            const s = String(sub).toUpperCase();
            if (s === 'FT8') return isChecked('layerDxccDigiFt8');
            if (s === 'FT4') return isChecked('layerDxccDigiFt4');
            if (s === 'JT65') return isChecked('layerDxccDigiJt65');
            if (s === 'RTTY') return isChecked('layerDxccDigiRtty');
            if (s === 'PSK31') return isChecked('layerDxccDigiPsk31');
            if (s === 'PSK63') return isChecked('layerDxccDigiPsk63');
            if (s === 'PSK125') return isChecked('layerDxccDigiPsk125');
            if (s === 'SSTV') return isChecked('layerDxccDigiSstv');
            return true;
        }

        return false;
    }

    function rebuildWorkedDxccSetsFromVisibleQsos() {
        clearWorkedDxccSets();

        for (const f of targetsSource.getFeatures()) {
            const qso = f.get('qso');
            if (!qso) continue;

            const mi = detectFeatureModeInfo(f);

            const code = Number(f.get('dxccEntityCode'));
            if (!Number.isFinite(code)) continue;

            // DXCC barvy se řídí jen DXCC checkboxy (ne Mode)
            if (!isDxccEnabledForMode(mi.bucket, mi.sub)) continue;

            if (mi.bucket === 'CW') workedDxcc.cw.add(code);
            else if (mi.bucket === 'SSB') workedDxcc.ssb.add(code);
            else if (mi.bucket === 'OTHER') workedDxcc.other.add(code);
            else if (mi.bucket === 'DIGI') {
                const k = String(mi.sub || '').toLowerCase();
                if (workedDxcc.digi[k]) workedDxcc.digi[k].add(code);
            }
        }
    }

    // ========= Tooltip =========
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
                lines.push(`<div class="line"><span class="key">DXCC</span><span class="val">${escapeHtml(String(dxccEntityCode))} — ${escapeHtml(dxccName)}</span></div>`);
            }
            tooltipEl.innerHTML = lines.join('');
            return;
        }

        const title = call ? call : (locator || '');
        const lines = [];
        lines.push(`<div class="title">${escapeHtml(title)}</div>`);

        if (dxccEntityCode && dxccName) {
            lines.push(`<div class="line"><span class="key">DXCC</span><span class="val">${escapeHtml(String(dxccEntityCode))} — ${escapeHtml(dxccName)}</span></div>`);
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

    // ========= QTH/Targets helpers =========
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

        saveSettings({ qthLocator: locator6 });
        return locator6;
    }

    function setQthFromLocator(locator) {
        const ext = locatorToExtentWGS84(locator);
        if (!ext) return false;

        const lon = (ext[0] + ext[2]) / 2;
        const lat = (ext[1] + ext[3]) / 2;
        const locTrim = String(locator).trim().toUpperCase();

        qthSource.clear(true);
        qthSource.addFeature(new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat])),
            label: `QTH ${locTrim}`
        }));

        saveSettings({ qthLocator: locTrim });
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
        else linksOtherSource.addFeature(lineFeature);
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
        const z = view.getZoom() ?? 0;

        // pevné prahy:
        // ≤5 : FIELD
        // >5 a ≤11 : SQUARE
        // >11 : SUBSQUARE
        if (z <= 5) return "field";
        if (z <= 11) return "square";

        const mode = ui.modeSelect?.value;
        if (mode === "field" || mode === "square" || mode === "subsquare") return mode;

        return "subsquare";
    }

    function refreshGrid() {
        if (!ui.statusEl || !ui.gridToggle) return;

        const size = map.getSize();
        if (!size || size[0] <= 0 || size[1] <= 0) {
            return;
        }

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
        const extent = view.calculateExtent(size);

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

    let importedByLocator = new Map();

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

            listItems.push({ display, km });
        }

        renderLocatorList(listItems);

        refreshTargetLinks();
        targetsSource.changed();

        rebuildWorkedDxccSetsFromVisibleQsos();
        dxccGeomSource.changed();

        if (ui.statusEl) {
            if (invalid.length) {
                ui.statusEl.textContent = t().msgInvalidLines(
                    invalid.slice(0, 8).join(', ') + (invalid.length > 8 ? '…' : '')
                );
            } else {
                ui.statusEl.textContent = t().msgShownLocs(valid.length, Boolean(qthLL));
            }
        }
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

    // ========= Context menu =========
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

    // ========= Events =========
    if (ui.langSelect) ui.langSelect.addEventListener('change', () => setLanguage(ui.langSelect.value));

    const langButtons = document.querySelectorAll('.lang-btn[data-lang]');
    if (langButtons.length) {
        langButtons.forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const lang = btn.dataset.lang;
                if (!lang) return;
                setLanguage(lang);
            });
        });
    }

    if (ui.modeSelect) ui.modeSelect.addEventListener('change', refreshGrid);
    if (ui.gridToggle) ui.gridToggle.addEventListener('change', refreshGrid);

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
            plotTargetsFromTextarea();
            refreshGrid();
            refreshTargetLinks();
        });
    }

    if (ui.qthInput) {
        ui.qthInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            if (!setQthFromLocator(ui.qthInput.value)) {
                if (ui.statusEl) ui.statusEl.textContent = t().msgBadQth;
                return;
            }
            plotTargetsFromTextarea();
            refreshGrid();
            refreshTargetLinks();
        });
    }

    if (ui.clearQthBtn) {
        ui.clearQthBtn.addEventListener('click', () => {
            if (ui.qthInput) ui.qthInput.value = '';
            qthSource.clear(true);
            saveSettings({ qthLocator: null });
            plotTargetsFromTextarea();
            refreshGrid();
            refreshTargetLinks();
        });
    }

    if (ui.ctxAddQthBtn) {
        ui.ctxAddQthBtn.addEventListener('click', () => {
            if (!lastContextLonLat) return;
            const [lon, lat] = lastContextLonLat;
            const locator6 = setQthFromLonLat(lon, lat);

            hideContextMenu();
            plotTargetsFromTextarea();
            refreshGrid();
            refreshTargetLinks();

            if (ui.statusEl) ui.statusEl.textContent = t().msgQthFromMap(locator6, lon.toFixed(5), lat.toFixed(5));
        });
    }

    if (ui.ctxExportPngBtn) {
        ui.ctxExportPngBtn.addEventListener('click', () => {
            exportMapAsPng({ map, hideContextMenu });

            // GA – export mapy
            trackEvent('export_map_png', {});
        });
    }

    if (ui.plotTargetsBtn) {
        ui.plotTargetsBtn.addEventListener('click', async () => {
            await ensureDxccLoaded();
            await ensureDxccGeometryLoaded();

            const rawText = ui.targetsTextarea?.value || '';
            const lineCount = rawText.split(/\r?\n/).filter(s => s.trim()).length;

            // GA – uživatel se pokusil vykreslit lokátory
            trackEvent('plot_targets', {
                lines_entered: lineCount
            });

            plotTargetsFromTextarea();
            refreshGrid();
        });
    }

    if (ui.clearTargetsBtn) {
        ui.clearTargetsBtn.addEventListener('click', () => {
            if (ui.targetsTextarea) ui.targetsTextarea.value = '';
            targetsSource.clear(true);
            if (ui.locatorListEl) ui.locatorListEl.innerHTML = '';
            importedByLocator = new Map();
            hideTooltip();
            refreshGrid();

            clearAllLinkSources();
            clearWorkedDxccSets();
            dxccGeomSource.changed();

            // GA – smazání všech lokátorů
            trackEvent('clear_targets', {});
        });
    }

    if (ui.importEdiBtn) {
        ui.importEdiBtn.addEventListener('click', async () => {
            const file = ui.ediFileInput?.files && ui.ediFileInput.files[0];

            // GA – klik na import
            trackEvent('import_log_clicked', {
                has_file: Boolean(file)
            });

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
                        return;
                    }

                    const qthLL = getQthLonLatOrNull();
                    if (!qthLL) {
                        if (ui.statusEl) ui.statusEl.textContent = 'Nejdřív nastav Moje QTH.';
                        return;
                    }

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

                    rebuildWorkedDxccSetsFromVisibleQsos();
                    dxccGeomSource.changed();

                    if (ui.statusEl) {
                        ui.statusEl.textContent = `ADIF načten: DXCC cílů ${byEntity.size}` + (unknownDxcc ? ` | Neznámé DXCC: ${unknownDxcc}` : '');
                    }

                    // GA – úspěšný ADIF import
                    trackEvent('import_adif_success', {
                        dxcc_entities: byEntity.size,
                        unknown_dxcc: unknownDxcc
                    });

                    const ext = targetsSource.getExtent();
                    if (ext && ext.every(Number.isFinite)) {
                        view.fit(ext, { padding: [80, 80, 80, 80], duration: 350, maxZoom: 4 });
                    }

                    return;
                }

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
                    hideTooltip();
                    refreshGrid();

                    clearAllLinkSources();
                    clearWorkedDxccSets();
                    dxccGeomSource.changed();

                    // GA – EDI bez lokátorů
                    trackEvent('import_edi_empty', {});
                    return;
                }

                importedByLocator = new Map(
                    parsed.targets.map(x => [x.locator, { call: (x.call || '').toUpperCase() || null, qso: x.qso || null }])
                );

                if (ui.targetsTextarea) ui.targetsTextarea.value = parsed.targets.map(x => x.locator).join('\n');

                plotTargetsFromTextarea();
                refreshGrid();

                if (ui.statusEl) ui.statusEl.textContent = t().msgEdiLoaded(parsed.targets.length, parsed.myLocator);

                // GA – úspěšný EDI import
                trackEvent('import_edi_success', {
                    locator_count: parsed.targets.length,
                    has_my_qth: Boolean(parsed.myLocator)
                });
            } catch (err) {
                if (ui.statusEl) ui.statusEl.textContent = `Import failed: ${err && err.message ? err.message : String(err)}`;

                // GA – chyba při importu
                trackEvent('import_log_error', {
                    message: err && err.message ? String(err.message).slice(0, 150) : String(err)
                });
            }
        });
    }

    // Tooltip hover
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

    function onUiLayersChanged() {
        applyLayerVisibilityFromCheckboxes();
        refreshTargetLinks();
        targetsSource.changed();
        rebuildWorkedDxccSetsFromVisibleQsos();
        dxccGeomSource.changed();
    }

    applyPersistedLayerCheckboxStates();

    bindPersistLayerCheckboxes();
    bindTreeCheckboxLogic(onUiLayersChanged);
    bindColorButtons(onUiLayersChanged);

    // DXCC label controls
    function getDxccLabelSize() {
        const val = Number(ui.dxccLabelSizeInput?.value);
        if (Number.isFinite(val) && val >= 8 && val <= 32) return val;
        return 12;
    }

    function bindDxccLabelControls() {
        const s0 = ensureSettingsShape(loadSettings());
        const savedSize = Number(s0.dxccLabels?.size);

        if (ui.dxccLabelSizeInput && Number.isFinite(savedSize)) {
            ui.dxccLabelSizeInput.value = savedSize;
        }

        const handler = () => {
            const size = getDxccLabelSize();
            settings = saveSettings({
                ...settings,
                dxccLabels: { size }
            });
            dxccLabelsLayer.changed();
        };

        ui.dxccLabelSizeInput?.addEventListener('change', handler);
    }

    bindDxccLabelControls();

    // after restore: sync tree states and apply
    if (ui.layersPanelEl) syncWholeTree(ui.layersPanelEl);
    persistAllLayerCheckboxStates();

    // restore QTH
    {
        const s0 = ensureSettingsShape(loadSettings());
        if (s0.qthLocator && ui.qthInput) {
            ui.qthInput.value = String(s0.qthLocator);
            setQthFromLocator(s0.qthLocator);
        }
    }

    setLanguage(currentLang);
    if (ui.panelBodyEl) ui.panelBodyEl.style.display = isPanelCollapsed() ? 'none' : 'block';

    applyLayerVisibilityFromCheckboxes();

    ensureDxccLoaded();
    ensureDxccGeometryLoaded().then(() => {
        rebuildWorkedDxccSetsFromVisibleQsos();
        dxccGeomSource.changed();
    });

    refreshGrid();
    refreshTargetLinks();
})();