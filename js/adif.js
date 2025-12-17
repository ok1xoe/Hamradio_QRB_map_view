// js/adif.js

function normalizeKey(k) {
    return String(k || '').trim().toUpperCase();
}

function normalizeVal(v) {
    return String(v ?? '').trim();
}

/**
 * Velmi jednoduchý ADIF parser:
 * - rozdělí na recordy podle <EOR>
 * - v každém recordu čte tagy tvaru <KEY:len>value (len ignorujeme, vezmeme value do dalšího "<")
 * - zajímá nás hlavně CALL a MODE
 */
export function parseAdifText(text) {
    const src = String(text || '');
    const parts = src.split(/<\s*EOR\s*>/i);

    const out = [];
    for (const rec of parts) {
        const r = String(rec || '').trim();
        if (!r) continue;

        const row = Object.create(null);

        const re = /<\s*([^:>\s]+)(?::\s*(\d+))?[^>]*>/gi;
        let m;
        while ((m = re.exec(r))) {
            const key = normalizeKey(m[1]);
            const tagEnd = re.lastIndex;

            const nextTag = r.indexOf('<', tagEnd);
            const rawVal = (nextTag === -1) ? r.slice(tagEnd) : r.slice(tagEnd, nextTag);

            const val = normalizeVal(rawVal);
            if (key) row[key] = val;
        }

        const call = normalizeVal(row.CALL || row.STATION_CALLSIGN || '');
        if (!call) continue;

        const mode = normalizeVal(row.MODE || '');
        out.push({ call, mode });
    }

    return out;
}

export async function importAdifFile(file) {
    if (!file) throw new Error('No file');
    return file.text();
}
