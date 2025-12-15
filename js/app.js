// app.js
(() => {
    /************************************************************
     *  EXTENT (používá se pro "fit" tlačítko)
     ************************************************************/
    const zlinskyExtentWGS84 = [16.8, 48.95, 18.6, 49.75]; // lon/lat
    const zlinskyExtent3857 = ol.proj.transformExtent(zlinskyExtentWGS84, 'EPSG:4326', 'EPSG:3857');

    /************************************************************
     *  UI prvky
     ************************************************************/
    const controlPanel = document.getElementById('controlPanel');
    const togglePanelBtn = document.getElementById('togglePanel');
    const panelBodyEl = controlPanel ? controlPanel.querySelector('.panel-body') : null;

    const modeSelect = document.getElementById('mode');
    const statusEl = document.getElementById('status');

    const locatorInput = document.getElementById('locator');
    const goLocatorBtn = document.getElementById('goLocator');
    const clearLocatorBtn = document.getElementById('clearLocator');

    const qthInput = document.getElementById('qth');
    const setQthBtn = document.getElementById('setQth');
    const clearQthBtn = document.getElementById('clearQth');

    const targetsTextarea = document.getElementById('targets');
    const plotTargetsBtn = document.getElementById('plotTargets');
    const clearTargetsBtn = document.getElementById('clearTargets');
    const locatorListEl = document.getElementById('locatorList');

    const contextMenuEl = document.getElementById('contextMenu');
    const ctxAddQthBtn = document.getElementById('ctxAddQth');
    const ctxExportPngBtn = document.getElementById('ctxExportPng');

    const gridToggle = document.getElementById('gridToggle');

    const ediFileInput = document.getElementById('ediFile');
    const ediSetQthCheckbox = document.getElementById('ediSetQth');
    const importEdiBtn = document.getElementById('importEdi');

    const langSelect = document.getElementById('lang');

    /************************************************************
     *  i18n CZ/EN (bez localStorage)
     ************************************************************/
    const i18n = {
        cs: {
            appTitle: 'Hamradio QRB map viewer',
            appDesc: 'Maidenhead Locator: Field (2) / Square (4) / Subsquare (6)',
            togglePanelCollapse: 'Minimalizovat',
            togglePanelExpand: 'Zobrazit',
            lblLang: 'Jazyk:',
            fit: 'Přiblížit na výřez (Zlínský kraj)',
            lblGridMode: 'Mřížka:',
            lblGridToggle: 'Zobrazit mřížku',
            lblEdi: 'Import EDI:',
            lblEdiSetQth: 'Nastavit QTH z EDI',
            importEdi: 'Načíst',
            lblSearch: 'Vyhledat čtverec:',
            goLocator: 'Najít',
            clearLocator: 'Zrušit',
            lblQth: 'Moje QTH:',
            setQth: 'Zobrazit',
            clearQth: 'Smazat',
            lblTargetsHelp: 'Lokátory (6 znaků, např. JO80AD; jeden na řádek):',
            plotTargets: 'Zobrazit na mapě',
            clearTargets: 'Vymazat',
            placeholderLocator: 'např. JN / JN89 / JN89ab',
            placeholderQth: 'např. JN89ab',
            placeholderTargets: 'JO80AD\nJN89AB\n...',
            ctxAddQth: 'Přidej Moje QTH',
            ctxExportPng: 'Export mapy do PNG',
            msgPickEdi: 'Vyber prosím EDI soubor.',
            msgEdiNoLocs: 'V EDI jsem nenašel žádné lokátory protistanic (6 znaků).',
            msgEdiLoaded: (n, my) => `EDI načteno: ${n} lokátorů${my ? ` | QTH: ${my}` : ''}`,
            msgBadLocator: 'Neplatný lokátor. Zadej 2/4/6 znaků (např. JN / JN89 / JN89ab).',
            msgBadQth: 'Neplatné QTH. Zadej lokátor ve formátu 2/4/6 znaků (např. JN89ab).',
            msgGridOff: z => `Zoom: ${z} | Mřížka: VYPNUTO`,
            msgGridOn: (z, lvl, n) => `Zoom: ${z} | ${lvl} | Buněk: ${n}`,
            msgInvalidLines: s => `Neplatné řádky (ignorováno): ${s}`,
            msgShownLocs: (n, hasQth) => `Zobrazeno lokátorů: ${n}${hasQth ? '' : ' (vzdálenost až po nastavení QTH)'}`,
            msgQthFromMap: (loc, lon, lat) => `QTH nastaveno z mapy: ${loc} (lon ${lon}, lat ${lat})`,
            msgNeedQthForDist: '— (nastav Moje QTH pro vzdálenost)'
        },
        en: {
            appTitle: 'Hamradio QRB map viewer',
            appDesc: 'Maidenhead Locator: Field (2) / Square (4) / Subsquare (6)',
            togglePanelCollapse: 'Minimize',
            togglePanelExpand: 'Show',
            lblLang: 'Language:',
            fit: 'Zoom to region (Zlín)',
            lblGridMode: 'Grid:',
            lblGridToggle: 'Show grid',
            lblEdi: 'Import EDI:',
            lblEdiSetQth: 'Set QTH from EDI',
            importEdi: 'Load',
            lblSearch: 'Find locator:',
            goLocator: 'Find',
            clearLocator: 'Clear',
            lblQth: 'My QTH:',
            setQth: 'Show',
            clearQth: 'Remove',
            lblTargetsHelp: 'Locators (6 chars, e.g. JO80AD; one per line):',
            plotTargets: 'Show on map',
            clearTargets: 'Clear',
            placeholderLocator: 'e.g. JN / JN89 / JN89ab',
            placeholderQth: 'e.g. JN89ab',
            placeholderTargets: 'JO80AD\nJN89AB\n...',
            ctxAddQth: 'Add My QTH',
            ctxExportPng: 'Export map as PNG',
            msgPickEdi: 'Please choose an EDI file.',
            msgEdiNoLocs: 'No 6-char remote locators found in EDI.',
            msgEdiLoaded: (n, my) => `EDI loaded: ${n} locators${my ? ` | QTH: ${my}` : ''}`,
            msgBadLocator: 'Invalid locator. Use 2/4/6 chars (e.g. JN / JN89 / JN89ab).',
            msgBadQth: 'Invalid QTH. Use locator format 2/4/6 (e.g. JN89ab).',
            msgGridOff: z => `Zoom: ${z} | Grid: OFF`,
            msgGridOn: (z, lvl, n) => `Zoom: ${z} | ${lvl} | Cells: ${n}`,
            msgInvalidLines: s => `Invalid lines (ignored): ${s}`,
            msgShownLocs: (n, hasQth) => `Shown locators: ${n}${hasQth ? '' : ' (distance after setting QTH)'}`,
            msgQthFromMap: (loc, lon, lat) => `QTH set from map: ${loc} (lon ${lon}, lat ${lat})`,
            msgNeedQthForDist: '— (set My QTH to compute distance)'
        }
    };

    let currentLang = (langSelect && langSelect.value) ? langSelect.value : 'cs';

    function isPanelCollapsed() {
        return controlPanel.classList.contains('collapsed');
    }

    function applyTranslations(lang) {
        const t = i18n[lang] || i18n.cs;

        document.documentElement.lang = (lang === 'en') ? 'en' : 'cs';
        document.title = t.appTitle;

        const setText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };

        setText('appTitle', t.appTitle);
        setText('appDesc', t.appDesc);
        setText('lblLang', t.lblLang);
        setText('lblGridMode', t.lblGridMode);
        setText('lblGridToggle', t.lblGridToggle);
        setText('lblEdi', t.lblEdi);
        setText('lblEdiSetQth', t.lblEdiSetQth);
        setText('lblSearch', t.lblSearch);
        setText('lblQth', t.lblQth);
        setText('lblTargetsHelp', t.lblTargetsHelp);

        document.getElementById('fit').textContent = t.fit;

        importEdiBtn.textContent = t.importEdi;
        goLocatorBtn.textContent = t.goLocator;
        clearLocatorBtn.textContent = t.clearLocator;
        setQthBtn.textContent = t.setQth;
        clearQthBtn.textContent = t.clearQth;
        plotTargetsBtn.textContent = t.plotTargets;
        clearTargetsBtn.textContent = t.clearTargets;

        locatorInput.placeholder = t.placeholderLocator;
        qthInput.placeholder = t.placeholderQth;
        targetsTextarea.placeholder = t.placeholderTargets;

        ctxAddQthBtn.textContent = t.ctxAddQth;
        if (ctxExportPngBtn) ctxExportPngBtn.textContent = t.ctxExportPng;

        togglePanelBtn.textContent = isPanelCollapsed() ? t.togglePanelExpand : t.togglePanelCollapse;
    }

    function setLanguage(lang) {
        currentLang = (lang === 'en') ? 'en' : 'cs';
        langSelect.value = currentLang;
        applyTranslations(currentLang);
        refreshGrid();
    }

    langSelect.addEventListener('change', () => setLanguage(langSelect.value));

    /************************************************************
     *  MINIMALIZACE PANELU (spolehlivě – skrývá panel-body i přes JS)
     ************************************************************/
    if (togglePanelBtn && controlPanel && panelBodyEl) {
        togglePanelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const collapsed = controlPanel.classList.toggle('collapsed');
            panelBodyEl.style.display = collapsed ? 'none' : 'block';

            applyTranslations(currentLang);
        });
    }

    /************************************************************
     *  MAIDENHEAD helpers
     ************************************************************/
    function locatorToExtentWGS84(locatorRaw) {
        const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const a = "abcdefghijklmnopqrstuvwxyz";

        const loc = String(locatorRaw || "").trim();
        if (!loc) return null;

        const locU = loc.toUpperCase();
        const locL = loc.toLowerCase();

        if (!(loc.length === 2 || loc.length === 4 || loc.length === 6)) return null;

        const fLon = A.indexOf(locU[0]);
        const fLat = A.indexOf(locU[1]);
        if (fLon < 0 || fLat < 0) return null;

        const fieldLon0 = -180 + fLon * 20;
        const fieldLat0 = -90 + fLat * 10;

        if (loc.length === 2) return [fieldLon0, fieldLat0, fieldLon0 + 20, fieldLat0 + 10];

        const sLon = Number(locU[2]);
        const sLat = Number(locU[3]);
        if (!Number.isInteger(sLon) || sLon < 0 || sLon > 9) return null;
        if (!Number.isInteger(sLat) || sLat < 0 || sLat > 9) return null;

        const lon0 = fieldLon0 + sLon * 2;
        const lat0 = fieldLat0 + sLat * 1;

        if (loc.length === 4) return [lon0, lat0, lon0 + 2, lat0 + 1];

        const subLon = a.indexOf(locL[4]);
        const subLat = a.indexOf(locL[5]);
        if (subLon < 0 || subLon > 23) return null;
        if (subLat < 0 || subLat > 23) return null;

        const stepLon = 1 / 12;
        const stepLat = 1 / 24;

        const slon0 = lon0 + subLon * stepLon;
        const slat0 = lat0 + subLat * stepLat;

        return [slon0, slat0, slon0 + stepLon, slat0 + stepLat];
    }

    function maidenheadField(lon, lat) {
        const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const lonAdj = lon + 180;
        const latAdj = lat + 90;
        const fieldLon = Math.floor(lonAdj / 20);
        const fieldLat = Math.floor(latAdj / 10);
        return `${A[fieldLon]}${A[fieldLat]}`;
    }

    function maidenheadSquare(lon, lat) {
        const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const lonAdj = lon + 180;
        const latAdj = lat + 90;

        const fieldLon = Math.floor(lonAdj / 20);
        const fieldLat = Math.floor(latAdj / 10);
        const squareLon = Math.floor((lonAdj % 20) / 2);
        const squareLat = Math.floor((latAdj % 10) / 1);

        return `${A[fieldLon]}${A[fieldLat]}${squareLon}${squareLat}`;
    }

    function maidenheadSubsquare(lon, lat) {
        const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const a = "abcdefghijklmnopqrstuvwxyz";
        const lonAdj = lon + 180;
        const latAdj = lat + 90;

        const fieldLon = Math.floor(lonAdj / 20);
        const fieldLat = Math.floor(latAdj / 10);

        const squareLon = Math.floor((lonAdj % 20) / 2);
        const squareLat = Math.floor((latAdj % 10) / 1);

        const lonIn2deg = (lonAdj % 2);
        const latIn1deg = (latAdj % 1);

        const subsLon = Math.floor(lonIn2deg / (1 / 12));
        const subsLat = Math.floor(latIn1deg / (1 / 24));

        return `${A[fieldLon]}${A[fieldLat]}${squareLon}${squareLat}${a[subsLon]}${a[subsLat]}`;
    }

    function buildGrid(extent3857, level) {
        const ll = ol.proj.toLonLat([extent3857[0], extent3857[1]]);
        const ur = ol.proj.toLonLat([extent3857[2], extent3857[3]]);

        let minLon = Math.max(-180, Math.min(ll[0], ur[0]));
        let maxLon = Math.min(180, Math.max(ll[0], ur[0]));
        let minLat = Math.max(-90, Math.min(ll[1], ur[1]));
        let maxLat = Math.min(90, Math.max(ll[1], ur[1]));

        let stepLon, stepLat, labelFn;
        if (level === "subsquare") {
            stepLon = 1 / 12;
            stepLat = 1 / 24;
            labelFn = maidenheadSubsquare;
        } else if (level === "field") {
            stepLon = 20;
            stepLat = 10;
            labelFn = maidenheadField;
        } else {
            stepLon = 2;
            stepLat = 1;
            labelFn = maidenheadSquare;
        }

        const startLon = Math.floor((minLon + 180) / stepLon) * stepLon - 180;
        const endLon = Math.ceil((maxLon + 180) / stepLon) * stepLon - 180;
        const startLat = Math.floor((minLat + 90) / stepLat) * stepLat - 90;
        const endLat = Math.ceil((maxLat + 90) / stepLat) * stepLat - 90;

        const features = [];

        for (let lon = startLon; lon < endLon; lon += stepLon) {
            for (let lat = startLat; lat < endLat; lat += stepLat) {
                const lon2 = lon + stepLon;
                const lat2 = lat + stepLat;

                const ring = [
                    [lon, lat],
                    [lon2, lat],
                    [lon2, lat2],
                    [lon, lat2],
                    [lon, lat]
                ].map(c => ol.proj.fromLonLat(c));

                const polygon = new ol.geom.Polygon([ring]);

                const centerLon = lon + stepLon / 2;
                const centerLat = lat + stepLat / 2;

                features.push(new ol.Feature({
                    geometry: polygon,
                    label: labelFn(centerLon, centerLat)
                }));
            }
        }

        return features;
    }

    /************************************************************
     *  MAPA – vrstvy
     ************************************************************/
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
     *  QTH + helpers
     ************************************************************/
    function setQthFromLonLat(lon, lat) {
        const locator6 = maidenheadSubsquare(lon, lat);

        qthSource.clear(true);
        qthSource.addFeature(new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat])),
            label: `QTH ${locator6}`
        }));

        qthInput.value = locator6;
        return locator6;
    }

    function setQthFromLocator(locator) {
        const extentWGS84 = locatorToExtentWGS84(locator);
        if (!extentWGS84) return false;

        const centerLon = (extentWGS84[0] + extentWGS84[2]) / 2;
        const centerLat = (extentWGS84[1] + extentWGS84[3]) / 2;

        qthSource.clear(true);
        qthSource.addFeature(new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat([centerLon, centerLat])),
            label: `QTH ${String(locator).trim()}`
        }));

        return true;
    }

    function clearQth() {
        qthSource.clear(true);
    }

    function getQthLonLatOrNull() {
        const feats = qthSource.getFeatures();
        if (!feats.length) return null;
        const c3857 = feats[0].getGeometry().getCoordinates();
        return ol.proj.toLonLat(c3857);
    }

    function locatorToCenterLonLat(locatorRaw) {
        const extentWGS84 = locatorToExtentWGS84(locatorRaw);
        if (!extentWGS84) return null;
        return [
            (extentWGS84[0] + extentWGS84[2]) / 2,
            (extentWGS84[1] + extentWGS84[3]) / 2
        ];
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

    /************************************************************
     *  Highlight "search locator"
     ************************************************************/
    function highlightLocator(locator) {
        const extentWGS84 = locatorToExtentWGS84(locator);
        if (!extentWGS84) return false;

        const extent3857 = ol.proj.transformExtent(extentWGS84, 'EPSG:4326', 'EPSG:3857');

        const ring = [
            [extentWGS84[0], extentWGS84[1]],
            [extentWGS84[2], extentWGS84[1]],
            [extentWGS84[2], extentWGS84[3]],
            [extentWGS84[0], extentWGS84[3]],
            [extentWGS84[0], extentWGS84[1]]
        ].map(c => ol.proj.fromLonLat(c));

        highlightSource.clear(true);
        highlightSource.addFeature(new ol.Feature({
            geometry: new ol.geom.Polygon([ring])
        }));

        view.fit(extent3857, { padding: [80, 80, 80, 80], duration: 450, maxZoom: 14 });
        return true;
    }

    /************************************************************
     *  Links QTH -> targets
     ************************************************************/
    function refreshLinks() {
        linksSource.clear(true);

        const qthLL = getQthLonLatOrNull();
        if (!qthLL) return;

        const targetFeatures = targetsSource.getFeatures();
        if (!targetFeatures.length) return;

        const qth3857 = ol.proj.fromLonLat(qthLL);

        for (const f of targetFeatures) {
            const p = f.getGeometry();
            if (!p) continue;
            const coords = p.getCoordinates(); // EPSG:3857
            linksSource.addFeature(new ol.Feature({
                geometry: new ol.geom.LineString([qth3857, coords])
            }));
        }
    }

    /************************************************************
     *  Grid render + toggle
     ************************************************************/
    function pickLevel() {
        const mode = modeSelect.value;
        if (mode === "field" || mode === "square" || mode === "subsquare") return mode;

        const z = view.getZoom() ?? 0;
        if (z <= 5) return "field";
        return (z >= 11.5) ? "subsquare" : "square";
    }

    function refreshGrid() {
        const t = i18n[currentLang] || i18n.cs;

        const zNum = view.getZoom();
        const zTxt = (typeof zNum === 'number') ? zNum.toFixed(1) : '?';

        if (!gridToggle.checked) {
            gridLayer.setVisible(false);
            gridSource.clear(true);
            statusEl.textContent = t.msgGridOff(zTxt);
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

        statusEl.textContent = t.msgGridOn(zTxt, effectiveLevel.toUpperCase(), features.length);
    }

    let gridTimer = null;
    map.on('moveend', () => {
        clearTimeout(gridTimer);
        gridTimer = setTimeout(refreshGrid, 120);
    });
    modeSelect.addEventListener('change', refreshGrid);
    gridToggle.addEventListener('change', refreshGrid);

    /************************************************************
     *  Targets (textarea) + list + distances
     ************************************************************/
    function isValidTargetLocator6(loc) {
        return /^[A-R]{2}[0-9]{2}[A-X]{2}$/.test(loc);
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
        const t = i18n[currentLang] || i18n.cs;

        locatorListEl.innerHTML = '';
        for (const it of items) {
            const li = document.createElement('li');
            const kmTxt = (typeof it.km === 'number')
                ? ` — ${it.km.toFixed(1)} km`
                : ` ${t.msgNeedQthForDist}`;
            li.innerHTML = `<code>${it.loc}</code>${kmTxt}`;
            locatorListEl.appendChild(li);
        }
    }

    function plotTargetsFromTextarea() {
        const t = i18n[currentLang] || i18n.cs;

        const locs = parseTargetsText(targetsTextarea.value);
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

            targetsSource.addFeature(new ol.Feature({
                geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat])),
                label: qthLL ? `${loc} (${km.toFixed(0)} km)` : loc,
                locator: loc,
                km
            }));

            listItems.push({ loc, km });
        }

        renderLocatorList(listItems);

        if (invalid.length) {
            statusEl.textContent = t.msgInvalidLines(
                invalid.slice(0, 8).join(', ') + (invalid.length > 8 ? '…' : '')
            );
        } else {
            statusEl.textContent = t.msgShownLocs(valid.length, Boolean(qthLL));
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

    /************************************************************
     *  Import EDI (Atalanta format)
     ************************************************************/
    function parseEdiText(text) {
        const lines = String(text || '').split(/\r?\n/);

        let section = '';
        let myLocator = null;
        const locators = [];

        for (const raw of lines) {
            const line = raw.trim();
            if (!line) continue;

            const mSec = line.match(/^\[(.+)\]$/);
            if (mSec) {
                section = mSec[1].toUpperCase();
                continue;
            }

            if (section === 'MAIN') {
                const m = line.match(/^LOCATOR\s*=\s*([A-Za-z0-9]+)\s*$/);
                if (m) myLocator = m[1].toUpperCase();
                continue;
            }

            if (section === 'QSO') {
                const parts = line.split(';');
                if (parts.length < 7) continue;
                const loc = String(parts[6] || '').trim().toUpperCase();
                if (isValidTargetLocator6(loc)) locators.push(loc);
            }
        }

        const seen = new Set();
        const uniqueLocs = [];
        for (const l of locators) {
            if (seen.has(l)) continue;
            seen.add(l);
            uniqueLocs.push(l);
        }

        return { myLocator, locators: uniqueLocs };
    }

    function importEdiFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error || new Error('File read error'));
            reader.onload = () => resolve(String(reader.result || ''));
            reader.readAsText(file);
        });
    }

    async function doImportEdi() {
        const t = i18n[currentLang] || i18n.cs;

        const file = ediFileInput.files && ediFileInput.files[0];
        if (!file) {
            statusEl.textContent = t.msgPickEdi;
            return;
        }

        try {
            const text = await importEdiFile(file);
            const parsed = parseEdiText(text);

            if (ediSetQthCheckbox.checked && parsed.myLocator) {
                qthInput.value = parsed.myLocator;
                setQthFromLocator(parsed.myLocator);
            }

            if (!parsed.locators.length) {
                statusEl.textContent = t.msgEdiNoLocs;
                targetsTextarea.value = '';
                targetsSource.clear(true);
                locatorListEl.innerHTML = '';
                refreshLinks();
                refreshGrid();
                return;
            }

            targetsTextarea.value = parsed.locators.join('\n');
            plotTargetsFromTextarea();
            refreshLinks();
            refreshGrid();

            statusEl.textContent = t.msgEdiLoaded(parsed.locators.length, parsed.myLocator);
        } catch (err) {
            statusEl.textContent = `EDI import failed: ${err && err.message ? err.message : String(err)}`;
        }
    }

    /************************************************************
     *  Kontextové menu + QTH z mapy
     ************************************************************/
    let lastContextLonLat = null;

    function hideContextMenu() {
        contextMenuEl.style.display = 'none';
        lastContextLonLat = null;
    }

    function showContextMenu(clientX, clientY) {
        const vpRect = map.getViewport().getBoundingClientRect();

        let x = clientX - vpRect.left;
        let y = clientY - vpRect.top;

        contextMenuEl.style.display = 'block';
        contextMenuEl.style.left = `${x}px`;
        contextMenuEl.style.top = `${y}px`;

        const menuRect = contextMenuEl.getBoundingClientRect();
        const overRight = menuRect.right - vpRect.right;
        const overBottom = menuRect.bottom - vpRect.bottom;
        if (overRight > 0) x = Math.max(0, x - overRight - 6);
        if (overBottom > 0) y = Math.max(0, y - overBottom - 6);

        contextMenuEl.style.left = `${x}px`;
        contextMenuEl.style.top = `${y}px`;
    }

    function onMapContextMenu(e) {
        e.preventDefault();
        const coordinate3857 = map.getEventCoordinate(e);
        lastContextLonLat = ol.proj.toLonLat(coordinate3857);
        showContextMenu(e.clientX, e.clientY);
    }

    map.getViewport().addEventListener('contextmenu', onMapContextMenu);
    document.getElementById('map').addEventListener('contextmenu', onMapContextMenu);

    document.addEventListener('mousedown', (e) => {
        if (contextMenuEl.style.display !== 'block') return;
        if (!contextMenuEl.contains(e.target)) hideContextMenu();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideContextMenu();
    });

    ctxAddQthBtn.addEventListener('click', () => {
        if (!lastContextLonLat) return;

        const t = i18n[currentLang] || i18n.cs;

        const [lon, lat] = lastContextLonLat;
        const locator6 = setQthFromLonLat(lon, lat);

        hideContextMenu();
        refreshTargetsDistancesIfAny();
        refreshLinks();
        refreshGrid();

        statusEl.textContent = t.msgQthFromMap(locator6, lon.toFixed(5), lat.toFixed(5));
    });

    /************************************************************
     *  Export mapy do PNG
     ************************************************************/
    function exportMapAsPng() {
        hideContextMenu();

        map.once('rendercomplete', () => {
            const mapCanvas = document.createElement('canvas');
            const size = map.getSize();
            mapCanvas.width = size[0];
            mapCanvas.height = size[1];

            const mapContext = mapCanvas.getContext('2d');

            const canvases = map.getViewport().querySelectorAll('canvas');

            canvases.forEach((canvas) => {
                if (canvas.width === 0 || canvas.height === 0) return;

                const opacity = canvas.parentNode && canvas.parentNode.style
                    ? canvas.parentNode.style.opacity
                    : canvas.style.opacity;

                mapContext.globalAlpha = opacity === '' ? 1 : Number(opacity);

                const transform = canvas.style.transform;
                if (transform && transform.startsWith('matrix(')) {
                    const values = transform
                        .slice(7, -1)
                        .split(',')
                        .map(v => Number(v.trim()));
                    mapContext.setTransform(values[0], values[1], values[2], values[3], values[4], values[5]);
                } else {
                    mapContext.setTransform(1, 0, 0, 1, 0, 0);
                }

                mapContext.drawImage(canvas, 0, 0);
            });

            mapContext.setTransform(1, 0, 0, 1, 0, 0);
            mapContext.globalAlpha = 1;

            mapCanvas.toBlob((blob) => {
                if (!blob) return;

                const now = new Date();
                const pad = (n) => String(n).padStart(2, '0');
                const filename =
                    `qrb-map-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`;

                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                link.remove();

                setTimeout(() => URL.revokeObjectURL(link.href), 1500);
            }, 'image/png');
        });

        map.renderSync();
    }

    if (ctxExportPngBtn) {
        ctxExportPngBtn.addEventListener('click', () => exportMapAsPng());
    }

    /************************************************************
     *  UI events
     ************************************************************/
    document.getElementById('fit').addEventListener('click', () => {
        view.fit(zlinskyExtent3857, { padding: [40, 40, 40, 40], duration: 400 });
    });

    function doLocatorSearch() {
        const t = i18n[currentLang] || i18n.cs;

        const ok = highlightLocator(locatorInput.value);
        if (!ok) {
            statusEl.textContent = t.msgBadLocator;
            return;
        }
        refreshGrid();
    }

    goLocatorBtn.addEventListener('click', doLocatorSearch);
    locatorInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doLocatorSearch();
    });

    clearLocatorBtn.addEventListener('click', () => {
        highlightSource.clear(true);
        locatorInput.value = '';
        refreshGrid();
    });

    function applyQth() {
        const t = i18n[currentLang] || i18n.cs;

        const ok = setQthFromLocator(qthInput.value);
        if (!ok) {
            statusEl.textContent = t.msgBadQth;
            return;
        }
        refreshTargetsDistancesIfAny();
        refreshLinks();
        refreshGrid();
    }

    setQthBtn.addEventListener('click', applyQth);
    qthInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') applyQth();
    });

    clearQthBtn.addEventListener('click', () => {
        qthInput.value = '';
        clearQth();
        refreshTargetsDistancesIfAny();
        refreshLinks();
        refreshGrid();
    });

    plotTargetsBtn.addEventListener('click', () => {
        plotTargetsFromTextarea();
        refreshLinks();
        refreshGrid();
    });

    clearTargetsBtn.addEventListener('click', () => {
        targetsTextarea.value = '';
        targetsSource.clear(true);
        locatorListEl.innerHTML = '';
        refreshLinks();
        refreshGrid();
    });

    importEdiBtn.addEventListener('click', doImportEdi);

    /************************************************************
     *  Initial
     ************************************************************/
    setLanguage(currentLang);

    if (panelBodyEl) panelBodyEl.style.display = isPanelCollapsed() ? 'none' : 'block';

    view.fit(zlinskyExtent3857, { padding: [40, 40, 40, 40] });
    refreshGrid();
    refreshLinks();
})();