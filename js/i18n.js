// js/i18n.js
export function createI18n() {
    const dict = {
        cs: {
            appTitle: 'Hamradio QRB map viewer',
            appDesc: 'Maidenhead Locator: Field (2) / Square (4) / Subsquare (6)',
            togglePanelCollapse: 'Minimalizovat',
            togglePanelExpand: 'Zobrazit',

            lblLang: 'Jazyk:',
            lblGridMode: 'Mřížka:',
            lblGridToggle: 'Zobrazit mřížku',

            lblEdi: 'Import EDI / ADIF:',
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

            msgPickEdi: 'Vyber prosím EDI/ADIF soubor.',
            msgEdiNoLocs: 'V EDI jsem nenašel žádné lokátory protistanic (6 znaků).',
            msgEdiLoaded: (n, my) => `EDI načteno: ${n} lokátorů${my ? ` | QTH: ${my}` : ''}`,
            msgBadLocator: 'Neplatný lokátor. Zadej 2/4/6 znaků (např. JN / JN89 / JN89ab).',
            msgBadQth: 'Neplatné QTH. Zadej lokátor ve formátu 2/4/6 znaků (např. JN89ab).',
            msgGridOff: z => `Zoom: ${z} | Mřížka: VYPNUTO`,
            msgGridOn: (z, lvl, n) => `Zoom: ${z} | ${lvl} | Buněk: ${n}`,
            msgInvalidLines: s => `Neplatné řádky (ignorováno): ${s}`,
            msgShownLocs: (n, hasQth) => `Zobrazeno lokátorů: ${n}${hasQth ? '' : ' (vzdálenost až po nastavení QTH)'}`,
            msgQthFromMap: (loc, lon, lat) => `QTH nastaveno z mapy: ${loc} (lon ${lon}, lat ${lat})`,
            msgNeedQthForDist: '— (nastav Moje QTH pro vzdálenost)',

            lblLayersTitle: 'Vrstvy',
            layerMap: 'Mapa',
            layerDxcc: 'DXCC',
            layerLinks: 'Spojnice',
            layerMode: 'Mode',

            layerCw: 'CW',
            layerSsb: 'SSB',
            layerOther: 'Ostatní',
            layerDigi: 'DIGI',

            digiFt8: 'FT8',
            digiFt4: 'FT4',
            digiJt65: 'JT65',
            digiRtty: 'RTTY',
            digiPsk31: 'PSK31',
            digiPsk63: 'PSK63',
            digiPsk125: 'PSK125',
            digiSstv: 'SSTV'
        },
        en: {
            appTitle: 'Hamradio QRB map viewer',
            appDesc: 'Maidenhead Locator: Field (2) / Square (4) / Subsquare (6)',
            togglePanelCollapse: 'Minimize',
            togglePanelExpand: 'Show',

            lblLang: 'Language:',
            lblGridMode: 'Grid:',
            lblGridToggle: 'Show grid',

            lblEdi: 'Import EDI / ADIF:',
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

            msgPickEdi: 'Please choose an EDI/ADIF file.',
            msgEdiNoLocs: 'No 6-char remote locators found in EDI.',
            msgEdiLoaded: (n, my) => `EDI loaded: ${n} locators${my ? ` | QTH: ${my}` : ''}`,
            msgBadLocator: 'Invalid locator. Use 2/4/6 chars (e.g. JN / JN89 / JN89ab).',
            msgBadQth: 'Invalid QTH. Use locator format 2/4/6 (e.g. JN89ab).',
            msgGridOff: z => `Zoom: ${z} | Grid: OFF`,
            msgGridOn: (z, lvl, n) => `Zoom: ${z} | ${lvl} | Cells: ${n}`,
            msgInvalidLines: s => `Invalid lines (ignored): ${s}`,
            msgShownLocs: (n, hasQth) => `Shown locators: ${n}${hasQth ? '' : ' (distance after setting QTH)'}`,
            msgQthFromMap: (loc, lon, lat) => `QTH set from map: ${loc} (lon ${lon}, lat ${lat})`,
            msgNeedQthForDist: '— (set My QTH to compute distance)',

            lblLayersTitle: 'Layers',
            layerMap: 'Map',
            layerDxcc: 'DXCC',
            layerLinks: 'Links',
            layerMode: 'Mode',

            layerCw: 'CW',
            layerSsb: 'SSB',
            layerOther: 'Other',
            layerDigi: 'DIGI',

            digiFt8: 'FT8',
            digiFt4: 'FT4',
            digiJt65: 'JT65',
            digiRtty: 'RTTY',
            digiPsk31: 'PSK31',
            digiPsk63: 'PSK63',
            digiPsk125: 'PSK125',
            digiSstv: 'SSTV'
        }
    };

    return dict;
}

export function applyTranslations({ lang, dict, ui, isPanelCollapsed }) {
    const t = dict[lang] || dict.cs;

    document.documentElement.lang = (lang === 'en') ? 'en' : 'cs';
    document.title = t.appTitle;

    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    const setElText = (el, text) => { if (el) el.textContent = text; };
    const setElPlaceholder = (el, text) => { if (el) el.placeholder = text; };

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

    setText('lblLayersTitle', t.lblLayersTitle);
    setText('lblLayerMap', t.layerMap);
    setText('lblLayerDxcc', t.layerDxcc);
    setText('lblLayerLinks', t.layerLinks);
    setText('lblLayerMode', t.layerMode);

    // Spojnice (top-level)
    setText('lblLayerLinksCw', t.layerCw);
    setText('lblLayerLinksSsb', t.layerSsb);
    setText('lblLayerLinksOther', t.layerOther);
    setText('lblLayerLinksDigi', t.layerDigi);

    // Spojnice > DIGI (submodes)
    setText('lblLayerLinksDigiFt8', t.digiFt8);
    setText('lblLayerLinksDigiFt4', t.digiFt4);
    setText('lblLayerLinksDigiJt65', t.digiJt65);
    setText('lblLayerLinksDigiRtty', t.digiRtty);
    setText('lblLayerLinksDigiPsk31', t.digiPsk31);
    setText('lblLayerLinksDigiPsk63', t.digiPsk63);
    setText('lblLayerLinksDigiPsk125', t.digiPsk125);
    setText('lblLayerLinksDigiSstv', t.digiSstv);

    // Mode (top-level)
    setText('lblLayerQsoCw', t.layerCw);
    setText('lblLayerQsoSsb', t.layerSsb);
    setText('lblLayerQsoOther', t.layerOther);
    setText('lblLayerQsoDigi', t.layerDigi);

    // Mode > DIGI (submodes)
    setText('lblLayerQsoDigiFt8', t.digiFt8);
    setText('lblLayerQsoDigiFt4', t.digiFt4);
    setText('lblLayerQsoDigiJt65', t.digiJt65);
    setText('lblLayerQsoDigiRtty', t.digiRtty);
    setText('lblLayerQsoDigiPsk31', t.digiPsk31);
    setText('lblLayerQsoDigiPsk63', t.digiPsk63);
    setText('lblLayerQsoDigiPsk125', t.digiPsk125);
    setText('lblLayerQsoDigiSstv', t.digiSstv);

    // Buttons
    setElText(ui?.importEdiBtn, t.importEdi);
    setElText(ui?.goLocatorBtn, t.goLocator);
    setElText(ui?.clearLocatorBtn, t.clearLocator);
    setElText(ui?.setQthBtn, t.setQth);
    setElText(ui?.clearQthBtn, t.clearQth);
    setElText(ui?.plotTargetsBtn, t.plotTargets);
    setElText(ui?.clearTargetsBtn, t.clearTargets);

    // Placeholders
    setElPlaceholder(ui?.locatorInput, t.placeholderLocator);
    setElPlaceholder(ui?.qthInput, t.placeholderQth);
    setElPlaceholder(ui?.targetsTextarea, t.placeholderTargets);

    // Context menu
    setElText(ui?.ctxAddQthBtn, t.ctxAddQth);
    setElText(ui?.ctxExportPngBtn, t.ctxExportPng);

    // Panel toggle
    setElText(
        ui?.togglePanelBtn,
        (typeof isPanelCollapsed === 'function' && isPanelCollapsed())
            ? t.togglePanelExpand
            : t.togglePanelCollapse
    );
}

export function normalizeLang(lang) {
    return (lang === 'en') ? 'en' : 'cs';
}