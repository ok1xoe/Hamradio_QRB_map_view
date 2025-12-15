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

    ui.importEdiBtn.textContent = t.importEdi;
    ui.goLocatorBtn.textContent = t.goLocator;
    ui.clearLocatorBtn.textContent = t.clearLocator;
    ui.setQthBtn.textContent = t.setQth;
    ui.clearQthBtn.textContent = t.clearQth;
    ui.plotTargetsBtn.textContent = t.plotTargets;
    ui.clearTargetsBtn.textContent = t.clearTargets;

    ui.locatorInput.placeholder = t.placeholderLocator;
    ui.qthInput.placeholder = t.placeholderQth;
    ui.targetsTextarea.placeholder = t.placeholderTargets;

    ui.ctxAddQthBtn.textContent = t.ctxAddQth;
    if (ui.ctxExportPngBtn) ui.ctxExportPngBtn.textContent = t.ctxExportPng;

    ui.togglePanelBtn.textContent = isPanelCollapsed() ? t.togglePanelExpand : t.togglePanelCollapse;
}

export function normalizeLang(lang) {
    return (lang === 'en') ? 'en' : 'cs';
}