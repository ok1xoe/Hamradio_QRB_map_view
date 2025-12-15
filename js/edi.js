// js/edi.js
function parseYyyyMmDdToIsoDate(yyyymmdd) {
    const s = String(yyyymmdd || '').trim();
    if (!/^\d{8}$/.test(s)) return null;
    const y = Number(s.slice(0, 4));
    const m = Number(s.slice(4, 6));
    const d = Number(s.slice(6, 8));
    if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
    return { y, m, d };
}

function parseExchange(exchangeRaw) {
    const s = String(exchangeRaw || '').trim().replace(/\s+/g, ' ');
    // typicky: "59" nebo "59 001" / pro CW třeba "599 005"
    const m = s.match(/^(\d{2,3})(?:\s+(.+))?$/);
    if (!m) return { raw: s || null, rst: null, code: null };
    return { raw: s || null, rst: m[1] || null, code: (m[2] || null) };
}

function pad3(n) {
    return String(n).padStart(3, '0');
}

export function parseEdiText(text, isValidTargetLocator6) {
    const lines = String(text || '').split(/\r?\n/);

    let section = '';
    let myLocator = null;     // z [MAIN] LOCATOR=
    let contestDate = null;   // {y,m,d} z [MAIN] DATE=YYYYMMDD

    // DŮLEŽITÉ: odeslaný soutěžní kód dopočítáváme od 001 a zvyšujeme po 1
    // pro každé QSO s validním lokátorem (dle požadavku).
    let sentSerialCounter = 1;

    // locator -> { locator, call, qso } (bereme první výskyt pro daný lokátor)
    const byLocator = new Map();

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;

        const mSec = line.match(/^\[(.+)\]$/);
        if (mSec) {
            section = mSec[1].toUpperCase();
            continue;
        }

        if (section === 'MAIN') {
            const mLoc = line.match(/^LOCATOR\s*=\s*([A-Za-z0-9]+)\s*$/);
            if (mLoc) myLocator = mLoc[1].toUpperCase();

            const mDate = line.match(/^DATE\s*=\s*(\d{8})\s*$/);
            if (mDate) contestDate = parseYyyyMmDdToIsoDate(mDate[1]);

            continue;
        }

        if (section === 'QSO') {
            // ukázka: 07:01;OK2BSP;;SSB;59; 59 001;JN99AK;;0;;;
            const parts = line.split(';');
            if (parts.length < 7) continue;

            const timeHHMM = String(parts[0] || '').trim();            // 07:01
            const call = String(parts[1] || '').trim().toUpperCase();  // OK2BSP
            const mode = String(parts[3] || '').trim().toUpperCase();  // SSB/CW...
            const sentRaw = String(parts[4] || '').trim();             // "59" / "599" (bez serialu)
            const rcvRaw = String(parts[5] || '').trim();              // "59 001" / "599 005"
            const loc = String(parts[6] || '').trim().toUpperCase();   // lokátor protistanice

            if (!isValidTargetLocator6(loc)) continue;

            // serial zvyšujeme pro KAŽDÉ QSO s validním lokátorem
            const computedSentCode = pad3(sentSerialCounter++);

            const sent = parseExchange(sentRaw);
            const rcv = parseExchange(rcvRaw);

            // datum jako text (bez timezone; EDI to většinou neudává)
            let dateStr = null;
            if (contestDate) {
                const pad = (n) => String(n).padStart(2, '0');
                dateStr = `${contestDate.y}-${pad(contestDate.m)}-${pad(contestDate.d)}`;
            }

            // Pokud čas není ve formátu HH:MM, necháme null
            const timeOk = /^\d{2}:\d{2}$/.test(timeHHMM) ? timeHHMM : null;

            // Odeslaný contest kód dopočítáme vždy (v EDI často chybí)
            const sentContestCode = computedSentCode;

            // Složený raw pro případné fallback zobrazení
            const sentExchangeRaw = [sent.rst, sentContestCode].filter(Boolean).join(' ') || sent.raw || null;

            const qso = {
                date: dateStr,          // YYYY-MM-DD nebo null
                time: timeOk,           // HH:MM nebo null
                mode: mode || null,     // SSB/CW/FT8...

                // pro formátování výměny v tooltipu potřebujeme obě lokace
                myLocator: myLocator || null,   // můj lokátor z [MAIN]
                locator: loc,                   // lokátor protistanice

                call: call || null,

                sentReport: sent.rst,
                sentContestCode,
                sentExchangeRaw,

                rcvReport: rcv.rst,
                rcvContestCode: rcv.code,
                rcvExchangeRaw: rcv.raw
            };

            // pro mapu/seznam držíme první výskyt per lokátor
            if (!byLocator.has(loc)) {
                byLocator.set(loc, { locator: loc, call: call || '', qso });
            }
        }
    }

    const targets = Array.from(byLocator.values());
    return { myLocator, targets };
}

export function importEdiFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error('File read error'));
        reader.onload = () => resolve(String(reader.result || ''));
        reader.readAsText(file);
    });
}