// js/dxcc.js

function normalizeCall(call) {
    return String(call || '')
        .trim()
        .toUpperCase();
}

function parsePrefixes(prefixField) {
    // prefixField je CSV: "CF,CG,CH,..." nebo "YA,T6" apod.
    return String(prefixField || '')
        .split(',')
        .map(s => s.trim().toUpperCase())
        .filter(Boolean);
}

/**
 * Načte dxcc/dxcc.json a připraví index prefixů.
 * Index je seřazený od nejdelšího prefixu, aby vyhrál nejkonkrétnější match.
 */
export async function loadDxccIndex({ url = './dxcc/dxcc.json' } = {}) {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`DXCC load failed (${res.status})`);
    const data = await res.json();

    const rows = Array.isArray(data?.dxcc) ? data.dxcc : [];
    const index = [];

    for (const ent of rows) {
        if (!ent) continue;

        const entityCode = ent.entityCode;
        const name = ent.name;
        const deleted = Boolean(ent.deleted);

        const prefixes = parsePrefixes(ent.prefix);
        for (const p of prefixes) {
            index.push({
                prefix: p,
                entityCode,
                name,
                deleted
            });
        }
    }

    // nejdelší prefix první, ať "VP2E" vyhraje nad "VP2"
    index.sort((a, b) => (b.prefix.length - a.prefix.length) || a.prefix.localeCompare(b.prefix));
    return index;
}

/**
 * Najde DXCC entitu podle pravidla:
 * - prefix v JSONu se porovnává se začátkem značky (startsWith)
 * - bere se nejdelší odpovídající prefix
 * - defaultně ignoruje deleted entity
 */
export function findDxccByCall(call, dxccIndex, { includeDeleted = false } = {}) {
    const c = normalizeCall(call);
    if (!c) return null;
    if (!Array.isArray(dxccIndex) || !dxccIndex.length) return null;

    for (const row of dxccIndex) {
        if (!includeDeleted && row.deleted) continue;
        if (!row.prefix) continue;
        if (c.startsWith(row.prefix)) {
            return {
                prefix: row.prefix,
                entityCode: row.entityCode,
                name: row.name
            };
        }
    }
    return null;
}