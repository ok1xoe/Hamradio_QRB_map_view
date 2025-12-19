// js/cabrillo.js

// Načte text ze souboru (File API)
export async function importCabrilloFile(file) {
    if (!file) throw new Error('No Cabrillo file');
    console.debug('[CABRILLO] importCabrilloFile: reading file', {
        name: file.name,
        size: file.size,
        type: file.type
    });
    const text = await file.text();
    console.debug('[CABRILLO] importCabrilloFile: text length', text.length);
    return text;
}

// Jednoduchý parser Cabrillo pro QSO řádky:
// Formát (příklad):
// QSO: 21259 PH 2013-07-27 1336 OK1K          59  0006 EI9HX         59  0092
// indexy: 0    1     2  3          4    5             6   7    8           9   10
// -> myCall = parts[5], hisCall = parts[8]
export function parseCabrilloText(text) {
    console.debug('[CABRILLO] parseCabrilloText: start, length', text?.length ?? 0);

    const lines = String(text || '')
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);

    console.debug('[CABRILLO] total non-empty lines', lines.length);

    const qsos = [];
    let myCall = null;
    let qsoLineCount = 0;

    for (const line of lines) {
        if (!line.toUpperCase().startsWith('QSO:')) continue;

        qsoLineCount++;
        if (qsoLineCount <= 5) {
            console.debug('[CABRILLO] QSO line sample', qsoLineCount, line);
        }

        const parts = line.split(/\s+/);
        if (parts.length < 9) continue;

        const freq = parts[1];          // např. 21259
        const mode = parts[2];          // např. PH
        const date = parts[3];          // 2013-07-27
        const time = parts[4];          // 1336
        const myCallCand = parts[5];
        const hisCallCand = parts[8];

        const myCallNorm = String(myCallCand || '').toUpperCase();
        const hisCallNorm = String(hisCallCand || '').toUpperCase();

        if (!myCall && myCallNorm) myCall = myCallNorm;

        // velmi jednoduchý filtr – značky mají aspoň 3 znaky [0-9A-Z/]
        if (!/^[0-9A-Z/]{3,}$/.test(hisCallNorm)) {
            console.debug('[CABRILLO] skip, hisCall not looking like CALL', {
                line,
                hisCallCand
            });
            continue;
        }

        qsos.push({
            call: hisCallNorm,
            mode,
            date,
            time,
            source: 'CABRILLO',
            rawLine: line,
            freq
        });
    }

    console.debug('[CABRILLO] parseCabrilloText: QSO lines', qsoLineCount, 'parsed QSOs', qsos.length, 'myCall', myCall);

    return {
        myCall,
        qsos
    };
}